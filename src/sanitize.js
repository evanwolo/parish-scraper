/**
 * Data sanitisation & normalisation for parish records.
 *
 * Cleans every field so downstream consumers (API, CSV, map UI) receive
 * consistent, well-formed data regardless of which scraper produced it.
 *
 * Exported:
 *   sanitizeRecord(raw, source?)  →  cleaned parish object
 *   sanitizeName(name)
 *   sanitizeState(state)
 *   sanitizeCountry(country, state)
 *   sanitizePhone(phone)
 *   sanitizeWebsite(url, source)
 *   sanitizeLatLng(value)
 *   normaliseJurisdiction(raw, source)
 */

// ── US state lookup (full name → abbreviation) ───────────────────────
const STATE_FULL_TO_ABBR = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
  // Territories
  "district of columbia": "DC", "puerto rico": "PR", guam: "GU",
  "us virgin islands": "VI", "american samoa": "AS",
  "northern mariana islands": "MP",
};

const VALID_US_ABBRS = new Set(Object.values(STATE_FULL_TO_ABBR));

// Canadian provinces
const CA_PROVINCES = new Set([
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
]);

// ── Jurisdiction canonical names ──────────────────────────────────────
const JURISDICTION_CANONICAL = {
  rocor: "Russian Orthodox Church Outside of Russia (ROCOR)",
  "russian orthodox church outside of russia":
    "Russian Orthodox Church Outside of Russia (ROCOR)",
  "russian orthodox church outside russia":
    "Russian Orthodox Church Outside of Russia (ROCOR)",
  oca: "Orthodox Church in America (OCA)",
  "orthodox church in america": "Orthodox Church in America (OCA)",
  "uoc-usa": "Ukrainian Orthodox Church of the USA (UOC-USA)",
  "ukrainian orthodox church of the usa":
    "Ukrainian Orthodox Church of the USA (UOC-USA)",
  "antiochian orthodox christian archdiocese of north america":
    "Antiochian Orthodox Christian Archdiocese of North America",
  "greek orthodox archdiocese of america":
    "Greek Orthodox Archdiocese of America",
  "serbian orthodox church in north and south america":
    "Serbian Orthodox Church in North and South America",
  "romanian orthodox archdiocese in the americas":
    "Romanian Orthodox Archdiocese in the Americas",
  "bulgarian eastern orthodox diocese of the usa, canada, and australia":
    "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia",
  "georgian orthodox church": "Georgian Orthodox Church",
  "american carpatho-russian orthodox diocese":
    "American Carpatho-Russian Orthodox Diocese",
  "albanian orthodox diocese of america":
    "Albanian Orthodox Diocese of America",
  "orthodox church of the genuinely orthodox christians of greece":
    "Orthodox Church of the Genuinely Orthodox Christians of Greece",
  // Short forms / abbreviations
  goarch: "Greek Orthodox Archdiocese of America",
  goa: "Greek Orthodox Archdiocese of America",
  "greek orthodox": "Greek Orthodox Archdiocese of America",
  aoca: "Antiochian Orthodox Christian Archdiocese of North America",
  antiochian: "Antiochian Orthodox Christian Archdiocese of North America",
  acrod: "American Carpatho-Russian Orthodox Diocese",
  "carpatho-russian": "American Carpatho-Russian Orthodox Diocese",
  serbian: "Serbian Orthodox Church in North and South America",
  "serbian orthodox": "Serbian Orthodox Church in North and South America",
  romanian: "Romanian Orthodox Archdiocese in the Americas",
  "romanian orthodox": "Romanian Orthodox Archdiocese in the Americas",
  bulgarian: "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia",
  "bulgarian orthodox": "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia",
  mp: "Patriarchal Parishes of the Russian Orthodox Church in the USA",
  "moscow patriarchate": "Patriarchal Parishes of the Russian Orthodox Church in the USA",
  "patriarchal parishes": "Patriarchal Parishes of the Russian Orthodox Church in the USA",
};

// Infer jurisdiction from scraper source when the record has none
const SOURCE_JURISDICTION = {
  "chicago-rocor": "Russian Orthodox Church Outside of Russia (ROCOR)",
  "ea-diocese": "Russian Orthodox Church Outside of Russia (ROCOR)",
  oca: "Orthodox Church in America (OCA)",
  "uoc-usa": "Ukrainian Orthodox Church of the USA (UOC-USA)",
  goarch: "Greek Orthodox Archdiocese of America",
  antiochian: "Antiochian Orthodox Christian Archdiocese of North America",
  serbian: "Serbian Orthodox Church in North and South America",
  romanian: "Romanian Orthodox Archdiocese in the Americas",
  acrod: "American Carpatho-Russian Orthodox Diocese",
  bulgarian: "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia",
};

// Base URLs for relative links from each source
const SOURCE_BASE_URL = {
  "chicago-rocor": "https://chicagodiocese.org",
  "ea-diocese": "https://eadiocese.org",
  goarch: "https://www.goarch.org",
  antiochian: "https://www.antiochian.org",
  serbian: "https://www.easterndiocese.org",
  romanian: "https://www.roea.org",
  acrod: "https://www.acrod.org",
  bulgarian: "https://www.bulgariandiocese.org",
};

