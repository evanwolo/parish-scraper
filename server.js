/**
 * Simple Express server that serves the web UI and parish JSON data.
 *
 * Usage:
 *   node server.js            # starts on http://localhost:3000
 *   PORT=8080 node server.js  # custom port
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const { deduplicate } = require("./src/dedup");
const { sanitizeRecord } = require("./src/sanitize");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Static files ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── API: return all parishes as JSON ──────────────────────────────────
app.get("/api/parishes", (_req, res) => {
  const files = [
    "chicago-rocor.json",
    "assembly-of-bishops.json",
    "oca.json",
    "uoc-usa.json",
    "ea-diocese.json",
    "goarch.json",
    "antiochian.json",
    "serbian.json",
    "romanian.json",
    "acrod.json",
    "bulgarian.json",
    "orthodox-world.json",
  ];

  const all = [];
  for (const file of files) {
    const fp = path.join(__dirname, "output", file);
    if (fs.existsSync(fp)) {
      try {
        const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
        all.push(...data);
      } catch { /* skip bad files */ }
    }
  }

  // Sanitise & normalise every record
  const normalised = all.map((r) => sanitizeRecord(r));

  // Deduplicate cross-source records
  const { unique, stats } = deduplicate(normalised);
  console.log(
    `[api] Serving ${stats.unique} parishes (${stats.merged} duplicates merged from ${stats.total} total)`
  );

  res.json(unique);
});

// ── API: list available sources ───────────────────────────────────────
app.get("/api/sources", (_req, res) => {
  const outDir = path.join(__dirname, "output");
  if (!fs.existsSync(outDir)) return res.json([]);
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".json") && f !== "all-parishes.json");
  const sources = files.map((f) => f.replace(".json", ""));
  res.json(sources);
});

// ── Fallback to index.html for SPA ───────────────────────────────────
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Parish Directory running at http://localhost:${PORT}`);
});
