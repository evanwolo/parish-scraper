const { fetchPage, clean } = require("./src/utils");
const cheerio = require("cheerio");

(async () => {
  try {
    const html = await fetchPage("https://www.oca.org/parishes/oca-ak-ancpvt");
    const ch = cheerio.load(html);

    // Find <h2>Address</h2> followed by <p>
    ch("h2").each((_i, el) => {
      const text = ch(el).text().trim();
      if (/address/i.test(text)) {
        console.log("Found h2:", text);
        const next = ch(el).nextAll("p").first();
        const addrHtml = next.html() || "";
        const lines = addrHtml
          .split(/<br\s*\/?>/gi)
          .map((l) => clean(cheerio.load(l).text()))
          .filter(Boolean);
        console.log("Address lines:", lines);
      }
    });

    // Check for phone in plain <p>
    ch("p").each((_i, el) => {
      const txt = ch(el).text().trim();
      if (/^(Office|Phone|Tel|Fax):/i.test(txt)) {
        console.log("Phone paragraph:", txt);
      }
    });

    // Check a midwest parish
    console.log("\n--- Checking MW parish ---");
    const html2 = await fetchPage("https://www.oca.org/parishes/oca-mw-chiahca");
    const c2 = cheerio.load(html2);
    c2("h2").each((_i, el) => {
      const text = c2(el).text().trim();
      if (/address/i.test(text)) {
        console.log("Found h2:", text);
        const next = c2(el).nextAll("p").first();
        const addrHtml = next.html() || "";
        const lines = addrHtml
          .split(/<br\s*\/?>/gi)
          .map((l) => clean(cheerio.load(l).text()))
          .filter(Boolean);
        console.log("Address lines:", lines);
      }
    });
    c2("p").each((_i, el) => {
      const txt = c2(el).text().trim();
      if (/^(Office|Phone|Tel|Fax):/i.test(txt)) {
        console.log("Phone paragraph:", txt);
      }
    });
  } catch (e) {
    console.error("Error:", e.message);
  }
})();
