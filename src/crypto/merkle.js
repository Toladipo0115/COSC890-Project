/**
 * merkle.js — Binary Merkle tree
 * - Pairwise SHA-256
 * - Odd leaf count: duplicate last leaf
 * - getMerkleProof()   → [{ hash, direction: 'left'|'right' }, ...]
 * - verifyMerkleProof() → true | false
 */
import { hashPair } from './hash.js';

/** Build full tree as array-of-levels, bottom up. */
function buildTree(leaves) {
  if (leaves.length === 0) throw new Error('Cannot build Merkle tree with 0 leaves');
  const levels = [leaves.slice()];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = i + 1 < prev.length ? prev[i + 1] : prev[i]; // duplicate last if odd
      next.push(hashPair(left, right));
    }
    levels.push(next);
  }
  return levels;
}

/** Compute Merkle root from array of txHash strings. */
export function getMerkleRoot(txHashes) {
  if (txHashes.length === 0) return '0'.repeat(64);
  const levels = buildTree(txHashes);
  return levels[levels.length - 1][0];
}

/**
 * Generate inclusion proof for a txHash.
 * @returns {Array<{hash: string, direction: 'left'|'right'}>}
 */
export function getMerkleProof(txHashes, txHash) {
  const leaves = txHashes.slice();
  let idx = leaves.findIndex(h => h === txHash);
  if (idx === -1) throw new Error(`txHash not found in leaf set`);

  const levels = buildTree(leaves);
  const proof = [];

  for (let level = 0; level < levels.length - 1; level++) {
    const row = levels[level];
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    // If no sibling (odd node), duplicate self
    const sibling = siblingIdx < row.length ? row[siblingIdx] : row[idx];
    proof.push({ hash: sibling, direction: isRight ? 'left' : 'right' });
    idx = Math.floor(idx / 2);
  }

  return proof;
}

/**
 * Verify a Merkle proof.
 * @param {string} txHash
 * @param {Array<{hash, direction}>} proof
 * @param {string} merkleRoot
 * @returns {boolean}
 */
export function verifyMerkleProof(txHash, proof, merkleRoot) {
  let current = txHash;
  for (const { hash, direction } of proof) {
    if (direction === 'left') {
      current = hashPair(hash, current);
    } else {
      current = hashPair(current, hash);
    }
  }
  return current === merkleRoot;
}