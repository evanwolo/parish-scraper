const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");

const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS) || 30_000;
const DEFAULT_RETRIES = Number(process.env.HTTP_RETRIES) || 3;
const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
  `(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`;

/** Shared HTTP client with sensible defaults */
const http = axios.create({
  timeout: HTTP_TIMEOUT_MS,
  headers: {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
  },
});

function classifyHttpError(err) {
  const status = err?.response?.status;
  if (status) {
    if (status === 429) return { type: "rate_limit", status };
    if (status >= 500) return { type: "server", status };
    if (status >= 400) return { type: "client", status };
  }
  const code = err?.code;
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") {
    return { type: "timeout", code };
  }
  if (code) return { type: "network", code };
  return { type: "unknown" };
}

async function fetchWithRetry(url, options, retries) {
  const attempts = retries ?? DEFAULT_RETRIES;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const { data } = await http.get(url, options);
      return data;
    } catch (err) {
      const info = classifyHttpError(err);
      const tag = info.status ? `status=${info.status}` : info.code ? `code=${info.code}` : "";
      console.error(
        `  [attempt ${attempt}/${attempts}] Failed to fetch ${url}: ${err.message} ${tag} (${info.type})`
      );
      if (attempt === attempts) throw err;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
}

/**
 * Fetch a URL and return the response body as a string.
 * Retries up to `retries` times on failure with exponential back-off.
 */
async function fetchPage(url, retries = DEFAULT_RETRIES) {
  const data = await fetchWithRetry(url, { responseType: "text" }, retries);
  return typeof data === "string" ? data : String(data);
}

/**
 * Fetch a URL and return a parsed JSON object.
 */
async function fetchJSON(url, retries = DEFAULT_RETRIES) {
  const data = await fetchWithRetry(
    url,
    { headers: { Accept: "application/json" } },
    retries
  );
  return typeof data === "string" ? JSON.parse(data) : data;
}

/**
 * Pause execution for the specified number of milliseconds.
 *
 * @param {number} ms - The delay in milliseconds before the Promise resolves.
 * @returns {Promise<void>} A Promise that resolves after the given delay.
 */
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

module.exports = { fetchPage, fetchJSON, fetchWithRetry, sleep, clean, writeCSV, writeJSON, http };
