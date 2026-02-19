/**
 * Canonical diocese lookup — source of truth for hierarchy mapping.
 *
 * Hierarchy: Patriarchate → Jurisdiction → Diocese → Deanery → Parish
 *
 * This module provides authoritative mappings independent of scraper data.
 * Each diocese entry includes its canonical name, parent jurisdiction,
 * and optional geographic hints (states/regions it covers).
 *
 * Usage:
 *   const { lookupDiocese, getPatriarchate } = require("./diocese-lookup");
 *   const info  = lookupDiocese("Diocese of the Midwest");
 *   const mother = getPatriarchate("Orthodox Church in America (OCA)");
 */

// ── Patriarchate / Mother Church hierarchy ──────────────────────────────
const PATRIARCHATE_HIERARCHY = {
  "Ecumenical Patriarchate of Constantinople": [
    "Greek Orthodox Archdiocese of America",
    "Ukrainian Orthodox Church of the USA (UOC-USA)",
    "American Carpatho-Russian Orthodox Diocese",
    "Albanian Orthodox Diocese of America",
  ],
  "Moscow Patriarchate": [
    "Russian Orthodox Church Outside of Russia (ROCOR)",
    "Patriarchal Parishes of the Russian Orthodox Church in the USA",
  ],
  "Autocephalous": [
    "Orthodox Church in America (OCA)",
  ],
  "Patriarchate of Antioch": [
    "Antiochian Orthodox Christian Archdiocese of North America",
  ],
  "Serbian Patriarchate": [
    "Serbian Orthodox Church in North and South America",
  ],
  "Romanian Patriarchate": [
    "Romanian Orthodox Archdiocese in the Americas",
  ],
  "Bulgarian Patriarchate": [
    "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia",
  ],
  "Georgian Patriarchate": [
    "Georgian Orthodox Church",
  ],
};

// ── Canonical diocese registry ──────────────────────────────────────────
// Each entry: { jurisdiction, region (human label), states (if applicable) }

