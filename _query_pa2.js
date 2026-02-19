const Database = require('better-sqlite3');
const db = new Database('./data/parishes.db');

// Find parishes with empty city/state - likely the bad geocoded duplicates
console.log('=== Parishes with empty city AND suspicious coords ===\n');
const emptyCity = db.prepare(`
  SELECT id, name, diocese, jurisdiction, city, state, country, lat, lng, source
  FROM parishes
  WHERE (city = '' OR city IS NULL)
  ORDER BY diocese, name
`).all();

console.log(`Found ${emptyCity.length} parishes with empty city:\n`);
for (const r of emptyCity) {
  console.log(`  [${r.id}] ${r.name} | ${r.diocese} | city="${r.city}" state="${r.state}" | lat=${r.lat} lng=${r.lng} | src=${r.source}`);
}

// Now check the specific bad PA entries
console.log('\n\n=== The two suspicious Western PA entries ===');
const bad = db.prepare(`SELECT * FROM parishes WHERE id IN (1666, 1669)`).all();
for (const r of bad) {
  console.log(JSON.stringify(r, null, 2));
}

// Check if there are matching "good" entries for the same name/diocese
console.log('\n\n=== Do these have counterpart entries with real addresses? ===');
for (const r of bad) {
  const matches = db.prepare(`SELECT id, name, diocese, city, state, lat, lng FROM parishes WHERE name = ? AND diocese = ? AND id != ?`).all(r.name, r.diocese, r.id);
  console.log(`\nMatches for "${r.name}" in "${r.diocese}":`);
  for (const m of matches) {
    console.log(`  [${m.id}] ${m.city}, ${m.state} | lat=${m.lat} lng=${m.lng}`);
  }
}

// Count all empty-city entries by source
console.log('\n\n=== Empty city entries by source ===');
const bySrc = db.prepare(`SELECT source, COUNT(*) as cnt FROM parishes WHERE city = '' OR city IS NULL GROUP BY source`).all();
for (const r of bySrc) console.log(`  ${r.source}: ${r.cnt}`);

// Count all empty-city entries by diocese
console.log('\n\n=== Empty city entries by diocese (top 20) ===');
const byDio = db.prepare(`SELECT diocese, COUNT(*) as cnt FROM parishes WHERE city = '' OR city IS NULL GROUP BY diocese ORDER BY cnt DESC LIMIT 20`).all();
for (const r of byDio) console.log(`  ${r.diocese}: ${r.cnt}`);

db.close();
