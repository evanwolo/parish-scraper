/**
 * Parish Scraper – Unified Runner
 *
 * Scrapes Orthodox parish directories from multiple sources and writes
 * per-source CSV/JSON files plus an optional merged "all-parishes" file.
 *
 * Usage:
 *   node scrape.js                       # scrape ALL sources
 *   node scrape.js --source oca          # scrape one source by key
 *   node scrape.js --source all --retry  # retry failed scrapers
 *   node scrape.js --skip-merge          # skip merged output
 */

const { sanitizeRecord } = require("./src/sanitize");

const SCRAPER_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS) || 5 * 60_000;

const SCRAPERS = {
  // Primary jurisdictions (largest in North America)
  oca: "./src/scrapers/oca",
  chicago: "./src/scrapers/chicago-rocor",
  goarch: "./src/scrapers/goarch",
  antiochian: "./src/scrapers/antiochian",

  // Other canonical jurisdictions
  serbian: "./src/scrapers/serbian",
  romanian: "./src/scrapers/romanian",
  bulgarian: "./src/scrapers/bulgarian",
  acrod: "./src/scrapers/acrod",
  uoc: "./src/scrapers/uoc-usa",
  "ea-diocese": "./src/scrapers/ea-diocese",

  // Cross-reference & supplementary sources
  assembly: "./src/scrapers/assembly-of-bishops",
  "orthodox-world": "./src/scrapers/orthodox-world",

  // ═══════════════════════════════════════════════════════════
  // EUROPEAN ORTHODOX CHURCHES
  // ═══════════════════════════════════════════════════════════

  // Eastern Europe
  "romanian-europe": "./src/scrapers/romanian-orthodox-europe",
  "serbian-europe": "./src/scrapers/serbian-orthodox-europe",
  "ukrainian-europe": "./src/scrapers/ukrainian-orthodox-europe",
  "russian-europe": "./src/scrapers/russian-orthodox-europe",
  "warsaw-orthodox": "./src/scrapers/warsaw-orthodox",

  // Southern & East
  "church-of-greece": "./src/scrapers/church-of-greece",
  "georgian-orthodox": "./src/scrapers/georgian-orthodox",
};

const RETRY_FAILED_SCRAPERS = process.argv.includes("--retry");
const SKIP_MERGE = process.argv.includes("--skip-merge");

function getRequestedSources() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--source");
  if (idx !== -1 && args[idx + 1]) {
    const key = args[idx + 1];
    if (key === "all") return Object.keys(SCRAPERS);
    if (!SCRAPERS[key]) {
      console.error(
        `Unknown source "${key}". Available: ${Object.keys(SCRAPERS).join(", ")}`
      );
      process.exitCode = 1;
      return [];
    }
    return [key];
  }
  return Object.keys(SCRAPERS);
}

