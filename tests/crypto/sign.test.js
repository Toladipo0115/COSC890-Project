import { generateKeypair, sign, verify } from '../../src/crypto/sign.js';
import { hashString } from '../../src/crypto/hash.js';

describe('Ed25519 signing', () => {
  let keypair;

  beforeAll(() => {
    keypair = generateKeypair();
  });

  test('generateKeypair returns 64-char hex strings', () => {
    expect(keypair.privateKey).toHaveLength(64);
    expect(keypair.publicKey).toHaveLength(64);
  });

  test('sign → verify roundtrip succeeds', () => {
    const txHash = hashString('{"flight_id":"001","timestamp":"2024-07-24T00:00:00Z"}');
    const sig = sign(keypair.privateKey, txHash);
    expect(verify(keypair.publicKey, txHash, sig)).toBe(true);
  });

  test('tampered txHash fails verification', () => {
    const txHash = hashString('original');
    const sig = sign(keypair.privateKey, txHash);
    const tampered = hashString('tampered');
    expect(verify(keypair.publicKey, tampered, sig)).toBe(false);
  });

  test('wrong public key fails verification', () => {
    const txHash = hashString('original');
    const sig = sign(keypair.privateKey, txHash);
    const other = generateKeypair();
    expect(verify(other.publicKey, txHash, sig)).toBe(false);
  });

  test('malformed signature returns false, not throw', () => {
    expect(verify(keypair.publicKey, hashString('x'), 'deadbeef')).toBe(false);
  });
});