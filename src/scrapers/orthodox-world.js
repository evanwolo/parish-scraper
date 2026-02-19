/**
 * Scraper: Orthodox World – World Orthodox Directory
 * URL: https://orthodox-world.oramaworld.com/
 *
 * The site lists parishes by country / region.  We:
 *   1. Fetch the home page to discover country links.
 *   2. Follow each country page to collect parish listings.
 *
 * Columns: name, country, region, city, website.
 */

const cheerio = require("cheerio");
const { fetchPage, clean, writeCSV, writeJSON, sleep, http } = require("../utils");

const SOURCE_URL = "https://orthodox-world.oramaworld.com/";
const SOURCE_NAME = "orthodox-world";

/**
 * Custom fetch with extra headers to avoid 403 blocks.
 * The orthodox-world site has aggressive bot protection.
 */
async function fetchWithHeaders(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data } = await http.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          Referer: "https://www.google.com/",
          DNT: "1",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "cross-site",
          "Sec-Fetch-Dest": "document",
        },
      });
      return typeof data === "string" ? data : JSON.stringify(data);
    } catch (err) {
      console.error(
        `  [attempt ${attempt}/${retries}] ${url}: ${err.message}`
      );
      if (attempt === retries) throw err;
      await sleep(2000 * attempt);
    }
  }
}

/** Discover country/region links from the home page. */
async function getCountryLinks() {
  console.log(`[${SOURCE_NAME}] Fetching index ${SOURCE_URL} …`);
  const html = await fetchWithHeaders(SOURCE_URL);
  const $ = cheerio.load(html);

  const links = [];
  $("a").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const text = clean($(el).text());
    // Country pages tend to be relative links or same-domain
    if (
      href &&
      text.length > 1 &&
      text.length < 80 &&
      !href.includes("mailto:") &&
      !href.includes("#") &&
      !href.match(/\.(jpg|png|gif|css|js)$/i)
    ) {
      const fullUrl = href.startsWith("http")
        ? href
        : new URL(href, SOURCE_URL).toString();

      // Stay on the same domain
      if (fullUrl.includes("oramaworld.com") || fullUrl.includes("orthodox-world")) {
        if (!links.some((l) => l.url === fullUrl)) {
          links.push({ url: fullUrl, label: text });
        }
      }
    }
  });

  console.log(`[${SOURCE_NAME}] Found ${links.length} sub-page link(s).`);
  return links;
}

/** Scrape a single country/region page for parish entries. */
async function scrapeCountryPage(url, countryLabel) {
  const parishes = [];
  let html;
  try {
    html = await fetchWithHeaders(url);
  } catch {
    return parishes;
  }
  const $ = cheerio.load(html);

  // Strategy 1: table rows
  $("table tbody tr, table tr").each((_i, el) => {
    const cells = [];
    $(el).find("td").each((_ci, td) => cells.push(clean($(td).text())));
    if (cells.length >= 2 && cells[0].length > 3) {
      parishes.push({
        source: SOURCE_NAME,
        name: cells[0],
        country: countryLabel,
        city: cells[1] || "",
        region: cells[2] || "",
        website: $(el).find("a").attr("href") || "",
      });
    }
  });

  // Strategy 2: repeated blocks
  if (parishes.length === 0) {
    const sels = [
      ".parish",
      ".directory-item",
      ".views-row",
      ".entry",
      "li",
      "article",
    ];
    for (const sel of sels) {
      $(sel).each((_i, el) => {
        const name = clean(
          $(el).find("h2, h3, h4, a, .title, .name").first().text()
        );
        if (!name || name.length < 4) return;
        if (
          !/church|parish|cathedral|mission|monastery|temple|chapel|orthodox/i.test(
            name
          ) &&
          name.length < 20
        )
          return;
        parishes.push({
          source: SOURCE_NAME,
          name,
          country: countryLabel,
          city: "",
          region: "",
          website: $(el).find("a").attr("href") || "",
        });
      });
      if (parishes.length > 0) break;
    }
  }

  // Strategy 3: links with church-like names
  if (parishes.length === 0) {
    $("a").each((_i, el) => {
      const text = clean($(el).text());
      if (
        text.length > 5 &&
        /church|parish|cathedral|mission|monastery|orthodox/i.test(text)
      ) {
        parishes.push({
          source: SOURCE_NAME,
          name: text,
          country: countryLabel,
          city: "",
          region: "",
          website: $(el).attr("href") || "",
        });
      }
    });
  }

  return parishes;
}

async function scrape() {
  const allParishes = [];

  // First: scrape the home page itself for any direct listings
  const homeParishes = await scrapeCountryPage(SOURCE_URL, "");
  allParishes.push(...homeParishes);

  // Then: discover and scrape country sub-pages
  let countryLinks = [];
  try {
    countryLinks = await getCountryLinks();
  } catch (err) {
    console.warn(`[${SOURCE_NAME}] Could not fetch index: ${err.message}`);
    console.warn(`[${SOURCE_NAME}] The site may block automated requests (403). Try using a browser or proxy.`);
    return allParishes;
  }

  // Limit to avoid hammering the server – process up to 50 country pages
  const toProcess = countryLinks.slice(0, 50);

  for (const { url, label } of toProcess) {
    await sleep(600); // polite delay
    const p = await scrapeCountryPage(url, label);
    allParishes.push(...p);
  }

  // Deduplicate
  const seen = new Set();
  const unique = allParishes.filter((p) => {
    const key = `${p.name}|${p.country}|${p.city}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[${SOURCE_NAME}] Found ${unique.length} unique parish(es).`);
  return unique;
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
