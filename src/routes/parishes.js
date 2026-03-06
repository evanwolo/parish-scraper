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
} = require("../diocese-lookup");
const {
  JURISDICTION_COLORS,
  DEFAULT_COLOR,
} = require("./middleware");
const {
  buildParishesData,
  buildMapDiocesesData,
  buildMapParishesPolyData,
  buildMapPointsData,
  buildMapMetaData,
} = require("../snapshot-data");

const router = express.Router();

// ── API: return all parishes as JSON (cached) ────────────────────────
router.get("/parishes", (_req, res) => {
  try {
    res.json(buildParishesData());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    res.json(buildMapDiocesesData());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Map API: parish polygons (Tier 2) ─────────────────────────────────
router.get("/map/parishes-poly", (req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: "Database not found. Run: npm run compute" });
  try {
    res.json(buildMapParishesPolyData(req.query.diocese));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Map API: parish points ────────────────────────────────────────────
router.get("/map/points", (_req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: "Database not found. Run: npm run compute" });
  try {
    const points = buildMapPointsData();
    const europeanCount = points.features.filter((f) => f.properties.region === "Europe").length;
    const naCount = points.features.length - europeanCount;
    console.log(`[api/map/points] Serving ${points.features.length} total features (${naCount} NA + ${europeanCount} Europe)`);
    res.json(points);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Map API: metadata ─────────────────────────────────────────────────
router.get("/map/meta", (_req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: "Database not found. Run: npm run compute" });
  try {
    res.json(buildMapMetaData());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
