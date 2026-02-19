/**
 * Scrape All Sources – Comprehensive Orthodox Parish Data Collection
 *
 * This script runs ALL available scrapers in sequence, collects data from
 * every Orthodox jurisdiction, deduplicates, and generates a comprehensive
 * all-parishes dataset.
 *
 * Usage:
 *   node scrape-all.js              # run all scrapers
 *   node scrape-all.js --retry      # retry failed scrapers once
 *   node scrape-all.js --skip-merge # skip final merge (keep individual files only)
 */

const path = require("path");
const { sanitizeRecord } = require("./src/sanitize");

// ── Complete Registry of All Available Scrapers ──────────────────────
const ALL_SCRAPERS = {
  // Primary jurisdictions (largest in North America)
  oca: require("./src/scrapers/oca"),
  chicago: require("./src/scrapers/chicago-rocor"),
  goarch: require("./src/scrapers/goarch"),
  antiochian: require("./src/scrapers/antiochian"),
  
  // Other canonical jurisdictions
  serbian: require("./src/scrapers/serbian"),
  romanian: require("./src/scrapers/romanian"),
  bulgarian: require("./src/scrapers/bulgarian"),
  acrod: require("./src/scrapers/acrod"),
  uoc: require("./src/scrapers/uoc-usa"),
  "ea-diocese": require("./src/scrapers/ea-diocese"),
  
  // Cross-reference & supplementary sources
  assembly: require("./src/scrapers/assembly-of-bishops"),
  "orthodox-world": require("./src/scrapers/orthodox-world"),
};

// ── Configuration ─────────────────────────────────────────────────────
const RETRY_FAILED_SCRAPERS = process.argv.includes("--retry");
const SKIP_MERGE = process.argv.includes("--skip-merge");

