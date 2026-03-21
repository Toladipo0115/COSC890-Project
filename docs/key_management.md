# Key Management — UAV Audit

## Curve

**Ed25519** — chosen per spec recommendation (FR-C01).
Fast, short signatures (64 bytes), no random nonce required for signing.

## Roles

| Role | Key Variable | Purpose |
|------|-------------|---------|
| `CityIssuer` | `CITY_ISSUER_PRIVATE_KEY` | Signs all flight transactions |
| `Auditor` | `AUDITOR_PRIVATE_KEY` | Reserved for countersigning audit events |

## Setup
```bash
npm run keygen
```

Output:
```
CITY_ISSUER_PRIVATE_KEY=<hex>
CITY_ISSUER_PUBLIC_KEY=<hex>
AUDITOR_PRIVATE_KEY=<hex>
AUDITOR_PUBLIC_KEY=<hex>
```

Paste into `.env`. Public keys are also saved to `keys/public-keys.json` (safe to commit).

## What Gets Signed

Each transaction is signed over its **txHash** — the SHA-256 of the canonical JSON string (FR-C02).
```
signature = Ed25519.sign(privateKey, txHash)
```

The raw JSON is never signed directly. This ensures that two
representations of the same logical record produce the same signature.

## Validation

`validateChain()` rejects any transaction that:
- Is missing `signature` or `issuerPublicKey`
- Has an `issuerPublicKey` that does not match `CITY_ISSUER_PUBLIC_KEY`
- Has a signature that does not verify against the stored `txHash`
- Has a `txHash` that does not match the recomputed hash of tx content

## Security Notes

- **Never commit `.env`** — it is gitignored
- **Never commit `keys/`** — private key files are gitignored
- `keys/public-keys.json` is safe to commit
- Rotate keys by re-running `npm run keygen`, updating `.env`, and re-running `npm run ingest`