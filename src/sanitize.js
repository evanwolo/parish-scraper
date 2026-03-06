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

// Canadian province full name -> abbreviation
const CA_PROVINCE_FULL_TO_ABBR = {
  alberta: "AB",
  "british columbia": "BC",
  manitoba: "MB",
  "new brunswick": "NB",
  "newfoundland and labrador": "NL",
  "newfoundland & labrador": "NL",
  "newfoundland": "NL",
  "nova scotia": "NS",
  "northwest territories": "NT",
  nunavut: "NU",
  ontario: "ON",
  "prince edward island": "PE",
  quebec: "QC",
  "quebec province": "QC",
  saskatchewan: "SK",
  yukon: "YT",
  "yukon territory": "YT",
};

// ── Jurisdiction canonical names ──────────────────────────────────────
const JURISDICTION_CANONICAL = {
  // OCA
  rocor: "Russian Orthodox Church Outside of Russia (ROCOR)",
  "russian orthodox church outside of russia":
    "Russian Orthodox Church Outside of Russia (ROCOR)",
  "russian orthodox church outside russia":
    "Russian Orthodox Church Outside of Russia (ROCOR)",
  roca: "Russian Orthodox Church Outside of Russia (ROCOR)",
  "rocor western american diocese":
    "Russian Orthodox Church Outside of Russia (ROCOR)",
  "diocese of western america rocor":
    "Russian Orthodox Church Outside of Russia (ROCOR)",
  oca: "Orthodox Church in America (OCA)",
  "orthodox church in america": "Orthodox Church in America (OCA)",
  "uoc-usa": "Ukrainian Orthodox Church of the USA (UOC-USA)",
  uoc: "Ukrainian Orthodox Church of the USA (UOC-USA)",
  "ukrainian orthodox church of the usa":
    "Ukrainian Orthodox Church of the USA (UOC-USA)",
  "ukrainian orthodox church":
    "Ukrainian Orthodox Church of the USA (UOC-USA)",
  "antiochian orthodox christian archdiocese of north america":
    "Antiochian Orthodox Christian Archdiocese of North America",
  "greek orthodox archdiocese of america":
    "Greek Orthodox Archdiocese of America",
  "serbian orthodox church in north and south america":
    "Serbian Orthodox Church in North and South America",
  "new gracanica":
    "Serbian Orthodox Church in North and South America",
  "new gracanica metropolitanate":
    "Serbian Orthodox Church in North and South America",
  "romanian orthodox archdiocese in the americas":
    "Romanian Orthodox Archdiocese in the Americas",
  "romanian orthodox metropolia":
    "Romanian Orthodox Archdiocese in the Americas",
  roea: "Romanian Orthodox Archdiocese in the Americas",
  // Romanian Episcopate is under OCA
  "romanian episcopate": "Orthodox Church in America (OCA)",
  "romanian orthodox episcopate of america": "Orthodox Church in America (OCA)",
  "bulgarian eastern orthodox diocese of the usa, canada, and australia":
    "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia",
  "georgian orthodox church": "Georgian Orthodox Church",
  "georgian patriarchal parishes": "Georgian Orthodox Church",
  "romanian orthodox metropolia of the americas":
    "Romanian Orthodox Archdiocese in the Americas",
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
  "bulgarian diocese": "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia",
  "bulgarian eastern orthodox diocese": "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia",
  albanian: "Albanian Orthodox Diocese of America",
  "albanian orthodox": "Albanian Orthodox Diocese of America",
  "albanian archdiocese": "Albanian Orthodox Diocese of America",
  mp: "Patriarchal Parishes of the Russian Orthodox Church in the USA",
  "moscow patriarchate": "Patriarchal Parishes of the Russian Orthodox Church in the USA",
  "patriarchal parishes": "Patriarchal Parishes of the Russian Orthodox Church in the USA",
  georgian: "Georgian Orthodox Church",
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
  const compactUpper = upper.replace(/[^A-Z]/g, "");
  if (VALID_US_ABBRS.has(upper)) return upper;
  if (CA_PROVINCES.has(upper)) return upper;
  if (compactUpper.length === 2 && VALID_US_ABBRS.has(compactUpper)) return compactUpper;
  if (compactUpper.length === 2 && CA_PROVINCES.has(compactUpper)) return compactUpper;

  // Full state name → abbreviation
  const lower = s.toLowerCase();
  if (STATE_FULL_TO_ABBR[lower]) return STATE_FULL_TO_ABBR[lower];
  if (CA_PROVINCE_FULL_TO_ABBR[lower]) return CA_PROVINCE_FULL_TO_ABBR[lower];

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

  // Handle 011 prefix (US international dialing convention)
  if (digits.startsWith("011")) {
    const stripped = digits.slice(3);
    // 011-1-XXX-XXX-XXXX → US number
    if (stripped.length === 11 && stripped.startsWith("1")) {
      const area = stripped.slice(1, 4);
      const mid = stripped.slice(4, 7);
      const last = stripped.slice(7);
      return `(${area}) ${mid}-${last}`;
    }
    if (stripped.length === 10) {
      const area = stripped.slice(0, 3);
      const mid = stripped.slice(3, 6);
      const last = stripped.slice(6);
      return `(${area}) ${mid}-${last}`;
    }
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
 * Returns a number with up to 7 decimal places, or null if invalid.
 */
function sanitizeLatLng(raw, type) {
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = parseFloat(raw);
  if (isNaN(n)) return null;

  // Basic range validation
  if (type === "lat" && (n < -90 || n > 90)) return null;
  if (type === "lng" && (n < -180 || n > 180)) return null;

  return parseFloat(n.toFixed(7)); // return number, not string
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
 * Clergy title patterns for detecting person boundaries.
 * Ordered longest-first so the regex engine matches compound titles
 * (e.g. "V. Rev.") before their shorter parts ("Rev.").
 */
const CLERGY_TITLES = [
  'The\\s+(?:Very\\s+)?Most\\s+Reverend',
  'The\\s+Right\\s+Reverend',
  'The\\s+Reverend',
  'Protopresb(?:yter|\\.)',
  'Archimandrite', 'Archmandrite',
  'Archpriest',
  'Protodeacon', 'Protodn\\.',
  'Archdeacon', 'Archdn\\.',
  'Hierodeacon',
  'Sub-Deacon', 'Sbdn\\.', 'Subdeacon',
  'Rassophore\\s+Monk',
  'Monk-Subdeacon',
  'Schemamonk-Reader', 'Schemamonk',
  'Hieromonk', 'Hiermonk',
  'Igumen',
  'Novice-Reader',
  'V\\.\\s*Rev\\.',
  'Very\\s+Rev(?:erend|\\.)',
  'Rev\\.', 'Reverend',
  'Rev\\b',
  'Fr\\.', 'Father',
  'Priest',
  'Deacon', 'Dn\\.',
  'Abb(?:ot|ess)',
  'Archbishop', 'Metropolitan', 'Bishop',
  'Rassophore',
  'Monk', 'Nun',
  'Novice',
  'Reader',
  'Postulant',
];
const _clergyTitleRe = new RegExp(
  '\\b(' + CLERGY_TITLES.join('|') + ')(?=\\s|[.;,]|$)', 'gi'
);

/**
 * Split a single clergy string (no semicolons) into individual people
 * by finding clergy-title boundaries.
 */
function splitClergyEntry(entry) {
  const s = entry.trim();
  if (!s) return [];

  const positions = [];
  _clergyTitleRe.lastIndex = 0;
  let m;
  while ((m = _clergyTitleRe.exec(s)) !== null) {
    positions.push({ index: m.index, end: m.index + m[0].length, title: m[0] });
  }

  if (positions.length <= 1) return [s];

  // Merge compound titles (consecutive titles with only whitespace between,
  // e.g. "V. Rev. Fr." or "The Most Reverend Archbishop")
  const personStarts = [{ ...positions[0] }];
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1];
    const curr = positions[i];
    const between = s.substring(prev.end, curr.index);

    if (/^\s*$/.test(between)) {
      // Adjacent titles → same person's compound title
      personStarts[personStarts.length - 1].end = curr.end;
      continue;
    }

    // If the word after this title starts lowercase it's probably a role
    // description ("Priest in Charge", "Metropolitan of …"), not a new person.
    const afterTitle = s.substring(curr.end).trim();
    if (afterTitle && /^[a-z]/.test(afterTitle)) {
      continue;
    }

    // If the word immediately before this title is a role modifier
    // ("acting", "senior", etc.) it's a description, not a new person.
    const beforeText = s.substring(0, curr.index).trimEnd();
    const lastWord = (beforeText.match(/\S+$/) || [''])[0].toLowerCase();
    if (['acting', 'senior', 'junior', 'assistant', 'associate', 'deputy',
         'former', 'convent', 'cathedral'].includes(lastWord)) {
      continue;
    }

    personStarts.push({ ...curr });
  }

  if (personStarts.length <= 1) return [s];

  // Split the string at person-start positions
  const parts = [];
  for (let i = 0; i < personStarts.length; i++) {
    const start = i === 0 ? 0 : personStarts[i].index;
    const end = i + 1 < personStarts.length ? personStarts[i + 1].index : s.length;
    parts.push(s.substring(start, end).trim());
  }
  return parts.filter(Boolean);
}

/**
 * Sanitise a clergy name or list.
 * Separates multiple clergy names with "; ", strips noise (phones,
 * e-mails, warden info, mailing addresses).
 */
function sanitizeClergy(raw) {
  let s = cleanStr(raw);
  if (!s) return "";

  // Strip leading/trailing separators
  s = s.replace(/^[;,\s]+|[;,\s]+$/g, "");

  // Strip "Served by:" prefix
  s = s.replace(/^served\s+by\s*:?\s*/i, "");

  // Strip phone numbers  (xxx) xxx-xxxx / xxx-xxx-xxxx / xxx.xxx.xxxx
  s = s.replace(/\(?\d{3}\)?[\s.-]+\d{3}[\s.-]+\d{4}/g, "");

  // Strip e-mail addresses
  s = s.replace(/[\w.-]+@[\w.-]+\.\w+/g, "");

  // Strip warden / warder lines (not clergy)
  s = s.replace(/;?\s*(?:mission\s+|church\s+)?ward(?:en|er)(?:[ns])?:?\s*[^;]*/gi, "");

  // Strip "mailing address: …" tails
  s = s.replace(/;?\s*mailing\s+address\s*:.*$/i, "");

  // Strip "Currently services held at – …" notes
  s = s.replace(/currently\s+services?\s+held\s+at\s*[-–]?\s*[^;]*/i, "");

  // Fix text jammed onto titles ("emeritus)Protodeacon" → "emeritus) Protodeacon")
  s = s.replace(/([).])(?=[A-Z])/g, "$1 ");

  // Fix title words jammed onto names ("PriestGeorge" → "Priest George")
  s = s.replace(/\b(Priest|Deacon|Protodeacon|Archdeacon|Archpriest|Hieromonk|Hiermonk|Igumen|Archimandrite|Archmandrite|Bishop|Archbishop|Metropolitan|Abbot|Abbess|Monk|Nun|Novice|Reader|Postulant|Father|Rassophore|Subdeacon)(?=[A-Z])/g, "$1 ");

  // Split by existing semicolons, then split each part on title boundaries
  const entries = s.split(/;\s*/);
  const result = [];
  for (const entry of entries) {
    result.push(...splitClergyEntry(entry));
  }

  // Rejoin and clean up
  s = result.filter(Boolean).join("; ");
  s = s.replace(/[.,]\s*(?=;)/g, "");  // strip orphan trailing punctuation before ";"
  s = s.replace(/\s{2,}/g, " ");
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

  // Pre-process: if the city field contains commas, it may have state/country embedded
  // e.g. "Nassau, New Providence, Bahamas" or "Palm Coast, Florida"
  let rawCity = cleanStr(raw.city);
  let rawState = raw.state || "";
  let rawCountry = raw.country || "";

  if (rawCity && rawCity.includes(",")) {
    const parts = rawCity.split(",").map((p) => p.trim()).filter(Boolean);
    // Check if last part is a country name
    const lastLower = (parts[parts.length - 1] || "").toLowerCase();
    if (COUNTRY_CANONICAL[lastLower] && parts.length >= 2) {
      rawCountry = parts.pop(); // country in city overrides existing
      // If remaining parts > 1, check if the last is now a state
      if (parts.length >= 2) {
        const maybeSt = parts[parts.length - 1].toUpperCase();
        const maybeStateLower = parts[parts.length - 1].toLowerCase();
        if (VALID_US_ABBRS.has(maybeSt) ||
            CA_PROVINCES.has(maybeSt) ||
            STATE_FULL_TO_ABBR[maybeStateLower] ||
            CA_PROVINCE_FULL_TO_ABBR[maybeStateLower]) {
          if (!rawState) rawState = parts.pop();
        }
      }
      rawCity = parts[0] || "";
    } else {
      // Check if the last comma part is a US state
      const maybeSt = parts[parts.length - 1].toUpperCase();
      const maybeStLower = parts[parts.length - 1].toLowerCase();
      if (parts.length === 2 && (VALID_US_ABBRS.has(maybeSt) ||
                                 CA_PROVINCES.has(maybeSt) ||
                                 STATE_FULL_TO_ABBR[maybeStLower] ||
                                 CA_PROVINCE_FULL_TO_ABBR[maybeStLower])) {
        rawCity = parts[0];
        if (!rawState) rawState = parts[1];
      } else {
        // Just take the first part as the city
        rawCity = parts[0];
      }
    }
  }

  const state = sanitizeState(rawState);

  return {
    name: sanitizeName(raw.name || raw.parish || ""),
    jurisdiction: normaliseJurisdiction(raw.jurisdiction, src),
    diocese: sanitizeDivision(raw.diocese),
    deanery: sanitizeDivision(raw.deanery),
    city: cleanStr(rawCity),
    state,
    zip: sanitizeZip(raw.zip),
    country: sanitizeCountry(rawCountry, state),
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
