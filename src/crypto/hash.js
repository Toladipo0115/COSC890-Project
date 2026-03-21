/**
 * hash.js — SHA-256 wrapper
 * All outputs are lowercase hex strings.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/** Hash a UTF-8 string → 64-char hex */
export function hashString(input) {
  if (typeof input !== 'string') {
    throw new TypeError(`hashString expects a string, got ${typeof input}`);
  }
  const bytes = new TextEncoder().encode(input);
  return bytesToHex(sha256(bytes));
}

/** Hash a Uint8Array → 64-char hex */
export function hashBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError(`hashBytes expects Uint8Array`);
  }
  return bytesToHex(sha256(bytes));
}

/**
 * Hash two hex strings together — used by Merkle tree.
 * Concatenates left + right as strings, then hashes.
 */
export function hashPair(left, right) {
  return hashString(left + right);
}