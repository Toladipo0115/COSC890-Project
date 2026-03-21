/**
 * simulate-fork.js — Demonstrates fork creation and resolution
 *
 * Scenario:
 *   1. Node A and Node B start in sync
 *   2. Network partition: both mine a block independently → fork
 *   3. Node A mines a second block → its chain is now longer
 *   4. Partition heals: Node B receives Node A's chain → resolves to longest
 *
 * Usage: npm run simulate:fork
 */
import { Blockchain } from "../chain/blockchain.js";
import { generateKeypair, sign } from "../crypto/sign.js";
import { normalizeRow, canonicalize } from "../tx/normalize.js";
import { hashString } from "../crypto/hash.js";

const DIFFICULTY = 2; // fast mining for demo
const SNAPSHOT = "a".repeat(64);
const SOURCE = "https://example.com";

// ── Helpers ───────────────────────────────────────────────────────────────
function makeBatch(keypair, count, offset) {
  return Array.from({ length: count }, (_, i) => {
    const raw = {
      _id: `sim_${offset + i}`,
      department: "Simulation",
      drone_make_model: "DJI Mavic 3",
      faa_drone_reg: `SIM${offset + i}`,
      pilot_certificate: "SIM-001",
      location_area_surveyed: "Test Area",
      street_address_area_surveyed: "123 Sim St",
      authorized_use: "Fork Simulation",
      timestamp: new Date().toISOString(),
    };
    const { tx, txHash } = normalizeRow(raw, offset + i, SNAPSHOT, SOURCE);
    const signedTx = {
      ...tx,
      issuerPublicKey: keypair.publicKey,
      signature: sign(keypair.privateKey, txHash),
    };
    return { txHash, tx: signedTx };
  });
}

function separator(label) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${label}`);
  console.log("─".repeat(60));
}

function chainSummary(label, c) {
  console.log(`  ${label}: ${c.blocks.length} blocks`);
  c.blocks.forEach((b) => {
    console.log(
      `    #${b.index} ${b.blockHash.slice(0, 16)}… (${b.txCount} txs)`,
    );
  });
}

// ── Simulation ────────────────────────────────────────────────────────────
async function simulate() {
  console.log("\n🔀  UAV Audit — Fork Simulation\n");
  const keypair = generateKeypair();

  // Step 1: Both nodes start with the same base chain
  separator("STEP 1 — Both nodes start in sync");
  const nodeA = new Blockchain(DIFFICULTY, keypair.publicKey);
  const nodeB = new Blockchain(DIFFICULTY, keypair.publicKey);

  // Mine 2 shared blocks
  nodeA.addBlock(makeBatch(keypair, 3, 0));
  nodeA.addBlock(makeBatch(keypair, 3, 3));

  // Sync B from A (simulate initial sync)
  nodeB.blocks = JSON.parse(JSON.stringify(nodeA.blocks));
  nodeB.txIndex = new Map(nodeA.txIndex);

  chainSummary("Node A", nodeA);
  chainSummary("Node B", nodeB);
  console.log(
    `\n  ✅ Both nodes identical: ${nodeA.latestBlock.blockHash.slice(0, 16)}…`,
  );

  // Step 2: Simulate network partition — both mine independently
  separator("STEP 2 — Network partition: nodes mine independently (FORK)");

  nodeA.addBlock(makeBatch(keypair, 3, 6)); // A mines block #3
  nodeB.addBlock(makeBatch(keypair, 3, 9)); // B mines block #3 independently

  chainSummary("Node A", nodeA);
  chainSummary("Node B", nodeB);

  const sameIndex = nodeA.latestBlock.index === nodeB.latestBlock.index;
  const diffHash = nodeA.latestBlock.blockHash !== nodeB.latestBlock.blockHash;
  console.log(
    `\n  ⚠️  Fork detected: same height (${nodeA.blocks.length - 1}), different hashes`,
  );
  console.log(`  Node A tip: ${nodeA.latestBlock.blockHash.slice(0, 24)}…`);
  console.log(`  Node B tip: ${nodeB.latestBlock.blockHash.slice(0, 24)}…`);

  // Step 3: Node A mines another block — now it's longer
  separator("STEP 3 — Node A mines again: chain length advantage");
  nodeA.addBlock(makeBatch(keypair, 3, 12));

  chainSummary("Node A", nodeA);
  chainSummary("Node B", nodeB);
  console.log(`\n  Node A: ${nodeA.blocks.length} blocks`);
  console.log(`  Node B: ${nodeB.blocks.length} blocks`);

  // Step 4: Partition heals — B receives A's chain and resolves
  separator("STEP 4 — Partition heals: Node B receives Node A's chain");

  const beforeReplace = nodeB.blocks.length;
  const accepted = nodeB.replaceChain(
    JSON.parse(JSON.stringify(nodeA.blocks)),
    nodeA.txIndex, // pass real tx data so sig validation works
  );

  if (accepted) {
    console.log(`\n  ✅ Fork resolved: Node B accepted Node A's longer chain`);
    console.log(
      `  Node B: ${beforeReplace} blocks → ${nodeB.blocks.length} blocks`,
    );
    chainSummary("Node B (resolved)", nodeB);
  } else {
    console.log(`\n  ❌ Unexpected: chain replace failed`);
  }

  // Step 5: Verify both chains now agree
  separator("STEP 5 — Verification");

  const aValid = nodeA.validateChain();
  const bValid = nodeB.validateChain();
  const agree = nodeA.latestBlock.blockHash === nodeB.latestBlock.blockHash;

  console.log(
    `  Node A validateChain: ${aValid.valid ? "✅ valid" : "❌ " + aValid.error}`,
  );
  console.log(
    `  Node B validateChain: ${bValid.valid ? "✅ valid" : "❌ " + bValid.error}`,
  );
  console.log(`  Chains agree:         ${agree ? "✅ yes" : "❌ no"}`);
  console.log(`  Final tip: ${nodeA.latestBlock.blockHash.slice(0, 32)}…`);
  console.log(`\n${"─".repeat(60)}\n`);
}

simulate().catch((err) => {
  console.error("Simulation error:", err);
  process.exit(1);
});
