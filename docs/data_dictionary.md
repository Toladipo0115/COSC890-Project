# Data Dictionary — UAV Flight Audit

## Source

City of Bloomington Open Data Portal
`https://data.bloomington.in.gov/api/views/3a7f-6kb4`

Snapshot date: **July 24, 2024**

## Canonical Transaction Schema

| Field | Type | Source Column | Notes |
|-------|------|---------------|-------|
| `flight_id` | string | `_id` | Fallback: `row_<index>` |
| `timestamp` | ISO 8601 UTC | `timestamp` | Normalized via `new Date().toISOString()` |
| `department` | string\|null | `department` | Trimmed |
| `drone_make_model` | string\|null | `drone_make_model` | Trimmed |
| `faa_drone_reg` | string\|null | `faa_drone_reg` | Trimmed |
| `pilot_certificate` | string\|null | `pilot_certificate` | Trimmed |
| `location_area_surveyed` | string\|null | `location_area_surveyed` | Trimmed |
| `street_address_area_surveyed` | string\|null | `street_address_area_surveyed` | Trimmed |
| `authorized_use` | string\|null | `authorized_use` | Trimmed |
| `source_url` | string\|null | — | Dataset download URL |
| `snapshot_hash` | string\|null | — | SHA-256 of raw snapshot file |

## Canonicalization Rules

These rules are **immutable** — changing them breaks reproducibility (NFR-01).

1. **Key sort**: All JSON object keys sorted lexicographically, recursive
2. **No whitespace**: `JSON.stringify` with no indent or spacing
3. **Null inclusion**: Missing fields are `null`, never omitted
4. **String cleaning**: Leading/trailing whitespace trimmed; internal runs collapsed to single space
5. **Timestamps**: All timestamps converted to ISO 8601 UTC via `new Date(val).toISOString()`
6. **txHash**: `SHA-256(canonicalJsonString)` as lowercase hex

## Example Canonical JSON
```json
{"authorized_use":"Infrastructure Inspection","department":"Public Works","drone_make_model":"DJI Mavic 3","faa_drone_reg":"FA12345","flight_id":"42","location_area_surveyed":"Downtown","pilot_certificate":"PC-9999","snapshot_hash":"aaa...","source_url":"https://...","street_address_area_surveyed":"401 N Morton St","timestamp":"2024-07-24T00:00:00.000Z"}
```

Note: keys are alphabetically sorted, no spaces, nulls explicit.

## Block Header Fields

| Field | Type | Notes |
|-------|------|-------|
| `index` | number | Block height, 0 = genesis |
| `timestamp` | ISO 8601 UTC | When block was mined |
| `prevHash` | hex(64) | Hash of previous block |
| `nonce` | number | PoW nonce |
| `difficulty` | number | Leading zero count required |
| `merkleRoot` | hex(64) | Merkle root of all txHashes in block |
| `txCount` | number | Number of transactions |
| `blockHash` | hex(64) | SHA-256 of concatenated header fields |

## blockHash Concatenation Order
```
blockHash = SHA-256(index + timestamp + prevHash + nonce + difficulty + merkleRoot + txCount)
```

Fields are cast to string and concatenated with no separator.
This order is fixed and must never change.