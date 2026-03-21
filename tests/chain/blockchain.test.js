import { Blockchain } from "../../src/chain/blockchain.js";
import { generateKeypair, sign } from "../../src/crypto/sign.js";
import { normalizeRow, canonicalize } from "../../src/tx/normalize.js";
import { hashString } from "../../src/crypto/hash.js";

const SNAPSHOT_HASH = "a".repeat(64);
const SOURCE_URL = "https://example.com";

/** Build a signed tx batch */
function makeBatch(keypair, count = 3, offset = 0) {
  return Array.from({ length: count }, (_, i) => {
    const raw = {
      _id: `${offset + i}`,
      department: "Public Works",
      drone_make_model: "DJI Mavic 3",
      faa_drone_reg: `FA${offset + i}`,
      pilot_certificate: "PC-001",
      location_area_surveyed: "Downtown",
      street_address_area_surveyed: "401 N Morton St",
      authorized_use: "Inspection",
      timestamp: "2024-07-24T00:00:00.000Z",
    };
    const { tx, txHash } = normalizeRow(
      raw,
      offset + i,
      SNAPSHOT_HASH,
      SOURCE_URL,
    );
    const signedTx = {
      ...tx,
      issuerPublicKey: keypair.publicKey,
      signature: sign(keypair.privateKey, txHash),
    };
    return { txHash, tx: signedTx };
  });
}

describe("Blockchain", () => {
  let keypair;
  let chain;

  beforeEach(() => {
    keypair = generateKeypair();
    chain = new Blockchain(2, keypair.publicKey); // difficulty 2 for test speed
  });

  test("initializes with genesis block", () => {
    expect(chain.blocks).toHaveLength(1);
    expect(chain.blocks[0].index).toBe(0);
    expect(chain.blocks[0].prevHash).toBe("0".repeat(64));
  });

  test("addBlock mines and appends a block", () => {
    const batch = makeBatch(keypair, 3);
    const block = chain.addBlock(batch);
    expect(chain.blocks).toHaveLength(2);
    expect(block.index).toBe(1);
    expect(block.txCount).toBe(3);
  });

  test("prevHash links are correct", () => {
    chain.addBlock(makeBatch(keypair, 3, 0));
    chain.addBlock(makeBatch(keypair, 3, 3));
    expect(chain.blocks[1].prevHash).toBe(chain.blocks[0].blockHash);
    expect(chain.blocks[2].prevHash).toBe(chain.blocks[1].blockHash);
  });

  test("validateChain passes on clean chain", () => {
    chain.addBlock(makeBatch(keypair, 3));
    const result = chain.validateChain();
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  test("tampered tx field breaks validateChain", () => {
    const batch = makeBatch(keypair, 3);
    chain.addBlock(batch);

    // Tamper: mutate a tx in the index directly
    const [txHash] = chain.blocks[1].txHashes;
    const entry = chain.txIndex.get(txHash);
    entry.tx.department = "TAMPERED";

    const result = chain.validateChain();
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(1);
  });

  test("tampered prevHash breaks validateChain", () => {
    chain.addBlock(makeBatch(keypair, 3));
    chain.blocks[1].prevHash = "f".repeat(64);
    const result = chain.validateChain();
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(1);
  });

  test("unsigned tx rejected by validateChain", () => {
    const batch = makeBatch(keypair, 2);
    // Strip signature from one tx
    batch[0].tx.signature = undefined;
    chain.addBlock(batch);
    const result = chain.validateChain();
    expect(result.valid).toBe(false);
  });

  test("Merkle proof verifies for every tx in chain", () => {
    chain.addBlock(makeBatch(keypair, 5));
    for (const txHash of chain.blocks[1].txHashes) {
      const { proof, merkleRoot } = chain.getMerkleProof(txHash);
      expect(chain.verifyMerkleProof(txHash, proof, merkleRoot)).toBe(true);
    }
  });

  test("getTx returns correct block info", () => {
    const batch = makeBatch(keypair, 2);
    const block = chain.addBlock(batch);
    const entry = chain.getTx(batch[0].txHash);
    expect(entry.blockHash).toBe(block.blockHash);
    expect(entry.blockIndex).toBe(1);
  });
});

describe("Dynamic difficulty", () => {
  let keypair;
  beforeEach(() => {
    keypair = generateKeypair();
  });

  test("holds difficulty before retarget interval is reached", () => {
    const c = new Blockchain(2, keypair.publicKey);
    // Add 9 blocks (interval is 10, so no retarget yet)
    for (let i = 0; i < 9; i++) c.addBlock(makeBatch(keypair, 1, i * 10));
    expect(c.getNextDifficulty(10, 10000)).toBe(2);
  });

  test("increases difficulty when blocks mined too fast", () => {
    const c = new Blockchain(2, keypair.publicKey);
    // Mine 10 blocks — timestamps will be nearly identical (sub-millisecond)
    // avgBlockTime ≈ 0ms, ratio ≈ 0 → should increase
    for (let i = 0; i < 10; i++) c.addBlock(makeBatch(keypair, 1, i * 10));
    const next = c.getNextDifficulty(10, 10000);
    expect(next).toBe(3); // difficulty + 1
  });

  test("decreases difficulty when blocks mined too slow", () => {
    const c = new Blockchain(3, keypair.publicKey);
    // Manually inject 10 blocks with timestamps 5 minutes apart
    // avgBlockTime = 300000ms, target = 10000ms, ratio = 30 → decrease
    for (let i = 0; i < 10; i++) {
      const batch = makeBatch(keypair, 1, i * 10);
      const block = c.addBlock(batch);
      // Override timestamp to simulate slow mining
      block.timestamp = new Date(Date.now() + i * 300000).toISOString();
    }
    const next = c.getNextDifficulty(10, 10000);
    expect(next).toBe(2); // difficulty - 1
  });

  test("never drops difficulty below 1", () => {
    const c = new Blockchain(1, keypair.publicKey);
    for (let i = 0; i < 10; i++) {
      const batch = makeBatch(keypair, 1, i * 10);
      const block = c.addBlock(batch);
      block.timestamp = new Date(Date.now() + i * 300000).toISOString();
    }
    const next = c.getNextDifficulty(10, 10000);
    expect(next).toBe(1); // floor
  });
});
