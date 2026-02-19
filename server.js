/**
 * Simple Express server that serves the web UI and parish JSON data.
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const { deduplicate } = require("./src/dedup");
const { sanitizeRecord } = require("./src/sanitize");
const { getDb, initSchema, migrate, DB_PATH } = require("./src/db");
const {
  PATRIARCHATE_HIERARCHY,
  DIOCESE_REGISTRY,
  getDiocesesForJurisdiction,
  getPatriarchate,
  lookupDiocese,
} = require("./src/diocese-lookup");

// ── Importance classification for parishes ────────────────────────────
// Returns an importance tier: "cathedral", "monastery", "seminary", "notable", or null
function classifyImportance(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (/\bcathedral\b/.test(n)) return "cathedral";
  if (/\bmonaster(y|ies)\b/.test(n) || /\blavra\b/.test(n) || /\bskete\b/.test(n)) return "monastery";
  if (/\bseminar(y|ies)\b/.test(n)) return "seminary";
  if (/\bstavropeg/i.test(n) || /\bmetochion\b/.test(n)) return "notable";
  if (/\bbasili[ck]a\b/.test(n)) return "notable";
  return null;
}

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "orthodox-parish-directory-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

// Authentication middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

// Jurisdiction → RGBA color mapping
const JURISDICTION_COLORS = {
  "Russian Orthodox Church Outside of Russia (ROCOR)":        [30, 100, 200, 100],
  "Orthodox Church in America (OCA)":                         [200, 40,  40, 100],
  "Greek Orthodox Archdiocese of America":                    [200, 170, 30, 100],
  "Antiochian Orthodox Christian Archdiocese of North America":[40, 160, 60, 100],
  "Serbian Orthodox Church in North and South America":       [0, 180, 180, 100],
  "Romanian Orthodox Archdiocese in the Americas":            [140, 50, 180, 100],
  "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia": [200, 120, 40, 100],
  "American Carpatho-Russian Orthodox Diocese":               [100, 60, 30, 100],
  "Ukrainian Orthodox Church of the USA (UOC-USA)":           [60, 120, 200, 100],
  "Albanian Orthodox Diocese of America":                     [180, 80, 100, 100],
  "Georgian Orthodox Church":                                 [80, 140, 80, 100],
  "Patriarchal Parishes of the Russian Orthodox Church in the USA": [100, 100, 180, 100],
};
const DEFAULT_COLOR = [128, 128, 128, 100];

// ── Static files ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── API: return all parishes as JSON (cached) ────────────────────────
let _parishCache = null;
function getParishes() {
  if (_parishCache) return _parishCache;
  const files = [
    "chicago-rocor.json", "assembly-of-bishops.json", "oca.json", "uoc-usa.json",
    "ea-diocese.json", "goarch.json", "antiochian.json", "serbian.json",
    "romanian.json", "acrod.json", "bulgarian.json", "orthodox-world.json",
  ];

  const all = [];
  for (const file of files) {
    const fp = path.join(__dirname, "output", file);
    if (fs.existsSync(fp)) {
      try { all.push(...JSON.parse(fs.readFileSync(fp, "utf-8"))); }
      catch { /* skip bad files */ }
    }
  }

  const normalised = all.map((r) => sanitizeRecord(r));
  const { unique, stats } = deduplicate(normalised);
  console.log(`[api] Cached ${stats.unique} parishes (${stats.merged} duplicates merged from ${stats.total} total)`);
  _parishCache = unique;
  return _parishCache;
}
app.get("/api/parishes", (_req, res) => res.json(getParishes()));

// ── API: list available sources ───────────────────────────────────────
app.get("/api/sources", (_req, res) => {
  const outDir = path.join(__dirname, "output");
  if (!fs.existsSync(outDir)) return res.json([]);
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".json") && f !== "all-parishes.json");
  res.json(files.map((f) => f.replace(".json", "")));
});

