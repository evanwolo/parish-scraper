/**
 * Backfill missing diocese fields using state-based lookup.
 *
 * For parishes that have a jurisdiction + state but no diocese,
 * looks up the appropriate diocese from DIOCESE_REGISTRY based on
 * which diocese covers that state within that jurisdiction.
 *
 * Usage:
 *   node src/backfill-diocese.js
 */

const { getDb, closeDb } = require("./db");
const { DIOCESE_REGISTRY } = require("./diocese-lookup");

// Build state → diocese mapping for each jurisdiction
const STATE_TO_DIOCESE = new Map();

for (const [dioceseName, info] of Object.entries(DIOCESE_REGISTRY)) {
  const { jurisdiction, states } = info;
  if (!states || states.length === 0) continue;

  const key = jurisdiction;
  if (!STATE_TO_DIOCESE.has(key)) STATE_TO_DIOCESE.set(key, new Map());
  const jurMap = STATE_TO_DIOCESE.get(key);

  for (const state of states) {
    if (!jurMap.has(state)) {
      jurMap.set(state, dioceseName);
    } else {
      // Handle overlaps — prefer more specific diocese names
      // (e.g., "Diocese of Eastern Pennsylvania" over "Diocese of the South")
      const existing = jurMap.get(state);
      if (dioceseName.length > existing.length) {
        jurMap.set(state, dioceseName);
      }
    }
  }
}

function backfillDioceses() {
  console.log("[backfill-diocese] Starting diocese backfill…");
  const db = getDb();

  // Get parishes with empty diocese but have jurisdiction + state
  const parishes = db
    .prepare(
      "SELECT id, jurisdiction, state FROM parishes WHERE (diocese = '' OR diocese IS NULL) AND jurisdiction != '' AND state != ''"
    )
    .all();

  console.log(`  Found ${parishes.length} parishes with missing diocese + valid jurisdiction/state`);

  const updateStmt = db.prepare("UPDATE parishes SET diocese = @diocese WHERE id = @id");
  let updated = 0;
  let notFound = 0;
  const notFoundJurisdictions = new Set();

  const transaction = db.transaction(() => {
    for (const p of parishes) {
      const jurMap = STATE_TO_DIOCESE.get(p.jurisdiction);
      if (jurMap) {
        const diocese = jurMap.get(p.state);
        if (diocese) {
          updateStmt.run({ diocese, id: p.id });
          updated++;
        } else {
          notFound++;
          notFoundJurisdictions.add(`${p.jurisdiction} / ${p.state}`);
        }
      } else {
        notFound++;
        notFoundJurisdictions.add(`${p.jurisdiction} / ${p.state}`);
      }
    }
  });

  transaction();

  console.log(`  ✓ Updated ${updated} parishes with backfilled diocese`);
  if (notFound > 0) {
    console.log(`  ⚠ ${notFound} parishes still have no diocese mapping`);
    console.log(`    Missing mappings for:`);
    for (const jur of Array.from(notFoundJurisdictions).sort()) {
      console.log(`      - ${jur}`);
    }
  }

  closeDb();
  console.log("[backfill-diocese] Done.\n");
}

if (require.main === module) {
  backfillDioceses();
}

module.exports = { backfillDioceses };
