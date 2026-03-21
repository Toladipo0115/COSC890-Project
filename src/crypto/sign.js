/**
 * sign.js — Ed25519 signing + verification
 * Uses @noble/curves — no native crypto, fully deterministic.
 *
 * Curve: Ed25519 (FR-C01)
 * We sign the txHash hex string (FR-C02), not raw JSON.
 */
import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

/** Generate a new Ed25519 keypair. Returns { privateKey, publicKey } as hex. */
export function generateKeypair() {
  const privBytes = ed25519.utils.randomPrivateKey();
  const pubBytes = ed25519.getPublicKey(privBytes);
  return {
    privateKey: bytesToHex(privBytes),
    publicKey: bytesToHex(pubBytes),
  };
}

/**
 * Sign a txHash with a private key.
 * @param {string} privateKeyHex
 * @param {string} txHash  — 64-char hex string
 * @returns {string} signature hex
 */
export function sign(privateKeyHex, txHash) {
  const privBytes = hexToBytes(privateKeyHex);
  const msgBytes = new TextEncoder().encode(txHash);
  const sigBytes = ed25519.sign(msgBytes, privBytes);
  return bytesToHex(sigBytes);
}

/**
 * Verify a signature against a txHash and public key.
 * @param {string} publicKeyHex
 * @param {string} txHash
 * @param {string} signatureHex
 * @returns {boolean}
 */
export function verify(publicKeyHex, txHash, signatureHex) {
  try {
    const pubBytes = hexToBytes(publicKeyHex);
    const sigBytes = hexToBytes(signatureHex);
    const msgBytes = new TextEncoder().encode(txHash);
    return ed25519.verify(sigBytes, msgBytes, pubBytes);
  } catch {
    return false;
  }
}