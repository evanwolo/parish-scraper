/**
 * Shared data-layer builders for live API responses and static snapshot files.
 */

const fs = require("fs");
const path = require("path");
const { getDb } = require("./db");
const {
  lookupDiocese,
  getPatriarchate,
} = require("./diocese-lookup");
const {
  classifyImportance,
  JURISDICTION_COLORS,
  DEFAULT_COLOR,
} = require("./routes/middleware");

const ROOT_DIR = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output");

let _parishesCache = null;
let _diocesanSeatsMap = null;
let _europeanFeatures = null;

function getParishesFromDb() {
  if (_parishesCache) return _parishesCache;
  const db = getDb();
  const rows = db.prepare("SELECT * FROM parishes").all();
  _parishesCache = rows;
  return _parishesCache;
}

function getDiocesanSeatsMap() {
  if (_diocesanSeatsMap) return _diocesanSeatsMap;
  _diocesanSeatsMap = {};

  const allParishesPath = path.join(OUTPUT_DIR, "all-parishes.json");
  if (!fs.existsSync(allParishesPath)) return _diocesanSeatsMap;

  try {
    const allParishes = JSON.parse(fs.readFileSync(allParishesPath, "utf-8"));
    allParishes.forEach((p) => {
      if (p.diocesanSeats && p.diocesanSeats.length > 0) {
        const key = `${p.city}|${p.state}`;
        _diocesanSeatsMap[key] = p.diocesanSeats;
      }
    });
  } catch (err) {
    console.warn(`[snapshot] Could not parse all-parishes.json: ${err.message}`);
  }

  return _diocesanSeatsMap;
}

function getEuropeanFeatures() {
  if (_europeanFeatures) return _europeanFeatures;
  _europeanFeatures = [];

  const europeanPath = path.join(OUTPUT_DIR, "european-churches-geojson.json");
  if (!fs.existsSync(europeanPath)) return _europeanFeatures;

  try {
    const europeanGeoJSON = JSON.parse(fs.readFileSync(europeanPath, "utf-8"));
    _europeanFeatures = (europeanGeoJSON.features || []).map((f) => {
      const props = f.properties || {};
      if (!props.color) {
        props.color = JURISDICTION_COLORS[props.jurisdiction] || DEFAULT_COLOR;
      }
      if (!props.importance) {
        props.importance = classifyImportance(props.name);
      }
      return { ...f, properties: props };
    });
  } catch (err) {
    console.warn(`[snapshot] Could not parse european-churches-geojson.json: ${err.message}`);
  }

  return _europeanFeatures;
}

function buildParishesData() {
  return getParishesFromDb();
}

function buildMapDiocesesData() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM polygons WHERE tier = 1").all();

  const countRows = db.prepare(
    "SELECT diocese, COUNT(*) as cnt FROM parishes WHERE lat IS NOT NULL GROUP BY diocese"
  ).all();

  const countByJur = db.prepare(
    "SELECT jurisdiction, COUNT(*) as cnt FROM parishes WHERE lat IS NOT NULL AND (diocese = '' OR diocese IS NULL) GROUP BY jurisdiction"
  ).all();

  const countMap = {};
  for (const r of countRows) {
    if (r.diocese) countMap[r.diocese] = (countMap[r.diocese] || 0) + r.cnt;
  }
  for (const r of countByJur) {
    if (r.jurisdiction) countMap[r.jurisdiction] = (countMap[r.jurisdiction] || 0) + r.cnt;
  }

  const features = rows.map((r) => {
    const dioceseInfo = lookupDiocese(r.diocese);
    const patriarchate = getPatriarchate(r.jurisdiction);

    return {
      type: "Feature",
      properties: {
        entityType: r.entity_type,
        entityId: r.entity_id,
        diocese: r.diocese,
        jurisdiction: r.jurisdiction,
        color: JURISDICTION_COLORS[r.jurisdiction] || DEFAULT_COLOR,
        parishCount: countMap[r.diocese] || countMap[r.jurisdiction] || 0,
        bishop: dioceseInfo?.bishop || null,
        region: dioceseInfo?.region || null,
        states: dioceseInfo?.states || [],
        patriarchate: patriarchate !== "Unknown" ? patriarchate : null,
      },
      geometry: JSON.parse(r.geojson),
    };
  });

  return { type: "FeatureCollection", features };
}

