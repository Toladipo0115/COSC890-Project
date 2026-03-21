/**
 * normalize.js — Canonical transaction schema + canonicalization
 *
 * Canonicalization rules (NFR-01, FR-A09 through FR-A12):
 *   1. JSON keys sorted lexicographically, recursive
 *   2. No whitespace (JSON.stringify with no indent)
 *   3. Null fields included — never omitted
 *   4. Strings trimmed, internal whitespace collapsed
 *   5. Timestamps normalized to ISO 8601 UTC
 *   6. txHash = SHA-256(canonicalJsonString)
 */
import { hashString } from '../crypto/hash.js';

/**
 * Collapse internal whitespace + trim a string.
 * @param {string|any} val
 * @returns {string|null}
 */
function cleanString(val) {
  if (val === undefined || val === null || val === '') return null;
  return String(val).trim().replace(/\s+/g, ' ');
}

/**
 * Normalize a timestamp to ISO 8601 UTC.
 * Returns null if unparseable.
 * @param {string|any} val
 * @returns {string|null}
 */
function normalizeTimestamp(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Recursively sort object keys lexicographically.
 * Arrays are preserved with their elements also sorted if objects.
 * @param {any} obj
 * @returns {any}
 */
export function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(obj[key]);
        return acc;
      }, {});
  }
  return obj;
}

/**
 * Produce canonical JSON string from an object.
 * Sorted keys, no whitespace, nulls included.
 * @param {object} obj
 * @returns {string}
 */
export function canonicalize(obj) {
  return JSON.stringify(sortKeysDeep(obj));
}

/**
 * Map a raw dataset row to the canonical transaction schema.
 * All fields explicitly present; missing → null (FR-A05).
 *
 * @param {object} raw   — parsed row from XML/CSV/JSON
 * @param {number} index — row index for fallback flight_id
 * @param {string} snapshotHash — SHA-256 of the raw snapshot file
 * @param {string} sourceUrl   — dataset source URL
 * @returns {{ tx: object, canonical: string, txHash: string }}
 */
export function normalizeRow(raw, index, snapshotHash, sourceUrl) {
  const tx = {
    authorized_use:               cleanString(raw.authorized_use ?? raw['Authorized Use'] ?? raw.authorizedUse),
    department:                   cleanString(raw.department ?? raw.Department),
    drone_make_model:             cleanString(raw.drone_make_model ?? raw['Drone Make/Model'] ?? raw.droneMakeModel),
    faa_drone_reg:                cleanString(raw.faa_drone_reg ?? raw['FAA Drone Reg #'] ?? raw.faaDroneReg),
    flight_id:                    cleanString(raw._id ?? raw.flight_id ?? raw.flightId) ?? `row_${index}`,
    location_area_surveyed:       cleanString(raw.location_area_surveyed ?? raw['Location/Area Surveyed'] ?? raw.locationAreaSurveyed),
    pilot_certificate:            cleanString(raw.pilot_certificate ?? raw['Pilot Certificate #'] ?? raw.pilotCertificate),
    snapshot_hash:                snapshotHash ?? null,
    source_url:                   sourceUrl ?? null,
    street_address_area_surveyed: cleanString(raw.street_address_area_surveyed ?? raw['Street Address/Area Surveyed'] ?? raw.streetAddressAreaSurveyed),
    timestamp:                    normalizeTimestamp(raw.timestamp ?? raw.Timestamp ?? raw.date ?? raw.Date ?? raw.flight_date),
  };

  const canonical = canonicalize(tx);
  const txHash = hashString(canonical);

  return { tx, canonical, txHash };
}