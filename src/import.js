/**
 * Import sanitised + deduplicated parish records into the SQLite database.
 *
 * Usage:
 *   node src/import.js          # imports from output/*.json
 *   node src/import.js --fresh  # drops all tables first
 */

const path = require("path");
const fs = require("fs");
const { sanitizeRecord } = require("./sanitize");
const { deduplicate } = require("./dedup");
const { getDb, initSchema, resetAll, closeDb, migrate } = require("./db");
const { getPatriarchate } = require("./diocese-lookup");

const SOURCE_FILES = [
  "chicago-rocor.json",
  "assembly-of-bishops.json",
  "oca.json",
  "uoc-usa.json",
  "ea-diocese.json",
  "goarch.json",
  "antiochian.json",
  "serbian.json",
  "romanian.json",
  "acrod.json",
  "bulgarian.json",
  "orthodox-world.json",
];

function loadAllParishes() {
  const outputDir = path.join(__dirname, "..", "output");
  const all = [];

  for (const file of SOURCE_FILES) {
    const fp = path.join(outputDir, file);
    if (!fs.existsSync(fp)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
      all.push(...data);
    } catch {
      console.warn(`  ⚠ skipped ${file} (parse error)`);
    }
  }

  const normalised = all.map((r) => sanitizeRecord(r));
  const { unique, stats } = deduplicate(normalised);
  console.log(
    `  Loaded ${stats.total} raw → ${stats.unique} unique (${stats.merged} duplicates merged)`
  );
  return unique;
}

function importParishes() {
  const fresh = process.argv.includes("--fresh");

  console.log("[import] Starting parish import…");
  const db = getDb();

  if (fresh) {
    console.log("  --fresh flag: dropping all tables");
    resetAll();
  } else {
    initSchema();
    migrate(); // ensure patriarchate column exists
    db.exec(`DELETE FROM parishes;`);
  }

  const parishes = loadAllParishes();

  const insertStmt = db.prepare(`
    INSERT INTO parishes (name, patriarchate, jurisdiction, diocese, deanery, city, state, zip, country, phone, website, lat, lng, address, clergy, source)
    VALUES (@name, @patriarchate, @jurisdiction, @diocese, @deanery, @city, @state, @zip, @country, @phone, @website, @lat, @lng, @address, @clergy, @source)
  `);

  const insertMany = db.transaction((records) => {
    for (const r of records) {
      insertStmt.run({
        name: r.name || "",
        patriarchate: getPatriarchate(r.jurisdiction || ""),
        jurisdiction: r.jurisdiction || "",
        diocese: r.diocese || "",
        deanery: r.deanery || "",
        city: r.city || "",
        state: r.state || "",
        zip: r.zip || "",
        country: r.country || "",
        phone: r.phone || "",
        website: r.website || "",
        lat: parseFloat(r.lat) || null,
        lng: parseFloat(r.lng) || null,
        address: r.address || "",
        clergy: r.clergy || "",
        source: r.source || "",
      });
    }
  });

  insertMany(parishes);

  const count = db.prepare("SELECT COUNT(*) as n FROM parishes").get().n;
  const withCoordsCount = db.prepare("SELECT COUNT(*) as n FROM parishes WHERE lat IS NOT NULL AND lng IS NOT NULL").get().n;

  console.log(`  ✓ Inserted ${count} parishes into DB (${withCoordsCount} with coordinates)`);
  console.log(`  DB: ${require("./db").DB_PATH}`);

  closeDb();
  console.log("[import] Done.\n");
}

if (require.main === module) {
  importParishes();
}

module.exports = { importParishes, loadAllParishes };
