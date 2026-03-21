/**
 * node.js — P2P WebSocket node
 *
 * Each node runs its own Express API + WebSocket server.
 * Nodes broadcast mined blocks and sync on connect.
 *
 * Usage:
 *   npm run dev:node -- --port 3001 --peers ws://localhost:3002,ws://localhost:3003
 *   npm run dev:node -- --port 3002 --peers ws://localhost:3001,ws://localhost:3003
 *   npm run dev:node -- --port 3003 --peers ws://localhost:3001,ws://localhost:3002
 *
 * FR-D01: configurable port
 * FR-D02: broadcast newly mined blocks
 * FR-D03: request missing blocks on startup / gap detection
 * FR-D05: WebSockets
 */

import express     from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join }    from 'path';
import { Blockchain } from '../chain/blockchain.js';
import { verifyMerkleProof } from '../crypto/merkle.js';
import { verify }  from '../crypto/sign.js';
import { canonicalize } from '../tx/normalize.js';
import { hashString } from '../crypto/hash.js';
import 'dotenv/config';

// ── CLI args ─────────────────────────────────────────────────────────────
const portArg  = process.argv.indexOf('--port');
const peersArg = process.argv.indexOf('--peers');

const PORT       = portArg  !== -1 ? parseInt(process.argv[portArg  + 1], 10) : 3001;
const PEER_URLS  = peersArg !== -1 ? process.argv[peersArg + 1].split(',')    : [];
const DIFFICULTY = parseInt(process.env.DIFFICULTY ?? '3', 10);
const PUBLIC_KEY = process.env.CITY_ISSUER_PUBLIC_KEY ?? null;

// ── Load chain ────────────────────────────────────────────────────────────
const CHAIN_PATH = join(process.cwd(), 'data', 'raw', 'chain.json');
let chain;

if (existsSync(CHAIN_PATH)) {
  const data = JSON.parse(readFileSync(CHAIN_PATH, 'utf8'));
  chain = new Blockchain(DIFFICULTY, data.cityIssuerPublicKey ?? PUBLIC_KEY);
  chain.blocks  = data.blocks;
  chain.txIndex = new Map(data.txIndex);
  console.log(`[node:${PORT}] Chain loaded: ${chain.blocks.length} blocks`);
} else {
  console.warn(`[node:${PORT}] No chain.json — starting empty chain`);
  chain = new Blockchain(DIFFICULTY, PUBLIC_KEY);
}

// ── Message types ─────────────────────────────────────────────────────────
const MSG = {
  QUERY_LATEST:   'QUERY_LATEST',
  QUERY_ALL:      'QUERY_ALL',
  RESPONSE_CHAIN: 'RESPONSE_CHAIN',
  BROADCAST_BLOCK:'BROADCAST_BLOCK',
  PING:           'PING',
  PONG:           'PONG',
};

function msg(type, data = null) {
  return JSON.stringify({ type, data });
}

// ── Peer registry ─────────────────────────────────────────────────────────
/** @type {Set<WebSocket>} */
const peers = new Set();

function broadcast(message) {
  for (const peer of peers) {
    if (peer.readyState === WebSocket.OPEN) {
      peer.send(message);
    }
  }
}

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(message);
}

// ── Chain sync ────────────────────────────────────────────────────────────
/**
 * Handle an incoming chain from a peer.
 * Applies longest-chain fork choice (FR-B14).
 */
function handleIncomingChain(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return;

  const latest      = blocks[blocks.length - 1];
  const ourLatest   = chain.latestBlock;

  if (latest.index <= ourLatest.index) return; // not longer, ignore

  if (blocks.length === 1) {
    // Single block — check if it extends our chain
    if (latest.prevHash === ourLatest.blockHash) {
      console.log(`[node:${PORT}] Appending single block #${latest.index}`);
      chain.blocks.push(latest);
      broadcast(msg(MSG.BROADCAST_BLOCK, latest));
    } else {
      // Gap detected — request full chain
      console.log(`[node:${PORT}] Gap detected — requesting full chain`);
      broadcast(msg(MSG.QUERY_ALL));
    }
    return;
  }

  // Full chain received — attempt replace
  console.log(`[node:${PORT}] Evaluating incoming chain (${blocks.length} blocks vs our ${chain.blocks.length})`);
  const accepted = chain.replaceChain(blocks);
  if (accepted) {
    console.log(`[node:${PORT}] ✅ Chain replaced with longer chain (${blocks.length} blocks)`);
    broadcast(msg(MSG.RESPONSE_CHAIN, chain.blocks));
  } else {
    console.log(`[node:${PORT}] ❌ Incoming chain rejected (invalid or not longer)`);
  }
}

