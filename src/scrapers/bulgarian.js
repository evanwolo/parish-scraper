/**
 * Scraper: Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia
 * URL: https://www.bulgariandiocese.org/
 *
 * Strategy: The diocese website uses Orthodox Web Solutions and has a proper
 * parish directory at /parishdirectory.html rendered as an HTML table.
 * Each row links to a detail page (?type=details&id=N) that contains
 * mailing address, phone, clergy, and an embedded Google Map with lat/lng.
 *
 * Columns: name, jurisdiction, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.bulgariandiocese.org/";
const SOURCE_NAME = "bulgarian";
const JURISDICTION = "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia";
const DIRECTORY_URL = "https://www.bulgariandiocese.org/parishdirectory.html";
const BASE_URL = "https://www.bulgariandiocese.org";

// ── Parse the directory table ──

function parseDirectoryTable($) {
  const parishes = [];

  // The directory is a table with columns: Parish | Country | City | State
  $("table tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 4) return;

    const nameCell = $(cells[0]);
    const rawName = clean(nameCell.text())
      .replace(/\s*\(www\)\s*/gi, "")   // strip "(www)" markers
      .trim();
    if (!rawName || rawName.length < 4) return;
    // Skip header row, garbage rows, and footer
    if (/^parish$/i.test(rawName)) return;
    if (rawName.length > 200) return;  // CSS/content leak
    if (/powered by|orthodox web solutions/i.test(rawName)) return;
    if (/\.shape_div_|SECTION_TITLE/i.test(rawName)) return;

    const country = clean($(cells[1]).text()) || "USA";
    const city = clean($(cells[2]).text());
    const state = clean($(cells[3]).text());

    // Extract detail page link if present
    const detailHref = nameCell.find("a[href*='type=details']").attr("href")
      || nameCell.find("a[href*='parishdirectory']").attr("href")
      || "";

    // Extract external website link (links that go off-site)
    let website = "";
    nameCell.find("a[href]").each((_j, a) => {
      const href = $(a).attr("href") || "";
      if (href.startsWith("http") && !href.includes("bulgariandiocese.org")) {
        website = href;
      }
    });

    const detailUrl = detailHref
      ? (detailHref.startsWith("http") ? detailHref : `${BASE_URL}/${detailHref.replace(/^\//, "")}`)
      : "";

    parishes.push({
      source: SOURCE_NAME,
      name: rawName,
      jurisdiction: JURISDICTION,
      city,
      state,
      country,
      phone: "",
      address: "",
      clergy: "",
      website,
      lat: "",
      lng: "",
      _detailUrl: detailUrl,
    });
  });

  return parishes;
}

// ── Fetch detail page for a single parish ──

