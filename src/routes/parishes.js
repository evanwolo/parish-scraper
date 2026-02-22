/**
 * Parish and map API routes
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const { getDb, DB_PATH } = require("../db");
const {
  PATRIARCHATE_HIERARCHY,
  getDiocesesForJurisdiction,
  getPatriarchate,
  lookupDiocese,
} = require("../diocese-lookup");
const {
  classifyImportance,
  JURISDICTION_COLORS,
  DEFAULT_COLOR,
} = require("./middleware");

const router = express.Router();

// ── Parish cache ──────────────────────────────────────────────────────
let _parishCache = null;

/**
 * Load and cache all parishes from JSON files, deduplicated and sanitized
 */
function getParishes() {
  if (_parishCache) return _parishCache;
  const db = getDb();
  const rows = db.prepare("SELECT * FROM parishes").all();
  console.log(`[api] Cached ${rows.length} parishes from DB`);
  _parishCache = rows;
  return _parishCache;
}

// ── API: return all parishes as JSON (cached) ────────────────────────
router.get("/parishes", (_req, res) => res.json(getParishes()));

// ── API: list available sources ───────────────────────────────────────
router.get("/sources", (_req, res) => {
  const outDir = path.join(__dirname, "..", "..", "output");
  if (!fs.existsSync(outDir)) return res.json([]);
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".json") && f !== "all-parishes.json");
  res.json(files.map((f) => f.replace(".json", "")));
});

