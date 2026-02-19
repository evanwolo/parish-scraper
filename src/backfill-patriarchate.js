/**
 * backfill-patriarchate.js
 * One-time migration: adds the 'patriarchate' column if missing,
 * then populates it for all existing parish records based on jurisdiction.
 *
 * Usage: node src/backfill-patriarchate.js
 */

const { getDb, initSchema, migrate } = require("./db");
const { getPatriarchate } = require("./diocese-lookup");

function backfill() {
  initSchema();
  const db = migrate();

  const rows = db.prepare("SELECT DISTINCT jurisdiction FROM parishes").all();
  console.log(`[backfill] Found ${rows.length} distinct jurisdiction(s).`);

  const stmt = db.prepare(
    "UPDATE parishes SET patriarchate = @patriarchate WHERE jurisdiction = @jurisdiction"
  );

  const run = db.transaction(() => {
    for (const row of rows) {
      const patriarchate = getPatriarchate(row.jurisdiction);
      stmt.run({ patriarchate, jurisdiction: row.jurisdiction });
      console.log(`  ${row.jurisdiction} → ${patriarchate}`);
    }
  });

  run();

  // Show summary
  const summary = db
    .prepare("SELECT patriarchate, COUNT(*) as count FROM parishes GROUP BY patriarchate ORDER BY count DESC")
    .all();
  console.log("\n[backfill] Summary:");
  for (const row of summary) {
    console.log(`  ${row.patriarchate || "(empty)"}: ${row.count} parish(es)`);
  }

  console.log("[backfill] Done.");
}

if (require.main === module) {
  backfill();
}

module.exports = { backfill };
