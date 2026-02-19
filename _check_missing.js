const { getDb, closeDb } = require('./src/db');

const db = getDb();

const missing = db.prepare(`
  SELECT jurisdiction, state, country, COUNT(*) as cnt 
  FROM parishes 
  WHERE diocese = '' OR diocese IS NULL 
  GROUP BY jurisdiction, state, country
  ORDER BY cnt DESC
  LIMIT 30
`).all();

console.log('=== Parishes Still Missing Diocese ===\n');
console.log('Count | Jurisdiction                                    | State | Country');
console.log('------+------------------------------------------------+-------+---------');
missing.forEach(m => {
  console.log(
    m.cnt.toString().padStart(5),
    '|',
    (m.jurisdiction || 'Unknown').substring(0,47).padEnd(47),
    '|',
    (m.state || 'null').padEnd(5),
    '|',
    m.country || 'null'
  );
});

console.log('\n=== Sample Missing Parishes ===');
const samples = db.prepare(`
  SELECT name, jurisdiction, city, state, country
  FROM parishes 
  WHERE diocese = '' OR diocese IS NULL 
  LIMIT 10
`).all();

samples.forEach(p => {
  console.log(`\n${p.name || 'Unnamed'}`);
  console.log(`  Jurisdiction: ${p.jurisdiction || 'Missing'}`);
  console.log(`  Location: ${p.city || '?'}, ${p.state || '?'}, ${p.country || '?'}`);
});

closeDb();
