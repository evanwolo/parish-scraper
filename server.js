/**
 * Simple Express server that serves the web UI and parish JSON data.
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const { deduplicate } = require("./src/dedup");
const { sanitizeRecord } = require("./src/sanitize");
const { getDb, initSchema, DB_PATH } = require("./src/db");

const app = express();
const PORT = process.env.PORT || 3000;

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

// ── Static files ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── API: return all parishes as JSON ──────────────────────────────────
app.get("/api/parishes", (_req, res) => {
  const files = [
    "chicago-rocor.json", "assembly-of-bishops.json", "oca.json", "uoc-usa.json",
    "ea-diocese.json", "goarch.json", "antiochian.json", "serbian.json",
    "romanian.json", "acrod.json", "bulgarian.json", "orthodox-world.json",
  ];

  const all = [];
  for (const file of files) {
    const fp = path.join(__dirname, "output", file);
    if (fs.existsSync(fp)) {
      try { all.push(...JSON.parse(fs.readFileSync(fp, "utf-8"))); }
      catch { /* skip bad files */ }
    }
  }

  const normalised = all.map((r) => sanitizeRecord(r));
  const { unique, stats } = deduplicate(normalised);
  console.log(`[api] Serving ${stats.unique} parishes (${stats.merged} duplicates merged from ${stats.total} total)`);
  res.json(unique);
});

// ── API: list available sources ───────────────────────────────────────
app.get("/api/sources", (_req, res) => {
  const outDir = path.join(__dirname, "output");
  if (!fs.existsSync(outDir)) return res.json([]);
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".json") && f !== "all-parishes.json");
  res.json(files.map((f) => f.replace(".json", "")));
});

// ── Map API: diocese polygons (Tier 1) ────────────────────────────────
app.get("/api/map/dioceses", (_req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: "Database not found. Run: npm run compute" });
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM polygons WHERE tier = 1").all();
    const features = rows.map((r) => ({
      type: "Feature",
      properties: {
        entityType: r.entity_type, entityId: r.entity_id, diocese: r.diocese,
        jurisdiction: r.jurisdiction, color: JURISDICTION_COLORS[r.jurisdiction] || DEFAULT_COLOR,
      },
      geometry: JSON.parse(r.geojson),
    }));
    res.json({ type: "FeatureCollection", features });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Map API: parish polygons (Tier 2) ─────────────────────────────────
app.get("/api/map/parishes-poly", (req, res) => {
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

      // Parse stored geojson — may have embedded properties.parishNames
      const geojsonRaw = JSON.parse(r.geojson);
      let geometry, parishNames;
      if (geojsonRaw.type === "Polygon" || geojsonRaw.type === "MultiPolygon") {
        geometry = geojsonRaw;
        parishNames = geojsonRaw.properties ? geojsonRaw.properties.parishNames : undefined;
      } else if (geojsonRaw.geometry) {
        geometry = geojsonRaw.geometry;
        parishNames = geojsonRaw.properties ? geojsonRaw.properties.parishNames : undefined;
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
app.get("/api/map/points", (_req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: "Database not found. Run: npm run compute" });
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM parishes WHERE lat IS NOT NULL AND lng IS NOT NULL").all();
    const features = rows.map((r) => ({
      type: "Feature",
      properties: {
        id: r.id, name: r.name, jurisdiction: r.jurisdiction, diocese: r.diocese,
        deanery: r.deanery, city: r.city, state: r.state, clergy: r.clergy,
        phone: r.phone, website: r.website, source: r.source, clusterId: r.cluster_id,
        color: JURISDICTION_COLORS[r.jurisdiction] || DEFAULT_COLOR,
      },
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
    }));
    res.json({ type: "FeatureCollection", features });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Map API: metadata ─────────────────────────────────────────────────
app.get("/api/map/meta", (_req, res) => {
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

// ── Fallback to index.html for SPA ───────────────────────────────────
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Parish Directory running at http://localhost:${PORT}`);
});
