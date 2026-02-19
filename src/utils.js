const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");

/** Shared HTTP client with sensible defaults */
const http = axios.create({
  timeout: 30_000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
  },
});

/**
 * Fetch a URL and return the response body as a string.
 * Retries up to `retries` times on failure with exponential back-off.
 */
async function fetchPage(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data } = await http.get(url);
      return typeof data === "string" ? data : JSON.stringify(data);
    } catch (err) {
      console.error(
        `  [attempt ${attempt}/${retries}] Failed to fetch ${url}: ${err.message}`
      );
      if (attempt === retries) throw err;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
}

/**
 * Fetch a URL and return a parsed JSON object.
 */
async function fetchJSON(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data } = await http.get(url, {
        headers: { Accept: "application/json" },
      });
      return typeof data === "string" ? JSON.parse(data) : data;
    } catch (err) {
      console.error(
        `  [attempt ${attempt}/${retries}] Failed to fetch JSON ${url}: ${err.message}`
      );
      if (attempt === retries) throw err;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Normalise whitespace in a scraped string.
 */
function clean(str) {
  if (!str) return "";
  return str.replace(/\s+/g, " ").trim();
}

/**
 * Write an array of parish objects to a CSV file inside `output/`.
 * Returns the absolute path of the written file.
 */
async function writeCSV(filename, records, columns) {
  const outDir = path.resolve(__dirname, "..", "output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const filePath = path.join(outDir, filename);
  const writer = createObjectCsvWriter({
    path: filePath,
    header: columns.map((c) => ({ id: c, title: c })),
  });
  await writer.writeRecords(records);
  return filePath;
}

/**
 * Write an array of parish objects to a JSON file inside `output/`.
 */
function writeJSON(filename, records) {
  const outDir = path.resolve(__dirname, "..", "output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), "utf-8");
  return filePath;
}

module.exports = { fetchPage, fetchJSON, sleep, clean, writeCSV, writeJSON, http };
