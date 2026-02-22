/**
 * Compute jurisdiction map polygons from parish coordinates.
 *
 * Pipeline:
 *   1. Dynamic DBSCAN clustering  (per-diocese, auto epsilon)
 *   2. Tier 1 — Diocese concave hulls (buffered) — overlapping, canonical scope
 *   3. Tier 2 — Global parish-level Voronoi (dominance — every pixel → one parish)
 *
 * Usage:
 *   node src/compute-map.js
 *   node src/compute-map.js --import   # import first, then compute
 */

const { Delaunay } = require("d3-delaunay");
const { point, polygon, lineString, featureCollection } = require("@turf/helpers");
const buffer = require("@turf/buffer").default || require("@turf/buffer");
const convex = require("@turf/convex").default || require("@turf/convex");
const union = require("@turf/union").default || require("@turf/union");
const intersect = require("@turf/intersect").default || require("@turf/intersect");
const concave = require("@turf/concave").default || require("@turf/concave");
const booleanValid = require("@turf/boolean-valid").default || require("@turf/boolean-valid");
const { getDb, initSchema, resetComputed, closeDb } = require("./db");
const { resolveCanonicalDiocese } = require("./diocese-lookup");

// Bounding boxes for different regions
const REGIONS = {
  northamerica: [-180, 15, -50, 72],  // Include full Alaska (Aleutians go past -170)
  europe: [-10, 35, 45, 70],          // Europe from UK to Russia, Turkey to Arctic
  global: [-180, -90, 180, 90]        // World
};
const BOUNDS = REGIONS.global;  // Process all data globally
const DBSCAN_MIN_PTS = 2;
const FALLBACK_EPSILON_KM = 8;
const EPSILON_PERCENTILE = 0.15;

// Buffer distance (km) around concave hulls for diocese boundaries
const DIOCESE_BUFFER_KM = 30;

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

  // Compute distances on-demand instead of storing O(n²) dense matrix
  function regionQuery(idx) {
    const neighbors = [];
    for (let j = 0; j < n; j++) {
      if (j === idx) { neighbors.push(j); continue; }
      if (haversineKm(points[idx].lat, points[idx].lng, points[j].lat, points[j].lng) <= epsilonKm) {
        neighbors.push(j);
      }
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
    return [polygon([[[w, s], [e, s], [e, n], [w, n], [w, s]]])];
  }
  const coords = points.map((p) => [p.lng, p.lat]);
  const delaunay = Delaunay.from(coords);
  const voronoi = delaunay.voronoi([bounds[0], bounds[1], bounds[2], bounds[3]]);

  const polys = [];
  for (let i = 0; i < points.length; i++) {
    const cell = voronoi.cellPolygon(i);
    if (!cell || cell.length < 4) {
      const p = points[i];
      polys.push(buffer(point([p.lng, p.lat]), 0.5, { units: "kilometers" }));
      continue;
    }
    try {
      polys.push(polygon([cell]));
    } catch {
      const p = points[i];
      polys.push(buffer(point([p.lng, p.lat]), 0.5, { units: "kilometers" }));
    }
  }
  return polys;
}

function safeUnion(polygons) {
  // Filter out invalid/degenerate polygons before attempting union
  const valid = polygons.filter((p) => {
    try { return booleanValid ? booleanValid(p) : true; } catch { return false; }
  });
  if (valid.length === 0) {
    // Fall back to convex hull of original polygons if all are invalid
    if (polygons.length > 0) {
      try {
        const fc = featureCollection(polygons);
        return convex(fc) || polygons[0];
      } catch { return polygons[0]; }
    }
    return null;
  }
  if (valid.length === 1) return valid[0];
  let result = valid[0];
  for (let i = 1; i < valid.length; i++) {
    try {
      const u = union(featureCollection([result, valid[i]]));
      if (u) result = u;
    } catch { continue; }
  }
  return result;
}

function safeIntersect(a, b) {
  try {
    return intersect(featureCollection([a, b]));
  } catch { return a; }
}