const DIOCESE_REGISTRY = {

  /* ================================================================
   * ORTHODOX CHURCH IN AMERICA  (OCA)  —  Autocephalous
   * Note: Romanian Episcopate is an OCA ethnic diocese.
   * Albanian and Bulgarian dioceses were historically associated but
   * are now canonically under Constantinople and Bulgarian Patriarchate.
   * ================================================================ */
  "Diocese of Alaska": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "Alaska",
    states: ["AK"],
    bishop: "Bishop Alexei (Trader)",
  },
  "Albanian Archdiocese": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "Albanian Archdiocese (national, under OCA)",
    states: ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"],
    bishop: "Administered by the Metropolitan",
  },
  "Bulgarian Diocese": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "Bulgarian Diocese (national, under OCA)",
    states: ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"],
    bishop: "Bishop Alexander (Golitzin), retired",
  },
  "Romanian Episcopate": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "Romanian Episcopate (national, under OCA)",
    states: ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"],
    bishop: "Bishop Andrei (Moldovan)",
  },
  "Archdiocese of Canada": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "Canada",
    states: ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"],
    bishop: "Archbishop Irénée (Rochon)",
  },
  "Archdiocese of Washington, D.C.": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "Washington D.C. area",
    states: ["DC", "MD", "VA"],
    bishop: "Metropolitan Tikhon (Mollard)",
  },
  "Diocese of Eastern Pennsylvania": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "Eastern Pennsylvania",
    states: ["PA"],
    bishop: "Bishop Mark (Maymon)",
  },
  "Archdiocese of Western Pennsylvania": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "Western Pennsylvania",
    states: ["PA", "WV"],
    bishop: "Bishop Melchisedek (Pleska)",
  },
  "Diocese of Mexico": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "Mexico",
    states: ["MX"],
    bishop: "Bishop Andrés (Girón)",
  },
  "Diocese of the Midwest": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "Midwest",
    states: ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
    bishop: "Bishop Daniel (Findikyan)",
  },
  "Diocese of New England": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "New England",
    states: ["CT", "MA", "ME", "NH", "RI", "VT"],
    bishop: "Bishop Nikon (Limonczenko)",
  },
  "Diocese of New York and New Jersey": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "New York & New Jersey",
    states: ["NY", "NJ"],
    bishop: "Archbishop Michael (Dahulich)",
  },
  "Diocese of the South": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "Southern United States",
    states: ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "OK", "SC", "TN", "TX", "VA"],
    bishop: "Archbishop Alexander (Golitzin)",
  },
  "Diocese of the West": {
    jurisdiction: "Orthodox Church in America (OCA)",
    region: "Western United States",
    states: ["AZ", "CA", "CO", "HI", "ID", "MT", "NM", "NV", "OR", "UT", "WA", "WY"],
    bishop: "Bishop Gerasim (Eliel)",
  },

  /* ================================================================
   * RUSSIAN ORTHODOX CHURCH OUTSIDE OF RUSSIA  (ROCOR)
   * Under Moscow Patriarchate since 2007
   * ================================================================ */
  "Eastern American Diocese": {
    jurisdiction: "Russian Orthodox Church Outside of Russia (ROCOR)",
    region: "Eastern United States",
    states: ["CT", "DC", "DE", "FL", "GA", "MA", "MD", "ME", "NC", "NH", "NJ", "NY", "PA", "PR", "RI", "SC", "VA", "VT", "WV"],
    bishop: "Metropolitan Nicholas (Olhovsky)",
  },
  "Diocese of Chicago and Mid-America": {
    jurisdiction: "Russian Orthodox Church Outside of Russia (ROCOR)",
    region: "Chicago & Mid-America",
    states: ["AL", "AR", "CO", "IA", "IL", "IN", "KS", "KY", "LA", "MI", "MN", "MO", "MS", "MT", "MX", "ND", "NE", "NM", "OH", "OK", "SD", "TN", "TX", "WI", "WY"],
    bishop: "Bishop Peter (Lukianov)",
  },
  "Diocese of Western America": {
    jurisdiction: "Russian Orthodox Church Outside of Russia (ROCOR)",
    region: "Western United States",
    states: ["AK", "AZ", "CA", "HI", "ID", "NV", "OR", "UT", "WA"],
    bishop: "Archbishop Kyrill (Dmitrieff)",
  },
  "Diocese of Australia and New Zealand": {
    jurisdiction: "Russian Orthodox Church Outside of Russia (ROCOR)",
    region: "Australia & New Zealand",
    states: ["AU", "NZ"],
    bishop: "Bishop George (Schaefer)",
  },
  "Diocese of Montreal and Canada": {
    jurisdiction: "Russian Orthodox Church Outside of Russia (ROCOR)",
    region: "Canada",
    states: ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"],
    bishop: "Bishop Irenei (Steenberg)",
  },
  "Diocese of South America": {
    jurisdiction: "Russian Orthodox Church Outside of Russia (ROCOR)",
    region: "South America",
    states: ["AR", "BO", "BR", "CL", "CO", "EC", "GY", "PY", "PE", "SR", "UY", "VE"],
    bishop: "Bishop John (Kallos)",
  },

  /* ================================================================
   * GREEK ORTHODOX ARCHDIOCESE OF AMERICA  (GOARCH)
   * Under Ecumenical Patriarchate of Constantinople
   * ================================================================ */
  "Direct Archdiocesan District": {
    jurisdiction: "Greek Orthodox Archdiocese of America",
    region: "New York area (Direct Archdiocesan District)",
    states: ["NY", "NJ", "CT"],
    bishop: "Archbishop Elpidophoros (Lambriniadis)",
  },
  "Metropolis of Chicago": {
    jurisdiction: "Greek Orthodox Archdiocese of America",
    region: "Midwest",
    states: ["IL", "IN", "IA", "MN", "MO", "WI"],
    bishop: "Metropolitan Nathanael (Symeonides)",
  },
  "Metropolis of Atlanta": {
    jurisdiction: "Greek Orthodox Archdiocese of America",
    region: "Southeast",
    states: ["AL", "FL", "GA", "MS", "NC", "SC", "TN"],
    bishop: "Metropolitan Alexios (Panagiotopoulos)",
  },
  "Metropolis of Denver": {
    jurisdiction: "Greek Orthodox Archdiocese of America",
    region: "Mountain West",
    states: ["AZ", "AR", "CO", "KS", "LA", "NE", "NM", "OK", "SD", "TX", "UT", "WY"],
    bishop: "Metropolitan Isaiah (Chronopoulos), retired",
  },
  "Metropolis of Detroit": {
    jurisdiction: "Greek Orthodox Archdiocese of America",
    region: "Great Lakes",
    states: ["IN", "KY", "MI", "OH", "WV"],
    bishop: "Metropolitan Nicholas (Pissaris)",
  },
  "Metropolis of Pittsburgh": {
    jurisdiction: "Greek Orthodox Archdiocese of America",
    region: "Mid-Atlantic",
    states: ["DC", "DE", "MD", "PA", "VA"],
    bishop: "Metropolitan Savas (Zembillas)",
  },
  "Metropolis of San Francisco": {
    jurisdiction: "Greek Orthodox Archdiocese of America",
    region: "Pacific",
    states: ["AK", "CA", "HI", "ID", "MT", "NV", "OR", "WA"],
    bishop: "Metropolitan Gerasimos (Michaleas)",
  },
  "Metropolis of New Jersey": {
    jurisdiction: "Greek Orthodox Archdiocese of America",
    region: "New Jersey",
    states: ["NJ"],
    bishop: "Metropolitan Apostolos (Koufalakis)",
  },
  "Metropolis of Boston": {
    jurisdiction: "Greek Orthodox Archdiocese of America",
    region: "New England",
    states: ["CT", "MA", "ME", "NH", "RI", "VT"],
    bishop: "Metropolitan Methodios (Tournas)",
  },
  // Alias used by some data sources
  "Metropolis of New England": {
    jurisdiction: "Greek Orthodox Archdiocese of America",
    region: "New England",
    states: ["CT", "MA", "ME", "NH", "RI", "VT"],
    bishop: "Metropolitan Methodios (Tournas)",
  },

  /* ================================================================
   * ANTIOCHIAN ORTHODOX CHRISTIAN ARCHDIOCESE OF NORTH AMERICA
   * Under Patriarchate of Antioch
   * ================================================================ */
  "Antiochian Archdiocese": {
    jurisdiction: "Antiochian Orthodox Christian Archdiocese of North America",
    region: "North America (national)",
    states: ["PR"],
    bishop: "Metropolitan Saba (Isper)",
  },
  "Diocese of Los Angeles and the West": {
    jurisdiction: "Antiochian Orthodox Christian Archdiocese of North America",
    region: "Western United States",
    states: ["AZ", "CA", "CO", "HI", "ID", "MT", "NM", "NV", "OR", "UT", "WA", "WY"],
    bishop: "Bishop Joseph (Al-Zehlaoui)",
  },
  "Diocese of Eagle River and the Northwest": {
    jurisdiction: "Antiochian Orthodox Christian Archdiocese of North America",
    region: "Pacific Northwest",
    states: ["AK", "ID", "MT", "OR", "WA"],
    bishop: "Bishop Gerasimos",
  },
  "Diocese of Wichita and Mid-America": {
    jurisdiction: "Antiochian Orthodox Christian Archdiocese of North America",
    region: "Mid-America",
    states: ["AR", "KS", "LA", "MO", "NE", "OK", "TX"],
    bishop: "Bishop Basil (Essey)",
  },
  "Diocese of Toledo and the Midwest": {
    jurisdiction: "Antiochian Orthodox Christian Archdiocese of North America",
    region: "Midwest",
    states: ["IA", "IL", "IN", "MI", "MN", "ND", "OH", "SD", "WI"],
    bishop: "Bishop Anthony (Michaels)",
  },
  "Diocese of Ottawa, Eastern Canada, and Upstate New York": {
    jurisdiction: "Antiochian Orthodox Christian Archdiocese of North America",
    region: "Eastern Canada & Upstate NY",
    states: ["NY"],
    bishop: "Bishop Alexander (Mufarrij)",
  },
  "Diocese of Charleston, Oakland, and the Mid-Atlantic": {
    jurisdiction: "Antiochian Orthodox Christian Archdiocese of North America",
    region: "Mid-Atlantic",
    states: ["DC", "DE", "KY", "MD", "NC", "PA", "SC", "TN", "VA", "WV"],
    bishop: "Bishop Thomas (Joseph)",
  },
  "Diocese of New York and the Southeast": {
    jurisdiction: "Antiochian Orthodox Christian Archdiocese of North America",
    region: "New York",
    states: ["NY"],
    bishop: "Metropolitan Saba (Isper)",
  },
  "Diocese of Miami and the Southeast": {
    jurisdiction: "Antiochian Orthodox Christian Archdiocese of North America",
    region: "Southeast",
    states: ["AL", "FL", "GA", "MS"],
    bishop: "Bishop Nicholas (Ozone)",
  },
  "Diocese of Worcester and New England": {
    jurisdiction: "Antiochian Orthodox Christian Archdiocese of North America",
    region: "New England",
    states: ["CT", "MA", "ME", "NH", "NJ", "RI", "VT"],
    bishop: "Bishop John (Abdalah)",
  },

  /* ================================================================
   * SERBIAN ORTHODOX CHURCH IN NORTH AND SOUTH AMERICA
   * Under Serbian Patriarchate
   * ================================================================ */
  "Eastern Diocese (Serbian)": {
    jurisdiction: "Serbian Orthodox Church in North and South America",
    region: "Eastern United States",
    states: ["CT", "DC", "DE", "MA", "MD", "ME", "NH", "NJ", "NY", "PA", "RI", "VA", "VT", "WV"],
    bishop: "Bishop Irinej (Dobrijevic)",
  },
  "Western Diocese (Serbian)": {
    jurisdiction: "Serbian Orthodox Church in North and South America",
    region: "Western United States",
    states: ["AK", "AZ", "CA", "CO", "HI", "ID", "MT", "NM", "NV", "OR", "UT", "WA", "WY"],
    bishop: "Bishop Maxim (Vasiljevic)",
  },
  "Midwest Diocese (Serbian)": {
    jurisdiction: "Serbian Orthodox Church in North and South America",
    region: "Midwest",
    states: ["IA", "KS", "MN", "MO", "NE", "ND", "SD", "WI"],
    bishop: "Bishop Longin (Krco)",
  },
  "New Gracanica Metropolitanate": {
    jurisdiction: "Serbian Orthodox Church in North and South America",
    region: "Midwest (New Gracanica / Libertyville)",
    states: ["IL", "IN", "MI", "MN", "OH", "WI"],
    bishop: "Metropolitan Longin (Krco)",
  },
  "Diocese of Canada (Serbian)": {
    jurisdiction: "Serbian Orthodox Church in North and South America",
    region: "Canada",
    states: ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"],
    bishop: "Bishop Mitrophan (Kodic)",
  },

  /* ================================================================
   * ROMANIAN ORTHODOX ARCHDIOCESE IN THE AMERICAS
   * Under Romanian Patriarchate (Bucharest)
   * DISTINCT from the OCA Romanian Episcopate above.
   * ================================================================ */
  "Romanian Orthodox Archdiocese in the Americas": {
    jurisdiction: "Romanian Orthodox Archdiocese in the Americas",
    region: "North America (national)",
    states: ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"],
    bishop: "Archbishop and Metropolitan Nicolae (Condrea)",
  },

  /* ================================================================
   * BULGARIAN EASTERN ORTHODOX DIOCESE
   * Under Bulgarian Patriarchate (Sofia).
   * ================================================================ */
  "Bulgarian Eastern Orthodox Diocese": {
    jurisdiction: "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia",
    region: "North America (national)",
    states: ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT", "AU", "NZ"],
    bishop: "Bishop Alexander (Golitzin)",
  },

  /* ================================================================
   * AMERICAN CARPATHO-RUSSIAN ORTHODOX DIOCESE  (ACROD)
   * Under Ecumenical Patriarchate of Constantinople
   * ================================================================ */
  "American Carpatho-Russian Orthodox Diocese": {
    jurisdiction: "American Carpatho-Russian Orthodox Diocese",
    region: "North America (national)",
    states: ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"],
    bishop: "Metropolitan Gregory (Tatsis)",
  },

  /* ================================================================
   * UKRAINIAN ORTHODOX CHURCH OF THE USA  (UOC-USA)
   * Under Ecumenical Patriarchate of Constantinople
   * ================================================================ */
  "UOC-USA": {
    jurisdiction: "Ukrainian Orthodox Church of the USA (UOC-USA)",
    region: "North America (national)",
    states: ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"],
    bishop: "Metropolitan Antony (Scharba)",
  },

  /* ================================================================
   * ALBANIAN ORTHODOX DIOCESE OF AMERICA
   * Under Ecumenical Patriarchate of Constantinople.
   * ================================================================ */
  "Albanian Orthodox Diocese of America": {
    jurisdiction: "Albanian Orthodox Diocese of America",
    region: "North America (national)",
    states: ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"],
    bishop: "Administered by the Metropolitan",
  },

  /* ================================================================
   * GEORGIAN ORTHODOX CHURCH
   * Under Georgian Patriarchate
   * ================================================================ */
  "Georgian Orthodox Church": {
    jurisdiction: "Georgian Orthodox Church",
    region: "North America (national)",
    states: ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"],
    bishop: "Catholicos-Patriarch Ilia II",
  },

  /* ================================================================
   * PATRIARCHAL PARISHES OF THE RUSSIAN ORTHODOX CHURCH IN THE USA
   * Directly under Moscow Patriarchate
   * ================================================================ */
  "Patriarchal Parishes of the Russian Orthodox Church in the USA": {
    jurisdiction: "Patriarchal Parishes of the Russian Orthodox Church in the USA",
    region: "North America (national)",
    states: ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"],
    bishop: "Patriarch Kirill of Moscow",
  },
};

