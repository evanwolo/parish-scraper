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

// Load data from JSON files
const PATRIARCHATE_HIERARCHY = require("../data/patriarchate-hierarchy.json");
const DIOCESE_REGISTRY = require("../data/diocese-registry.json");

// ── Public API ────────────────────────────────────────────────────────

/**
 * Find which patriarchate/mother church a jurisdiction belongs to.
 * Returns "Autocephalous" for OCA, the patriarchate name otherwise.
 */
function getPatriarchate(jurisdiction) {
  if (!jurisdiction) return "Unknown";
  for (const [patriarchate, jurisdictions] of Object.entries(PATRIARCHATE_HIERARCHY)) {
    if (jurisdictions.includes(jurisdiction)) {
      return patriarchate;
    }
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
