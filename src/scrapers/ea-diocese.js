/**
 * Scraper: Eastern American Diocese (ROCOR) parish directory
 * URL: https://eadiocese.org/parishes
 *
 * 1. Parse the HTML table for parish name, deanery, country, city, state.
 * 2. Visit each detail page to extract address, phone, clergy, website, lat/lng.
 *
 * Detail page structure (same CMS as chicagodiocese.org):
 *   .parish-title h1.SECTION_TITLE   – name
 *   .parish-address                   – mailing address
 *   .detail-row .detail-label/value   – Clergy, Phone, Email, Website, Language
 *   JS: var parishLocation = { lat: N, lng: N };
 */

const cheerio = require("cheerio");
const { fetchPage, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://eadiocese.org/parishes";
const SOURCE_NAME = "ea-diocese";
const BASE = "https://eadiocese.org";
const JURISDICTION = "Russian Orthodox Church Outside of Russia (ROCOR)";

/* ── detail page scraper ───────────────────────────────────────────── */

async function scrapeDetailPage(record) {
  const url = record.detailUrl;
  if (!url) return record;

  let html;
  try { html = await fetchPage(url); } catch { return record; }
  const $ = cheerio.load(html);

  // Address from .parish-address
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

  // Detail rows: Clergy, Phone, Email, Website, Liturgical Language
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

/* ── listing scraper ───────────────────────────────────────────────── */

async function scrape() {
  console.log(`[${SOURCE_NAME}] Fetching ${SOURCE_URL} …`);
  const html = await fetchPage(SOURCE_URL);
  const $ = cheerio.load(html);

  const parishes = [];

  $("table tr").each((_i, row) => {
    const cells = $(row).find("td[valign]");
    if (cells.length < 4) return;

    const firstCell = cells.eq(0);
    const detailLink = firstCell.find("a").first();
    const name = clean(detailLink.text());
    if (!name) return;

    const detailHref = detailLink.attr("href") || "";
    const detailUrl = detailHref.startsWith("http")
      ? detailHref
      : `${BASE}${detailHref.startsWith("/") ? "" : "/"}${detailHref}`;

    // Optional "(www)" link — second <a>
    const allLinks = firstCell.find("a");
    let website = "";
    if (allLinks.length > 1) {
      const wwwLink = allLinks.eq(1).attr("href") || "";
      if (wwwLink.startsWith("http")) website = wwwLink;
    }

    const deanery = clean(
      $(row).find("td#SM_parish_listing_col_deanery, td[id*='deanery']").text() ||
        cells.eq(1).text()
    );
    const country = clean(
      $(row).find("td#SM_parish_listing_col_country, td[id*='country']").text() ||
        cells.eq(2).text()
    );
    const city = clean(
      $(row).find("td#SM_parish_listing_col_city, td[id*='city']").text() ||
        cells.eq(3).text()
    );
    const state = clean(
      $(row).find("td#SM_parish_listing_col_state, td[id*='state']").text() ||
        cells.eq(4).text()
    );

    parishes.push({
      source: SOURCE_NAME,
      name,
      jurisdiction: JURISDICTION,
      diocese: "Eastern American Diocese",
      deanery,
      country: country || "USA",
      city,
      state,
      detailUrl,
      website,
    });
  });

  console.log(`[${SOURCE_NAME}] Found ${parishes.length} parish(es). Fetching detail pages …`);

  // Fetch detail pages
  for (let i = 0; i < parishes.length; i++) {
    if ((i + 1) % 30 === 0) console.log(`[${SOURCE_NAME}]   … ${i + 1}/${parishes.length}`);
    await sleep(300);
    try { parishes[i] = await scrapeDetailPage(parishes[i]); } catch { /* keep partial */ }
  }

  // Set final website (prefer external, then detail page)
  for (const r of parishes) {
    r.website = r.externalWebsite || r.website || r.detailUrl || "";
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
