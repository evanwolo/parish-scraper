/**
 * Generate sample European Orthodox church data for map visualization
 * 
 * This creates GeoJSON features for major Orthodox churches in Europe
 * with realistic coordinates. Used to populate the map with European data
 * until live scraping is implemented.
 */

const fs = require('fs');
const path = require('path');

// Major European Orthodox churches with coordinates
const EUROPEAN_CHURCHES = [
  // ROMANIA
  { name: "Patriarchal Cathedral", city: "București", country: "Romania", diocese: "Mitropolia Munteniei", lat: 44.4268, lng: 26.1038, source: "romanian-europe" },
  { name: "Dormition Cathedral", city: "Sibiu", country: "Romania", diocese: "Mitropolia Argeșului", lat: 45.7979, lng: 24.1548, source: "romanian-europe" },
  { name: "Holy Trinity Church", city: "Cluj-Napoca", country: "Romania", diocese: "Mitropolia Clujului", lat: 46.7712, lng: 23.6236, source: "romanian-europe" },
  { name: "Holy Dormition Cathedral", city: "Iași", country: "Romania", diocese: "Mitropolia Moldovei", lat: 47.1615, lng: 27.5899, source: "romanian-europe" },
  { name: "Holy Cross Cathedral", city: "Constanța", country: "Romania", diocese: "Mitropolia Munteniei", lat: 44.1679, lng: 28.6537, source: "romanian-europe" },
  { name: "Holy Archangels Church", city: "Timișoara", country: "Romania", diocese: "Mitropolia Banatului", lat: 45.7494, lng: 21.2272, source: "romanian-europe" },

  // SERBIA
  { name: "Cathedral of Saint Sava", city: "Beograd", country: "Serbia", diocese: "Eparhija Rašsko-Prizrenska", lat: 44.8125, lng: 20.4619, source: "serbian-europe" },
  { name: "Saint Nicholas Church", city: "Zemun", country: "Serbia", diocese: "Eparhija Bačka", lat: 44.8765, lng: 20.3988, source: "serbian-europe" },
  { name: "Északi Orthodox Church", city: "Niš", country: "Serbia", diocese: "Eparhija Niška", lat: 43.3209, lng: 21.8954, source: "serbian-europe" },
  { name: "Holy Transfiguration", city: "Vranje", country: "Serbia", diocese: "Eparhija Vranjska", lat: 41.8955, lng: 21.9122, source: "serbian-europe" },
  { name: "Saint George Church", city: "Prizren", country: "Serbia", diocese: "Eparhija Rašsko-Prizrenska", lat: 42.2165, lng: 21.1689, source: "serbian-europe" },

  // UKRAINE
  { name: "Saint Michael's Golden-Domed Monastery", city: "Kyiv", country: "Ukraine", diocese: "Kyivska Metropoliya", lat: 50.4454, lng: 30.5341, source: "ukrainian-europe" },
  { name: "Saint Volodymyr Cathedral", city: "Kyiv", country: "Ukraine", diocese: "Kyivska Metropoliya", lat: 50.4577, lng: 30.5281, source: "ukrainian-europe" },
  { name: "Holy Nativity Church", city: "Lviv", country: "Ukraine", diocese: "Lvivska Eparhiya", lat: 49.8383, lng: 24.0232, source: "ukrainian-europe" },
  { name: "Holy Assumption Church", city: "Kharkiv", country: "Ukraine", diocese: "Kharkivska Eparhiya", lat: 50.0039, lng: 36.2304, source: "ukrainian-europe" },
  { name: "Saint John the Baptist Church", city: "Odesa", country: "Ukraine", diocese: "Odaska Metropoliya", lat: 46.4794, lng: 30.7310, source: "ukrainian-europe" },

  // RUSSIA (Moscow area)
  { name: "Cathedral of Christ the Saviour", city: "Moskva", country: "Russia", diocese: "Moskovskaya Eparhiya", lat: 55.7557, lng: 37.6173, source: "russian-europe" },
  { name: "Saint Basil's Cathedral", city: "Moskva", country: "Russia", diocese: "Moskovskaya Eparhiya", lat: 55.7535, lng: 37.6228, source: "russian-europe" },
  { name: "Kazan Cathedral", city: "Sankt-Peterburg", country: "Russia", diocese: "Peterburgskaya Eparhiya", lat: 59.9334, lng: 30.3340, source: "russian-europe" },
  { name: "Peter and Paul Cathedral", city: "Sankt-Peterburg", country: "Russia", diocese: "Peterburgskaya Eparhiya", lat: 59.9510, lng: 30.3215, source: "russian-europe" },
  { name: "Holy Resurrection Church", city: "Vladmir", country: "Russia", diocese: "Vladimirskaya Eparhiya", lat: 56.1386, lng: 40.4069, source: "russian-europe" },

  // GREECE
  { name: "Holy Metropolis of Athens", city: "Athens", country: "Greece", diocese: "Metropolitan of Athens", lat: 37.9838, lng: 23.7275, source: "church-of-greece" },
  { name: "Hagia Sophia Cathedral", city: "Thessaloniki", country: "Greece", diocese: "Metropolitan of Thessaloniki", lat: 40.6366, lng: 22.9547, source: "church-of-greece" },
  { name: "Church of Saint Demetrius", city: "Thessaloniki", country: "Greece", diocese: "Metropolitan of Thessaloniki", lat: 40.6330, lng: 22.9456, source: "church-of-greece" },
  { name: "Orthodox Church of Crete", city: "Iraklio", country: "Greece", diocese: "Metropolitan of Crete", lat: 35.3387, lng: 25.1442, source: "church-of-greece" },
  { name: "Holy Monastery of Knossos", city: "Rethymno", country: "Greece", diocese: "Metropolitan of Crete", lat: 35.3691, lng: 24.8782, source: "church-of-greece" },

  // POLAND
  { name: "Orthodox Cathedral of Mary Magdalene", city: "Białystok", country: "Poland", diocese: "Diocese of Białystok", lat: 53.1289, lng: 23.1671, source: "warsaw-orthodox" },
  { name: "Orthodox Church of the Holy Spirit", city: "Warsaw", country: "Poland", diocese: "Diocese of Warsaw", lat: 52.2296, lng: 21.0122, source: "warsaw-orthodox" },
  { name: "Orthodox Church of St. Mary Magdalene", city: "Gdańsk", country: "Poland", diocese: "Diocese of Gdańsk", lat: 54.3770, lng: 18.6466, source: "warsaw-orthodox" },
  { name: "Orthodox Church", city: "Wrocław", country: "Poland", diocese: "Diocese of Wrocław", lat: 51.1079, lng: 17.0385, source: "warsaw-orthodox" },

  // GEORGIA
  { name: "Svetitskhovloba Cathedral", city: "Tbilisi", country: "Georgia", diocese: "Tbilisi Metropolitan", lat: 41.7151, lng: 44.7922, source: "georgian-orthodox" },
  { name: "Metekhi Church", city: "Tbilisi", country: "Georgia", diocese: "Tbilisi Metropolitan", lat: 41.7161, lng: 44.7912, source: "georgian-orthodox" },
  { name: "Gelati Monastery", city: "Kutaisi", country: "Georgia", diocese: "Diocese of Kutaisi", lat: 42.2855, lng: 42.7106, source: "georgian-orthodox" },
  { name: "Bagrati Cathedral", city: "Kutaisi", country: "Georgia", diocese: "Diocese of Kutaisi", lat: 42.2673, lng: 42.7125, source: "georgian-orthodox" },
  { name: "Sioni Cathedral", city: "Batumi", country: "Georgia", diocese: "Diocese of Batumi", lat: 41.6347, lng: 41.6450, source: "georgian-orthodox" },
];

