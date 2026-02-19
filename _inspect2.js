const { fetchPage, clean } = require("./src/utils");
const cheerio = require("cheerio");

(async () => {
  // 1) Chicago-ROCOR detail page
  console.log("=== CHICAGO-ROCOR DETAIL ===");
  const crUrl = "https://chicagodiocese.org/parishes.html?type=details&id=403";
  console.log("Fetching", crUrl);
  try {
    const html = await fetchPage(crUrl);
    const $ = cheerio.load(html);
    console.log("Body text (first 3000):");
    console.log($("body").text().replace(/\s+/g, " ").substring(0, 3000));
  } catch (e) {
    console.log("Error:", e.message);
  }

  // 2) EA-Diocese detail page
  console.log("\n=== EA-DIOCESE DETAIL ===");
  const eaUrl = "https://eadiocese.org/parishes.html?type=details&id=1";
  console.log("Fetching", eaUrl);
  try {
    const html = await fetchPage(eaUrl);
    const $ = cheerio.load(html);
    console.log("Body text (first 3000):");
    console.log($("body").text().replace(/\s+/g, " ").substring(0, 3000));
  } catch (e) {
    console.log("Error:", e.message);
  }

  // 3) Another OCA detail page - to see city/state parsing
  console.log("\n=== OCA DETAIL (2nd sample) ===");
  const ocaUrl = "https://www.oca.org/parishes/oca-ny-nyjoliet";
  console.log("Fetching", ocaUrl);
  try {
    const html = await fetchPage(ocaUrl);
    const $ = cheerio.load(html);
    // Grab the parish heading area
    const main = $("body").text().replace(/\s+/g, " ");
    // Extract the section between "Parishes /" and "Go List"
    const match = main.match(/Parishes \/ (.+?)Go List/s);
    if (match) console.log("Parish section:", match[1].substring(0, 1500));
    else console.log("Body (first 2000):", main.substring(0, 2000));
  } catch (e) {
    console.log("Error:", e.message);
  }
})().catch((e) => console.error(e.message));
