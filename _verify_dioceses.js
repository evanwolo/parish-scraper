const { getDb, closeDb } = require('./src/db');

const db = getDb();

const total = db.prepare('SELECT COUNT(*) as count FROM parishes').get();
const withDiocese = db.prepare("SELECT COUNT(*) as count FROM parishes WHERE diocese != '' AND diocese IS NOT NULL").get();
const noDiocese = db.prepare("SELECT COUNT(*) as count FROM parishes WHERE diocese = '' OR diocese IS NULL").get();

console.log('=== Diocese Coverage ===');
console.log('Total parishes:', total.count);
console.log('With diocese:', withDiocese.count);
console.log('Coverage:', ((withDiocese.count / total.count) * 100).toFixed(1) + '%');

const byJur = db.prepare(`
  SELECT 
    jurisdiction,
    COUNT(*) as total,
    SUM(CASE WHEN diocese != '' AND diocese IS NOT NULL THEN 1 ELSE 0 END) as with_diocese
  FROM parishes 
  GROUP BY jurisdiction 
  ORDER BY total DESC
  LIMIT 10
`).all();

console.log('\n=== Top 10 Jurisdictions ===');
byJur.forEach(j => {
  const coverage = ((j.with_diocese / j.total) * 100).toFixed(1);
  console.log(`${j.jurisdiction.substring(0, 50).padEnd(50)} ${j.with_diocese}/${j.total} (${coverage}%)`);
});

closeDb();