// ── API: stats (includes patriarchate breakdown) ─────────────────────
router.get("/stats", (_req, res) => {
  try {
    const db = getDb();
    const total = db.prepare("SELECT COUNT(*) as n FROM parishes").get().n;
    const byPatriarchate = db
      .prepare("SELECT patriarchate, COUNT(*) as count FROM parishes WHERE patriarchate != '' GROUP BY patriarchate ORDER BY count DESC")
      .all();
    const byJurisdiction = db
      .prepare("SELECT jurisdiction, COUNT(*) as count FROM parishes GROUP BY jurisdiction ORDER BY count DESC")
      .all();
    const byState = db
      .prepare("SELECT state, COUNT(*) as count FROM parishes WHERE state != '' GROUP BY state ORDER BY count DESC")
      .all();
    res.json({ total, byPatriarchate, byJurisdiction, byState });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── API: jurisdictions with patriarchate info ────────────────────────
router.get("/jurisdictions", (_req, res) => {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT DISTINCT jurisdiction FROM parishes ORDER BY jurisdiction")
      .all();
    const result = rows.map((r) => ({
      jurisdiction: r.jurisdiction,
      patriarchate: getPatriarchate(r.jurisdiction),
      color: JURISDICTION_COLORS[r.jurisdiction] || DEFAULT_COLOR,
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── API: full hierarchy tree ─────────────────────────────────────────
router.get("/hierarchy", (_req, res) => {
  try {
    const db = getDb();

    // Parish counts by jurisdiction
    const countsByJurisdiction = {};
    for (const row of db.prepare(
      "SELECT jurisdiction, COUNT(*) as count FROM parishes GROUP BY jurisdiction"
    ).all()) {
      countsByJurisdiction[row.jurisdiction] = row.count;
    }

    // Parish counts by jurisdiction + diocese
    const countsByDiocese = {};
    for (const row of db.prepare(
      "SELECT jurisdiction, diocese, COUNT(*) as count FROM parishes GROUP BY jurisdiction, diocese"
    ).all()) {
      countsByDiocese[`${row.jurisdiction}|||${row.diocese}`] = row.count;
    }

    const tree = [];
    for (const [patriarchate, jurisdictions] of Object.entries(PATRIARCHATE_HIERARCHY)) {
      const jurNodes = jurisdictions.map((jur) => {
        const registryDioceses = getDiocesesForJurisdiction(jur);
        return {
          name: jur,
          color: JURISDICTION_COLORS[jur] || DEFAULT_COLOR,
          parishCount: countsByJurisdiction[jur] || 0,
          dioceses: registryDioceses.map((d) => ({
            name: d.diocese,
            region: d.region,
            states: d.states,
            bishop: d.bishop || null,
            parishCount: countsByDiocese[`${jur}|||${d.diocese}`] || 0,
          })),
        };
      });
      tree.push({ patriarchate, jurisdictions: jurNodes });
    }

    res.json(tree);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Map API: diocese polygons (Tier 1 — overlapping hulls) ────────────
router.get("/map/dioceses", (_req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: "Database not found. Run: npm run compute" });
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM polygons WHERE tier = 1").all();
    // Get parish counts per diocese
    const countRows = db.prepare(
      "SELECT diocese, COUNT(*) as cnt FROM parishes WHERE lat IS NOT NULL GROUP BY diocese"
    ).all();
    // Also count parishes that have empty diocese but matching jurisdiction
    const countByJur = db.prepare(
      "SELECT jurisdiction, COUNT(*) as cnt FROM parishes WHERE lat IS NOT NULL AND (diocese = '' OR diocese IS NULL) GROUP BY jurisdiction"
    ).all();
    const countMap = {};
    for (const r of countRows) { if (r.diocese) countMap[r.diocese] = (countMap[r.diocese] || 0) + r.cnt; }
    for (const r of countByJur) { if (r.jurisdiction) countMap[r.jurisdiction] = (countMap[r.jurisdiction] || 0) + r.cnt; }

    const features = rows.map((r) => {
      const dioceseInfo = lookupDiocese(r.diocese);
      const patriarchate = getPatriarchate(r.jurisdiction);
      return {
        type: "Feature",
        properties: {
          entityType: r.entity_type, entityId: r.entity_id, diocese: r.diocese,
          jurisdiction: r.jurisdiction, color: JURISDICTION_COLORS[r.jurisdiction] || DEFAULT_COLOR,
          parishCount: countMap[r.diocese] || countMap[r.jurisdiction] || 0,
          bishop: dioceseInfo?.bishop || null,
          region: dioceseInfo?.region || null,
          states: dioceseInfo?.states || [],
          patriarchate: patriarchate !== "Unknown" ? patriarchate : null,
        },
        geometry: JSON.parse(r.geojson),
      };
    });
    res.json({ type: "FeatureCollection", features });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Map API: parish polygons (Tier 2) ─────────────────────────────────
router.get("/map/parishes-poly", (req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: "Database not found. Run: npm run compute" });
  try {
    const db = getDb();
    let rows;
    if (req.query.diocese) {
      rows = db.prepare("SELECT * FROM polygons WHERE tier = 2 AND diocese = ?").all(req.query.diocese);
    } else {
      rows = db.prepare("SELECT * FROM polygons WHERE tier = 2").all();
    }
    const features = rows.map((r) => {
      const baseColor = JURISDICTION_COLORS[r.jurisdiction] || DEFAULT_COLOR;
      const hash = r.entity_id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const shift = (hash % 60) - 30;
      const color = [
        Math.max(0, Math.min(255, baseColor[0] + shift)),
        Math.max(0, Math.min(255, baseColor[1] + shift)),
        Math.max(0, Math.min(255, baseColor[2] + shift)),
        baseColor[3],
      ];

      // Parse stored geojson — may be a Feature (new) or bare geometry (legacy)
      const geojsonRaw = JSON.parse(r.geojson);
      let geometry, parishNames;
      if (geojsonRaw.type === "Feature" && geojsonRaw.geometry) {
        geometry = geojsonRaw.geometry;
        parishNames = geojsonRaw.properties?.parishNames;
      } else if (geojsonRaw.type === "Polygon" || geojsonRaw.type === "MultiPolygon") {
        geometry = geojsonRaw;
        parishNames = geojsonRaw.properties?.parishNames;
      } else if (geojsonRaw.geometry) {
        geometry = geojsonRaw.geometry;
        parishNames = geojsonRaw.properties?.parishNames;
      } else {
        geometry = geojsonRaw;
      }

      return {
        type: "Feature",
        properties: {
          entityType: r.entity_type, entityId: r.entity_id, diocese: r.diocese,
          jurisdiction: r.jurisdiction, color, parishNames: parishNames || [],
        },
        geometry,
      };
    });
    res.json({ type: "FeatureCollection", features });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Map API: parish points ────────────────────────────────────────────
router.get("/map/points", (_req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: "Database not found. Run: npm run compute" });
  try {
    const db = getDb();
     // Load diocesan seats lookup from all-parishes.json
     let diocesanSeatsMap = {};
     try {
       const allParishesPath = path.join(__dirname, "..", "..", "output", "all-parishes.json");
       if (fs.existsSync(allParishesPath)) {
         const allParishes = JSON.parse(fs.readFileSync(allParishesPath, "utf-8"));
         allParishes.forEach(p => {
           if (p.diocesanSeats && p.diocesanSeats.length > 0) {
             const key = `${p.city}|${p.state}`;
             diocesanSeatsMap[key] = p.diocesanSeats;
           }
         });
       }
      } catch (e) {
        console.error("[api/map/points] Error loading diocesan seats:", e.message);
      }

    const rows = db.prepare("SELECT * FROM parishes WHERE lat IS NOT NULL AND lng IS NOT NULL").all();
    const features = rows.map((r) => {
      const importance = classifyImportance(r.name);
      const dioceseInfo = lookupDiocese(r.diocese);
      const patriarchate = getPatriarchate(r.jurisdiction);
       const seatKey = `${r.city}|${r.state}`;
      return {
        type: "Feature",
        properties: {
          id: r.id, name: r.name, jurisdiction: r.jurisdiction, diocese: r.diocese,
          deanery: r.deanery, city: r.city, state: r.state, country: r.country,
          address: r.address, zip: r.zip, clergy: r.clergy,
          phone: r.phone, website: r.website, source: r.source, clusterId: r.cluster_id,
          color: JURISDICTION_COLORS[r.jurisdiction] || DEFAULT_COLOR,
          importance,
          patriarchate: patriarchate !== "Unknown" ? patriarchate : null,
          bishop: dioceseInfo?.bishop || null,
          region: dioceseInfo?.region || null,
             diocesanSeats: diocesanSeatsMap[seatKey] || null,
        },
        geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      };
    });
    res.json({ type: "FeatureCollection", features });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Map API: metadata ─────────────────────────────────────────────────
router.get("/map/meta", (_req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: "Database not found. Run: npm run compute" });
  try {
    const db = getDb();
    const parishCount = db.prepare("SELECT COUNT(*) as n FROM parishes WHERE lat IS NOT NULL").get().n;
    const dioceseCount = db.prepare("SELECT COUNT(DISTINCT diocese) as n FROM polygons WHERE tier = 1").get().n;
    const clusterCount = db.prepare("SELECT COUNT(*) as n FROM clusters").get().n;
    const tier1Count = db.prepare("SELECT COUNT(*) as n FROM polygons WHERE tier = 1").get().n;
    const tier2Count = db.prepare("SELECT COUNT(*) as n FROM polygons WHERE tier = 2").get().n;
    const dioceses = db.prepare(
      "SELECT DISTINCT diocese, jurisdiction FROM polygons WHERE tier = 1 ORDER BY jurisdiction, diocese"
    ).all();
    res.json({
      stats: { parishes: parishCount, dioceses: dioceseCount, clusters: clusterCount, tier1Polygons: tier1Count, tier2Polygons: tier2Count },
      colors: JURISDICTION_COLORS, defaultColor: DEFAULT_COLOR, dioceses,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