// Country name normalisation
const COUNTRY_CANONICAL = {
  "united states": "USA",
  "united states of america": "USA",
  us: "USA",
  usa: "USA",
  "u.s.a.": "USA",
  "u.s.": "USA",
  canada: "Canada",
  haiti: "Haiti",
  "dominican republic": "Dominican Republic",
  jamaica: "Jamaica",
  "trinidad and tobago": "Trinidad and Tobago",
  nicaragua: "Nicaragua",
  dominica: "Dominica",
  "costa rica": "Costa Rica",
  grenada: "Grenada",
  mexico: "Mexico",
};

// ── Helpers ───────────────────────────────────────────────────────────

/** Collapse whitespace, strip control characters, trim */
function cleanStr(s) {
  if (!s) return "";
  return s
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, "") // control chars except \n (handled below)
    .replace(/\r?\n/g, " ")      // newlines → space
    .replace(/&amp;/gi, "&")     // common HTML entities
    .replace(/&nbsp;/gi, " ")
    .replace(/&#?\w+;/gi, "")    // remaining HTML entities
    .replace(/\s+/g, " ")        // collapse whitespace
    .trim();
}

/** Title-case a string: "holy trinity church" → "Holy Trinity Church" */
function titleCase(s) {
  if (!s) return "";
  const small = new Set([
    "a", "an", "the", "and", "but", "or", "for", "nor",
    "at", "by", "in", "of", "on", "to", "up", "as",
  ]);
  return s
    .split(/\s+/)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && small.has(lower)) return lower;
      // Preserve all-caps abbreviations (2-3 chars) like "OCA", "NY"
      if (/^[A-Z]{2,3}$/.test(w)) return w;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

// ── Field sanitisers ─────────────────────────────────────────────────

/**
 * Clean a parish name:
 *  – strip "(www)" suffix
 *  – remove wrapping quotes
 *  – collapse whitespace
 *  – normalise to title case
 */
