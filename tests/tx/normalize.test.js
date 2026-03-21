import { normalizeRow, canonicalize, sortKeysDeep } from '../../src/tx/normalize.js';

const SNAPSHOT_HASH = 'a'.repeat(64);
const SOURCE_URL = 'https://data.bloomington.in.gov/api/views/3a7f-6kb4/rows.xml';

const sampleRaw = {
  _id: '42',
  department: '  Public Works ',
  drone_make_model: 'DJI  Mavic 3',
  faa_drone_reg: 'FA12345',
  pilot_certificate: 'PC-9999',
  location_area_surveyed: 'Downtown',
  street_address_area_surveyed: '401 N Morton St',
  authorized_use: 'Infrastructure Inspection',
  timestamp: '2024-07-24T00:00:00.000Z',
};

describe('canonicalize', () => {
  test('keys are sorted lexicographically', () => {
    const result = canonicalize({ z: 1, a: 2, m: 3 });
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  test('no whitespace in output', () => {
    const result = canonicalize({ foo: 'bar' });
    expect(result).not.toMatch(/\s/);
  });

  test('null values are included, not omitted', () => {
    const result = canonicalize({ a: null, b: 'hi' });
    expect(result).toContain('"a":null');
  });

  test('nested objects have keys sorted too', () => {
    const result = canonicalize({ b: { z: 1, a: 2 } });
    expect(result).toBe('{"b":{"a":2,"z":1}}');
  });

  test('same input always produces identical string — reproducibility', () => {
    const obj = { flight_id: '1', timestamp: '2024-01-01T00:00:00.000Z', department: 'IT' };
    expect(canonicalize(obj)).toBe(canonicalize(obj));
    expect(canonicalize(obj)).toBe(canonicalize({ ...obj }));
  });
});

describe('normalizeRow', () => {
  test('same raw row always produces identical txHash', () => {
    const a = normalizeRow(sampleRaw, 0, SNAPSHOT_HASH, SOURCE_URL);
    const b = normalizeRow(sampleRaw, 0, SNAPSHOT_HASH, SOURCE_URL);
    expect(a.txHash).toBe(b.txHash);
  });

  test('all canonical schema fields are present', () => {
    const { tx } = normalizeRow(sampleRaw, 0, SNAPSHOT_HASH, SOURCE_URL);
    const required = [
      'authorized_use', 'department', 'drone_make_model', 'faa_drone_reg',
      'flight_id', 'location_area_surveyed', 'pilot_certificate',
      'snapshot_hash', 'source_url', 'street_address_area_surveyed', 'timestamp',
    ];
    for (const field of required) {
      expect(tx).toHaveProperty(field);
    }
  });

  test('missing fields are null, not undefined or omitted', () => {
    const { tx } = normalizeRow({}, 0, SNAPSHOT_HASH, SOURCE_URL);
    expect(tx.department).toBeNull();
    expect(tx.drone_make_model).toBeNull();
    expect(tx.timestamp).toBeNull();
  });

  test('flight_id falls back to row_<index>', () => {
    const { tx } = normalizeRow({}, 7, SNAPSHOT_HASH, SOURCE_URL);
    expect(tx.flight_id).toBe('row_7');
  });

  test('strings are trimmed and whitespace collapsed', () => {
    const { tx } = normalizeRow(sampleRaw, 0, SNAPSHOT_HASH, SOURCE_URL);
    expect(tx.department).toBe('Public Works');
    expect(tx.drone_make_model).toBe('DJI Mavic 3');
  });

  test('timestamp normalized to ISO 8601 UTC', () => {
    const { tx } = normalizeRow(sampleRaw, 0, SNAPSHOT_HASH, SOURCE_URL);
    expect(tx.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('mutating a field changes the txHash', () => {
    const a = normalizeRow(sampleRaw, 0, SNAPSHOT_HASH, SOURCE_URL);
    const b = normalizeRow({ ...sampleRaw, department: 'Finance' }, 0, SNAPSHOT_HASH, SOURCE_URL);
    expect(a.txHash).not.toBe(b.txHash);
  });

  test('snapshot_hash embedded in tx', () => {
    const { tx } = normalizeRow(sampleRaw, 0, SNAPSHOT_HASH, SOURCE_URL);
    expect(tx.snapshot_hash).toBe(SNAPSHOT_HASH);
  });
});