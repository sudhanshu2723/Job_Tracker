import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  verifySchema,
  friendSchema,
  inviteSchema,
  applicationSchema,
  importSchema,
  parseBody,
} from "@/lib/validation";

describe("registerSchema", () => {
  it("normalizes email + username to lowercase and trims", () => {
    const r = parseBody(registerSchema, {
      email: "  USER@Example.COM ",
      username: "  BobDev ",
      password: "secret1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.email).toBe("user@example.com");
      expect(r.data.username).toBe("bobdev");
    }
  });

  it("rejects bad email", () => {
    const r = parseBody(registerSchema, { email: "nope", username: "bobdev", password: "secret1" });
    expect(r.ok).toBe(false);
  });

  it("rejects short password", () => {
    const r = parseBody(registerSchema, { email: "a@b.co", username: "bobdev", password: "12345" });
    expect(r.ok).toBe(false);
  });

  it("rejects password over 72 bytes (bcrypt truncation boundary)", () => {
    const r = parseBody(registerSchema, { email: "a@b.co", username: "bobdev", password: "x".repeat(73) });
    expect(r.ok).toBe(false);
  });

  it("rejects username with illegal chars", () => {
    const r = parseBody(registerSchema, { email: "a@b.co", username: "bad name!", password: "secret1" });
    expect(r.ok).toBe(false);
  });

  it("defaults to a non-channel account", () => {
    const r = parseBody(registerSchema, { email: "a@b.co", username: "bobdev", password: "secret1" });
    expect(r.ok && r.data.isChannel).toBe(false);
  });

  it("requires a name and description when registering as a channel", () => {
    expect(
      parseBody(registerSchema, {
        email: "a@b.co", username: "bobdev", password: "secret1",
        isChannel: true, channelLabel: "", channelDescription: "plenty of detail here",
      }).ok,
    ).toBe(false);
    expect(
      parseBody(registerSchema, {
        email: "a@b.co", username: "bobdev", password: "secret1",
        isChannel: true, channelLabel: "Acme Jobs", channelDescription: "too short",
      }).ok,
    ).toBe(false);
    expect(
      parseBody(registerSchema, {
        email: "a@b.co", username: "bobdev", password: "secret1",
        isChannel: true, channelLabel: "Acme Jobs", channelDescription: "Curated startup engineering roles.",
      }).ok,
    ).toBe(true);
  });
});

describe("loginSchema", () => {
  it("accepts any non-empty password (no min for login)", () => {
    const r = parseBody(loginSchema, { email: "a@b.co", password: "x" });
    expect(r.ok).toBe(true);
  });
  it("rejects empty password", () => {
    const r = parseBody(loginSchema, { email: "a@b.co", password: "" });
    expect(r.ok).toBe(false);
  });
});

describe("verifySchema", () => {
  it("accepts a 6-digit code", () => {
    expect(parseBody(verifySchema, { email: "a@b.co", code: "123456" }).ok).toBe(true);
  });
  it("rejects non-6-digit codes", () => {
    expect(parseBody(verifySchema, { email: "a@b.co", code: "12345" }).ok).toBe(false);
    expect(parseBody(verifySchema, { email: "a@b.co", code: "abcdef" }).ok).toBe(false);
  });
});

describe("friend + invite schemas", () => {
  it("friendSchema lowercases username", () => {
    const r = parseBody(friendSchema, { toUsername: "Alice" });
    expect(r.ok && r.data.toUsername).toBe("alice");
  });
  it("inviteSchema requires ISO dates", () => {
    expect(parseBody(inviteSchema, { toUsername: "alice", fromDate: "2026-01-01", toDate: "2026-02-01" }).ok).toBe(true);
    expect(parseBody(inviteSchema, { toUsername: "alice", fromDate: "01/01/2026", toDate: "2026-02-01" }).ok).toBe(false);
  });
});

describe("applicationSchema", () => {
  it("requires company and role", () => {
    expect(parseBody(applicationSchema, { company: "", role: "x" }).ok).toBe(false);
    expect(parseBody(applicationSchema, { company: "x", role: "" }).ok).toBe(false);
    expect(parseBody(applicationSchema, { company: "Acme", role: "Dev" }).ok).toBe(true);
  });
  it("rejects unknown status", () => {
    expect(parseBody(applicationSchema, { company: "A", role: "R", status: "hired" }).ok).toBe(false);
  });
  it("rejects over-long fields", () => {
    expect(parseBody(applicationSchema, { company: "x".repeat(201), role: "R" }).ok).toBe(false);
    expect(parseBody(applicationSchema, { company: "A", role: "R", notes: "n".repeat(5001) }).ok).toBe(false);
  });
});

describe("importSchema", () => {
  it("caps array length at 2000", () => {
    const rows = Array.from({ length: 2001 }, () => ({ company: "A", role: "R" }));
    expect(importSchema.safeParse(rows).success).toBe(false);
    const ok = Array.from({ length: 2000 }, () => ({ company: "A", role: "R" }));
    expect(importSchema.safeParse(ok).success).toBe(true);
  });
});
