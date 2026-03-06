#!/usr/bin/env node
/**
 * Parish Scraper — Formal Data Pipeline
 *
 * Stages (in order):
 *   1. scrape   — Run scrapers concurrently, output per-source + merged JSON/CSV
 *   2. dedup    — Re-deduplicate merged data
 *   3. enrich   — Add bishop seats & backfill diocese fields
 *   4. geocode  — Fill missing lat/lng via Nominatim (slow, optional)
 *   5. import   — Load output JSON into SQLite (fresh)
 *   6. compute  — Generate map polygons (DBSCAN + hulls + Voronoi)
 *   7. snapshot — Build static frontend JSON snapshots
 *   8. serve    — Start the Express server
 *
 * Usage:
 *   node pipeline.js                          # stages 1-7
 *   node pipeline.js --serve                  # stages 1-8
 *   node pipeline.js --from import            # start from import
 *   node pipeline.js --only compute           # single stage
 *   node pipeline.js --stages scrape,import   # specific stages
 *   node pipeline.js --skip geocode           # skip slow stage
 *   node pipeline.js --dry-run                # show plan only
 *   node pipeline.js --retry                  # retry failed scrapers
 *   node pipeline.js --list                   # list stages
 */

const path = require("path");
const fs = require("fs");

// ── Stage Definitions ──────────────────────────────────────────────

const STAGES = [
  { name: "scrape",  description: "Run scrapers → per-source + merged JSON/CSV", run: runScrape },
  { name: "dedup",   description: "Re-deduplicate merged all-parishes data",     run: runDedup },
  { name: "enrich",  description: "Add bishop seats & backfill diocese fields",   run: runEnrich },
  { name: "geocode", description: "Fill missing lat/lng via Nominatim (slow)",    run: runGeocode },
  { name: "import",  description: "Load output JSON into SQLite (fresh import)",  run: runImport },
  { name: "compute", description: "Generate map polygons (DBSCAN + hulls + Voronoi)", run: runCompute },
  { name: "snapshot", description: "Build static frontend JSON snapshots", run: runSnapshot },
  { name: "serve",   description: "Start the Express server on port 3000",       run: runServe },
];

const STAGE_NAMES = STAGES.map((s) => s.name);

// ── CLI Parsing ────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { from: null, only: null, stages: null, skip: [], dryRun: false, retry: false, serve: false, list: false, source: null };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--from":    opts.from = args[++i]; break;
      case "--only":    opts.only = args[++i]; break;
      case "--stages":  opts.stages = args[++i]?.split(",").map((s) => s.trim()); break;
      case "--skip":    opts.skip.push(...args[++i]?.split(",").map((s) => s.trim())); break;
      case "--dry-run": opts.dryRun = true; break;
      case "--retry":   opts.retry = true; break;
      case "--serve":   opts.serve = true; break;
      case "--list":    opts.list = true; break;
      case "--source":  opts.source = args[++i]; break;
      case "--help": case "-h": printUsage(); process.exit(0);
    }
  }
  return opts;
}

function printUsage() {
  console.log(`
Parish Scraper — Data Pipeline

Usage: node pipeline.js [options]

Options:
  --from <stage>           Start from this stage
  --only <stage>           Run only this stage
  --stages <a,b,c>         Run specific stages (in pipeline order)
  --skip <a,b>             Skip these stages
  --serve                  Include the serve stage
  --retry                  Retry failed scrapers
  --source <key>           Scrape only one source
  --dry-run                Show plan without executing
  --list                   List available stages

Stages:
${STAGES.map((s, i) => `  ${i + 1}. ${s.name.padEnd(10)} ${s.description}`).join("\n")}
`);
}

// ── Stage Resolution ───────────────────────────────────────────────

