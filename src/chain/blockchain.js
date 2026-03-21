/**
 * blockchain.js — Chain management + validation
 *
 * validateChain() checks (FR-B09–B13):
 *   1. prevHash links are correct
 *   2. PoW satisfied on every block
 *   3. Merkle root recomputed from stored txHashes matches
 *   4. All tx signatures valid (CityIssuer)
 */
import {
  computeBlockHash,
  createGenesisBlock,
  validateBlock,
} from "./block.js";
import { buildAndMineBlock } from "./miner.js";
import {
  getMerkleRoot,
  getMerkleProof,
  verifyMerkleProof,
} from "../crypto/merkle.js";
import { verify } from "../crypto/sign.js";
import { canonicalize } from "../tx/normalize.js";
import { hashString } from "../crypto/hash.js";

export class Blockchain {
  /**
   * @param {number} difficulty
   * @param {string} cityIssuerPublicKey — hex; used to validate tx signatures
   */
  constructor(difficulty = 3, cityIssuerPublicKey = null) {
    this.difficulty = difficulty;
    this.cityIssuerPublicKey = cityIssuerPublicKey;
    /** @type {object[]} */
    this.blocks = [];
    /** @type {Map<string, { tx: object, blockIndex: number, blockHash: string }>} */
    this.txIndex = new Map();

    // Init genesis
    this.blocks.push(createGenesisBlock(difficulty));
  }

  get latestBlock() {
    return this.blocks[this.blocks.length - 1];
  }

  /**
   * Mine a batch of signed txs into a new block.
   * @param {Array<{txHash: string, tx: object}>} batch
   * @returns {object} the newly added block
   */
  addBlock(batch) {
    const index = this.blocks.length;
    const prevHash = this.latestBlock.blockHash;
    const difficulty = this.getNextDifficulty();
    const block = buildAndMineBlock(index, prevHash, batch, difficulty);
    this.blocks.push(block);

    for (const { txHash, tx } of batch) {
      this.txIndex.set(txHash, {
        tx,
        blockIndex: block.index,
        blockHash: block.blockHash,
      });
    }

    return block;
  }

  /**
   * Compute difficulty for the next block.
   * Retargets every `retargetInterval` blocks toward `targetBlockTimeMs`.
   *
   * - ratio < 0.5  → blocks mined too fast  → difficulty + 1
   * - ratio > 2.0  → blocks mined too slow  → difficulty - 1 (min 1)
   * - otherwise    → hold current difficulty
   *
   * @param {number} retargetInterval   — how many blocks per retarget window
   * @param {number} targetBlockTimeMs  — target ms between blocks
   * @returns {number} difficulty for next block
   */
  getNextDifficulty(
    retargetInterval = parseInt(process.env.RETARGET_INTERVAL ?? "10", 10),
    targetBlockTimeMs = parseInt(
      process.env.TARGET_BLOCK_TIME_MS ?? "10000",
      10,
    ),
  ) {
    // Exclude genesis — its fixed timestamp would corrupt elapsed time calculation
    const nonGenesis = this.blocks.slice(1);

    // Not enough mined blocks yet — hold constructor difficulty
    if (nonGenesis.length < retargetInterval) return this.difficulty;

    // Only retarget on interval boundaries
    if (nonGenesis.length % retargetInterval !== 0)
      return this.latestBlock.difficulty;

    const window = nonGenesis.slice(-retargetInterval);
    const elapsed =
      new Date(window[window.length - 1].timestamp) -
      new Date(window[0].timestamp);
    const avgBlockTime = elapsed / retargetInterval;
    const ratio = avgBlockTime / targetBlockTimeMs;

    const current = this.latestBlock.difficulty;
    if (ratio < 0.5) return current + 1;
    if (ratio > 2.0) return Math.max(1, current - 1);
    return current;
  }

  /**
   * Get a block by its hash.
   * @returns {object|null}
   */
  getBlockByHash(blockHash) {
    return this.blocks.find((b) => b.blockHash === blockHash) ?? null;
  }

  /**
   * Get a tx by hash.
   * @returns {{ tx, blockIndex, blockHash }|null}
   */
  getTx(txHash) {
    return this.txIndex.get(txHash) ?? null;
  }