function buildMapParishesPolyData(diocese) {
  const db = getDb();
  let rows;

  if (diocese) {
    rows = db.prepare("SELECT * FROM polygons WHERE tier = 2 AND diocese = ?").all(diocese);
  } else {
    rows = db.prepare("SELECT * FROM polygons WHERE tier = 2").all();
  }

  const features = rows.map((r) => {
    const baseColor = JURISDICTION_COLORS[r.jurisdiction] || DEFAULT_COLOR;
    const hash = r.entity_id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const shift = (hash % 60) - 30;
    const color = [
      Math.max(0, Math.min(255, baseColor[0] + shift)),
      Math.max(0, Math.min(255, baseColor[1] + shift)),
      Math.max(0, Math.min(255, baseColor[2] + shift)),
      baseColor[3],
    ];

    const geojsonRaw = JSON.parse(r.geojson);
    let geometry;
    let parishNames;

    if (geojsonRaw.type === "Feature" && geojsonRaw.geometry) {
      geometry = geojsonRaw.geometry;
      parishNames = geojsonRaw.properties?.parishNames;
    } else if (geojsonRaw.type === "Polygon" || geojsonRaw.type === "MultiPolygon") {
      geometry = geojsonRaw;
      parishNames = geojsonRaw.properties?.parishNames;
    } else if (geojsonRaw.geometry) {
      geometry = geojsonRaw.geometry;
      parishNames = geojsonRaw.properties?.parishNames;
    } else {
      geometry = geojsonRaw;
    }

    return {
      type: "Feature",
      properties: {
        entityType: r.entity_type,
        entityId: r.entity_id,
        diocese: r.diocese,
        jurisdiction: r.jurisdiction,
        color,
        parishNames: parishNames || [],
      },
      geometry,
    };
  });

  return { type: "FeatureCollection", features };
}

function buildMapPointsData() {
  const db = getDb();
  const diocesanSeatsMap = getDiocesanSeatsMap();
  const europeanFeatures = getEuropeanFeatures();

  const rows = db.prepare("SELECT * FROM parishes WHERE lat IS NOT NULL AND lng IS NOT NULL").all();

  const naFeatures = rows.map((r) => {
    const importance = classifyImportance(r.name);
    const dioceseInfo = lookupDiocese(r.diocese);
    const patriarchate = getPatriarchate(r.jurisdiction);
    const seatKey = `${r.city}|${r.state}`;

    return {
      type: "Feature",
      properties: {
        id: r.id,
        name: r.name,
        jurisdiction: r.jurisdiction,
        diocese: r.diocese,
        deanery: r.deanery,
        city: r.city,
        state: r.state,
        country: r.country,
        address: r.address,
        zip: r.zip,
        clergy: r.clergy,
        phone: r.phone,
        website: r.website,
        source: r.source,
        clusterId: r.cluster_id,
        color: JURISDICTION_COLORS[r.jurisdiction] || DEFAULT_COLOR,
        importance,
        patriarchate: patriarchate !== "Unknown" ? patriarchate : null,
        bishop: dioceseInfo?.bishop || null,
        region: dioceseInfo?.region || "North America",
        diocesanSeats: diocesanSeatsMap[seatKey] || null,
      },
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
    };
  });

  return { type: "FeatureCollection", features: [...naFeatures, ...europeanFeatures] };
}

function buildMapMetaData() {
  const db = getDb();

  const parishCount = db.prepare("SELECT COUNT(*) as n FROM parishes WHERE lat IS NOT NULL").get().n;
  const dioceseCount = db.prepare("SELECT COUNT(DISTINCT diocese) as n FROM polygons WHERE tier = 1").get().n;
  const clusterCount = db.prepare("SELECT COUNT(*) as n FROM clusters").get().n;
  const tier1Count = db.prepare("SELECT COUNT(*) as n FROM polygons WHERE tier = 1").get().n;
  const tier2Count = db.prepare("SELECT COUNT(*) as n FROM polygons WHERE tier = 2").get().n;
  const dioceses = db.prepare(
    "SELECT DISTINCT diocese, jurisdiction FROM polygons WHERE tier = 1 ORDER BY jurisdiction, diocese"
  ).all();

  const europeanCount = getEuropeanFeatures().length;

  return {
    stats: {
      naParishes: parishCount,
      europeanChurches: europeanCount,
      totalFeatures: parishCount + europeanCount,
      dioceses: dioceseCount,
      clusters: clusterCount,
      tier1Polygons: tier1Count,
      tier2Polygons: tier2Count,
    },
    colors: JURISDICTION_COLORS,
    defaultColor: DEFAULT_COLOR,
    dioceses,
    regions: ["North America", "Europe"],
  };
}

function clearDataLayerCaches() {
  _parishesCache = null;
  _diocesanSeatsMap = null;
  _europeanFeatures = null;
}

module.exports = {
  buildParishesData,
  buildMapDiocesesData,
  buildMapParishesPolyData,
  buildMapPointsData,
  buildMapMetaData,
  clearDataLayerCaches,
};
