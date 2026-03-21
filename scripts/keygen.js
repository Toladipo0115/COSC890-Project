/**
 * keygen.js — Generate CityIssuer + Auditor Ed25519 keypairs.
 * Prints hex values to stdout for pasting into .env
 *
 * Usage: npm run keygen
 */
import { generateKeypair } from '../src/crypto/sign.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const cityIssuer = generateKeypair();
const auditor = generateKeypair();

console.log('\n=== UAV Audit — Key Generation ===\n');
console.log('Copy the following into your .env file:\n');
console.log(`CITY_ISSUER_PRIVATE_KEY=${cityIssuer.privateKey}`);
console.log(`CITY_ISSUER_PUBLIC_KEY=${cityIssuer.publicKey}`);
console.log(`AUDITOR_PRIVATE_KEY=${auditor.privateKey}`);
console.log(`AUDITOR_PUBLIC_KEY=${auditor.publicKey}`);
console.log('\n⚠️  Private keys are NOT written to disk by this script.');
console.log('   Paste them into .env manually. Never commit .env.\n');

// Write public keys to a safe, committed file
mkdirSync('keys', { recursive: true });
const pubkeys = {
  cityIssuer: { publicKey: cityIssuer.publicKey },
  auditor: { publicKey: auditor.publicKey },
  generatedAt: new Date().toISOString(),
};
writeFileSync(join('keys', 'public-keys.json'), JSON.stringify(pubkeys, null, 2));
console.log('✅  Public keys saved to keys/public-keys.json');