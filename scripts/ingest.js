/**
 * ingest.js — Download + normalize + chain UAV flight dataset
 *
 * Usage:
 *   npm run ingest
 *   npm run ingest -- --format csv
 *   npm run ingest -- --format json
 */
import axios from 'axios';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { normalizeRow } from '../src/tx/normalize.js';
import { loadIntoChain } from '../src/chain/chainStore.js';
import 'dotenv/config';

const BASE_URL = 'https://data.bloomington.in.gov/api/views/3a7f-6kb4/rows';
const DATA_DIR  = join(process.cwd(), 'data', 'raw');
const MANIFEST  = join(DATA_DIR, 'manifest.json');

const FORMATS = {
  xml:  { ext: 'xml',  url: `${BASE_URL}.xml?accessType=DOWNLOAD` },
  csv:  { ext: 'csv',  url: `${BASE_URL}.csv?accessType=DOWNLOAD` },
  json: { ext: 'json', url: `${BASE_URL}.json?accessType=DOWNLOAD` },
};

const fmtArg = process.argv.indexOf('--format');
const format  = fmtArg !== -1 ? process.argv[fmtArg + 1] : 'xml';

if (!FORMATS[format]) {
  console.error(`Unknown format "${format}". Use xml, csv, or json.`);
  process.exit(1);
}

const PRIVATE_KEY = process.env.CITY_ISSUER_PRIVATE_KEY;
const PUBLIC_KEY  = process.env.CITY_ISSUER_PUBLIC_KEY;

if (!PRIVATE_KEY || !PUBLIC_KEY) {
  console.error('❌  CITY_ISSUER_PRIVATE_KEY and CITY_ISSUER_PUBLIC_KEY must be set in .env');
  console.error('    Run: npm run keygen — then paste keys into .env');
  process.exit(1);
}

mkdirSync(DATA_DIR, { recursive: true });

const dateStamp = new Date().toISOString().slice(0, 10);
const filename  = `uav_flights_${dateStamp}.${FORMATS[format].ext}`;
const filepath  = join(DATA_DIR, filename);

// FR-A03: Skip re-download if today's cache exists
if (existsSync(filepath)) {
  console.log(`Cache hit: ${filename} — skipping download.`);
} else {
  console.log(`Downloading ${format.toUpperCase()}...`);
  const res = await axios.get(FORMATS[format].url, { responseType: 'text' });
  writeFileSync(filepath, res.data, 'utf8');
  console.log(`Saved: ${filename}`);
}

// FR-A04: SHA-256 of raw snapshot
const raw          = readFileSync(filepath, 'utf8');
const snapshotHash = createHash('sha256').update(raw).digest('hex');
console.log(`Snapshot SHA-256: ${snapshotHash}`);

// Update manifest
let manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
manifest[filename] = { snapshotHash, cachedAt: new Date().toISOString(), format };
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

// Parse rows
let rows = [];
if (format === 'xml') {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const parsed  = parser.parse(raw);
  const rowContainer = parsed?.response?.row?.row ?? parsed?.rows?.row ?? [];
  rows = Array.isArray(rowContainer) ? rowContainer : [rowContainer];
} else if (format === 'json') {
  const parsed = JSON.parse(raw);
  rows = Array.isArray(parsed) ? parsed : parsed?.data ?? [];
} else if (format === 'csv') {
  const lines   = raw.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i]]));
  });
}

console.log(`Parsed ${rows.length} rows.`);

const normalized = rows.map((row, i) =>
  normalizeRow(row, i, snapshotHash, FORMATS[format].url)
);

// Write normalized cache
const normalizedPath = join(DATA_DIR, `normalized_${dateStamp}.json`);
writeFileSync(normalizedPath, JSON.stringify(normalized, null, 2));
console.log(`Normalized ${normalized.length} transactions.`);

// Build chain
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? '10', 10);
await loadIntoChain(normalized, PRIVATE_KEY, PUBLIC_KEY, BATCH_SIZE);

// Persist chain to disk for server to load
const chainPath = join(DATA_DIR, 'chain.json');
import { chain } from '../src/chain/chainStore.js';
const chainData = {
  blocks: chain.blocks,
  txIndex: Array.from(chain.txIndex.entries()),
  cityIssuerPublicKey: PUBLIC_KEY,
  builtAt: new Date().toISOString(),
};
writeFileSync(chainPath, JSON.stringify(chainData));
console.log(`\n✅ Chain persisted → data/raw/chain.json`);
console.log(`   Blocks: ${chain.blocks.length} | Txs: ${chain.txIndex.size}`);