function sanitizeName(raw) {
  let s = cleanStr(raw);
  // Remove "(www)" marker that some ROCOR scrapers include
  s = s.replace(/\s*\(www\)\s*/gi, "");
  // Remove wrapping double-quotes: "Joy of All Who Sorrow" → Joy of All Who Sorrow
  s = s.replace(/^"(.*)"$/, "$1");
  // Remove wrapping single-quotes similarly
  s = s.replace(/^'(.*)'$/, "$1");
  // Normalise "St " / "Ss " / "Sts " variants
  s = s.replace(/^Sts?\.\s*/i, (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
  s = cleanStr(s); // re-trim after removals
  return s;
}

/**
 * Normalise US state codes to 2-letter uppercase abbreviations.
 * Non-US provinces/regions are title-cased as-is.
 */
function sanitizeState(raw) {
  const s = cleanStr(raw);
  if (!s) return "";

  // Already a valid 2-letter US abbreviation?
  const upper = s.toUpperCase();
  if (VALID_US_ABBRS.has(upper)) return upper;
  if (CA_PROVINCES.has(upper)) return upper;

  // Full state name → abbreviation
  const lower = s.toLowerCase();
  if (STATE_FULL_TO_ABBR[lower]) return STATE_FULL_TO_ABBR[lower];

  // Return title-cased for non-US/CA regions (e.g. Haitian departments)
  return titleCase(s);
}

/**
 * Normalise country.
 * If empty, infer from the state abbreviation.
 */
function sanitizeCountry(raw, state) {
  let s = cleanStr(raw);
  // Normalise known names
  const lower = s.toLowerCase();
  if (COUNTRY_CANONICAL[lower]) return COUNTRY_CANONICAL[lower];

  // Infer from state when country is missing
  if (!s && state) {
    const upperSt = state.toUpperCase();
    if (VALID_US_ABBRS.has(upperSt)) return "USA";
    if (CA_PROVINCES.has(upperSt)) return "Canada";
  }

  return s;
}

/**
 * Normalise jurisdiction to a canonical display name.
 * Falls back to source-based inference when the field is empty.
 */
function normaliseJurisdiction(raw, source) {
  const s = cleanStr(raw);
  const key = s.toLowerCase();
  if (JURISDICTION_CANONICAL[key]) return JURISDICTION_CANONICAL[key];
  if (!s && source && SOURCE_JURISDICTION[source]) {
    return SOURCE_JURISDICTION[source];
  }
  // Return cleaned original if not in our map (e.g. rare jurisdictions from assembly data)
  return s;
}

/**
 * Normalise a phone number to a consistent format.
 * US/CA numbers → (XXX) XXX-XXXX
 * International numbers → +CC (XXX) XXX-XXXX or left as-is
 */
function sanitizePhone(raw) {
  let s = cleanStr(raw);
  if (!s) return "";

  // Strip everything except digits and leading +
  const hasPlus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");

  if (!digits) return "";

  // US / Canada: 10 digits, or 11 digits starting with 1
  if (digits.length === 10) {
    const area = digits.slice(0, 3);
    const mid = digits.slice(3, 6);
    const last = digits.slice(6);
    return `(${area}) ${mid}-${last}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.slice(1, 4);
    const mid = digits.slice(4, 7);
    const last = digits.slice(7);
    return `(${area}) ${mid}-${last}`;
  }

  // International: keep the + prefix, group digits readably
  if (hasPlus || digits.length > 10) {
    return "+" + digits;
  }

  // Short/local numbers: return digits with original separators cleaned
  return s.replace(/[^\d()-\s+]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Normalise a website URL.
 *  – Prefix relative paths with the source's base URL
 *  – Ensure http(s):// prefix
 *  – Strip trailing slashes
 *  – Lowercase the hostname
 */
function sanitizeWebsite(raw, source) {
  let s = cleanStr(raw);
  if (!s) return "";

  // Relative path → absolute using source base URL
  if (s.startsWith("/")) {
    const base = SOURCE_BASE_URL[source];
    if (base) {
      s = base + s;
    } else {
      // Can't resolve; return empty rather than a broken relative path
      return "";
    }
  }

  // Add protocol if missing
  if (!s.match(/^https?:\/\//i)) {
    s = "https://" + s;
  }

  try {
    const url = new URL(s);
    // Lowercase hostname
    url.hostname = url.hostname.toLowerCase();
    // Remove trailing slash on path (but keep "/" root)
    let result = url.toString();
    if (result.endsWith("/") && url.pathname === "/") {
      result = result.slice(0, -1);
    }
    return result;
  } catch {
    // If URL parsing fails, return the cleaned string anyway
    return s;
  }
}

/**
 * Validate and normalise a latitude or longitude value.
 * Returns a string with up to 7 decimal places, or "" if invalid.
 */
function sanitizeLatLng(raw, type) {
  if (raw === "" || raw === null || raw === undefined) return "";
  const n = parseFloat(raw);
  if (isNaN(n)) return "";

  // Basic range validation
  if (type === "lat" && (n < -90 || n > 90)) return "";
  if (type === "lng" && (n < -180 || n > 180)) return "";

  return n.toFixed(7);
}

/**
 * Sanitise an address string.
 *  – Normalise common abbreviations (St → St., Ave → Ave., etc.)
 *  – Title-case
 */
function sanitizeAddress(raw) {
  let s = cleanStr(raw);
  if (!s) return "";
  return s;
}

/**
 * Sanitise a clergy name or list.
 */
function sanitizeClergy(raw) {
  let s = cleanStr(raw);
  if (!s) return "";
  // Remove leading/trailing semicolons or commas
  s = s.replace(/^[;,\s]+|[;,\s]+$/g, "");
  return s;
}

/**
 * Sanitise a diocese or deanery name.
 */
function sanitizeDivision(raw) {
  return cleanStr(raw);
}

/**
 * Sanitise a zip/postal code.
 *  – US: 5-digit or ZIP+4
 *  – Canada: A1A 1A1
 */
function sanitizeZip(raw) {
  let s = cleanStr(raw);
  if (!s) return "";
  // US ZIP: ensure 5 digits, optionally followed by -XXXX
  const usZip = s.match(/^(\d{5})(-\d{4})?$/);
  if (usZip) return usZip[0];
  // Canadian postal code: normalize spacing
  const caZip = s.replace(/\s+/g, "").toUpperCase();
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(caZip)) {
    return caZip.slice(0, 3) + " " + caZip.slice(3);
  }
  return s;
}

// ── Full record sanitiser ─────────────────────────────────────────────

/**
 * Sanitise and normalise a full parish record.
 * Accepts any shape of raw record from any scraper and returns a
 * consistent, cleaned object with canonical field names.
 *
 * @param {Object} raw - scraped record (may have 'parish' instead of 'name', etc.)
 * @param {string} [source] - override source identifier (otherwise uses raw.source)
 * @returns {Object} sanitised record
 */
function sanitizeRecord(raw, source) {
  const src = source || raw.source || "";
  const state = sanitizeState(raw.state);

  return {
    name: sanitizeName(raw.name || raw.parish || ""),
    jurisdiction: normaliseJurisdiction(raw.jurisdiction, src),
    diocese: sanitizeDivision(raw.diocese),
    deanery: sanitizeDivision(raw.deanery),
    city: cleanStr(raw.city),
    state,
    zip: sanitizeZip(raw.zip),
    country: sanitizeCountry(raw.country, state),
    phone: sanitizePhone(raw.phone),
    website: sanitizeWebsite(raw.website || raw.detailUrl || "", src),
    lat: sanitizeLatLng(raw.lat, "lat"),
    lng: sanitizeLatLng(raw.lng, "lng"),
    address: sanitizeAddress(raw.address),
    clergy: sanitizeClergy(raw.clergy),
    source: src,
  };
}

module.exports = {
  sanitizeRecord,
  sanitizeName,
  sanitizeState,
  sanitizeCountry,
  sanitizePhone,
  sanitizeWebsite,
  sanitizeLatLng,
  sanitizeAddress,
  sanitizeClergy,
  sanitizeZip,
  sanitizeDivision,
  normaliseJurisdiction,
  cleanStr,
  titleCase,
};