async function fetchDetail(parish) {
  if (!parish._detailUrl) return;
  try {
    const html = await fetchPage(parish._detailUrl, 2);
    const $ = cheerio.load(html);

    // Mailing Address — appears as text near "Mailing Address:"
    const bodyText = $("body").text();
    const addrMatch = bodyText.match(/Mailing Address:\s*(.+?)(?=\s*Contact Information|Phone:|Clergy:|$)/is);
    if (addrMatch) {
      const addr = clean(addrMatch[1]).replace(/\s+/g, " ").trim();
      if (addr) parish.address = addr;
    }

    // Phone
    const phoneLink = $("a[href^='tel:']").first().attr("href");
    if (phoneLink) {
      parish.phone = phoneLink.replace("tel:", "").trim();
    } else {
      const phoneMatch = bodyText.match(/Phone:\s*([\d+\-()\s]+)/i);
      if (phoneMatch) parish.phone = clean(phoneMatch[1]);
    }

    // Clergy
    const clergyMatch = bodyText.match(/Clergy:\s*(.+?)(?=\s*Phone:|Contact Information|Additional Information|$)/is);
    if (clergyMatch) {
      let clergy = clean(clergyMatch[1])
        .replace(/\S+@\S+/g, "")          // strip emails
        .replace(/\+?1?[\s-]?\d{3}[\s-]\d{3}[\s-]\d{4}/g, "") // strip phones
        .replace(/\s+/g, " ")
        .trim();
      if (clergy && clergy.length < 200) parish.clergy = clergy;
    }

    // Website — look for external links in the page body
    if (!parish.website) {
      $("a[href]").each((_i, a) => {
        const href = $(a).attr("href") || "";
        if (href.startsWith("http") && !href.includes("bulgariandiocese.org")
            && !href.includes("google.com") && !href.includes("orthodoxws.com")
            && !href.includes("bg-patriarshia")) {
          if (!parish.website) parish.website = href;
        }
      });
    }

    // Lat/lng from embedded Google Maps — multiple strategies
    const fullHtml = $.html();

    // Strategy 1: var parishLocation = { lat: N, lng: N }  (Orthodox Web Solutions)
    const plMatch = fullHtml.match(/parishLocation\s*=\s*\{[^}]*lat:\s*([-\d.]+)[^}]*lng:\s*([-\d.]+)/);
    if (plMatch) {
      parish.lat = parseFloat(plMatch[1]);
      parish.lng = parseFloat(plMatch[2]);
    }

    // Strategy 2: google.maps.LatLng(lat, lng)
    if (!parish.lat) {
      const scripts = $("script").map((_i, el) => $(el).html() || "").get().join("\n");
      const llMatch = scripts.match(/LatLng\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
      if (llMatch) {
        parish.lat = parseFloat(llMatch[1]);
        parish.lng = parseFloat(llMatch[2]);
      }
    }

    // Strategy 3: ll= in Google Maps link
    if (!parish.lat) {
      const gmapMatch = fullHtml.match(/maps\.google\.com\/maps\?ll=([-\d.]+),([-\d.]+)/);
      if (gmapMatch) {
        parish.lat = parseFloat(gmapMatch[1]);
        parish.lng = parseFloat(gmapMatch[2]);
      }
    }

    // Strategy 4: @lat,lng in any link
    if (!parish.lat) {
      const atMatch = fullHtml.match(/@([-\d.]+),([-\d.]+)/);
      if (atMatch) {
        parish.lat = parseFloat(atMatch[1]);
        parish.lng = parseFloat(atMatch[2]);
      }
    }
  } catch (err) {
    console.log(`  [${SOURCE_NAME}] Failed to fetch detail for "${parish.name}": ${err.message}`);
  }
}

// ── Static fallback (if live scrape fails) ──

