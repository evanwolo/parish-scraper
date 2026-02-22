const fs = require('fs');
const path = require('path');

// Load data files
const parishesPath = path.join(__dirname, 'output', 'all-parishes.json');
const bishopLocationsPath = path.join(__dirname, 'bishop-locations.json');

const parishes = require(parishesPath);
const bishopLocations = require(bishopLocationsPath);

// Create a map of cities to diocesan seat info
const seatMap = {};
Object.entries(bishopLocations.bishopLocations).forEach(([diocese, info]) => {
  const cityState = info.seat; // e.g., "Anchorage, AK"
  if (!seatMap[cityState]) {
    seatMap[cityState] = [];
  }
  seatMap[cityState].push({
    diocese,
    jurisdiction: info.jurisdiction,
    type: info.type,
    notes: info.notes
  });
});

console.log('Diocesan seat cities:', Object.keys(seatMap));
console.log('');

// Add diocesanSeat field to parishes
let seatCount = 0;
let recordsUpdated = 0;

parishes.forEach(parish => {
  const cityState = `${parish.city}, ${parish.state}`;
  
  if (seatMap[cityState]) {
    // This church is in a diocesan seat city
    parish.diocesanSeats = seatMap[cityState];
    seatCount++;
    
    // Only log the first few for verification
    if (recordsUpdated < 5) {
      console.log(`✓ ${parish.name}`);
      console.log(`  Location: ${cityState}`);
      seatMap[cityState].forEach(seat => {
        console.log(`  → ${seat.diocese} (${seat.jurisdiction})`);
      });
      console.log('');
    }
    recordsUpdated++;
  }
});

if (recordsUpdated > 5) {
  console.log(`... and ${recordsUpdated - 5} more churches\n`);
}

console.log(`\n=== SUMMARY ===`);
console.log(`Churches marked with diocesan seats: ${seatCount}`);
console.log(`Total parishes: ${parishes.length}`);

// Save updated parishes
fs.writeFileSync(parishesPath, JSON.stringify(parishes, null, 2));
console.log(`\nUpdated all-parishes.json with diocesan seat information.`);
