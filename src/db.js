/**
 * SQLite database layer for the jurisdiction map.
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DB_DIR, "parishes.db");

let _db = null;

function getDb() {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  return _db;
}

function initSchema() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS parishes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      jurisdiction TEXT NOT NULL DEFAULT '',
      diocese     TEXT NOT NULL DEFAULT '',
      deanery     TEXT NOT NULL DEFAULT '',
      city        TEXT NOT NULL DEFAULT '',
      state       TEXT NOT NULL DEFAULT '',
      zip         TEXT NOT NULL DEFAULT '',
      country     TEXT NOT NULL DEFAULT '',
      phone       TEXT NOT NULL DEFAULT '',
      website     TEXT NOT NULL DEFAULT '',
      lat         REAL,
      lng         REAL,
      address     TEXT NOT NULL DEFAULT '',
      clergy      TEXT NOT NULL DEFAULT '',
      source      TEXT NOT NULL DEFAULT '',
      cluster_id  INTEGER
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS clusters (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      diocese       TEXT NOT NULL,
      jurisdiction  TEXT NOT NULL DEFAULT '',
      centroid_lat  REAL NOT NULL,
      centroid_lng  REAL NOT NULL,
      radius        REAL NOT NULL DEFAULT 0,
      parish_count  INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS polygons (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id   TEXT NOT NULL,
      diocese     TEXT NOT NULL DEFAULT '',
      jurisdiction TEXT NOT NULL DEFAULT '',
      geojson     TEXT NOT NULL,
      tier        INTEGER NOT NULL
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_parishes_diocese ON parishes(diocese);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_parishes_jurisdiction ON parishes(jurisdiction);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_parishes_cluster ON parishes(cluster_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_polygons_tier ON polygons(tier);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_polygons_entity ON polygons(entity_type, entity_id);`);
}

function resetComputed() {
  const db = getDb();
  db.exec(`DELETE FROM polygons;`);
  db.exec(`DELETE FROM clusters;`);
  db.exec(`UPDATE parishes SET cluster_id = NULL;`);
}

function resetAll() {
  const db = getDb();
  db.exec(`DROP TABLE IF EXISTS polygons;`);
  db.exec(`DROP TABLE IF EXISTS clusters;`);
  db.exec(`DROP TABLE IF EXISTS parishes;`);
  initSchema();
}

function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

module.exports = { getDb, initSchema, resetComputed, resetAll, closeDb, DB_PATH };