// ── Map API: diocese polygons (Tier 1 — overlapping hulls) ────────────
app.get("/api/map/dioceses", (_req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: "Database not found. Run: npm run compute" });
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM polygons WHERE tier = 1").all();
    // Get parish counts per diocese
    const countRows = db.prepare(
      "SELECT diocese, COUNT(*) as cnt FROM parishes WHERE lat IS NOT NULL GROUP BY diocese"
    ).all();
    // Also count parishes that have empty diocese but matching jurisdiction
    const countByJur = db.prepare(
      "SELECT jurisdiction, COUNT(*) as cnt FROM parishes WHERE lat IS NOT NULL AND (diocese = '' OR diocese IS NULL) GROUP BY jurisdiction"
    ).all();
    const countMap = {};
    for (const r of countRows) { if (r.diocese) countMap[r.diocese] = (countMap[r.diocese] || 0) + r.cnt; }
    for (const r of countByJur) { if (r.jurisdiction) countMap[r.jurisdiction] = (countMap[r.jurisdiction] || 0) + r.cnt; }

    const features = rows.map((r) => {
      const dioceseInfo = lookupDiocese(r.diocese);
      const patriarchate = getPatriarchate(r.jurisdiction);
      return {
        type: "Feature",
        properties: {
          entityType: r.entity_type, entityId: r.entity_id, diocese: r.diocese,
          jurisdiction: r.jurisdiction, color: JURISDICTION_COLORS[r.jurisdiction] || DEFAULT_COLOR,
          parishCount: countMap[r.diocese] || countMap[r.jurisdiction] || 0,
          bishop: dioceseInfo?.bishop || null,
          region: dioceseInfo?.region || null,
          states: dioceseInfo?.states || [],
          patriarchate: patriarchate !== "Unknown" ? patriarchate : null,
        },
        geometry: JSON.parse(r.geojson),
      };
    });
    res.json({ type: "FeatureCollection", features });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Map API: parish polygons (Tier 2) ─────────────────────────────────
app.get("/api/map/parishes-poly", (req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: "Database not found. Run: npm run compute" });
  try {
    const db = getDb();
    let rows;
    if (req.query.diocese) {
      rows = db.prepare("SELECT * FROM polygons WHERE tier = 2 AND diocese = ?").all(req.query.diocese);
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

      // Parse stored geojson — may be a Feature (new) or bare geometry (legacy)
      const geojsonRaw = JSON.parse(r.geojson);
      let geometry, parishNames;
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
          entityType: r.entity_type, entityId: r.entity_id, diocese: r.diocese,
          jurisdiction: r.jurisdiction, color, parishNames: parishNames || [],
        },
        geometry,
      };
    });
    res.json({ type: "FeatureCollection", features });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Map API: parish points ────────────────────────────────────────────
app.get("/api/map/points", (_req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: "Database not found. Run: npm run compute" });
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM parishes WHERE lat IS NOT NULL AND lng IS NOT NULL").all();
    const features = rows.map((r) => {
      const importance = classifyImportance(r.name);
      const dioceseInfo = lookupDiocese(r.diocese);
      const patriarchate = getPatriarchate(r.jurisdiction);
      return {
        type: "Feature",
        properties: {
          id: r.id, name: r.name, jurisdiction: r.jurisdiction, diocese: r.diocese,
          deanery: r.deanery, city: r.city, state: r.state, country: r.country,
          address: r.address, zip: r.zip, clergy: r.clergy,
          phone: r.phone, website: r.website, source: r.source, clusterId: r.cluster_id,
          color: JURISDICTION_COLORS[r.jurisdiction] || DEFAULT_COLOR,
          importance,
          patriarchate: patriarchate !== "Unknown" ? patriarchate : null,
          bishop: dioceseInfo?.bishop || null,
          region: dioceseInfo?.region || null,
        },
        geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      };
    });
    res.json({ type: "FeatureCollection", features });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Map API: metadata ─────────────────────────────────────────────────
