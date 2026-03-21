# Network Architecture — UAV Audit P2P Layer

## Overview

Each node is a self-contained unit: Express HTTP API + WebSocket server.
Nodes discover each other via explicit peer URLs (no DHT/bootstrap for MVP).

## Starting Nodes

Open three terminals:
```bash
# Terminal 1
npm run dev:node -- --port 3001 --peers ws://localhost:3002,ws://localhost:3003

# Terminal 2
npm run dev:node -- --port 3002 --peers ws://localhost:3001,ws://localhost:3003

# Terminal 3
npm run dev:node -- --port 3003 --peers ws://localhost:3001,ws://localhost:3002
```

Each node loads `data/raw/chain.json` on startup (produced by `npm run ingest`).

## Message Protocol

| Type | Direction | Purpose |
|------|-----------|---------|
| `QUERY_LATEST` | → peer | Ask for peer's latest block |
| `QUERY_ALL` | → peer | Ask for peer's full chain |
| `RESPONSE_CHAIN` | ← peer | Receive block(s) |
| `BROADCAST_BLOCK` | → all peers | Announce newly mined block |
| `PING` / `PONG` | ↔ | Keepalive |

## Sync Behaviour

1. **On connect**: node sends `QUERY_LATEST` to new peer
2. **If peer is ahead by 1**: append single block, re-broadcast
3. **If peer is ahead by more**: send `QUERY_ALL`, evaluate full chain
4. **Fork resolution**: longest valid chain wins (`replaceChain`)
5. **Reconnection**: auto-reconnects to lost peers every 5 seconds

## Fork Simulation
```bash
npm run simulate:fork
```

Demonstrates the full lifecycle in a single process:
1. Two nodes start in sync
2. Network partition — both mine independently → fork
3. Node A mines an extra block → longer chain
4. Partition heals → Node B resolves to Node A's chain
5. Both chains validated and confirmed identical

## Node Status API

Each node exposes:

| Endpoint | Response |
|----------|----------|
| `GET /chain` | Full block array |
| `GET /status` | `{ port, blocks, txs, peers }` |
| `GET /peers` | `{ port, peerCount }` |

## In-Memory Note

P2P chain state is in-memory for MVP (FR-D04 default).
Each node loads from `chain.json` at startup but does not persist
blocks received over the network. Restart = reload from snapshot.