// ── Main Execution ────────────────────────────────────────────────────
async function scrapeAll() {
  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  Orthodox Parish Scraper – COMPREHENSIVE DATA COLLECTION     ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");
  console.log(`Sources to scrape: ${Object.keys(ALL_SCRAPERS).length}`);
  console.log(`Retry on failure: ${RETRY_FAILED_SCRAPERS ? "YES" : "NO"}`);
  console.log(`Skip merge: ${SKIP_MERGE ? "YES" : "NO"}\n`);

  const allData = [];
  const summary = [];
  const failed = [];

  // ── Phase 1: Run all scrapers ───────────────────────────────────────
  console.log("═══ PHASE 1: SCRAPING ALL SOURCES ═══\n");

  for (const [key, scraper] of Object.entries(ALL_SCRAPERS)) {
    console.log(`\n┌─ ${key.toUpperCase()} ${"─".repeat(60 - key.length)}`);
    const start = Date.now();
    
    try {
      const raw = await scraper.run();
      const data = raw.map((r) => sanitizeRecord(r));
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      
      console.log(`└─ ✓ ${key}: ${data.length} parishes (${elapsed}s)`);
      summary.push({ 
        source: key, 
        count: data.length, 
        time: `${elapsed}s`, 
        status: "✓ SUCCESS" 
      });
      allData.push(...data);
      
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.error(`└─ ✗ ${key} FAILED: ${err.message} (${elapsed}s)`);
      summary.push({ 
        source: key, 
        count: 0, 
        time: `${elapsed}s`, 
        status: `✗ ${err.message.substring(0, 30)}` 
      });
      failed.push({ key, scraper, error: err });
    }
  }

  // ── Phase 2: Retry failed scrapers (if enabled) ─────────────────────
  if (RETRY_FAILED_SCRAPERS && failed.length > 0) {
    console.log("\n\n═══ PHASE 2: RETRYING FAILED SCRAPERS ═══\n");
    
    const stillFailed = [];
    for (const { key, scraper } of failed) {
      console.log(`\n┌─ RETRY: ${key.toUpperCase()} ${"─".repeat(55 - key.length)}`);
      const start = Date.now();
      
      try {
        const raw = await scraper.run();
        const data = raw.map((r) => sanitizeRecord(r));
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        
        console.log(`└─ ✓ ${key}: ${data.length} parishes (${elapsed}s) [RETRY SUCCESS]`);
        
        // Update summary
        const summaryEntry = summary.find(s => s.source === key);
        if (summaryEntry) {
          summaryEntry.count = data.length;
          summaryEntry.time = `${elapsed}s`;
          summaryEntry.status = "✓ SUCCESS (retry)";
        }
        allData.push(...data);
        
      } catch (err) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.error(`└─ ✗ ${key} STILL FAILED: ${err.message} (${elapsed}s)`);
        stillFailed.push(key);
      }
    }
    
    if (stillFailed.length > 0) {
      console.log(`\n⚠  ${stillFailed.length} source(s) failed after retry: ${stillFailed.join(", ")}`);
    }
  }

  // ── Phase 3: Merge and deduplicate ──────────────────────────────────
  if (!SKIP_MERGE && allData.length > 0) {
    console.log("\n\n═══ PHASE 3: MERGING & DEDUPLICATING ═══\n");
    
    const { writeCSV, writeJSON } = require("./src/utils");
    const { deduplicate } = require("./src/dedup");

    const { unique, stats } = deduplicate(allData);
    console.log(`[dedup] ${stats.total} total records → ${stats.unique} unique parishes`);
    console.log(`        ${stats.merged} duplicates merged across sources`);

    const columns = [...new Set(unique.flatMap(Object.keys))];
    const csvPath = await writeCSV("all-parishes.csv", unique, columns);
    const jsonPath = writeJSON("all-parishes.json", unique);
    
    console.log(`\n[output] ${csvPath}`);
    console.log(`[output] ${jsonPath}`);
  }

  // ── Phase 4: Summary Report ─────────────────────────────────────────
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
  const successCount = summary.filter(s => s.status.startsWith("✓")).length;
  const failCount = summary.filter(s => s.status.startsWith("✗")).length;
  
  console.log(`\nTotal parishes collected: ${totalCount}`);
  console.log(`Successful sources: ${successCount}/${Object.keys(ALL_SCRAPERS).length}`);
  
  if (failCount > 0) {
    console.log(`\n⚠  WARNING: ${failCount} source(s) failed`);
    const failedSources = summary.filter(s => s.status.startsWith("✗")).map(s => s.source);
    console.log(`   Failed: ${failedSources.join(", ")}`);
    console.log(`   Tip: Run with --retry flag to retry failed scrapers\n`);
  }

  // ── Coverage Analysis ───────────────────────────────────────────────
  if (allData.length > 0) {
    console.log("\n═══ COVERAGE ANALYSIS ═════════════════════════════════════════\n");
    
    // Count by jurisdiction
    const jurisdictions = {};
    allData.forEach(p => {
      const j = p.jurisdiction || "Unknown";
      jurisdictions[j] = (jurisdictions[j] || 0) + 1;
    });
    
    console.log("Parishes by jurisdiction:");
    Object.entries(jurisdictions)
      .sort((a, b) => b[1] - a[1])
      .forEach(([j, count]) => {
        console.log(`  ${String(count).padStart(4)} - ${j}`);
      });
    
    // Count by state (US only)
    const states = {};
    allData.forEach(p => {
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
    
    // Data quality metrics
    const withCoords = allData.filter(p => p.lat && p.lng).length;
    const withPhone = allData.filter(p => p.phone).length;
    const withWebsite = allData.filter(p => p.website).length;
    const withDiocese = allData.filter(p => p.diocese).length;
    
    console.log(`\nData quality metrics:`);
    console.log(`  Geocoded (lat/lng): ${withCoords} (${((withCoords/allData.length)*100).toFixed(1)}%)`);
    console.log(`  Has phone: ${withPhone} (${((withPhone/allData.length)*100).toFixed(1)}%)`);
    console.log(`  Has website: ${withWebsite} (${((withWebsite/allData.length)*100).toFixed(1)}%)`);
    console.log(`  Has diocese: ${withDiocese} (${((withDiocese/allData.length)*100).toFixed(1)}%)`);
  }

  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  SCRAPING COMPLETE                                            ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  if (failCount > 0) {
    process.exit(1);
  }
}

// ── Run ───────────────────────────────────────────────────────────────
scrapeAll().catch((err) => {
  console.error("\n✗ FATAL ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});
