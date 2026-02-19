/**
 * Compute jurisdiction map polygons from parish coordinates.
 *
 * Pipeline:
 *   1. Dynamic DBSCAN clustering  (per-diocese, auto epsilon)
 *   2. Tier 1 — Diocese-level Voronoi tessellation
 *   3. Tier 2 — Parish-level subdivision within each diocese
 *
 * Usage:
 *   node src/compute-map.js
 *   node src/compute-map.js --import   # import first, then compute
 */

const { Delaunay } = require("d3-delaunay");
const turf = require("@turf/turf");
const { getDb, initSchema, resetComputed, closeDb } = require("./db");

// Bounding box for North America [west, south, east, north]
const BOUNDS = [-170, 15, -50, 72];
const DBSCAN_MIN_PTS = 2;
const FALLBACK_EPSILON_KM = 8;
const EPSILON_PERCENTILE = 0.15;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function dbscan(points, epsilonKm, minPts) {
  const n = points.length;
  const labels = new Array(n).fill(-1);
  let clusterId = 0;

  const dist = [];
  for (let i = 0; i < n; i++) {
    dist[i] = [];
    for (let j = 0; j < n; j++) {
      dist[i][j] = i === j ? 0 : haversineKm(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
    }
  }

  function regionQuery(idx) {
    const neighbors = [];
    for (let j = 0; j < n; j++) {
      if (dist[idx][j] <= epsilonKm) neighbors.push(j);
    }
    return neighbors;
  }

  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1) continue;
    const neighbors = regionQuery(i);
    if (neighbors.length < minPts) { labels[i] = 0; continue; }
    clusterId++;
    labels[i] = clusterId;
    const seed = [...neighbors];
    for (let si = 0; si < seed.length; si++) {
      const q = seed[si];
      if (labels[q] === 0) labels[q] = clusterId;
      if (labels[q] !== -1 && labels[q] !== 0) continue;
      labels[q] = clusterId;
      const qNeighbors = regionQuery(q);
      if (qNeighbors.length >= minPts) {
        for (const nn of qNeighbors) {
          if (!seed.includes(nn)) seed.push(nn);
        }
      }
    }
  }

  return { labels, numClusters: clusterId };
}

function computeEpsilon(points) {
  if (points.length < 3) return FALLBACK_EPSILON_KM;
  const nnDists = [];
  for (let i = 0; i < points.length; i++) {
    let minD = Infinity;
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const d = haversineKm(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
      if (d < minD) minD = d;
    }
    nnDists.push(minD);
  }
  nnDists.sort((a, b) => a - b);
  const idx = Math.floor(nnDists.length * EPSILON_PERCENTILE);
  const eps = nnDists[Math.min(idx, nnDists.length - 1)];
  return Math.max(0.5, Math.min(50, eps));
}

function computeVoronoiPolygons(points, bounds) {
  if (points.length === 0) return [];
  if (points.length === 1) {
    const [w, s, e, n] = bounds;
    return [turf.polygon([[[w, s], [e, s], [e, n], [w, n], [w, s]]])];
  }
  const coords = points.map((p) => [p.lng, p.lat]);
  const delaunay = Delaunay.from(coords);
  const voronoi = delaunay.voronoi([bounds[0], bounds[1], bounds[2], bounds[3]]);

  const polys = [];
  for (let i = 0; i < points.length; i++) {
    const cell = voronoi.cellPolygon(i);
    if (!cell || cell.length < 4) {
      const p = points[i];
      polys.push(turf.buffer(turf.point([p.lng, p.lat]), 0.5, { units: "kilometers" }));
      continue;
    }
    try {
      polys.push(turf.polygon([cell]));
    } catch {
      const p = points[i];
      polys.push(turf.buffer(turf.point([p.lng, p.lat]), 0.5, { units: "kilometers" }));
    }
  }
  return polys;
}

function safeUnion(polygons) {
  if (polygons.length === 0) return null;
  if (polygons.length === 1) return polygons[0];
  let result = polygons[0];
  for (let i = 1; i < polygons.length; i++) {
    try {
      const u = turf.union(turf.featureCollection([result, polygons[i]]));
      if (u) result = u;
    } catch { continue; }
  }
  return result;
}

function safeIntersect(a, b) {
  try {
    return turf.intersect(turf.featureCollection([a, b]));
  } catch { return a; }
}

/**
 * Look up parish names associated with a representative point.
 */
