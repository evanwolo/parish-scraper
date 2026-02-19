/**
 * Geocoding utility using OpenStreetMap Nominatim (free, no API key).
 *
 * Rate-limited to 1 request/second per Nominatim usage policy.
 * Used to fill missing lat/lng for records that have an address.
 *
 * Exported:
 *   geocodeRecord(record) → record with lat/lng filled if possible
 *   geocodeBatch(records, opts) → records with lat/lng filled
 */

const { http, sleep } = require("./utils");

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "OrthoCalendar-ParishScraper/1.0 (parish directory project)";

/**
 * Geocode a single address string → { lat, lng } or null.
 */
async function geocodeAddress(address, city, state, country) {
  // Build a structured query for better results
  const parts = [];
  if (address) parts.push(address);
  if (city) parts.push(city);
  if (state) parts.push(state);
  if (country) parts.push(country);
  const q = parts.join(", ");
  if (!q) return null;

  try {
    const { data } = await http.get(NOMINATIM_URL, {
      params: {
        q,
        format: "json",
        limit: 1,
        addressdetails: 0,
      },
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      timeout: 10000,
    });

    if (Array.isArray(data) && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }
  } catch {
    // Silently fail — geocoding is best-effort
  }
  return null;
}

/**
 * Fill lat/lng on a single record if missing.
 * Returns the (possibly enriched) record.
 */
async function geocodeRecord(record) {
  if (record.lat && record.lng) return record; // already has coords
  if (!record.address && !record.city) return record; // nothing to geocode

  const result = await geocodeAddress(
    record.address, record.city, record.state, record.country || "USA"
  );
  if (result) {
    record.lat = result.lat;
    record.lng = result.lng;
  }
  return record;
}

/**
 * Geocode a batch of records, filling missing lat/lng.
 * Respects Nominatim's 1 req/sec rate limit.
 *
 * @param {Array} records
 * @param {Object} [opts]
 * @param {string} [opts.label] - label for progress logging
 * @param {number} [opts.delayMs=1100] - delay between requests (ms)
 * @returns {Promise<Array>} records with lat/lng filled where possible
 */
async function geocodeBatch(records, opts = {}) {
  const label = opts.label || "geocode";
  const delayMs = opts.delayMs || 1100; // >1s to respect Nominatim policy
  const needGeocode = records.filter((r) => !r.lat && !r.lng && (r.address || r.city));
  if (needGeocode.length === 0) return records;

  console.log(`[${label}] Geocoding ${needGeocode.length} records …`);
  let success = 0;

  for (let i = 0; i < needGeocode.length; i++) {
    const r = needGeocode[i];
    if ((i + 1) % 20 === 0) {
      console.log(`[${label}]   … ${i + 1}/${needGeocode.length} (${success} succeeded)`);
    }
    await geocodeRecord(r);
    if (r.lat && r.lng) success++;
    await sleep(delayMs);
  }

  console.log(`[${label}] Geocoded ${success}/${needGeocode.length} records.`);
  return records;
}

module.exports = { geocodeAddress, geocodeRecord, geocodeBatch };