/**
 * Build a concave hull around a set of points.
 * Falls back to convex hull or buffered point for small sets.
 */
function buildDioceseHull(points, bufferKm) {
  if (points.length === 0) return null;

  const turfPoints = points.map(p => point([p.lng, p.lat]));
  const fc = featureCollection(turfPoints);

  if (points.length === 1) {
    return buffer(turfPoints[0], bufferKm, { units: "kilometers" });
  }

  if (points.length === 2) {
    const line = lineString(points.map(p => [p.lng, p.lat]));
    return buffer(line, bufferKm, { units: "kilometers" });
  }

  // Try concave hull first (maxEdge in km — controls tightness)
  let hull = null;
  try {
    hull = concave(fc, { maxEdge: 300, units: "kilometers" });
  } catch { /* fall through */ }

  if (!hull) {
    try {
      hull = convex(fc);
    } catch { /* fall through */ }
  }

  if (!hull) {
    // Last resort: union of buffered points
    const buffered = turfPoints.map(p => buffer(p, bufferKm, { units: "kilometers" }));
    return safeUnion(buffered);
  }

  // Buffer the hull outward to give it body
  try {
    const buffered = buffer(hull, bufferKm, { units: "kilometers" });
    return buffered || hull;
  } catch {
    return hull;
  }
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

  // Group by diocese (resolve canonical name)
  const dioceseMap = new Map();
  for (const p of parishes) {
    const key = resolveCanonicalDiocese(p.diocese, p.jurisdiction);
    if (!dioceseMap.has(key)) dioceseMap.set(key, []);
    dioceseMap.get(key).push(p);
  }
  console.log(`  ${dioceseMap.size} distinct dioceses/groups`);

  // ── Redistribute catch-all jurisdiction groups ──
  // When a group key equals the jurisdiction name but other specific diocese
  // groups exist for that jurisdiction, assign orphan parishes to the nearest
  // real diocese by geographic proximity instead of creating a huge
  // jurisdiction-wide polygon.
  const jurisdictionDioceses = new Map(); // jurisdiction → [dioceseKey, ...]
  for (const [key, dParishes] of dioceseMap) {
    const j = dParishes[0]?.jurisdiction || "";
    if (!jurisdictionDioceses.has(j)) jurisdictionDioceses.set(j, []);
    jurisdictionDioceses.get(j).push(key);
  }

  for (const [jurisdiction, dioceseKeys] of jurisdictionDioceses) {
    // Only act when the jurisdiction name itself is a key AND other real dioceses exist
    if (!dioceseMap.has(jurisdiction)) continue;
    const realDioceses = dioceseKeys.filter(k => k !== jurisdiction);
    if (realDioceses.length === 0) continue; // single-diocese jurisdiction, nothing to redistribute

    const orphans = dioceseMap.get(jurisdiction);
    console.log(`    Redistributing ${orphans.length} orphan parishes from catch-all "${jurisdiction}" to ${realDioceses.length} real dioceses`);

    // Compute centroids of each real diocese group
    const dioceseCentroids = realDioceses.map(dk => {
      const pts = dioceseMap.get(dk);
      const cLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
      const cLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
      return { key: dk, lat: cLat, lng: cLng };
    });

    // Assign each orphan parish to its nearest real diocese
    for (const orphan of orphans) {
      let bestKey = realDioceses[0];
      let bestDist = Infinity;
      for (const dc of dioceseCentroids) {
        const d = haversineKm(orphan.lat, orphan.lng, dc.lat, dc.lng);
        if (d < bestDist) { bestDist = d; bestKey = dc.key; }
      }
      dioceseMap.get(bestKey).push(orphan);
    }

    // Remove the catch-all group
    dioceseMap.delete(jurisdiction);
  }

  console.log(`  ${dioceseMap.size} diocese groups after redistribution`);

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

  // ── STEP 2: Tier 1 — Diocese concave hulls (overlapping) ──
  console.log("  Step 2: Diocese concave hulls (Tier 1 — overlapping)…");

  const insertPolygon = db.prepare(`
    INSERT INTO polygons (entity_type, entity_id, diocese, jurisdiction, geojson, tier)
    VALUES (@entity_type, @entity_id, @diocese, @jurisdiction, @geojson, @tier)
  `);

  const diocesePolygons = new Map();

  const tier1Transaction = db.transaction(() => {
    for (const [dioceseName, dParishes] of dioceseMap) {
      const points = dParishes.map(p => ({ lat: p.lat, lng: p.lng }));
      const hull = buildDioceseHull(points, DIOCESE_BUFFER_KM);
      if (!hull) continue;

      diocesePolygons.set(dioceseName, hull);
      const jurisdiction = dParishes[0]?.jurisdiction || "";

      insertPolygon.run({
        entity_type: "diocese", entity_id: dioceseName, diocese: dioceseName, jurisdiction,
        geojson: JSON.stringify(hull.geometry), tier: 1,
      });
    }
  });

  tier1Transaction();
  console.log(`    ${diocesePolygons.size} diocese hull polygons stored`);

  // ── STEP 3: Tier 2 — Global parish-level Voronoi (dominance view) ──
  console.log("  Step 3: Global parish-level Voronoi (Tier 2 — dominance)…");

  // Collect all representative points across all dioceses for global Voronoi
  const allReps = [];
  const repMeta = []; // parallel array storing diocese/jurisdiction for each rep

  for (const [dioceseName, reps] of dioceseRepPoints) {
    const dParishes = dioceseMap.get(dioceseName) || [];
    const jurisdiction = dParishes[0]?.jurisdiction || "";
    for (const rep of reps) {
      allReps.push(rep);
      repMeta.push({ diocese: dioceseName, jurisdiction });
    }
  }

  console.log(`    ${allReps.length} representative points for global Voronoi`);

  const globalPolys = computeVoronoiPolygons(allReps, BOUNDS);

  // Precompute parish-name lookups BEFORE entering the write transaction
  const precomputedNames = new Map();
  for (const [dioceseName, reps] of dioceseRepPoints) {
    const repsWithNames = reps.map(rep => {
      const parishInfos = getParishNamesForRep(db, rep);
      return { ...rep, parishInfos };
    });
    precomputedNames.set(dioceseName, repsWithNames);
  }

  // Build a quick index from rep id → precomputed names
  const repNameIndex = new Map();
  for (const [, repsWithNames] of precomputedNames) {
    for (const r of repsWithNames) {
      repNameIndex.set(r.id, r.parishInfos);
    }
  }

  let tier2Count = 0;

  const tier2Transaction = db.transaction(() => {
    for (let i = 0; i < allReps.length; i++) {
      if (!globalPolys[i]) continue;
      const rep = allReps[i];
      const meta = repMeta[i];
      const parishInfos = repNameIndex.get(rep.id) || [];
      const geometry = globalPolys[i].geometry || globalPolys[i];

      insertPolygon.run({
        entity_type: "parish",
        entity_id: rep.id,
        diocese: meta.diocese,
        jurisdiction: meta.jurisdiction,
        geojson: JSON.stringify({
          type: "Feature",
          geometry,
          properties: { parishNames: parishInfos },
        }),
        tier: 2,
      });
      tier2Count++;
    }
  });

  tier2Transaction();
  console.log(`    ${tier2Count} parish-level polygons stored`);

  const polyCount = db.prepare("SELECT COUNT(*) as n FROM polygons").get().n;
  const clusterCount = db.prepare("SELECT COUNT(*) as n FROM clusters").get().n;

  console.log(`\n  ✓ Computation complete:`);
  console.log(`    Parishes: ${parishes.length}`);
  console.log(`    Clusters: ${clusterCount}`);
  console.log(`    Polygons: ${polyCount} (Tier 1 hulls + Tier 2 Voronoi)`);

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