// ── WebSocket message handler ─────────────────────────────────────────────
function handleMessage(ws, raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return; }

  const { type, data } = parsed;
  console.log(`[node:${PORT}] ← ${type}`);

  switch (type) {
    case MSG.QUERY_LATEST:
      send(ws, msg(MSG.RESPONSE_CHAIN, [chain.latestBlock]));
      break;

    case MSG.QUERY_ALL:
      send(ws, msg(MSG.RESPONSE_CHAIN, chain.blocks));
      break;

    case MSG.RESPONSE_CHAIN:
      handleIncomingChain(data);
      break;

    case MSG.BROADCAST_BLOCK:
      handleIncomingChain([data]);
      break;

    case MSG.PING:
      send(ws, msg(MSG.PONG));
      break;

    case MSG.PONG:
      break;

    default:
      console.warn(`[node:${PORT}] Unknown message type: ${type}`);
  }
}

// ── WebSocket server ──────────────────────────────────────────────────────
const app        = express();
const httpServer = createServer(app);
const wss        = new WebSocketServer({ server: httpServer });

app.use(express.json());

wss.on('connection', (ws, req) => {
  const addr = req.socket.remoteAddress;
  console.log(`[node:${PORT}] Peer connected: ${addr}`);
  peers.add(ws);

  // On new connection, ask for their latest block (FR-D03)
  send(ws, msg(MSG.QUERY_LATEST));

  ws.on('message', raw  => handleMessage(ws, raw));
  ws.on('close',   ()   => { peers.delete(ws); console.log(`[node:${PORT}] Peer disconnected`); });
  ws.on('error',   err  => { peers.delete(ws); console.error(`[node:${PORT}] Peer error:`, err.message); });
});

// ── Connect to known peers ────────────────────────────────────────────────
function connectToPeer(url) {
  console.log(`[node:${PORT}] Connecting to peer: ${url}`);
  const ws = new WebSocket(url);

  ws.on('open', () => {
    console.log(`[node:${PORT}] Connected to ${url}`);
    peers.add(ws);
    send(ws, msg(MSG.QUERY_LATEST)); // sync on connect (FR-D03)
  });

  ws.on('message', raw  => handleMessage(ws, raw));
  ws.on('close',   ()   => {
    peers.delete(ws);
    console.log(`[node:${PORT}] Lost ${url} — reconnecting in 5s`);
    setTimeout(() => connectToPeer(url), 5000);
  });
  ws.on('error',   err  => {
    console.warn(`[node:${PORT}] Cannot reach ${url}: ${err.message}`);
  });
}

// ── REST API (per-node) ───────────────────────────────────────────────────
app.get('/chain',  (req, res) => res.json(chain.blocks));
app.get('/peers',  (req, res) => res.json({ port: PORT, peerCount: peers.size }));
app.get('/status', (req, res) => res.json({
  port:   PORT,
  blocks: chain.blocks.length,
  txs:    chain.txIndex.size,
  peers:  peers.size,
}));

// ── Start ─────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n🌐 [node:${PORT}] P2P node running`);
  console.log(`   HTTP: http://localhost:${PORT}`);
  console.log(`   WS:   ws://localhost:${PORT}`);

  // Connect to known peers after a short delay
  if (PEER_URLS.length > 0) {
    setTimeout(() => PEER_URLS.forEach(connectToPeer), 500);
  }
});

export { chain, broadcast, msg, MSG };