/**
 * Generate GeoJSON FeatureCollection from European churches
 */
function generateEuropeanGeoJSON() {
  const features = EUROPEAN_CHURCHES.map(church => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [church.lng, church.lat]
    },
    properties: {
      name: church.name,
      city: church.city,
      country: church.country,
      diocese: church.diocese,
      source: church.source,
      jurisdiction: getJurisdiction(church.source),
      lat: church.lat,
      lng: church.lng,
      type: "parish"
    }
  }));

  return {
    type: "FeatureCollection",
    features
  };
}

/**
 * Map source key to full jurisdiction name
 */
function getJurisdiction(source) {
  const jurisdictions = {
    "romanian-europe": "Romanian Orthodox Church",
    "serbian-europe": "Serbian Orthodox Church",
    "ukrainian-europe": "Ukrainian Orthodox Church",
    "russian-europe": "Russian Orthodox Church",
    "church-of-greece": "Church of Greece",
    "warsaw-orthodox": "Polish Orthodox Church",
    "georgian-orthodox": "Georgian Orthodox Church"
  };
  return jurisdictions[source] || "European Orthodox";
}

/**
 * Write European churches to JSON file
 */
function writeEuropeanData() {
  const outputDir = path.join(__dirname, '..', 'output');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write as parishes JSON
  fs.writeFileSync(
    path.join(outputDir, 'european-churches.json'),
    JSON.stringify(EUROPEAN_CHURCHES, null, 2)
  );

  // Write as GeoJSON
  fs.writeFileSync(
    path.join(outputDir, 'european-churches-geojson.json'),
    JSON.stringify(generateEuropeanGeoJSON(), null, 2)
  );

  console.log(`✅ Generated ${EUROPEAN_CHURCHES.length} European churches`);
  console.log(`   Output: output/european-churches.json`);
  console.log(`   GeoJSON: output/european-churches-geojson.json`);

  return EUROPEAN_CHURCHES;
}

// Export
module.exports = {
  EUROPEAN_CHURCHES,
  generateEuropeanGeoJSON,
  writeEuropeanData,
  getJurisdiction
};

// CLI
if (require.main === module) {
  writeEuropeanData();
}
