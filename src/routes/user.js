/**
 * User API routes for authenticated user operations
 * Handles profile, visits, preferences, saved parishes, journal, and spiritual goals
 */

const express = require("express");
const { getDb } = require("../db");
const { requireAuth } = require("./middleware");

const router = express.Router();

// ── User Profile ────────────────────────────────────────────────────

// Get user profile
router.get("/profile", requireAuth, (req, res) => {
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
router.put("/profile", requireAuth, async (req, res) => {
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

// ── Parish Visits ──────────────────────────────────────────────────

// Get visited parishes
router.get("/visits", requireAuth, (req, res) => {
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
router.post("/visits", requireAuth, (req, res) => {
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
router.delete("/visits/:id", requireAuth, (req, res) => {
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

// ── Closest Parish ─────────────────────────────────────────────────

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth radius in miles
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Get closest parish to user's home
router.get("/closest-parish", requireAuth, (req, res) => {
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

    // Fetch parishes and compute distance in JavaScript (better-sqlite3 lacks trig functions)
    let query = `SELECT * FROM parishes WHERE lat IS NOT NULL AND lng IS NOT NULL`;
    const params = [];

    if (jurisdictionFilter) {
      query += ` AND (jurisdiction LIKE ? OR patriarchate LIKE ?)`;
      params.push(`%${jurisdictionFilter}%`, `%${jurisdictionFilter}%`);
    }

    const rows = db.prepare(query).all(...params);
    const parishes = rows
      .map(r => ({ ...r, distance: haversineDistance(profile.home_lat, profile.home_lng, r.lat, r.lng) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);

    // If no results with affiliation filter, fall back to all nearby parishes
    if (parishes.length === 0 && jurisdictionFilter) {
      const allRows = db.prepare(
        "SELECT * FROM parishes WHERE lat IS NOT NULL AND lng IS NOT NULL"
      ).all();
      const fallbackParishes = allRows
        .map(r => ({ ...r, distance: haversineDistance(profile.home_lat, profile.home_lng, r.lat, r.lng) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10);

      return res.json({ parishes: fallbackParishes, filtered: false, message: "No parishes of your affiliation found nearby. Showing all nearby parishes." });
    }

    res.json({ parishes, filtered: jurisdictionFilter ? true : false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── User Preferences (Bio, Spiritual Journey, etc.) ────────────────

router.get("/preferences", requireAuth, (req, res) => {
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

router.put("/preferences", requireAuth, async (req, res) => {
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

router.get("/saved-parishes", requireAuth, (req, res) => {
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

router.post("/saved-parishes", requireAuth, (req, res) => {
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

router.delete("/saved-parishes/:id", requireAuth, (req, res) => {
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

router.get("/journal", requireAuth, (req, res) => {
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

router.post("/journal", requireAuth, (req, res) => {
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

router.put("/journal/:id", requireAuth, (req, res) => {
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

router.delete("/journal/:id", requireAuth, (req, res) => {
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

router.get("/spiritual-goals", requireAuth, (req, res) => {
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

router.post("/spiritual-goals", requireAuth, (req, res) => {
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

router.put("/spiritual-goals/:id", requireAuth, (req, res) => {
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

router.delete("/spiritual-goals/:id", requireAuth, (req, res) => {
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

module.exports = router;
