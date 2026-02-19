const { fetchPage, clean } = require("./src/utils");
const cheerio = require("cheerio");

(async () => {
  // OCA detail: find the content block HTML
  console.log("=== OCA DETAIL HTML ===");
  const html1 = await fetchPage("https://www.oca.org/parishes/oca-ak-adasic");
  const $1 = cheerio.load(html1);
  // Look for the main article / content div around the parish info
  const selectors1 = ["article", "#main-content", ".content", ".entry-content", "#content", "main"];
  for (const s of selectors1) {
    if ($1(s).length) {
      console.log("Found with selector:", s);
      console.log($1(s).html().substring(0, 4000));
      break;
    }
  }
  // Check for address class
  console.log("\n=== OCA .address ===");
  $1(".address").each(function () {
    console.log("address HTML:", $1(this).html());
  });

  console.log("\n\n=== CHICAGO DETAIL HTML ===");
  const html2 = await fetchPage("https://chicagodiocese.org/parishes.html?type=details&id=403");
  const $2 = cheerio.load(html2);
  // Find the main content block
  const selectors2 = [".SM_detail_container", ".parish-detail", ".content-area", "#content", "article", "main"];
  for (const s of selectors2) {
    if ($2(s).length) {
      console.log("Found with selector:", s);
      console.log($2(s).html().substring(0, 3000));
      break;
    }
  }
  // Try broader approach - find element containing "Mailing Address"
  console.log("\n=== Elements containing 'Mailing Address' ===");
  $2("*").each(function () {
    const t = $2(this).text().trim();
    if (t.includes("Mailing Address") && t.length < 1000) {
      console.log(this.tagName, $2(this).attr("class") || "", ":", $2(this).html().substring(0, 800));
      return false;
    }
  });

  console.log("\n\n=== EA-DIOCESE DETAIL HTML ===");
  const html3 = await fetchPage("https://eadiocese.org/parishes.html?type=details&id=1");
  const $3 = cheerio.load(html3);
  // Same approach
  $3("*").each(function () {
    const t = $3(this).text().trim();
    if (t.includes("Mailing Address") && t.length < 1000 && !["html", "body", "head"].includes(this.tagName)) {
      console.log(this.tagName, $3(this).attr("class") || "", ":");
      console.log($3(this).html().substring(0, 800));
      return false;
    }
  });
})().catch(console.error);
