import { describe, it, expect } from "vitest";
import { rateLimit, clientIp, enforceRateLimit } from "@/lib/rateLimit";

// No Upstash env in tests → exercises the in-memory sliding-window fallback.

describe("rateLimit (in-memory fallback)", () => {
  it("allows up to the limit then blocks", async () => {
    const key = "test-block-" + Math.random().toString(36).slice(2);
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await rateLimit(key, 3, 60));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false, false]);
    expect(results[0].remaining).toBe(2);
    expect(results[2].remaining).toBe(0);
  });

  it("keeps separate keys independent", async () => {
    const a = await rateLimit("test-key-a", 1, 60);
    const b = await rateLimit("test-key-b", 1, 60);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect((await rateLimit("test-key-a", 1, 60)).ok).toBe(false);
  });
});

describe("clientIp", () => {
  it("reads the first x-forwarded-for hop", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });
  it("falls back to x-real-ip then 'unknown'", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("enforceRateLimit", () => {
  it("returns null under limit and a 429 with Retry-After when exceeded", async () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "10.0.0.1" } });
    const first = await enforceRateLimit(req, "enf-test", 1, 60);
    expect(first).toBeNull();
    const second = await enforceRateLimit(req, "enf-test", 1, 60);
    expect(second).not.toBeNull();
    expect(second!.status).toBe(429);
    expect(second!.headers.get("Retry-After")).toBeTruthy();
  });

  it("scopes by extra (per-user) separately from IP-only", async () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "10.0.0.2" } });
    expect(await enforceRateLimit(req, "enf-scope", 1, 60, "userA")).toBeNull();
    // Different extra → independent bucket.
    expect(await enforceRateLimit(req, "enf-scope", 1, 60, "userB")).toBeNull();
    // Same extra again → blocked.
    expect(await enforceRateLimit(req, "enf-scope", 1, 60, "userA")).not.toBeNull();
  });
});
