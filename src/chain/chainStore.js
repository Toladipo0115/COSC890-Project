/**
 * chainStore.js — Singleton Blockchain instance + loader.
 * Import this everywhere you need chain access.
 */
import { Blockchain } from './blockchain.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const DIFFICULTY = parseInt(process.env.DIFFICULTY ?? '3', 10);
const PUBLIC_KEY = process.env.CITY_ISSUER_PUBLIC_KEY ?? null;

export const chain = new Blockchain(DIFFICULTY, PUBLIC_KEY);

/**
 * Load a normalized snapshot file into the chain.
 * Called by ingest.js after normalization.
 * @param {Array<{tx, canonical, txHash}>} normalized
 * @param {string} privateKey — CityIssuer private key for signing
 * @param {string} publicKey  — CityIssuer public key
 * @param {number} batchSize
 */
export async function loadIntoChain(normalized, privateKey, publicKey, batchSize = 10) {
  const { sign } = await import('../crypto/sign.js');

  let mined = 0;

  for (let i = 0; i < normalized.length; i += batchSize) {
    const slice = normalized.slice(i, i + batchSize);

    const batch = slice.map(({ tx, txHash }) => {
      const signedTx = {
        ...tx,
        issuerPublicKey: publicKey,
        signature: sign(privateKey, txHash),
      };
      return { txHash, tx: signedTx };
    });

    chain.addBlock(batch);
    mined++;
    process.stdout.write(`\rMined block ${mined} (${Math.min(i + batchSize, normalized.length)}/${normalized.length} txs)...`);
  }

  console.log(`\n✅ Chain built: ${chain.blocks.length} blocks (including genesis)`);
  return chain;
}