function getParishNamesForRep(db, rep) {
  if (!rep) return [];
  if (rep.type === "cluster" && rep.dbClusterId) {
    return db.prepare(
      "SELECT id, name, city, state, clergy, phone FROM parishes WHERE cluster_id = ?"
    ).all(rep.dbClusterId);
  }
  if (rep.parishIds && rep.parishIds.length > 0) {
    const placeholders = rep.parishIds.map(() => "?").join(",");
    return db.prepare(
      `SELECT id, name, city, state, clergy, phone FROM parishes WHERE id IN (${placeholders})`
    ).all(...rep.parishIds);
  }
  return [];
}

function computeMap() {
  console.log("[compute] Starting map computation…");
  const db = getDb();
  initSchema();
  resetComputed();

  const parishes = db
    .prepare("SELECT * FROM parishes WHERE lat IS NOT NULL AND lng IS NOT NULL")
    .all();

  console.log(`  ${parishes.length} parishes with coordinates`);
  if (parishes.length === 0) {
    console.log("  ⚠ No parishes with coordinates found. Run import first.");
    closeDb();
    return;
  }

  // Group by diocese
  const dioceseMap = new Map();
  for (const p of parishes) {
    const key = p.diocese || p.jurisdiction || "Unknown";
    if (!dioceseMap.has(key)) dioceseMap.set(key, []);
    dioceseMap.get(key).push(p);
  }
  console.log(`  ${dioceseMap.size} distinct dioceses/groups`);

  // ── STEP 1: DBSCAN clustering per diocese ──
  console.log("  Step 1: DBSCAN clustering…");

  const insertCluster = db.prepare(`
    INSERT INTO clusters (diocese, jurisdiction, centroid_lat, centroid_lng, radius, parish_count)
    VALUES (@diocese, @jurisdiction, @centroid_lat, @centroid_lng, @radius, @parish_count)
  `);
  const updateParishCluster = db.prepare("UPDATE parishes SET cluster_id = @cluster_id WHERE id = @id");

  const dioceseRepPoints = new Map();
  let totalClusters = 0;

  const clusterTransaction = db.transaction(() => {
    for (const [dioceseName, dParishes] of dioceseMap) {
      const points = dParishes.map((p) => ({ lat: p.lat, lng: p.lng, id: p.id }));
      const reps = [];

      if (points.length <= 2) {
        for (const pt of points) {
          reps.push({ lat: pt.lat, lng: pt.lng, id: `p-${pt.id}`, type: "parish", parishIds: [pt.id] });
        }
      } else {
        const epsilon = computeEpsilon(points);
        const { labels } = dbscan(points, epsilon, DBSCAN_MIN_PTS);

        const clusterGroups = new Map();
        for (let i = 0; i < labels.length; i++) {
          const lbl = labels[i];
          if (!clusterGroups.has(lbl)) clusterGroups.set(lbl, []);
          clusterGroups.get(lbl).push(i);
        }

        for (const [label, indices] of clusterGroups) {
          if (label === 0) {
            for (const idx of indices) {
              const pt = points[idx];
              reps.push({ lat: pt.lat, lng: pt.lng, id: `p-${pt.id}`, type: "parish", parishIds: [pt.id] });
            }
          } else {
            const lats = indices.map((i) => points[i].lat);
            const lngs = indices.map((i) => points[i].lng);
            const centLat = lats.reduce((a, b) => a + b, 0) / lats.length;
            const centLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
            const radius = Math.max(...indices.map((i) => haversineKm(centLat, centLng, points[i].lat, points[i].lng)));
            const parishIds = indices.map((i) => points[i].id);
            const jurisdiction = dParishes[0].jurisdiction || "";

            const result = insertCluster.run({
              diocese: dioceseName, jurisdiction, centroid_lat: centLat, centroid_lng: centLng, radius, parish_count: parishIds.length,
            });

            const clusterId = Number(result.lastInsertRowid);
            for (const pid of parishIds) {
              updateParishCluster.run({ cluster_id: clusterId, id: pid });
            }

            reps.push({ lat: centLat, lng: centLng, id: `c-${clusterId}`, type: "cluster", parishIds, dbClusterId: clusterId });
            totalClusters++;
          }
        }
      }

      dioceseRepPoints.set(dioceseName, reps);
    }
  });

  clusterTransaction();
  console.log(`    ${totalClusters} clusters formed from nearby parishes`);

  // ── STEP 2: Tier 1 — Diocese-level Voronoi ──
  console.log("  Step 2: Diocese-level Voronoi (Tier 1)…");

  const allReps = [];
  const repDioceseIndex = [];

  for (const [dioceseName, reps] of dioceseRepPoints) {
    for (const rep of reps) {
      allReps.push(rep);
      repDioceseIndex.push(dioceseName);
    }
  }
  console.log(`    ${allReps.length} representative points across all dioceses`);

  const globalPolys = computeVoronoiPolygons(allReps, BOUNDS);

  const dioceseCellMap = new Map();
  for (let i = 0; i < allReps.length; i++) {
    const diocese = repDioceseIndex[i];
    if (!dioceseCellMap.has(diocese)) dioceseCellMap.set(diocese, []);
    if (globalPolys[i]) dioceseCellMap.get(diocese).push(globalPolys[i]);
  }

  const insertPolygon = db.prepare(`
    INSERT INTO polygons (entity_type, entity_id, diocese, jurisdiction, geojson, tier)
    VALUES (@entity_type, @entity_id, @diocese, @jurisdiction, @geojson, @tier)
  `);

  const diocesePolygons = new Map();

  const tier1Transaction = db.transaction(() => {
    for (const [dioceseName, cells] of dioceseCellMap) {
      const merged = safeUnion(cells);
      if (!merged) continue;
      diocesePolygons.set(dioceseName, merged);

      const dParishes = dioceseMap.get(dioceseName) || [];
      const jurisdiction = dParishes[0]?.jurisdiction || "";

      insertPolygon.run({
        entity_type: "diocese", entity_id: dioceseName, diocese: dioceseName, jurisdiction,
        geojson: JSON.stringify(merged.geometry), tier: 1,
      });
    }
  });

  tier1Transaction();
  console.log(`    ${diocesePolygons.size} diocese polygons stored`);

  // ── STEP 3: Tier 2 — Parish-level subdivision ──
  console.log("  Step 3: Parish-level subdivision (Tier 2)…");

  let tier2Count = 0;

  const tier2Transaction = db.transaction(() => {
    for (const [dioceseName, reps] of dioceseRepPoints) {
      if (reps.length === 0) continue;
      const diocesePoly = diocesePolygons.get(dioceseName);
      if (!diocesePoly) continue;

      const dParishes = dioceseMap.get(dioceseName) || [];
      const jurisdiction = dParishes[0]?.jurisdiction || "";

      // Look up parish names for each rep to embed in the polygon
      const repsWithNames = reps.map(rep => {
        const parishInfos = getParishNamesForRep(db, rep);
        return { ...rep, parishInfos };
      });

      if (reps.length === 1) {
        insertPolygon.run({
          entity_type: "parish", entity_id: repsWithNames[0].id, diocese: dioceseName, jurisdiction,
          geojson: JSON.stringify({
            ...diocesePoly.geometry,
            properties: { parishNames: repsWithNames[0].parishInfos }
          }),
          tier: 2,
        });
        tier2Count++;
        continue;
      }

      const innerPolys = computeVoronoiPolygons(reps, BOUNDS);

      for (let i = 0; i < reps.length; i++) {
        if (!innerPolys[i]) continue;
        const clipped = safeIntersect(innerPolys[i], diocesePoly);
        if (!clipped) continue;

        // Embed parish names into the geojson so the frontend can show them
        const geom = clipped.geometry || clipped;
        insertPolygon.run({
          entity_type: "parish", entity_id: repsWithNames[i].id, diocese: dioceseName, jurisdiction,
          geojson: JSON.stringify({
            ...geom,
            properties: { parishNames: repsWithNames[i].parishInfos }
          }),
          tier: 2,
        });
        tier2Count++;
      }
    }
  });

  tier2Transaction();
  console.log(`    ${tier2Count} parish-level polygons stored`);

  const polyCount = db.prepare("SELECT COUNT(*) as n FROM polygons").get().n;
  const clusterCount = db.prepare("SELECT COUNT(*) as n FROM clusters").get().n;

  console.log(`\n  ✓ Computation complete:`);
  console.log(`    Parishes: ${parishes.length}`);
  console.log(`    Clusters: ${clusterCount}`);
  console.log(`    Polygons: ${polyCount} (Tier 1 + Tier 2)`);

  closeDb();
  console.log("[compute] Done.\n");
}

if (require.main === module) {
  if (process.argv.includes("--import")) {
    const { importParishes } = require("./import");
    importParishes();
  }
  computeMap();
}

module.exports = { computeMap };
