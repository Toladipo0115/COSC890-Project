import { hashString, hashBytes, hashPair } from "../../src/crypto/hash.js";

describe("hashString", () => {
  test("known SHA-256 vector — empty string", () => {
    expect(hashString("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test("output is a 64-char lowercase hex string", () => {
    const result = hashString("abc");
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  test("deterministic — same input always same output", () => {
    const a = hashString("hello world");
    const b = hashString("hello world");
    expect(a).toBe(b);
  });

  test("different inputs produce different hashes", () => {
    expect(hashString("foo")).not.toBe(hashString("bar"));
  });

  test("throws on non-string input", () => {
    expect(() => hashString(123)).toThrow(TypeError);
  });
});

describe("hashPair", () => {
  test("is deterministic", () => {
    const h = hashPair("aaa", "bbb");
    expect(hashPair("aaa", "bbb")).toBe(h);
  });

  test("order matters", () => {
    expect(hashPair("aaa", "bbb")).not.toBe(hashPair("bbb", "aaa"));
  });
});
