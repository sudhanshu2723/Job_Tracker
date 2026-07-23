import { describe, it, expect, beforeAll } from "vitest";
import { hashPassword, verifyPassword, hashOtp } from "@/lib/auth";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-key";
});

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("hunter2!");
    expect(await verifyPassword("hunter2!", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("hashOtp", () => {
  it("is deterministic for the same code", () => {
    expect(hashOtp("123456")).toBe(hashOtp("123456"));
  });
  it("differs for different codes", () => {
    expect(hashOtp("123456")).not.toBe(hashOtp("654321"));
  });
  it("never returns the plaintext code", () => {
    const h = hashOtp("123456");
    expect(h).not.toContain("123456");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});
