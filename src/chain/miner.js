/**
 * miner.js — Proof-of-Work miner
 *
 * Increments nonce until blockHash has `difficulty` leading hex zeros (FR-B06, FR-B07).
 * Difficulty 3 recommended for demo.
 */
import { computeBlockHash } from './block.js';
import { getMerkleRoot } from '../crypto/merkle.js';

/**
 * Mine a block: find a nonce satisfying PoW.
 * @param {object} blockTemplate — all fields except nonce + blockHash
 * @returns {object} mined block with valid nonce + blockHash
 */
export function mineBlock(blockTemplate) {
  const prefix = '0'.repeat(blockTemplate.difficulty);
  let nonce = 0;
  let blockHash;

  do {
    blockHash = computeBlockHash({ ...blockTemplate, nonce });
    nonce++;
  } while (!blockHash.startsWith(prefix));

  return { ...blockTemplate, nonce: nonce - 1, blockHash };
}

/**
 * Build + mine a full block from a batch of txs.
 * @param {number} index
 * @param {string} prevHash
 * @param {Array<{txHash: string, tx: object}>} batch
 * @param {number} difficulty
 * @returns {object} mined block
 */
export function buildAndMineBlock(index, prevHash, batch, difficulty = 3) {
  const timestamp = new Date().toISOString();
  const txHashes = batch.map(b => b.txHash);
  const merkleRoot = getMerkleRoot(txHashes);
  const txCount = batch.length;

  const template = { index, timestamp, prevHash, difficulty, merkleRoot, txCount };
  const mined = mineBlock(template);

  return { ...mined, txHashes };
}