const STATIC_PARISHES = [
  { name: "All Saints Orthodox Church", city: "Buffalo", state: "NY", country: "USA" },
  { name: "Christ the Savior Bulgarian Eastern Orthodox Mission", city: "Nashville", state: "IN", country: "USA" },
  { name: "Comforter Spirit of Truth Orthodox Church", city: "Mississauga", state: "ON", country: "Canada" },
  { name: "Holy Dormition Orthodox Church", city: "Santa Rosa", state: "CA", country: "USA" },
  { name: "Holy Ghost Bulgarian Eastern Orthodox Church", city: "Sterling Heights", state: "MI", country: "USA" },
  { name: "Holy Resurrection Bulgarian Eastern Orthodox Church", city: "Allston", state: "MA", country: "USA" },
  { name: "Holy Transfiguration Bulgarian Eastern Orthodox Church", city: "East Syracuse", state: "NY", country: "USA" },
  { name: "Holy Trinity Bulgarian Eastern Orthodox Church", city: "Madison", state: "IL", country: "USA" },
  { name: "Holy Trinity Macedono-Bulgarian Eastern Orthodox Church", city: "Toronto", state: "ON", country: "Canada" },
  { name: "Joy of All Who Sorrow Bulgarian Eastern Orthodox Church", city: "Indianapolis", state: "IN", country: "USA" },
  { name: "Skete of St. Maximos the Confessor", city: "Palmyra", state: "VA", country: "USA" },
  { name: "St. 26 Zograph Martyrs", city: "Chicago", state: "IL", country: "USA" },
  { name: "St. Clement Ohridski Macedono-Bulgarian Eastern Orthodox Church", city: "Dearborn", state: "MI", country: "USA" },
  { name: "St. Cyril and Methody Macedono-Bulgarian Eastern Orthodox Cathedral", city: "Toronto", state: "ON", country: "Canada" },
  { name: "St. Dimitar Bulgarian Eastern Orthodox Church", city: "Brampton", state: "ON", country: "Canada" },
  { name: "St. George Bulgarian Eastern Orthodox Church", city: "Orlando", state: "FL", country: "USA" },
  { name: "St. George Macedono-Bulgarian Eastern Orthodox Church", city: "Toronto", state: "ON", country: "Canada" },
  { name: "St. George Orthodox Church", city: "Los Angeles", state: "CA", country: "USA" },
  { name: "St. Herman of Alaska Bulgarian Eastern Orthodox Church", city: "Hudson", state: "OH", country: "USA" },
  { name: "St. Innocent of Alaska Bulgarian Eastern Orthodox Church", city: "Salem", state: "VA", country: "USA" },
  { name: "St. John of Rila Bulgarian Orthodox Church", city: "Niagara Falls", state: "ON", country: "Canada" },
  { name: "St. John of Rila Orthodox Church", city: "Montreal", state: "QC", country: "Canada" },
  { name: "St. John the Baptist Orthodox Monastery", city: "Warwick", state: "MA", country: "USA" },
  { name: "St. Joseph the Betrothed Bulgarian Orthodox Mission", city: "Baroda", state: "MI", country: "USA" },
  { name: "St. Nedelya Orthodox Church", city: "Sarasota", state: "FL", country: "USA" },
  { name: "St. Nicholay Orthodox Church", city: "Atlanta", state: "GA", country: "USA" },
  { name: "St. Petka Bulgarian Eastern Orthodox Church", city: "Brookline", state: "MA", country: "USA" },
  { name: "St. Petka Orthodox Church", city: "St. Petersburg", state: "FL", country: "USA" },
  { name: "St. Petka Orthodox Church", city: "Woodburn", state: "MA", country: "USA" },
  { name: "St. Sophia Bulgarian Eastern Orthodox Church", city: "Phoenix", state: "AZ", country: "USA" },
  { name: "St. Sophia Bulgarian Eastern Orthodox Church", city: "Des Plaines", state: "IL", country: "USA" },
  { name: "St. Stephen Bulgarian Eastern Orthodox Church", city: "Indianapolis", state: "IN", country: "USA" },
  { name: "St. Thomas Eastern Orthodox Church", city: "Fairlawn", state: "OH", country: "USA" },
  { name: "Sts. Kyril and Metodi Bulgarian Eastern Orthodox Diocesan Cathedral", city: "New York", state: "NY", country: "USA" },
];

// ── Main ──

async function scrape() {
  let parishes = [];

  // 1. Try live scrape of the parish directory table
  try {
    const html = await fetchPage(DIRECTORY_URL, 2);
    const $ = cheerio.load(html);
    parishes = parseDirectoryTable($);
    console.log(`[${SOURCE_NAME}] Parsed ${parishes.length} parishes from directory table`);
  } catch (err) {
    console.log(`[${SOURCE_NAME}] Failed to fetch directory: ${err.message}`);
  }

  // 2. Fall back to static list if live scrape yielded too few
  if (parishes.length < 10) {
    console.log(`[${SOURCE_NAME}] Using static fallback (${STATIC_PARISHES.length} parishes)`);
    parishes = STATIC_PARISHES.map(p => ({
      source: SOURCE_NAME,
      ...p,
      jurisdiction: JURISDICTION,
      phone: "", address: "", clergy: "", website: "", lat: "", lng: "",
      _detailUrl: "",
    }));
  }

  // 3. Filter to North America (skip Australia)
  parishes = parishes.filter(p =>
    p.country === "USA" || p.country === "Canada"
  );

  // 4. Enrich with detail pages (throttled)
  const withDetail = parishes.filter(p => p._detailUrl);
  if (withDetail.length > 0) {
    console.log(`[${SOURCE_NAME}] Fetching ${withDetail.length} detail pages...`);
    for (const p of withDetail) {
      await fetchDetail(p);
      await sleep(400);
    }
  }

  // 5. Clean up internal field
  for (const p of parishes) {
    delete p._detailUrl;
  }

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
  console.log(`[${SOURCE_NAME}] Wrote ${csvPath} (${data.length} records)`);
  console.log(`[${SOURCE_NAME}] Wrote ${jsonPath}`);
  return data;
}

module.exports = { scrape, run, SOURCE_NAME, SOURCE_URL };