  /**
   * Generate a Merkle inclusion proof for a tx (FR-B04).
   * @returns {{ txHash, proof, merkleRoot, blockHash }|null}
   */
  getMerkleProof(txHash) {
    const entry = this.txIndex.get(txHash);
    if (!entry) return null;

    const block = this.blocks[entry.blockIndex];
    const proof = getMerkleProof(block.txHashes, txHash);
    return {
      txHash,
      proof,
      merkleRoot: block.merkleRoot,
      blockHash: block.blockHash,
    };
  }

  /**
   * Verify a Merkle proof (FR-B05).
   * @returns {boolean}
   */
  verifyMerkleProof(txHash, proof, merkleRoot) {
    return verifyMerkleProof(txHash, proof, merkleRoot);
  }

  /**
   * Full chain validation (FR-B09–B13).
   * @returns {{ valid: boolean, error: string|null, failedAt: number|null }}
   */
  validateChain() {
    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i];

      // 1. Check prevHash linkage (skip genesis)
      if (i > 0) {
        const prev = this.blocks[i - 1];
        if (block.prevHash !== prev.blockHash) {
          return {
            valid: false,
            error: `prevHash mismatch at block ${i}`,
            failedAt: i,
          };
        }
      }

      // 2. Validate blockHash + PoW
      const blockCheck = validateBlock(block);
      if (!blockCheck.valid) {
        return { valid: false, error: blockCheck.error, failedAt: i };
      }

      // Skip tx checks on genesis
      if (i === 0) continue;

      // 3. Recompute Merkle root from stored txHashes
      const recomputed = getMerkleRoot(block.txHashes);
      if (recomputed !== block.merkleRoot) {
        return {
          valid: false,
          error: `Merkle root mismatch at block ${i}`,
          failedAt: i,
        };
      }

      // 4. Validate all tx signatures if cityIssuerPublicKey is set (FR-B12)
      if (this.cityIssuerPublicKey) {
        for (const txHash of block.txHashes) {
          const entry = this.txIndex.get(txHash);
          if (!entry) {
            return {
              valid: false,
              error: `txHash ${txHash} in block ${i} not found in index`,
              failedAt: i,
            };
          }
          const { tx } = entry;
          if (!tx.signature || !tx.issuerPublicKey) {
            return {
              valid: false,
              error: `tx ${txHash} missing signature or issuerPublicKey`,
              failedAt: i,
            };
          }
          if (tx.issuerPublicKey !== this.cityIssuerPublicKey) {
            return {
              valid: false,
              error: `tx ${txHash} signed by unknown key`,
              failedAt: i,
            };
          }

          // Recompute txHash from tx content (strip signing fields first)
          const { signature, issuerPublicKey, ...coreTx } = tx;
          const recomputedTxHash = hashString(canonicalize(coreTx));
          if (recomputedTxHash !== txHash) {
            return {
              valid: false,
              error: `tx content tampered: recomputed hash does not match stored txHash ${txHash}`,
              failedAt: i,
            };
          }

          const sigValid = verify(issuerPublicKey, txHash, signature);
          if (!sigValid) {
            return {
              valid: false,
              error: `Invalid signature on tx ${txHash}`,
              failedAt: i,
            };
          }
        }
      }
    }

    return { valid: true, error: null, failedAt: null };
  }

  /** Longest-chain fork choice (FR-B14). Replace chain if candidate is longer. */
  replaceChain(candidateBlocks, candidateTxIndex = null) {
    if (candidateBlocks.length <= this.blocks.length) return false;

    const temp = new Blockchain(this.difficulty, null);
    temp.blocks = candidateBlocks;

    const check = temp.validateChain();
    if (!check.valid) {
      console.warn("replaceChain: candidate chain invalid —", check.error);
      return false;
    }

    this.blocks = candidateBlocks;
    this.txIndex.clear();

    for (const block of candidateBlocks.slice(1)) {
      for (const txHash of block.txHashes || []) {
        // Use real tx data from candidate if available, else stub
        const entry = candidateTxIndex?.get(txHash) ?? {
          tx: { txHash },
          blockIndex: block.index,
          blockHash: block.blockHash,
        };
        this.txIndex.set(txHash, entry);
      }
    }

    return true;
  }
}
