/**
 * Shared utilities for routes
 */

// Jurisdiction → RGBA color mapping
const JURISDICTION_COLORS = {
  "Russian Orthodox Church Outside of Russia (ROCOR)":        [30, 100, 200, 100],
  "Orthodox Church in America (OCA)":                         [200, 40,  40, 100],
  "Greek Orthodox Archdiocese of America":                    [200, 170, 30, 100],
  "Antiochian Orthodox Christian Archdiocese of North America":[40, 160, 60, 100],
  "Serbian Orthodox Church in North and South America":       [0, 180, 180, 100],
  "Romanian Orthodox Archdiocese in the Americas":            [140, 50, 180, 100],
  "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia": [200, 120, 40, 100],
  "American Carpatho-Russian Orthodox Diocese":               [100, 60, 30, 100],
  "Ukrainian Orthodox Church of the USA (UOC-USA)":           [60, 120, 200, 100],
  "Albanian Orthodox Diocese of America":                     [180, 80, 100, 100],
  "Georgian Orthodox Church":                                 [80, 140, 80, 100],
  "Patriarchal Parishes of the Russian Orthodox Church in the USA": [100, 100, 180, 100],
};
const DEFAULT_COLOR = [128, 128, 128, 100];

/**
 * Importance classification for parishes
 * Returns an importance tier: "cathedral", "monastery", "seminary", "notable", or null
 */
function classifyImportance(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (/\bcathedral\b/.test(n)) return "cathedral";
  if (/\bmonaster(y|ies)\b/.test(n) || /\blavra\b/.test(n) || /\bskete\b/.test(n)) return "monastery";
  if (/\bseminar(y|ies)\b/.test(n)) return "seminary";
  if (/\bstavropeg/i.test(n) || /\bmetochion\b/.test(n)) return "notable";
  if (/\bbasili[ck]a\b/.test(n)) return "notable";
  return null;
}

/**
 * Authentication middleware
 */
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

module.exports = {
  JURISDICTION_COLORS,
  DEFAULT_COLOR,
  classifyImportance,
  requireAuth,
};
