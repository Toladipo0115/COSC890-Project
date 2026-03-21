/**
 * block.js — Block structure + hash computation
 *
 * blockHash = SHA-256(index + timestamp + prevHash + nonce + difficulty + merkleRoot + txCount)
 * Exact concatenation order documented here and must never change (NFR-01).
 */
import { hashString } from '../crypto/hash.js';
import { getMerkleRoot } from '../crypto/merkle.js';

/**
 * Compute blockHash from header fields.
 * Concatenation order: index|timestamp|prevHash|nonce|difficulty|merkleRoot|txCount
 * @returns {string} 64-char hex
 */
export function computeBlockHash({ index, timestamp, prevHash, nonce, difficulty, merkleRoot, txCount }) {
  const raw = `${index}${timestamp}${prevHash}${nonce}${difficulty}${merkleRoot}${txCount}`;
  return hashString(raw);
}

/**
 * Create a new block object (unmined — nonce=0).
 * @param {number} index
 * @param {string} prevHash
 * @param {Array<{txHash: string, tx: object}>} batch
 * @param {number} difficulty
 * @returns {object} block
 */
export function createBlock(index, prevHash, batch, difficulty = 3) {
  const timestamp = new Date().toISOString();
  const txHashes = batch.map(b => b.txHash);
  const merkleRoot = getMerkleRoot(txHashes);
  const txCount = batch.length;

  const blockHash = computeBlockHash({ index, timestamp, prevHash, nonce: 0, difficulty, merkleRoot, txCount });

  return {
    index,
    timestamp,
    prevHash,
    nonce: 0,
    difficulty,
    merkleRoot,
    txCount,
    blockHash,
    // txHashes stored on block for lookup — not part of blockHash computation
    txHashes,
  };
}

/**
 * Create the genesis block (FR-B15).
 * index: 0, prevHash: "0".repeat(64), no flight txs.
 */
export function createGenesisBlock(difficulty = 3) {
  const index = 0;
  const timestamp = '2024-07-24T00:00:00.000Z'; // fixed for reproducibility (NFR-01)
  const prevHash = '0'.repeat(64);
  const merkleRoot = '0'.repeat(64);
  const txCount = 0;
  const txHashes = [];

  let nonce = 0;
  let blockHash;
  const prefix = '0'.repeat(difficulty);

  do {
    blockHash = computeBlockHash({ index, timestamp, prevHash, nonce, difficulty, merkleRoot, txCount });
    nonce++;
  } while (!blockHash.startsWith(prefix));

  return { index, timestamp, prevHash, nonce: nonce - 1, difficulty, merkleRoot, txCount, blockHash, txHashes };
}

/**
 * Validate a block's hash is correctly computed and satisfies PoW.
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateBlock(block) {
  const expected = computeBlockHash(block);
  if (expected !== block.blockHash) {
    return { valid: false, error: `blockHash mismatch: expected ${expected}, got ${block.blockHash}` };
  }
  const prefix = '0'.repeat(block.difficulty);
  if (!block.blockHash.startsWith(prefix)) {
    return { valid: false, error: `PoW failed: blockHash does not start with ${prefix}` };
  }
  return { valid: true, error: null };
}