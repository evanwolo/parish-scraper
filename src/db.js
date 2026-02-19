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
      patriarchate TEXT NOT NULL DEFAULT '',
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

  // User authentication and profile tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      email       TEXT NOT NULL UNIQUE,
      password    TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id             INTEGER NOT NULL UNIQUE,
      home_address        TEXT NOT NULL DEFAULT '',
      home_lat            REAL,
      home_lng            REAL,
      church_status       TEXT NOT NULL DEFAULT '',
      church_affiliation  TEXT NOT NULL DEFAULT '',
      baptismal_parish_id INTEGER,
      current_parish_id   INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (baptismal_parish_id) REFERENCES parishes(id) ON DELETE SET NULL,
      FOREIGN KEY (current_parish_id) REFERENCES parishes(id) ON DELETE SET NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_parish_visits (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      parish_id   INTEGER NOT NULL,
      visited_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      notes       TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parish_id) REFERENCES parishes(id) ON DELETE CASCADE,
      UNIQUE(user_id, parish_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_saved_parishes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      parish_id   INTEGER NOT NULL,
      saved_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      label       TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parish_id) REFERENCES parishes(id) ON DELETE CASCADE,
      UNIQUE(user_id, parish_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_journal_entries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      parish_id   INTEGER,
      title       TEXT NOT NULL DEFAULT '',
      content     TEXT NOT NULL DEFAULT '',
      entry_date  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parish_id) REFERENCES parishes(id) ON DELETE SET NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_spiritual_goals (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      goal_text   TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'other',
      is_completed BOOLEAN DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL UNIQUE,
      bio         TEXT NOT NULL DEFAULT '',
      spiritual_journey TEXT NOT NULL DEFAULT '',
      favorite_saints TEXT NOT NULL DEFAULT '',
      prayer_focus TEXT NOT NULL DEFAULT '',
      theme       TEXT NOT NULL DEFAULT 'light',
      is_profile_public BOOLEAN DEFAULT 0,
      show_visited_parishes BOOLEAN DEFAULT 1,
      show_prayer_intentions BOOLEAN DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_saved_parishes_user ON user_saved_parishes(user_id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_saved_parishes_parish ON user_saved_parishes(parish_id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_journal_entries_user ON user_journal_entries(user_id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_journal_entries_date ON user_journal_entries(entry_date);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_spiritual_goals_user ON user_spiritual_goals(user_id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_visits_user ON user_parish_visits(user_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_visits_parish ON user_parish_visits(parish_id);`);
}

function resetComputed() {
  const db = getDb();
  db.exec(`DELETE FROM polygons;`);
  db.exec(`DELETE FROM clusters;`);
  db.exec(`UPDATE parishes SET cluster_id = NULL;`);
}

function resetAll() {
  const db = getDb();
  // Disable FK checks to avoid constraint errors during drop
  db.pragma("foreign_keys = OFF");
  db.exec(`DROP TABLE IF EXISTS polygons;`);
  db.exec(`DROP TABLE IF EXISTS clusters;`);
  db.exec(`DROP TABLE IF EXISTS parishes;`);
  db.exec(`DROP TABLE IF EXISTS user_parish_visits;`);
  db.exec(`DROP TABLE IF EXISTS user_saved_parishes;`);
  db.exec(`DROP TABLE IF EXISTS user_journal_entries;`);
  db.exec(`DROP TABLE IF EXISTS user_spiritual_goals;`);
  db.exec(`DROP TABLE IF EXISTS user_preferences;`);
  db.exec(`DROP TABLE IF EXISTS user_profiles;`);
  db.exec(`DROP TABLE IF EXISTS users;`);
  db.pragma("foreign_keys = ON");
  initSchema();
}

function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

/**
 * Run migrations for databases created before the hierarchy update.
 * Adds the 'patriarchate' column if it doesn't exist yet.
 */
function migrate() {
  const db = getDb();
  
  // Migrate parishes table
  const cols = db.pragma("table_info(parishes)");
  const hasPatriarchate = cols.some((c) => c.name === "patriarchate");
  if (!hasPatriarchate) {
    db.exec("ALTER TABLE parishes ADD COLUMN patriarchate TEXT NOT NULL DEFAULT '';");
    console.log("[migrate] Added 'patriarchate' column to parishes table.");
  }
  
  // Migrate user_profiles table
  const profileCols = db.pragma("table_info(user_profiles)");
  const hasAffiliation = profileCols.some((c) => c.name === "church_affiliation");
  if (!hasAffiliation) {
    db.exec("ALTER TABLE user_profiles ADD COLUMN church_affiliation TEXT NOT NULL DEFAULT '';");
    console.log("[migrate] Added 'church_affiliation' column to user_profiles table.");
  }
  
  return db;
}

module.exports = { getDb, initSchema, resetComputed, resetAll, closeDb, migrate, DB_PATH };