function resolveStages(opts) {
  const validate = (names) => {
    const unknown = names.filter((s) => !STAGE_NAMES.includes(s));
    if (unknown.length) { console.error(`Unknown stage(s): ${unknown.join(", ")}. Available: ${STAGE_NAMES.join(", ")}`); process.exit(1); }
  };

  if (opts.only) { validate([opts.only]); return [opts.only]; }

  let selected;
  if (opts.stages) { validate(opts.stages); selected = STAGE_NAMES.filter((s) => opts.stages.includes(s)); }
  else if (opts.from) { validate([opts.from]); selected = STAGE_NAMES.slice(STAGE_NAMES.indexOf(opts.from)); }
  else { selected = opts.serve ? [...STAGE_NAMES] : STAGE_NAMES.filter((s) => s !== "serve"); }

  if (opts.skip.length) { validate(opts.skip); selected = selected.filter((s) => !opts.skip.includes(s)); }
  if (!opts.serve && !opts.only) selected = selected.filter((s) => s !== "serve");

  return selected;
}

// ── Stage Implementations ──────────────────────────────────────────

async function runScrape(ctx) {
  const scrapeArgs = [];
  if (ctx.retry) scrapeArgs.push("--retry");
  if (ctx.source) scrapeArgs.push("--source", ctx.source);

  const originalArgv = process.argv;
  process.argv = ["node", "scrape.js", ...scrapeArgs];
  try {
    delete require.cache[require.resolve("./scrape")];
    const { scrapeAll } = require("./scrape");
    await scrapeAll();
  } finally {
    process.argv = originalArgv;
  }
}

async function runDedup() {
  const allPath = path.join(__dirname, "output", "all-parishes.json");
  if (!fs.existsSync(allPath)) { console.log("  No all-parishes.json — skipping dedup"); return; }

  const { deduplicate } = require("./src/dedup");
  const { writeCSV, writeJSON } = require("./src/utils");
  const data = JSON.parse(fs.readFileSync(allPath, "utf-8"));
  console.log(`  Input: ${data.length} parishes`);

  const { unique, stats } = deduplicate(data);
  console.log(`  Output: ${unique.length} parishes (${stats.merged} merged)`);

  const columns = [...new Set(unique.flatMap(Object.keys))];
  writeJSON("all-parishes.json", unique);
  await writeCSV("all-parishes.csv", unique, columns);
}

async function runEnrich() {
  const allPath = path.join(__dirname, "output", "all-parishes.json");
  if (!fs.existsSync(allPath)) { console.log("  No all-parishes.json — skipping enrich"); return; }

  const bishopPath = path.join(__dirname, "bishop-locations.json");
  if (!fs.existsSync(bishopPath)) { console.log("  No bishop-locations.json — skipping"); return; }

  const parishes = JSON.parse(fs.readFileSync(allPath, "utf-8"));
  const bishopLocations = JSON.parse(fs.readFileSync(bishopPath, "utf-8"));

  const seatMap = {};
  Object.entries(bishopLocations.bishopLocations || {}).forEach(([diocese, info]) => {
    const cityState = info.seat;
    if (!seatMap[cityState]) seatMap[cityState] = [];
    seatMap[cityState].push({ diocese, jurisdiction: info.jurisdiction, type: info.type, notes: info.notes });
  });

  let seatCount = 0;
  parishes.forEach((p) => {
    const key = `${p.city}, ${p.state}`;
    if (seatMap[key]) { p.diocesanSeats = seatMap[key]; seatCount++; }
  });

  fs.writeFileSync(allPath, JSON.stringify(parishes, null, 2));
  console.log(`  Bishop seats: ${seatCount} parishes marked`);
}

async function runGeocode() {
  const allPath = path.join(__dirname, "output", "all-parishes.json");
  if (!fs.existsSync(allPath)) { console.log("  No all-parishes.json — skipping geocode"); return; }

  const { geocodeBatch } = require("./src/geocode");
  const parishes = JSON.parse(fs.readFileSync(allPath, "utf-8"));
  const missing = parishes.filter((p) => !p.lat && !p.lng && (p.address || p.city));
  console.log(`  ${missing.length} parishes need geocoding out of ${parishes.length}`);
  if (missing.length === 0) { console.log("  All parishes already geocoded"); return; }

  await geocodeBatch(parishes, { label: "pipeline-geocode" });
  fs.writeFileSync(allPath, JSON.stringify(parishes, null, 2));
  console.log(`  Geocoded: ${parishes.filter((p) => p.lat && p.lng).length}/${parishes.length}`);
}

