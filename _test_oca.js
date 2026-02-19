const m = require("./src/scrapers/oca");
m.run()
  .then((d) => {
    console.log("=== OCA RESULT ===");
    console.log("Records:", d.length);
    console.log("Has address:", d.filter((r) => r.address).length);
    console.log("Has phone:", d.filter((r) => r.phone).length);
    console.log("Has lat:", d.filter((r) => r.lat).length);
    console.log("Has clergy:", d.filter((r) => r.clergy).length);
    console.log("Has city:", d.filter((r) => r.city).length);
  })
  .catch((e) => {
    console.error("=== OCA ERROR ===");
    console.error(e.message);
  });
