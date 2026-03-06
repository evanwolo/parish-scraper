const db = require('./src/db').getDb();

const geocodable = db.prepare("SELECT COUNT(*) as n FROM parishes WHERE (lat IS NULL OR lng IS NULL) AND city IS NOT NULL AND city != ''").get().n;
const noCity = db.prepare("SELECT COUNT(*) as n FROM parishes WHERE (lat IS NULL OR lng IS NULL) AND (city IS NULL OR city = '')").get().n;
const serbian = db.prepare("SELECT COUNT(*) as n FROM parishes WHERE jurisdiction LIKE '%Serbian%' AND (lat IS NULL OR lng IS NULL)").get().n;
const romanian = db.prepare("SELECT COUNT(*) as n FROM parishes WHERE jurisdiction LIKE '%Romanian%' AND (lat IS NULL OR lng IS NULL)").get().n;

console.log("Missing coordinates breakdown:");
console.log("  Geocodable (have city):", geocodable);
console.log("  No city at all:", noCity);
console.log("  Serbian missing:", serbian);
console.log("  Romanian missing:", romanian);

// Sample some with city+state that should be geocodable
const samples = db.prepare("SELECT name, city, state, address FROM parishes WHERE (lat IS NULL OR lng IS NULL) AND city IS NOT NULL AND city != '' LIMIT 10").all();
console.log("\nSample geocodable parishes:");
samples.forEach(r => console.log("  ", r.name, "|", r.city, r.state, "|", r.address || "(no addr)"));

require('./src/db').closeDb();