async function runImport() {
  const { importParishes } = require("./src/import");
  const originalArgv = process.argv;
  process.argv = ["node", "import.js", "--fresh"];
  try { importParishes(); } finally { process.argv = originalArgv; }

  try {
    const { backfillDioceses } = require("./src/backfill-diocese");
    backfillDioceses();
  } catch (err) { console.warn(`  Diocese backfill warning: ${err.message}`); }
}

async function runCompute() {
  const { computeMap } = require("./src/compute-map");
  computeMap();
}

async function runSnapshot() {
  const { buildSnapshots } = require("./src/build-snapshots");
  buildSnapshots();
}

async function runServe() {
  require("./server");
}

// ── Pipeline Runner ────────────────────────────────────────────────

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

async function runPipeline() {
  const opts = parseArgs();

  if (opts.list) {
    console.log("\nAvailable pipeline stages:\n");
    STAGES.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s.name.padEnd(10)} — ${s.description}`));
    console.log();
    return;
  }

  const stageNames = resolveStages(opts);
  if (stageNames.length === 0) { console.error("No stages selected. Use --help for usage."); process.exit(1); }

  const stageDefs = stageNames.map((name) => STAGES.find((s) => s.name === name));

  console.log();
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║           Orthodox Parish Data Pipeline                      ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`  Stages: ${stageNames.join(" → ")}`);
  if (opts.skip.length) console.log(`  Skipped: ${opts.skip.join(", ")}`);
  if (opts.retry) console.log(`  Retry failed scrapers: YES`);
  if (opts.source) console.log(`  Source filter: ${opts.source}`);
  console.log();

  if (opts.dryRun) {
    console.log("──── DRY RUN (no stages will execute) ────\n");
    stageDefs.forEach((s, i) => console.log(`  ${i + 1}. [${s.name}] ${s.description}`));
    console.log("\nRemove --dry-run to execute.\n");
    return;
  }

  const results = [];
  const pipelineStart = Date.now();

  for (let i = 0; i < stageDefs.length; i++) {
    const stage = stageDefs[i];
    console.log(`\n${"═".repeat(65)}`);
    console.log(`  STAGE ${i + 1}/${stageDefs.length}: ${stage.name.toUpperCase()} — ${stage.description}`);
    console.log(`${"═".repeat(65)}\n`);

    const start = Date.now();
    try {
      await stage.run({ retry: opts.retry, source: opts.source });
      const elapsed = Date.now() - start;
      results.push({ name: stage.name, status: "OK", elapsed });
      console.log(`\n  ✓ ${stage.name} completed (${formatDuration(elapsed)})`);
    } catch (err) {
      const elapsed = Date.now() - start;
      results.push({ name: stage.name, status: "FAILED", elapsed, error: err.message });
      console.error(`\n  ✗ ${stage.name} FAILED: ${err.message}`);
      if (stage.name !== "serve") {
        console.error(`  Resume with: node pipeline.js --from ${stage.name}\n`);
        break;
      }
    }
  }

  const totalElapsed = Date.now() - pipelineStart;
  console.log(`\n\n${"═".repeat(65)}`);
  console.log("  PIPELINE SUMMARY");
  console.log(`${"═".repeat(65)}\n`);
  console.log("  ┌──────────────┬──────────┬─────────────┐");
  console.log("  │ Stage        │ Status   │ Duration    │");
  console.log("  ├──────────────┼──────────┼─────────────┤");
  for (const r of results) {
    console.log(`  │ ${r.name.padEnd(12)} │ ${r.status.padEnd(8)} │ ${formatDuration(r.elapsed).padStart(11)} │`);
  }
  console.log("  └──────────────┴──────────┴─────────────┘");
  console.log(`\n  Total: ${formatDuration(totalElapsed)}`);

  const failed = results.filter((r) => r.status === "FAILED");
  if (failed.length) {
    console.log(`\n  ⚠ ${failed.length} stage(s) failed: ${failed.map((r) => r.name).join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\n  All stages completed successfully.");
  }
  console.log();
}

runPipeline().catch((err) => { console.error("Pipeline error:", err); process.exitCode = 1; });
