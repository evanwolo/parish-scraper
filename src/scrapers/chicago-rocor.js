/**
 * Scraper: Diocese of Chicago and Mid-America (ROCOR) parish list
 * URL: https://chicagodiocese.org/parishes.html
 *
 * 1. Parse the HTML table for parish name, jurisdiction, deanery, city, state.
 * 2. Visit each detail page to get address, phone, clergy, website, lat/lng.
 *
 * Detail page structure (same CMS as eadiocese.org):
 *   .parish-title h1.SECTION_TITLE   – name
 *   .parish-address                   – mailing address
 *   .detail-row .detail-label/value   – Clergy, Phone, Email, Website
 *   JS: var parishLocation = { lat: N, lng: N };
 */

const cheerio = require("cheerio");
const { fetchPage, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://chicagodiocese.org/parishes.html";
const SOURCE_NAME = "chicago-rocor";
const BASE = "https://chicagodiocese.org";
const JURISDICTION = "Russian Orthodox Church Outside of Russia (ROCOR)";

/* ── detail page scraper ───────────────────────────────────────────── */

async function scrapeDetailPage(record) {
  const url = record.detailUrl;
  if (!url) return record;

  let html;
  try { html = await fetchPage(url); } catch { return record; }
  const $ = cheerio.load(html);

  // Address
  const addrEl = $(".parish-address");
  if (addrEl.length) {
    const addrHtml = addrEl.html() || "";
    const lines = addrHtml
      .replace(/<strong>.*?<\/strong>/gi, "")
      .split(/<br\s*\/?>/gi)
      .map((l) => clean(cheerio.load(l).text()))
      .filter(Boolean);
    if (lines.length) record.address = lines.join(", ");
  }

  // Detail rows: Clergy, Phone, Email, Website
  $(".detail-row").each((_i, el) => {
    const label = clean($(el).find(".detail-label").text()).replace(/:$/, "").toLowerCase();
    const valueEl = $(el).find(".detail-value");
    const value = clean(valueEl.text());
    const link = valueEl.find("a").attr("href") || "";

    switch (label) {
      case "clergy": {
        // Separate multiple clergy entries by "; " (they are usually split by <br>)
        const clergyHtml = valueEl.html() || "";
        const clergyParts = clergyHtml
          .split(/<br\s*\/?>/gi)
          .map((p) => clean(cheerio.load(p).text()))
          .filter(Boolean);
        record.clergy = clergyParts.length ? clergyParts.join("; ") : value;
        break;
      }
      case "phone":
        record.phone = value;
        break;
      case "email":
        record.email = value;
        break;
      case "website":
        if (link && link.startsWith("http")) record.externalWebsite = link;
        break;
    }
  });

  // Lat / Lng from JS
  const scripts = $("script").toArray().map((s) => $(s).html() || "").join("\n");
  const locMatch = scripts.match(/parishLocation\s*=\s*\{\s*lat:\s*([\d.-]+)\s*,\s*lng:\s*([\d.-]+)\s*\}/);
  if (locMatch) {
    record.lat = locMatch[1];
    record.lng = locMatch[2];
  }

  return record;
}

/* ── listing page scraper ──────────────────────────────────────────── */

async function scrape() {
  console.log(`[${SOURCE_NAME}] Fetching ${SOURCE_URL} …`);
  const html = await fetchPage(SOURCE_URL);
  const $ = cheerio.load(html);

  const parishes = [];

  // --- Strategy 1: HTML <table> ---
  const tables = $("table");
  if (tables.length > 0) {
    tables.each((_ti, table) => {
      const headerCells = [];
      // Prefer thead if present; otherwise fall back to first row
      const theadRow = $(table).find("thead tr").first();
      if (theadRow.length) {
        theadRow.find("th, td").each((_i, el) => headerCells.push(clean($(el).text()).toLowerCase()));
      } else {
        $(table).find("tr").first().find("th, td")
          .each((_i, el) => headerCells.push(clean($(el).text()).toLowerCase()));
      }

      const rows =
        headerCells.length > 0
          ? $(table).find("tbody tr").add($(table).find("tr").slice(1))
          : $(table).find("tr");

      rows.each((_ri, row) => {
        const cells = [];
        $(row)
          .find("td, th")
          .each((_ci, cell) => cells.push(clean($(cell).text())));

        if (cells.length === 0 || cells.every((c) => !c)) return;

        const record = { source: SOURCE_NAME };
        if (headerCells.length > 0) {
          headerCells.forEach((h, idx) => {
            if (idx < cells.length) record[h] = cells[idx];
          });
        } else {
          record.name = cells[0];
          cells.slice(1).forEach((c, i) => (record[`col${i + 2}`] = c));
        }

        // ── Normalise: rename "parish" key → "name" ──
        if (record.parish && !record.name) {
          record.name = record.parish;
        }
        delete record.parish;

        // Clean "(www)" from name
        if (record.name) {
          record.name = record.name.replace(/\s*\(www\)\s*/gi, "").trim();
        }

        // ── Resolve relative website link ──
        const link = $(row).find("td:first-child a, th:first-child a").attr("href");
        if (link) {
          record.detailUrl = link.startsWith("http") ? link : `${BASE}${link.startsWith("/") ? "" : "/"}${link}`;
        }

        // ── Fill defaults ──
        if (!record.jurisdiction) record.jurisdiction = JURISDICTION;
        if (record.jurisdiction === "ROCOR") record.jurisdiction = JURISDICTION;
        if (!record.country) record.country = "USA";
        if (record.diocese === "DCMA") record.diocese = "Diocese of Chicago and Mid-America";

        parishes.push(record);
      });
    });
  }

  // --- Strategy 2: Structured div/list fallback ---
  if (parishes.length === 0) {
    console.log(`[${SOURCE_NAME}] No table found, trying div/list fallback …`);
    const selectors = [".parish", ".parish-item", ".directory-item", "article", ".views-row", "li.parish"];
    for (const sel of selectors) {
      $(sel).each((_i, el) => {
        const name =
          clean($(el).find("h2, h3, h4, .title, .name").first().text()) ||
          clean($(el).find("a").first().text());
        if (!name) return;
        const record = { source: SOURCE_NAME, name, jurisdiction: JURISDICTION };
        const address = clean($(el).find(".address, .location, .field-address, p").first().text());
        if (address) record.address = address;
        const link = $(el).find("a").attr("href");
        if (link) record.detailUrl = link.startsWith("http") ? link : `${BASE}${link}`;
        parishes.push(record);
      });
      if (parishes.length > 0) break;
    }
  }

  // --- Strategy 3: link-based fallback ---
  if (parishes.length === 0) {
    console.log(`[${SOURCE_NAME}] Trying link-based extraction …`);
    $("a").each((_i, el) => {
      const text = clean($(el).text());
      const href = $(el).attr("href") || "";
      if (/church|mission|monastery|parish|cathedral/i.test(text) && text.length > 5) {
        parishes.push({
          source: SOURCE_NAME,
          name: text.replace(/\s*\(www\)\s*/gi, ""),
          jurisdiction: JURISDICTION,
          website: href.startsWith("http") ? href : undefined,
        });
      }
    });
  }

  console.log(`[${SOURCE_NAME}] Found ${parishes.length} parish(es). Fetching detail pages …`);

  // ── Fetch detail pages to fill address, phone, clergy, lat/lng ──
  for (let i = 0; i < parishes.length; i++) {
    if (parishes[i].detailUrl) {
      if ((i + 1) % 20 === 0) console.log(`[${SOURCE_NAME}]   … ${i + 1}/${parishes.length}`);
      await sleep(300);
      try { parishes[i] = await scrapeDetailPage(parishes[i]); } catch { /* keep partial */ }
    }
  }

  // Set final website field (prefer external site, fall back to detail page)
  for (const r of parishes) {
    r.website = r.externalWebsite || r.detailUrl || "";
    delete r.externalWebsite;
    delete r.detailUrl;
  }

  console.log(`[${SOURCE_NAME}] Completed with ${parishes.length} parish(es).`);
  return parishes;
}

async function run() {
  const data = await scrape();
  if (data.length === 0) {
    console.log(`[${SOURCE_NAME}] No data to write.`);
    return [];
  }
  const columns = [...new Set(data.flatMap(Object.keys))];
  const csvPath = await writeCSV(`${SOURCE_NAME}.csv`, data, columns);
  const jsonPath = writeJSON(`${SOURCE_NAME}.json`, data);
  console.log(`[${SOURCE_NAME}] Wrote ${csvPath}`);
  console.log(`[${SOURCE_NAME}] Wrote ${jsonPath}`);
  return data;
}

module.exports = { scrape, run, SOURCE_NAME, SOURCE_URL };
