/**
 * Deduplication utility for parish records scraped from multiple sources.
 *
 * Strategy:
 *   1. Build a composite key from normalised (name + city + state).
 *   2. Group records sharing the same key.
 *   3. Merge each group into a single record, preferring the most complete
 *      field values and accumulating sources.
 *
 * Exported:
 *   deduplicate(records)  →  Array of merged, unique parish records.
 */

// ── Helpers ───────────────────────────────────────────────────────────

/** Strip to lowercase alphanumerics only */
function norm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Normalise a parish name for comparison:
 *   – lowercase, strip non-alphanumeric
 *   – remove common suffixes/qualifiers that differ between sources
 */
function normName(name) {
  let n = norm(name);
  // Strip common inconsistent suffixes
  n = n.replace(/(orthodox|russian|rocor|oca|church|mission|cathedral|chapel|monastery|parish|www)$/g, "");
  // Also strip leading "st" / "sts" / "ss" (saint abbreviations)
  // but keep it for key purposes – saints are distinctive
  return n;
}

/**
 * Return a dedup key for a parish record.
 * Records with the same key are considered duplicates.
 */
function dedupKey(record) {
  const name = normName(record.name || record.parish || "");
  const city = norm(record.city || "");
  const state = norm(record.state || "");
  // Use name|city as primary key; include state only when city is empty
  // to avoid splitting records that have city in one source but not another.
  return city ? `${name}|${city}` : `${name}||${state}`;
}

// ── Source priority ───────────────────────────────────────────────────
// Higher-priority sources have richer / more authoritative data.
const SOURCE_PRIORITY = {
  "ea-diocese": 5,      // full deanery, jurisdiction, external links
  goarch: 4,            // first-party Greek Archdiocese data
  antiochian: 4,        // first-party Antiochian data
  serbian: 4,           // first-party Serbian data
  romanian: 4,          // first-party Romanian data
  acrod: 4,             // first-party ACROD data
  bulgarian: 4,         // first-party Bulgarian data
  "assembly-of-bishops": 3, // lat/lng, phone – covers all jurisdictions
  "chicago-rocor": 2,   // neat tabular data
  oca: 2,               // first-party OCA
  "uoc-usa": 2,         // first-party UOC
  "orthodox-world": 0,
};

function sourcePriority(src) {
  return SOURCE_PRIORITY[src] ?? 0;
}

// ── Merge logic ───────────────────────────────────────────────────────

/** Pick the "better" value for a single field across two records */
function pick(a, b) {
  if (!a) return b || "";
  if (!b) return a;
  // Prefer the longer (more detailed) string
  return a.length >= b.length ? a : b;
}

/**
 * Merge an array of duplicate records into one.
 * Fields are filled from the richest available source.
 * `source` becomes a comma-separated list of all contributing sources.
 */
function mergeGroup(records) {
  // Sort so highest-priority source is last (its values overwrite)
  const sorted = [...records].sort(
    (a, b) => sourcePriority(a.source) - sourcePriority(b.source)
  );

  const merged = {};
  const fields = [
    "name", "jurisdiction", "diocese", "deanery",
    "city", "state", "country", "phone",
    "website", "lat", "lng", "address", "clergy",
  ];

  for (const field of fields) {
    merged[field] = "";
  }

  for (const rec of sorted) {
    for (const field of fields) {
      const val = (rec[field] ?? "").toString().trim();
      if (val) {
        merged[field] = pick(merged[field], val);
      }
    }
  }

  // Combine source tags
  const sources = [...new Set(records.map((r) => r.source).filter(Boolean))];
  merged.source = sources.join(", ");

  return merged;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Deduplicate an array of normalised parish records.
 *
 * @param {Array} records - parish objects (must already have `name`, `city`,
 *   `state`, `source` fields).
 * @returns {{ unique: Array, stats: { total: number, unique: number, merged: number } }}
 */
function deduplicate(records) {
  const groups = new Map();

  for (const rec of records) {
    const key = dedupKey(rec);
    if (!key || key === "|" || key === "||") continue; // skip blank names
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rec);
  }

  const unique = [];
  let mergedCount = 0;

  for (const [, group] of groups) {
    if (group.length === 1) {
      unique.push(group[0]);
    } else {
      unique.push(mergeGroup(group));
      mergedCount += group.length - 1; // how many extra records were folded in
    }
  }

  return {
    unique,
    stats: {
      total: records.length,
      unique: unique.length,
      merged: mergedCount,
    },
  };
}

module.exports = { deduplicate };
