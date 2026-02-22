const { deduplicate } = require('./src/dedup');
const { writeCSV, writeJSON } = require('./src/utils');
const data = require('./output/all-parishes.json');

console.log('Applying improved deduplication to existing data...\n');
console.log(`Input: ${data.length} parishes`);

const { unique, stats } = deduplicate(data);

console.log(`Output: ${unique.length} parishes`);
console.log(`\nDeduplication Results:`);
console.log(`  Total records: ${stats.total}`);
console.log(`  Unique parishes: ${stats.unique}`);
console.log(`  Duplicates merged: ${stats.merged}`);

// Save updated files
const columns = [...new Set(unique.flatMap(Object.keys))];
const csvPath = writeJSON('all-parishes.json', unique);
writeCSV('all-parishes.csv', unique, columns);

console.log(`\n✓ Updated output files with deduplicated data`);
