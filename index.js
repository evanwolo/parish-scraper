/**
 * Parish Scraper – Unified Runner
 *
 * Scrapes Orthodox parish directories from multiple sources and writes
 * per-source CSV/JSON files plus a merged "all-parishes" file into output/.
 *
 * Usage:
 *   node index.js                       # scrape ALL sources
 *   node index.js --source chicago      # scrape one source by key
 *   node index.js --source assembly     # (keys: chicago, assembly, oca, uoc, orthodox-world)
 */

const path = require("path");
const { sanitizeRecord } = require("./src/sanitize");

// ── Registry ──────────────────────────────────────────────────────────
const scraperModules = {
  chicago: require("./src/scrapers/chicago-rocor"),
  assembly: require("./src/scrapers/assembly-of-bishops"),
  oca: require("./src/scrapers/oca"),
  uoc: require("./src/scrapers/uoc-usa"),
  "ea-diocese": require("./src/scrapers/ea-diocese"),
  goarch: require("./src/scrapers/goarch"),
  antiochian: require("./src/scrapers/antiochian"),
  serbian: require("./src/scrapers/serbian"),
  romanian: require("./src/scrapers/romanian"),
  acrod: require("./src/scrapers/acrod"),
  bulgarian: require("./src/scrapers/bulgarian"),
  "orthodox-world": require("./src/scrapers/orthodox-world"),
};

// ── CLI arg parsing ───────────────────────────────────────────────────
function getRequestedSources() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--source");
  if (idx !== -1 && args[idx + 1]) {
    const key = args[idx + 1];
    if (!scraperModules[key]) {
      console.error(
        `Unknown source "${key}". Available: ${Object.keys(scraperModules).join(", ")}`
      );
      process.exit(1);
    }
    return [key];
  }
  return Object.keys(scraperModules);
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const sources = getRequestedSources();
  console.log(`\n=== Parish Scraper ===`);
  console.log(`Sources: ${sources.join(", ")}\n`);

  const allData = [];
  const summary = [];

  for (const key of sources) {
    const mod = scraperModules[key];
    const start = Date.now();
    try {
      const raw = await mod.run();
      const data = raw.map((r) => sanitizeRecord(r));
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      summary.push({ source: key, count: data.length, time: `${elapsed}s`, status: "OK" });
      allData.push(...data);
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.error(`\n✗ ${key} failed: ${err.message}\n`);
      summary.push({ source: key, count: 0, time: `${elapsed}s`, status: `FAIL: ${err.message}` });
    }
  }

  // Write merged output when scraping multiple sources
  if (sources.length > 1 && allData.length > 0) {
    const { writeCSV, writeJSON } = require("./src/utils");
    const { deduplicate } = require("./src/dedup");

    // Records are already sanitised in the per-source loop above;
    // deduplicate the merged set now.
    const { unique, stats } = deduplicate(allData);
    console.log(
      `\n[dedup] ${stats.total} records → ${stats.unique} unique (${stats.merged} duplicates merged)`
    );

    const columns = [...new Set(unique.flatMap(Object.keys))];
    const csvPath = await writeCSV("all-parishes.csv", unique, columns);
    const jsonPath = writeJSON("all-parishes.json", unique);
    console.log(`[merged] Wrote ${csvPath}`);
    console.log(`[merged] Wrote ${jsonPath}`);
  }

  // Print summary table
  console.log("\n┌─────────────────────┬────────┬─────────┬──────────────────────────┐");
  console.log("│ Source              │  Count │  Time   │ Status                   │");
  console.log("├─────────────────────┼────────┼─────────┼──────────────────────────┤");
  for (const s of summary) {
    const src = s.source.padEnd(19);
    const cnt = String(s.count).padStart(6);
    const tm = s.time.padStart(7);
    const st = s.status.substring(0, 24).padEnd(24);
    console.log(`│ ${src} │ ${cnt} │ ${tm} │ ${st} │`);
  }
  console.log("└─────────────────────┴────────┴─────────┴──────────────────────────┘");
  console.log(`\nTotal parishes: ${allData.length}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