app.get("/api/map/meta", (_req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: "Database not found. Run: npm run compute" });
  try {
    const db = getDb();
    const parishCount = db.prepare("SELECT COUNT(*) as n FROM parishes WHERE lat IS NOT NULL").get().n;
    const dioceseCount = db.prepare("SELECT COUNT(DISTINCT diocese) as n FROM polygons WHERE tier = 1").get().n;
    const clusterCount = db.prepare("SELECT COUNT(*) as n FROM clusters").get().n;
    const tier1Count = db.prepare("SELECT COUNT(*) as n FROM polygons WHERE tier = 1").get().n;
    const tier2Count = db.prepare("SELECT COUNT(*) as n FROM polygons WHERE tier = 2").get().n;
    const dioceses = db.prepare(
      "SELECT DISTINCT diocese, jurisdiction FROM polygons WHERE tier = 1 ORDER BY jurisdiction, diocese"
    ).all();
    res.json({
      stats: { parishes: parishCount, dioceses: dioceseCount, clusters: clusterCount, tier1Polygons: tier1Count, tier2Polygons: tier2Count },
      colors: JURISDICTION_COLORS, defaultColor: DEFAULT_COLOR, dioceses,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── API: full hierarchy tree ─────────────────────────────────────────
app.get("/api/hierarchy", (_req, res) => {
  try {
    const db = getDb();

    // Parish counts by jurisdiction
    const countsByJurisdiction = {};
    for (const row of db.prepare(
      "SELECT jurisdiction, COUNT(*) as count FROM parishes GROUP BY jurisdiction"
    ).all()) {
      countsByJurisdiction[row.jurisdiction] = row.count;
    }

    // Parish counts by jurisdiction + diocese
    const countsByDiocese = {};
    for (const row of db.prepare(
      "SELECT jurisdiction, diocese, COUNT(*) as count FROM parishes GROUP BY jurisdiction, diocese"
    ).all()) {
      countsByDiocese[`${row.jurisdiction}|||${row.diocese}`] = row.count;
    }

    const tree = [];
    for (const [patriarchate, jurisdictions] of Object.entries(PATRIARCHATE_HIERARCHY)) {
      const jurNodes = jurisdictions.map((jur) => {
        const registryDioceses = getDiocesesForJurisdiction(jur);
        return {
          name: jur,
          color: JURISDICTION_COLORS[jur] || DEFAULT_COLOR,
          parishCount: countsByJurisdiction[jur] || 0,
          dioceses: registryDioceses.map((d) => ({
            name: d.diocese,
            region: d.region,
            states: d.states,
            bishop: d.bishop || null,
            parishCount: countsByDiocese[`${jur}|||${d.diocese}`] || 0,
          })),
        };
      });
      tree.push({ patriarchate, jurisdictions: jurNodes });
    }

    res.json(tree);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── API: stats (includes patriarchate breakdown) ─────────────────────
app.get("/api/stats", (_req, res) => {
  try {
    const db = getDb();
    const total = db.prepare("SELECT COUNT(*) as n FROM parishes").get().n;
    const byPatriarchate = db
      .prepare("SELECT patriarchate, COUNT(*) as count FROM parishes WHERE patriarchate != '' GROUP BY patriarchate ORDER BY count DESC")
      .all();
    const byJurisdiction = db
      .prepare("SELECT jurisdiction, COUNT(*) as count FROM parishes GROUP BY jurisdiction ORDER BY count DESC")
      .all();
    const byState = db
      .prepare("SELECT state, COUNT(*) as count FROM parishes WHERE state != '' GROUP BY state ORDER BY count DESC")
      .all();
    res.json({ total, byPatriarchate, byJurisdiction, byState });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── API: jurisdictions with patriarchate info ────────────────────────
app.get("/api/jurisdictions", (_req, res) => {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT DISTINCT jurisdiction FROM parishes ORDER BY jurisdiction")
      .all();
    const result = rows.map((r) => ({
      jurisdiction: r.jurisdiction,
      patriarchate: getPatriarchate(r.jurisdiction),
      color: JURISDICTION_COLORS[r.jurisdiction] || DEFAULT_COLOR,
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Authentication & User API ────────────────────────────────────────

// Register new user
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const db = getDb();
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare(
      "INSERT INTO users (email, password) VALUES (?, ?)"
    ).run(email, hashedPassword);

    // Create profile
    db.prepare("INSERT INTO user_profiles (user_id) VALUES (?)").run(result.lastInsertRowid);

    req.session.userId = result.lastInsertRowid;
    req.session.email = email;

    res.json({ success: true, userId: result.lastInsertRowid, email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const db = getDb();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    req.session.userId = user.id;
    req.session.email = user.email;

    res.json({ success: true, userId: user.id, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to logout" });
    }
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

// Get current user
app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({ userId: req.session.userId, email: req.session.email });
});

// Get user profile
app.get("/api/user/profile", requireAuth, (req, res) => {
  try {
    const db = getDb();
    const profile = db.prepare(`
      SELECT 
        up.*,
        bp.name as baptismal_parish_name,
        bp.city as baptismal_parish_city,
        bp.state as baptismal_parish_state,
        cp.name as current_parish_name,
        cp.city as current_parish_city,
        cp.state as current_parish_state
      FROM user_profiles up
      LEFT JOIN parishes bp ON up.baptismal_parish_id = bp.id
      LEFT JOIN parishes cp ON up.current_parish_id = cp.id
      WHERE up.user_id = ?
    `).get(req.session.userId);

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user profile
app.put("/api/user/profile", requireAuth, async (req, res) => {
  try {
    const { home_address, home_lat, home_lng, church_status, church_affiliation, baptismal_parish_id, current_parish_id } = req.body;
    const db = getDb();
    
    db.prepare(`
      UPDATE user_profiles 
      SET home_address = ?, 
          home_lat = ?, 
          home_lng = ?, 
          church_status = ?,
          church_affiliation = ?,
          baptismal_parish_id = ?,
          current_parish_id = ?
      WHERE user_id = ?
    `).run(
      home_address || "",
      home_lat || null,
      home_lng || null,
      church_status || "",
      church_affiliation || "",
      baptismal_parish_id || null,
      current_parish_id || null,
      req.session.userId
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get visited parishes
app.get("/api/user/visits", requireAuth, (req, res) => {
  try {
    const db = getDb();
    const visits = db.prepare(`
      SELECT 
        uv.*,
        p.name,
        p.city,
        p.state,
        p.jurisdiction,
        p.diocese,
        p.website
      FROM user_parish_visits uv
      JOIN parishes p ON uv.parish_id = p.id
      WHERE uv.user_id = ?
      ORDER BY uv.visited_at DESC
    `).all(req.session.userId);

    res.json(visits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add parish visit
app.post("/api/user/visits", requireAuth, (req, res) => {
  try {
    const { parish_id, notes } = req.body;
    if (!parish_id) {
      return res.status(400).json({ error: "Parish ID is required" });
    }

    const db = getDb();
    
    // Check if already visited
    const existing = db.prepare(
      "SELECT id FROM user_parish_visits WHERE user_id = ? AND parish_id = ?"
    ).get(req.session.userId, parish_id);

    if (existing) {
      // Update existing visit
      db.prepare(`
        UPDATE user_parish_visits 
        SET visited_at = CURRENT_TIMESTAMP, notes = ?
        WHERE id = ?
      `).run(notes || "", existing.id);
    } else {
      // Insert new visit
      db.prepare(
        "INSERT INTO user_parish_visits (user_id, parish_id, notes) VALUES (?, ?, ?)"
      ).run(req.session.userId, parish_id, notes || "");
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete parish visit
app.delete("/api/user/visits/:id", requireAuth, (req, res) => {
  try {
    const db = getDb();
    db.prepare(
      "DELETE FROM user_parish_visits WHERE id = ? AND user_id = ?"
    ).run(req.params.id, req.session.userId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get closest parish to user's home
app.get("/api/user/closest-parish", requireAuth, (req, res) => {
  try {
    const db = getDb();
    const profile = db.prepare(
      "SELECT home_lat, home_lng, church_affiliation FROM user_profiles WHERE user_id = ?"
    ).get(req.session.userId);

    if (!profile || !profile.home_lat || !profile.home_lng) {
      return res.status(400).json({ error: "Home address not set" });
    }

    // Map church affiliation to jurisdiction/patriarchate filter
    const affiliationMap = {
      'antiochian': 'Antiochian',
      'oca': 'Orthodox Church in America',
      'greek': 'Greek Orthodox',
      'serbian': 'Serbian',
      'romanian': 'Romanian',
      'bulgarian': 'Bulgarian',
      'moscow': 'Moscow Patriarchate',
      'ukrainian': 'Ukrainian',
      'uoc-usa': 'Ukrainian Orthodox',
      'acrod': 'American Carpatho-Russian',
      'assembly': 'Assembly',
      'catholic-eastern': 'Eastern Catholic'
    };

    const jurisdictionFilter = affiliationMap[profile.church_affiliation] || null;

    // Calculate distance using Haversine formula with optional jurisdiction filter
    let query = `
      SELECT 
        *,
        (
          3959 * acos(
            cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) +
            sin(radians(?)) * sin(radians(lat))
          )
        ) as distance
      FROM parishes
      WHERE lat IS NOT NULL AND lng IS NOT NULL
    `;

    const params = [profile.home_lat, profile.home_lng, profile.home_lat];

    // Add jurisdiction filter if affiliation is set
    if (jurisdictionFilter) {
      query += ` AND (jurisdiction LIKE ? OR patriarchate LIKE ?)`;
      params.push(`%${jurisdictionFilter}%`, `%${jurisdictionFilter}%`);
    }

    query += ` ORDER BY distance LIMIT 10`;

    const parishes = db.prepare(query).all(...params);

    // If no results with affiliation filter, fall back to all nearby parishes
    if (parishes.length === 0 && jurisdictionFilter) {
      const fallbackParishes = db.prepare(`
        SELECT 
          *,
          (
            3959 * acos(
              cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) +
              sin(radians(?)) * sin(radians(lat))
            )
          ) as distance
        FROM parishes
        WHERE lat IS NOT NULL AND lng IS NOT NULL
        ORDER BY distance
        LIMIT 10
      `).all(profile.home_lat, profile.home_lng, profile.home_lat);

      return res.json({ parishes: fallbackParishes, filtered: false, message: "No parishes of your affiliation found nearby. Showing all nearby parishes." });
    }

    res.json({ parishes, filtered: jurisdictionFilter ? true : false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── User Preferences (Bio, Spiritual Journey, etc.) ────────────────
app.get("/api/user/preferences", requireAuth, (req, res) => {
  try {
    const db = getDb();
    let prefs = db.prepare(
      "SELECT * FROM user_preferences WHERE user_id = ?"
    ).get(req.session.userId);

    if (!prefs) {
      // Create default preferences
      db.prepare(`
        INSERT INTO user_preferences (user_id, theme) VALUES (?, 'light')
      `).run(req.session.userId);
      prefs = db.prepare(
        "SELECT * FROM user_preferences WHERE user_id = ?"
      ).get(req.session.userId);
    }

    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/user/preferences", requireAuth, async (req, res) => {
  try {
    const { bio, spiritual_journey, favorite_saints, prayer_focus, theme, is_profile_public, show_visited_parishes, show_prayer_intentions } = req.body;
    const db = getDb();

    db.prepare(`
      UPDATE user_preferences 
      SET bio = ?,
          spiritual_journey = ?,
          favorite_saints = ?,
          prayer_focus = ?,
          theme = ?,
          is_profile_public = ?,
          show_visited_parishes = ?,
          show_prayer_intentions = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      bio || "",
      spiritual_journey || "",
      favorite_saints || "",
      prayer_focus || "",
      theme || "light",
      is_profile_public ? 1 : 0,
      show_visited_parishes !== false ? 1 : 0,
      show_prayer_intentions ? 1 : 0,
      req.session.userId
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Saved Parishes (Favorites) ──────────────────────────────────────
app.get("/api/user/saved-parishes", requireAuth, (req, res) => {
  try {
    const db = getDb();
    const saved = db.prepare(`
      SELECT 
        sp.*,
        p.name, p.city, p.state, p.jurisdiction, p.diocese, p.website, p.address, p.phone
      FROM user_saved_parishes sp
      JOIN parishes p ON sp.parish_id = p.id
      WHERE sp.user_id = ?
      ORDER BY sp.saved_at DESC
    `).all(req.session.userId);

    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user/saved-parishes", requireAuth, (req, res) => {
  try {
    const { parish_id, label } = req.body;
    if (!parish_id) return res.status(400).json({ error: "Parish ID is required" });

    const db = getDb();
    db.prepare(
      "INSERT OR IGNORE INTO user_saved_parishes (user_id, parish_id, label) VALUES (?, ?, ?)"
    ).run(req.session.userId, parish_id, label || "");

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/user/saved-parishes/:id", requireAuth, (req, res) => {
  try {
    const db = getDb();
    db.prepare(
      "DELETE FROM user_saved_parishes WHERE id = ? AND user_id = ?"
    ).run(req.params.id, req.session.userId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Journal Entries ─────────────────────────────────────────────────
app.get("/api/user/journal", requireAuth, (req, res) => {
  try {
    const db = getDb();
    const entries = db.prepare(`
      SELECT 
        je.*,
        p.name as parish_name,
        p.city as parish_city,
        p.state as parish_state
      FROM user_journal_entries je
      LEFT JOIN parishes p ON je.parish_id = p.id
      WHERE je.user_id = ?
      ORDER BY je.entry_date DESC
    `).all(req.session.userId);

    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user/journal", requireAuth, (req, res) => {
  try {
    const { title, content, parish_id, entry_date } = req.body;
    const db = getDb();

    const result = db.prepare(`
      INSERT INTO user_journal_entries (user_id, title, content, parish_id, entry_date)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.session.userId,
      title || "",
      content || "",
      parish_id || null,
      entry_date || new Date().toISOString()
    );

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/user/journal/:id", requireAuth, (req, res) => {
  try {
    const { title, content, parish_id, entry_date } = req.body;
    const db = getDb();

    db.prepare(`
      UPDATE user_journal_entries
      SET title = ?, content = ?, parish_id = ?, entry_date = ?
      WHERE id = ? AND user_id = ?
    `).run(title || "", content || "", parish_id || null, entry_date, req.params.id, req.session.userId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/user/journal/:id", requireAuth, (req, res) => {
  try {
    const db = getDb();
    db.prepare(
      "DELETE FROM user_journal_entries WHERE id = ? AND user_id = ?"
    ).run(req.params.id, req.session.userId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Spiritual Goals ────────────────────────────────────────────────
app.get("/api/user/spiritual-goals", requireAuth, (req, res) => {
  try {
    const db = getDb();
    const goals = db.prepare(`
      SELECT * FROM user_spiritual_goals
      WHERE user_id = ?
      ORDER BY is_completed ASC, created_at DESC
    `).all(req.session.userId);

    res.json(goals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user/spiritual-goals", requireAuth, (req, res) => {
  try {
    const { goal_text, category } = req.body;
    if (!goal_text) return res.status(400).json({ error: "Goal text is required" });

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO user_spiritual_goals (user_id, goal_text, category)
      VALUES (?, ?, ?)
    `).run(req.session.userId, goal_text, category || "other");

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/user/spiritual-goals/:id", requireAuth, (req, res) => {
  try {
    const { goal_text, category, is_completed } = req.body;
    const db = getDb();

    db.prepare(`
      UPDATE user_spiritual_goals
      SET goal_text = ?, category = ?, is_completed = ?, completed_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      goal_text,
      category || "other",
      is_completed ? 1 : 0,
      is_completed ? new Date().toISOString() : null,
      req.params.id,
      req.session.userId
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/user/spiritual-goals/:id", requireAuth, (req, res) => {
  try {
    const db = getDb();
    db.prepare(
      "DELETE FROM user_spiritual_goals WHERE id = ? AND user_id = ?"
    ).run(req.params.id, req.session.userId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Fallback to index.html for SPA ───────────────────────────────────
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Ensure schema + migration on startup ─────────────────────────────
try {
  initSchema();
  migrate();
} catch { /* DB may not exist yet — that's fine */ }

app.listen(PORT, () => {
  console.log(`Parish Directory running at http://localhost:${PORT}`);
});