// ── Fast lookup helpers ─────────────────────────────────────────────────

/**
 * Get the mother church / patriarchate for a jurisdiction.
 */
function getPatriarchate(jurisdiction) {
  if (!jurisdiction) return "Unknown";
  for (const [patriarchate, jurisdictions] of Object.entries(PATRIARCHATE_HIERARCHY)) {
    if (jurisdictions.includes(jurisdiction)) return patriarchate;
  }
  return "Unknown";
}

/**
 * Fuzzy-match a diocese name against the registry.
 * Tries exact match first, then substring/normalised match.
 */
function lookupDiocese(name) {
  if (!name) return null;
  // Exact match
  if (DIOCESE_REGISTRY[name]) return { diocese: name, ...DIOCESE_REGISTRY[name] };

  // Normalised match
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [key, val] of Object.entries(DIOCESE_REGISTRY)) {
    const kNorm = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (kNorm === norm || norm.includes(kNorm) || kNorm.includes(norm)) {
      return { diocese: key, ...val };
    }
  }
  return null;
}

/**
 * Return all dioceses belonging to a jurisdiction.
 */
function getDiocesesForJurisdiction(jurisdiction) {
  return Object.entries(DIOCESE_REGISTRY)
    .filter(([, val]) => val.jurisdiction === jurisdiction)
    .map(([key, val]) => ({ diocese: key, ...val }));
}

/**
 * Return the full registry for iteration.
 */
function getAllDioceses() {
  return Object.entries(DIOCESE_REGISTRY).map(([key, val]) => ({ diocese: key, ...val }));
}

/**
 * Given a parish's diocese field (possibly empty) and jurisdiction,
 * resolve the canonical diocese name.
 */
function resolveCanonicalDiocese(diocese, jurisdiction) {
  if (diocese) {
    const match = lookupDiocese(diocese);
    if (match) return match.diocese;
  }
  // Fall back to jurisdiction-as-diocese for single-diocese jurisdictions
  if (jurisdiction) {
    const jDioceses = getDiocesesForJurisdiction(jurisdiction);
    if (jDioceses.length === 1) return jDioceses[0].diocese;
  }
  return diocese || jurisdiction || "Unknown";
}

module.exports = {
  DIOCESE_REGISTRY,
  PATRIARCHATE_HIERARCHY,
  lookupDiocese,
  getDiocesesForJurisdiction,
  getAllDioceses,
  resolveCanonicalDiocese,
  getPatriarchate,
};
