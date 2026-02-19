const fs = require('fs');
const duplicates = JSON.parse(fs.readFileSync('./NEAR_DUPLICATES.json'));

console.log('=== NEAR DUPLICATES ANALYSIS ===\n');
console.log('Total found: ' + duplicates.length + '\n');

// Group by type of formatting issue
let categories = {
  russian_orthodox: [],
  saint_vs_st: [],
  mission_difference: [],
  quotation_marks: [],
  ampersand: [],
  other: []
};

duplicates.forEach(dup => {
  const n1 = dup.name1;
  const n2 = dup.name2;
  
  if ((n1.includes('Russian') && !n2.includes('Russian')) || (!n1.includes('Russian') && n2.includes('Russian'))) {
    categories.russian_orthodox.push(dup);
  } else if ((n1.includes('Saint ') && n2.includes('St.')) || (n2.includes('Saint ') && n1.includes('St.'))) {
    categories.saint_vs_st.push(dup);
  } else if ((n1.includes('Mission') && !n2.includes('Mission')) || (!n1.includes('Mission') && n2.includes('Mission'))) {
    categories.mission_difference.push(dup);
  } else if ((n1.match(/"/g) || []).length > 0 || (n2.match(/"/g) || []).length > 0) {
    categories.quotation_marks.push(dup);
  } else if ((n1.includes('&') && n2.includes('and')) || (n1.includes('and') && n2.includes('&'))) {
    categories.ampersand.push(dup);
  } else {
    categories.other.push(dup);
  }
});

console.log('--- BY FORMATTING ISSUE TYPE ---');
console.log('Russian Orthodox / Orthodox: ' + categories.russian_orthodox.length);
console.log('Saint / St. abbreviation: ' + categories.saint_vs_st.length);
console.log('Mission added/removed: ' + categories.mission_difference.length);
console.log('Quotation marks: ' + categories.quotation_marks.length);
console.log('& vs and: ' + categories.ampersand.length);
console.log('Other: ' + categories.other.length);
console.log('');

console.log('--- SAMPLE CASES ---\n');

if (categories.russian_orthodox.length > 0) {
  console.log('Russian Orthodox issue:');
  let d = categories.russian_orthodox[0];
  console.log('  "' + d.name1 + '"');
  console.log('  vs');
  console.log('  "' + d.name2 + '"');
  console.log('  Location: ' + d.city1 + ', ' + d.state1 + ' (Distance: ' + d.dist + 'mi)');
  console.log('');
}

if (categories.mission_difference.length > 0) {
  console.log('Mission difference:');
  let d = categories.mission_difference[0];
  console.log('  "' + d.name1 + '"');
  console.log('  vs');
  console.log('  "' + d.name2 + '"');
  console.log('  Location: ' + d.city1 + ', ' + d.state1 + ' (Distance: ' + d.dist + 'mi)');
  console.log('');
}

if (categories.quotation_marks.length > 0) {
  console.log('Quotation mark issue:');
  let d = categories.quotation_marks[0];
  console.log('  "' + d.name1 + '"');
  console.log('  vs');
  console.log('  "' + d.name2 + '"');
  console.log('  Location: ' + d.city1 + ', ' + d.state1 + ' (Distance: ' + d.dist + 'mi)');
  console.log('');
}

console.log('--- CLOSEST DUPLICATES (First 15) ---\n');
duplicates.slice(0, 15).forEach((dup, i) => {
  console.log((i+1) + '. ' + dup.dist + 'mi - ' + dup.city1 + ', ' + dup.state1);
  console.log('   ' + dup.name1);
  console.log('   ' + dup.name2);
  console.log('');
});
