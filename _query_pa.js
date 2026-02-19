const Database = require('better-sqlite3');
const db = new Database('./data/parishes.db');

// Check PA diocese parishes
const rows = db.prepare(`
  SELECT id, name, diocese, jurisdiction, city, state, country, lat, lng 
  FROM parishes 
  WHERE diocese LIKE '%Pennsylvania%'
  ORDER BY diocese, name
`).all();

console.log(`Found ${rows.length} PA parishes:\n`);
for (const r of rows) {
  const flag = (r.lat > 49 || r.lat < 38) ? ' *** SUSPICIOUS LAT ***' : '';
  console.log(`  [${r.id}] ${r.name} | ${r.diocese} | ${r.city}, ${r.state} ${r.country} | lat=${r.lat} lng=${r.lng}${flag}`);
}

// Also check for parishes appearing in Canada that shouldn't
console.log('\n\n--- All parishes with lat > 49 (likely Canada) that are NOT Canadian ---');
const canadian = db.prepare(`
  SELECT id, name, diocese, jurisdiction, city, state, country, lat, lng
  FROM parishes
  WHERE lat > 49 AND country NOT IN ('Canada', 'CA', '')
  ORDER BY lat DESC
`).all();
console.log(`Found ${canadian.length} suspicious:\n`);
for (const r of canadian) {
  console.log(`  [${r.id}] ${r.name} | ${r.diocese} | ${r.city}, ${r.state} ${r.country} | lat=${r.lat} lng=${r.lng}`);
}

// Check for parishes with swapped lat/lng or other coordinate issues
console.log('\n\n--- Parishes with coordinates outside continental US/Canada bounds ---');
const outOfBounds = db.prepare(`
  SELECT id, name, diocese, jurisdiction, city, state, country, lat, lng
  FROM parishes
  WHERE (lat IS NOT NULL AND lng IS NOT NULL)
    AND (lat < 15 OR lat > 75 OR lng < -180 OR lng > -50)
    AND country NOT IN ('', 'Greece', 'Turkey', 'Israel', 'UK', 'United Kingdom')
  ORDER BY lat DESC
`).all();
console.log(`Found ${outOfBounds.length}:\n`);
for (const r of outOfBounds) {
  console.log(`  [${r.id}] ${r.name} | ${r.diocese} | ${r.city}, ${r.state} ${r.country} | lat=${r.lat} lng=${r.lng}`);
}

db.close();
