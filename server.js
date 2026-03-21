/**
 * server.js — UAV Flight Audit API
 *
 * Endpoints:
 *   GET  /chain          — block headers
 *   GET  /block/:hash    — block + tx list
 *   GET  /tx/:txHash     — single tx
 *   GET  /proof/:txHash  — Merkle proof
 *   POST /verify         — { txHash } → { valid, reason }
 */
import express from 'express';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Blockchain } from './src/chain/blockchain.js';
import { verifyMerkleProof } from './src/crypto/merkle.js';
import { verify } from './src/crypto/sign.js';
import { normalizeRow, canonicalize } from './src/tx/normalize.js';
import { hashString } from './src/crypto/hash.js';
import 'dotenv/config';

const app  = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());
app.use(express.static('public'));

// ── Load persisted chain ──────────────────────────────────────────────────────
const CHAIN_PATH = join(process.cwd(), 'data', 'raw', 'chain.json');

let chain;

if (existsSync(CHAIN_PATH)) {
  console.log('Loading chain from disk...');
  const data = JSON.parse(readFileSync(CHAIN_PATH, 'utf8'));
  chain = new Blockchain(
    parseInt(process.env.DIFFICULTY ?? '3', 10),
    data.cityIssuerPublicKey
  );
  chain.blocks  = data.blocks;
  chain.txIndex = new Map(data.txIndex);
  console.log(`✅ Chain loaded: ${chain.blocks.length} blocks, ${chain.txIndex.size} txs`);
} else {
  console.warn('⚠️  No chain.json found. Run: npm run ingest');
  chain = new Blockchain(parseInt(process.env.DIFFICULTY ?? '3', 10), null);
}

// ── Routes ───────────────────────────────────────────────────────────────────

/** GET /chain — all block headers (no txHashes array to keep payload small) */
app.get('/chain', (req, res) => {
  const headers = chain.blocks.map(({ txHashes, ...header }) => ({
    ...header,
    txCount: header.txCount,
  }));
  res.json(headers);
});

/** GET /block/:hash — full block + tx objects */
app.get('/block/:hash', (req, res) => {
  const block = chain.getBlockByHash(req.params.hash);
  if (!block) return res.status(404).json({ error: 'Block not found' });

  const txs = block.txHashes.map(txHash => {
    const entry = chain.getTx(txHash);
    return { txHash, ...(entry?.tx ?? {}) };
  });

  res.json({ ...block, txs });
});

/** GET /tx/:txHash — single transaction */
app.get('/tx/:txHash', (req, res) => {
  const entry = chain.getTx(req.params.txHash);
  if (!entry) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ txHash: req.params.txHash, ...entry });
});

/** GET /proof/:txHash — Merkle inclusion proof */
app.get('/proof/:txHash', (req, res) => {
  const proof = chain.getMerkleProof(req.params.txHash);
  if (!proof) return res.status(404).json({ error: 'Transaction not found' });
  res.json(proof);
});

/**
 * POST /verify — verify a tx is on-chain, unmodified, and correctly signed
 * Body: { txHash: string }
 * Returns: { valid: bool, reason: string }
 */
app.post('/verify', (req, res) => {
  const { txHash } = req.body;

  if (!txHash) {
    return res.status(400).json({ valid: false, reason: 'txHash is required' });
  }

  // 1. Tx exists on chain
  const entry = chain.getTx(txHash);
  if (!entry) {
    return res.json({ valid: false, reason: 'Transaction not found on chain' });
  }

  const { tx, blockIndex, blockHash } = entry;
  const block = chain.blocks[blockIndex];

  // 2. Recompute txHash from content
  const { signature, issuerPublicKey, ...coreTx } = tx;
  const recomputed = hashString(canonicalize(coreTx));
  if (recomputed !== txHash) {
    return res.json({ valid: false, reason: 'Transaction content has been tampered' });
  }

  // 3. Signature valid
  if (!signature || !issuerPublicKey) {
    return res.json({ valid: false, reason: 'Transaction is missing signature or public key' });
  }
  const sigOk = verify(issuerPublicKey, txHash, signature);
  if (!sigOk) {
    return res.json({ valid: false, reason: 'Signature verification failed' });
  }

  // 4. Merkle proof
  const proofData = chain.getMerkleProof(txHash);
  if (!proofData) {
    return res.json({ valid: false, reason: 'Could not generate Merkle proof' });
  }
  const merkleOk = verifyMerkleProof(txHash, proofData.proof, proofData.merkleRoot);
  if (!merkleOk) {
    return res.json({ valid: false, reason: 'Merkle proof verification failed' });
  }

  res.json({
    valid: true,
    reason: 'Transaction verified: on-chain, unmodified, signature valid, Merkle proof confirmed',
    blockIndex,
    blockHash,
    merkleRoot: proofData.merkleRoot,
    proof: proofData.proof,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚁 UAV Audit API running → http://localhost:${PORT}`);
  console.log(`   GET  /chain`);
  console.log(`   GET  /block/:hash`);
  console.log(`   GET  /tx/:txHash`);
  console.log(`   GET  /proof/:txHash`);
  console.log(`   POST /verify`);
});

export { app, chain };