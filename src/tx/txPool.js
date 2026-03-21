/**
 * txPool.js — In-memory transaction pool.
 * Holds normalized txs waiting to be mined into blocks.
 * Also serves as a lookup index by txHash once mined.
 */

export class TxPool {
  constructor() {
    /** @type {Map<string, object>} txHash → tx object */
    this._pool = new Map();
    /** @type {Map<string, object>} txHash → { tx, blockHash, blockIndex } after mining */
    this._confirmed = new Map();
  }

  /** Add a signed tx to the pending pool. */
  add(txHash, tx) {
    if (this._pool.has(txHash) || this._confirmed.has(txHash)) return; // idempotent
    this._pool.set(txHash, tx);
  }

  /** Drain up to `batchSize` txs from the pool. Returns array of { txHash, tx }. */
  drain(batchSize = 10) {
    const batch = [];
    for (const [txHash, tx] of this._pool) {
      if (batch.length >= batchSize) break;
      batch.push({ txHash, tx });
      this._pool.delete(txHash);
    }
    return batch;
  }

  /** Mark a batch as confirmed in a block. */
  confirm(batch, blockHash, blockIndex) {
    for (const { txHash, tx } of batch) {
      this._confirmed.set(txHash, { tx, blockHash, blockIndex });
    }
  }

  /** Look up a confirmed tx by hash. Returns null if not found. */
  getConfirmed(txHash) {
    return this._confirmed.get(txHash) ?? null;
  }

  get pendingCount() { return this._pool.size; }
  get confirmedCount() { return this._confirmed.size; }
}