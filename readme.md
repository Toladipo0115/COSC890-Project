# UAV Flight Audit Log
**City of Bloomington — Blockchain-Backed Drone Flight Records**

A hand-rolled blockchain system that ingests UAV flight records from Bloomington's open data portal, chains them into a cryptographically signed, tamper-evident ledger, and exposes a browser UI + REST API for auditing and verification.

No blockchain frameworks. Pure Node.js, Ed25519, SHA-256, Merkle trees, PoW.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js v20+ (ESM) |
| Crypto | `@noble/hashes`, `@noble/curves` |
| API | Express |
| Data | `fast-xml-parser`, `axios` |
| P2P | WebSockets (`ws`) |
| Tests | Jest (46 tests) |

---

## Quick Start

### 1. Install
```bash
npm install
```

### 2. Generate keypairs
```bash
npm run keygen
```
Paste the output into a `.env` file (see `.env.example`).

### 3. Ingest dataset
```bash
npm run ingest
```
Downloads the Bloomington UAV flight dataset, normalizes all records into canonical transactions, signs them with `CityIssuer`, mines them into blocks, and persists the chain to `data/raw/chain.json`.

### 4. Start server
```bash
npm start
# → http://localhost:3000
```

### 5. Run tests
```bash
npm test
# 46 tests, 0 failures
```

---

## Folder Structure

```
/
├── data/raw/               # Cached snapshots + chain.json + manifest.json
├── docs/                   # data_dictionary.md, key_management.md, network.md
├── keys/                   # gitignored — public-keys.json only
├── scripts/
│   ├── ingest.js           # Download → normalize → sign → mine
│   └── keygen.js           # Generate CityIssuer + Auditor keypairs
├── src/
│   ├── chain/
│   │   ├── block.js        # Block structure + hash computation
│   │   ├── blockchain.js   # Chain management + validation + dynamic difficulty
│   │   ├── chainStore.js   # Singleton chain instance + loader
│   │   └── miner.js        # Proof-of-Work miner
│   ├── crypto/
│   │   ├── hash.js         # SHA-256 wrapper
│   │   ├── merkle.js       # Merkle tree, proof gen + verify
│   │   └── sign.js         # Ed25519 keygen, sign, verify
│   ├── tx/
│   │   ├── normalize.js    # Canonical schema + canonicalization
│   │   └── txPool.js       # In-memory transaction pool
│   └── p2p/
│       ├── node.js         # WebSocket P2P node
│       └── simulate-fork.js# Fork creation + resolution demo
├── public/
│   └── index.html          # Dataset Explorer, Block Explorer, Verify Flight
├── tests/                  # Jest test suites
├── server.js               # Express API server
└── .env.example
```

---

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/chain` | All block headers |
| GET | `/block/:hash` | Block + full tx list |
| GET | `/tx/:txHash` | Single transaction |
| GET | `/proof/:txHash` | Merkle inclusion proof |
| POST | `/verify` | `{ txHash }` → `{ valid, reason }` |

Unknown hashes return `404 { error: "not found" }`.

---

## UI

Three pages served at `http://localhost:3000`:

**Dataset Explorer** — Filter flights by location, drone model, date range. Click any row to jump to Verify.

**Block Explorer** — Block list with full header details, Merkle root, and tx hash list. Click any hash to jump to Verify.

**Verify Flight** — Paste a `txHash` → **PASS ✅** or **FAIL ❌** with Merkle proof path, signature status, and block metadata.

---

## How It Works

### Canonicalization
Every transaction is serialized to a canonical JSON string before hashing:
- Keys sorted lexicographically (recursive)
- No whitespace
- Null fields included, never omitted
- Timestamps normalized to ISO 8601 UTC

`txHash = SHA-256(canonicalJsonString)`

This guarantees that the same logical record always produces the same hash — regardless of when or where it's ingested.

### Block Hash
```
blockHash = SHA-256(index + timestamp + prevHash + nonce + difficulty + merkleRoot + txCount)
```
Fields cast to string, concatenated in this exact order, no separator.

### Signing
All transactions are signed by `CityIssuer` using Ed25519:
```
signature = Ed25519.sign(privateKey, txHash)
```
`validateChain()` rejects any transaction with a missing, invalid, or tampered signature.

### Proof of Work
Miner increments `nonce` until `blockHash` starts with `difficulty` leading hex zeros.

### Dynamic Difficulty
Difficulty retargets every `RETARGET_INTERVAL` blocks (default: 10) toward `TARGET_BLOCK_TIME_MS` (default: 10000ms):
- Blocks mined too fast (ratio < 0.5) → difficulty + 1
- Blocks mined too slow (ratio > 2.0) → difficulty - 1 (min 1)
- Within range → hold

Genesis block is excluded from the retarget window.

---

## P2P Multi-Node

### Run 3 nodes
```bash
# Terminal 1
npm run dev:node -- --port 3001 --peers ws://localhost:3002,ws://localhost:3003

# Terminal 2
npm run dev:node -- --port 3002 --peers ws://localhost:3001,ws://localhost:3003

# Terminal 3
npm run dev:node -- --port 3003 --peers ws://localhost:3001,ws://localhost:3002
```

Check sync status:
```bash
curl http://localhost:3001/status
curl http://localhost:3002/status
curl http://localhost:3003/status
```

Run on 3 seperate servers
```bash
# Terminal 1
PORT=3001 npm start

# Terminal 2
PORT=3002 npm start

# Terminal 3
PORT=3003 npm start
```


### Fork simulation
```bash
npm run simulate:fork
```
Demonstrates full fork lifecycle: sync → partition → independent mining → chain length advantage → partition heals → longest chain wins.

---

## Configuration

```env
CITY_ISSUER_PRIVATE_KEY=   # Ed25519 private key hex (from npm run keygen)
CITY_ISSUER_PUBLIC_KEY=    # Ed25519 public key hex
AUDITOR_PRIVATE_KEY=       # Reserved for audit countersigning
AUDITOR_PUBLIC_KEY=
PORT=3000                  # API server port
DIFFICULTY=3               # Initial PoW difficulty (leading hex zeros)
BATCH_SIZE=10              # Transactions per block
RETARGET_INTERVAL=10       # Blocks between difficulty retargets
TARGET_BLOCK_TIME_MS=10000 # Target ms per block
```

---

## Security Notes

- Private keys are never written to disk by `keygen.js` — paste manually into `.env`
- `.env` and `keys/` are gitignored
- `keys/public-keys.json` (public keys only) is safe to commit
- Rotate keys: re-run `npm run keygen`, update `.env`, re-run `npm run ingest`

See `docs/key_management.md` for full details.

---

## Dataset

**Source**: City of Bloomington Open Data Portal
`https://data.bloomington.in.gov/api/views/3a7f-6kb4`

**Snapshot**: July 24, 2024

Supports XML (default), CSV, and JSON:
```bash
npm run ingest -- --format csv
npm run ingest -- --format json
```

Ingest is idempotent — re-running with the same date's cache skips the download and produces identical `txHash` values (NFR-01).

See `docs/data_dictionary.md` for full schema and canonicalization rules.

---

## License

City of Bloomington internal use.
