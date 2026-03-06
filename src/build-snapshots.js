#!/usr/bin/env node
/**
 * Build static frontend snapshots from the live data layer.
 *
 * Usage:
 *   node src/build-snapshots.js
 *   node src/build-snapshots.js --output public/data/snapshots
 */

const fs = require("fs");
const path = require("path");
const { DB_PATH, initSchema, migrate, closeDb } = require("./db");
const {
  buildParishesData,
  buildMapDiocesesData,
  buildMapParishesPolyData,
  buildMapPointsData,
  buildMapMetaData,
  clearDataLayerCaches,
} = require("./snapshot-data");

const ROOT_DIR = path.join(__dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    outputDir: path.join(ROOT_DIR, "public", "data", "snapshots"),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output") {
      const rel = args[++i];
      opts.outputDir = path.resolve(ROOT_DIR, rel);
    }
  }

  return opts;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function buildSnapshots() {
  const opts = parseArgs();

  if (!fs.existsSync(DB_PATH)) {
    throw new Error("Database not found. Run: npm run import:fresh && npm run compute");
  }

  try {
    initSchema();
    migrate();
    clearDataLayerCaches();

    const generatedAt = new Date().toISOString();
    const parishes = buildParishesData();
    const mapDioceses = buildMapDiocesesData();
    const mapParishesPoly = buildMapParishesPolyData();
    const mapPoints = buildMapPointsData();
    const mapMeta = buildMapMetaData();

    const manifest = {
      schemaVersion: 1,
      generatedAt,
      mode: "static-snapshot",
      stats: {
        parishes: parishes.length,
        mapDioceses: mapDioceses.features.length,
        mapParishesPoly: mapParishesPoly.features.length,
        mapPoints: mapPoints.features.length,
      },
      files: {
        parishes: "parishes.json",
        mapDioceses: "map-dioceses.json",
        mapParishesPoly: "map-parishes-poly.json",
        mapPoints: "map-points.json",
        mapMeta: "map-meta.json",
      },
    };

    writeJson(path.join(opts.outputDir, "manifest.json"), manifest);
    writeJson(path.join(opts.outputDir, "parishes.json"), parishes);
    writeJson(path.join(opts.outputDir, "map-dioceses.json"), mapDioceses);
    writeJson(path.join(opts.outputDir, "map-parishes-poly.json"), mapParishesPoly);
    writeJson(path.join(opts.outputDir, "map-points.json"), mapPoints);
    writeJson(path.join(opts.outputDir, "map-meta.json"), mapMeta);

    console.log(`[snapshot] Built static data layer at ${opts.outputDir}`);
    console.log(`[snapshot] Generated: ${generatedAt}`);
    console.log(
      `[snapshot] Files: parishes=${parishes.length}, points=${mapPoints.features.length}, dioceses=${mapDioceses.features.length}`
    );
  } finally {
    closeDb();
  }
}

if (require.main === module) {
  try {
    buildSnapshots();
  } catch (err) {
    console.error(`[snapshot] Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { buildSnapshots };
