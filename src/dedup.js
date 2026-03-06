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
 *   – remove only source-tag suffixes that add no distinguishing info
 *   – keep words like "church", "mission", "cathedral" that distinguish
 *     separate parishes in the same city
 */
function normName(name) {
  let n = norm(name);
  // Only strip source-tag suffixes and truly meaningless markers.
  // Keep distinguishing type words (church, mission, cathedral, monastery, chapel)
  // so that e.g. "St. Nicholas Cathedral" !== "St. Nicholas Mission" in the same city.
  n = n.replace(/(orthodox|russian|rocor|oca|www)$/, "");
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
  if (!name) return "";
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

/**
 * Merge an array of duplicate records into one.
 * Fields are filled preferring the highest-priority source.
 * When priority is equal, the longer (more detailed) string wins.
 * `source` becomes a comma-separated list of all contributing sources.
 */
function mergeGroup(records) {
  // Sort ascending by priority so highest-priority source is last
  const sorted = [...records].sort(
    (a, b) => sourcePriority(a.source) - sourcePriority(b.source)
  );

  const merged = {};
  const mergedPriority = {}; // track which source priority wrote each field
  const fields = [
    "name", "jurisdiction", "diocese", "deanery",
    "city", "state", "country", "phone",
    "website", "lat", "lng", "address", "clergy",
  ];

  for (const field of fields) {
    merged[field] = "";
    mergedPriority[field] = -1;
  }

  for (const rec of sorted) {
    const recPri = sourcePriority(rec.source);
    for (const field of fields) {
      const val = (rec[field] ?? "").toString().trim();
      if (!val) continue;
      const curVal = merged[field];
      const curPri = mergedPriority[field];
      // Higher priority always wins; equal priority picks longer string
      if (!curVal || recPri > curPri || (recPri === curPri && val.length > curVal.length)) {
        merged[field] = val;
        mergedPriority[field] = recPri;
      }
    }
  }

  // Combine source tags (split any already-joined sources to avoid duplicates)
  const sources = [...new Set(records.flatMap((r) => (r.source || "").split(",").map(s => s.trim())).filter(Boolean))];
  merged.source = sources.join(", ");

  return merged;
}

// ── Coordinate-based deduplication ────────────────────────────────────

/**
 * Return a coordinate key for a record.
 * Used to identify records at the same physical location.
 */
function coordKey(record) {
  if (!record.lat || !record.lng) return "";
  // Round to 4 decimal places (~11m precision) to account for minor geocoding variations
  const lat = parseFloat(record.lat).toFixed(4);
  const lng = parseFloat(record.lng).toFixed(4);
  return `${lat}|${lng}`;
}

/**
 * Second pass: deduplicate by coordinates.
 * Merges records that share the same location (within ~11m).
 */
function deduplicateByCoordinates(records) {
  const groups = new Map();

  for (const rec of records) {
    const key = coordKey(rec);
    if (!key) {
      // No coordinates, keep as-is
      if (!groups.has("")) groups.set("", []);
      groups.get("").push([rec]);
    } else {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push([rec]);
    }
  }

  const unique = [];
  let mergedCount = 0;

  for (const [, groups_or_records] of groups) {
    // Groups without coordinates are single-record arrays
    for (const group of groups_or_records) {
      if (group.length === 1) {
        unique.push(group[0]);
      } else {
        unique.push(mergeGroup(group));
        mergedCount += group.length - 1;
      }
    }
  }

  return { unique, mergedCount };
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

  // First pass: deduplicate by name + city + state
  for (const rec of records) {
    const key = dedupKey(rec);
    if (!key) continue; // skip blank names
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rec);
  }

  let deduped1 = [];
  let mergedPass1 = 0;

  for (const [, group] of groups) {
    if (group.length === 1) {
      deduped1.push(group[0]);
    } else {
      deduped1.push(mergeGroup(group));
      mergedPass1 += group.length - 1;
    }
  }

  // Second pass: deduplicate by coordinates
  const coordGroups = new Map();
  const noCoords = [];

  for (const rec of deduped1) {
    const key = coordKey(rec);
    if (!key) {
      noCoords.push(rec);
    } else {
      if (!coordGroups.has(key)) coordGroups.set(key, []);
      coordGroups.get(key).push(rec);
    }
  }

  let unique = noCoords;
  let mergedPass2 = 0;

  for (const [, group] of coordGroups) {
    if (group.length === 1) {
      unique.push(group[0]);
    } else {
      unique.push(mergeGroup(group));
      mergedPass2 += group.length - 1;
    }
  }

  return {
    unique,
    stats: {
      total: records.length,
      unique: unique.length,
      merged: mergedPass1 + mergedPass2,
    },
  };
}

module.exports = { deduplicate };