async function scrapeAll() {
  const sources = getRequestedSources();
  if (sources.length === 0) return;

  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  Orthodox Parish Scraper – COMPREHENSIVE DATA COLLECTION     ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");
  console.log(`Sources to scrape: ${sources.length}`);
  console.log(`Retry on failure: ${RETRY_FAILED_SCRAPERS ? "YES" : "NO"}`);
  console.log(`Skip merge: ${SKIP_MERGE ? "YES" : "NO"}\n`);

  const allData = [];
  const summary = [];
  const failed = [];
  let uniqueData = null;

  const runWithTimeout = async (label, fn) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timed out after ${SCRAPER_TIMEOUT_MS}ms`));
      }, SCRAPER_TIMEOUT_MS);
    });

    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  console.log("═══ PHASE 1: SCRAPING SOURCES (CONCURRENT) ═══\n");

  const scrapePromises = sources.map(async (key) => {
    const start = Date.now();

    try {
      const scraper = require(SCRAPERS[key]);
      const raw = await runWithTimeout(key, () => scraper.run());
      const data = raw.map((r) => sanitizeRecord(r));
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      console.log(`  ✓ ${key}: ${data.length} parishes (${elapsed}s)`);
      return { key, data, elapsed, ok: true };
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.error(`  ✗ ${key} FAILED: ${err.message} (${elapsed}s)`);
      return { key, data: [], elapsed, ok: false, error: err };
    }
  });

  const results = await Promise.allSettled(scrapePromises);

  for (const settled of results) {
    const r = settled.status === "fulfilled" ? settled.value : { key: "?", data: [], elapsed: "0", ok: false, error: settled.reason };
    if (r.ok) {
      summary.push({ source: r.key, count: r.data.length, time: `${r.elapsed}s`, status: "✓ SUCCESS" });
      allData.push(...r.data);
    } else {
      summary.push({ source: r.key, count: 0, time: `${r.elapsed}s`, status: `✗ ${(r.error?.message || "unknown").substring(0, 30)}` });
      failed.push({ key: r.key, error: r.error });
    }
  }

  if (RETRY_FAILED_SCRAPERS && failed.length > 0) {
    console.log("\n\n═══ PHASE 2: RETRYING FAILED SCRAPERS (CONCURRENT) ═══\n");

    const retryPromises = failed.map(async ({ key }) => {
      const start = Date.now();

      try {
        const scraper = require(SCRAPERS[key]);
        const raw = await runWithTimeout(key, () => scraper.run());
        const data = raw.map((r) => sanitizeRecord(r));
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);

        console.log(`  ✓ ${key}: ${data.length} parishes (${elapsed}s) [RETRY SUCCESS]`);
        return { key, data, elapsed, ok: true };
      } catch (err) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.error(`  ✗ ${key} STILL FAILED: ${err.message} (${elapsed}s)`);
        return { key, data: [], elapsed, ok: false };
      }
    });

    const retryResults = await Promise.allSettled(retryPromises);
    const stillFailed = [];

    for (const settled of retryResults) {
      const r = settled.status === "fulfilled" ? settled.value : { key: "?", ok: false };
      if (r.ok) {
        const summaryEntry = summary.find((s) => s.source === r.key);
        if (summaryEntry) {
          summaryEntry.count = r.data.length;
          summaryEntry.time = `${r.elapsed}s`;
          summaryEntry.status = "✓ SUCCESS (retry)";
        }
        allData.push(...r.data);
      } else {
        stillFailed.push(r.key);
      }
    }

    if (stillFailed.length > 0) {
      console.log(`\n⚠  ${stillFailed.length} source(s) failed after retry: ${stillFailed.join(", ")}`);
    }
  }

  if (!SKIP_MERGE && sources.length > 1 && allData.length > 0) {
    console.log("\n\n═══ PHASE 3: MERGING & DEDUPLICATING ═══\n");

    const { writeCSV, writeJSON } = require("./src/utils");
    const { deduplicate } = require("./src/dedup");

    const { unique, stats } = deduplicate(allData);
    uniqueData = unique;
    console.log(`[dedup] ${stats.total} total records → ${stats.unique} unique parishes`);
    console.log(`        ${stats.merged} duplicates merged across sources`);

    const columns = [...new Set(unique.flatMap(Object.keys))];
    const csvPath = await writeCSV("all-parishes.csv", unique, columns);
    const jsonPath = writeJSON("all-parishes.json", unique);

    console.log(`\n[output] ${csvPath}`);
    console.log(`[output] ${jsonPath}`);
  }

  console.log("\n\n═══ SUMMARY ═══════════════════════════════════════════════════\n");
  console.log("┌──────────────────────┬────────┬─────────┬────────────────────────────┐");
  console.log("│ Source               │  Count │  Time   │ Status                     │");
  console.log("├──────────────────────┼────────┼─────────┼────────────────────────────┤");

  for (const s of summary) {
    const src = s.source.padEnd(20);
    const cnt = String(s.count).padStart(6);
    const tm = s.time.padStart(7);
    const st = s.status.substring(0, 26).padEnd(26);
    console.log(`│ ${src} │ ${cnt} │ ${tm} │ ${st} │`);
  }

  console.log("└──────────────────────┴────────┴─────────┴────────────────────────────┘");

  const totalCount = summary.reduce((sum, s) => sum + s.count, 0);
  const successCount = summary.filter((s) => s.status.startsWith("✓")).length;
  const failCount = summary.filter((s) => s.status.startsWith("✗")).length;

  console.log(`\nTotal parishes collected: ${totalCount}`);
  console.log(`Successful sources: ${successCount}/${sources.length}`);

  if (failCount > 0) {
    console.log(`\n⚠  WARNING: ${failCount} source(s) failed`);
    const failedSources = summary.filter((s) => s.status.startsWith("✗")).map((s) => s.source);
    console.log(`   Failed: ${failedSources.join(", ")}`);
    console.log(`   Tip: Run with --retry flag to retry failed scrapers\n`);
  }

  const coverageData = uniqueData || allData;
  if (coverageData.length > 0) {
    console.log("\n═══ COVERAGE ANALYSIS ═════════════════════════════════════════\n");

    const jurisdictions = {};
    coverageData.forEach((p) => {
      const j = p.jurisdiction || "Unknown";
      jurisdictions[j] = (jurisdictions[j] || 0) + 1;
    });

    console.log("Parishes by jurisdiction:");
    Object.entries(jurisdictions)
      .sort((a, b) => b[1] - a[1])
      .forEach(([j, count]) => {
        console.log(`  ${String(count).padStart(4)} - ${j}`);
      });

    const states = {};
    coverageData.forEach((p) => {
      if (p.country === "USA" && p.state) {
        states[p.state] = (states[p.state] || 0) + 1;
      }
    });

    console.log(`\nParishes by state (top 10):`);
    Object.entries(states)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([state, count]) => {
        console.log(`  ${String(count).padStart(4)} - ${state}`);
      });

    const withCoords = coverageData.filter((p) => p.lat && p.lng).length;
    const withPhone = coverageData.filter((p) => p.phone).length;
    const withWebsite = coverageData.filter((p) => p.website).length;
    const withDiocese = coverageData.filter((p) => p.diocese).length;

    console.log(`\nData quality metrics:`);
    console.log(
      `  Geocoded (lat/lng): ${withCoords} (${((withCoords / coverageData.length) * 100).toFixed(1)}%)`
    );
    console.log(
      `  Has phone: ${withPhone} (${((withPhone / coverageData.length) * 100).toFixed(1)}%)`
    );
    console.log(
      `  Has website: ${withWebsite} (${((withWebsite / coverageData.length) * 100).toFixed(1)}%)`
    );
    console.log(
      `  Has diocese: ${withDiocese} (${((withDiocese / coverageData.length) * 100).toFixed(1)}%)`
    );
  }

  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  SCRAPING COMPLETE                                            ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  scrapeAll().catch((err) => {
    console.error("\n✗ FATAL ERROR:", err.message);
    console.error(err.stack);
    process.exitCode = 1;
  });
}

module.exports = { scrapeAll };
