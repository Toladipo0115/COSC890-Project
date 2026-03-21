import { getMerkleRoot, getMerkleProof, verifyMerkleProof } from '../../src/crypto/merkle.js';
import { hashString } from '../../src/crypto/hash.js';

const leaves = ['tx1', 'tx2', 'tx3', 'tx4'].map(t => hashString(t));
const leavesOdd = ['tx1', 'tx2', 'tx3'].map(t => hashString(t));

describe('getMerkleRoot', () => {
  test('single leaf — root equals that leaf', () => {
    const h = hashString('only');
    expect(getMerkleRoot([h])).toBe(h);
  });

  test('even count — deterministic', () => {
    expect(getMerkleRoot(leaves)).toBe(getMerkleRoot(leaves));
  });

  test('odd count — deterministic', () => {
    expect(getMerkleRoot(leavesOdd)).toBe(getMerkleRoot(leavesOdd));
  });

  test('different leaf sets produce different roots', () => {
    const other = ['tx1', 'tx2', 'tx9', 'tx4'].map(t => hashString(t));
    expect(getMerkleRoot(leaves)).not.toBe(getMerkleRoot(other));
  });
});

describe('getMerkleProof + verifyMerkleProof', () => {
  test('proof verifies for every leaf — even count', () => {
    const root = getMerkleRoot(leaves);
    for (const leaf of leaves) {
      const proof = getMerkleProof(leaves, leaf);
      expect(verifyMerkleProof(leaf, proof, root)).toBe(true);
    }
  });

  test('proof verifies for every leaf — odd count', () => {
    const root = getMerkleRoot(leavesOdd);
    for (const leaf of leavesOdd) {
      const proof = getMerkleProof(leavesOdd, leaf);
      expect(verifyMerkleProof(leaf, proof, root)).toBe(true);
    }
  });

  test('tampered txHash fails verification', () => {
    const root = getMerkleRoot(leaves);
    const proof = getMerkleProof(leaves, leaves[0]);
    expect(verifyMerkleProof(hashString('tampered'), proof, root)).toBe(false);
  });

  test('wrong root fails verification', () => {
    const root = getMerkleRoot(leaves);
    const proof = getMerkleProof(leaves, leaves[0]);
    expect(verifyMerkleProof(leaves[0], proof, hashString('wrongroot'))).toBe(false);
  });
});