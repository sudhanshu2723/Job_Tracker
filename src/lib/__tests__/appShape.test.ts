import { describe, it, expect } from "vitest";
import { sanitizeDraft } from "@/lib/appShape";

describe("sanitizeDraft — link scheme (stored XSS guard)", () => {
  it("drops javascript: links", () => {
    expect(sanitizeDraft({ company: "A", role: "R", link: "javascript:alert(1)" }).link).toBe("");
  });
  it("drops data: links", () => {
    expect(sanitizeDraft({ company: "A", role: "R", link: "data:text/html,<script>" }).link).toBe("");
  });
  it("drops relative / mailto links", () => {
    expect(sanitizeDraft({ company: "A", role: "R", link: "/foo" }).link).toBe("");
    expect(sanitizeDraft({ company: "A", role: "R", link: "mailto:x@y.z" }).link).toBe("");
  });
  it("keeps http and https links", () => {
    expect(sanitizeDraft({ company: "A", role: "R", link: "https://x.co/1" }).link).toBe("https://x.co/1");
    expect(sanitizeDraft({ company: "A", role: "R", link: "HTTP://x.co" }).link).toBe("HTTP://x.co");
  });
});

describe("sanitizeDraft — length caps", () => {
  it("caps notes at 5000 and company at 200", () => {
    const d = sanitizeDraft({ company: "c".repeat(500), role: "R", notes: "n".repeat(9000) });
    expect(d.company.length).toBe(200);
    expect(d.notes.length).toBe(5000);
  });
  it("caps link at 2000", () => {
    const long = "https://x.co/" + "a".repeat(5000);
    expect(sanitizeDraft({ company: "A", role: "R", link: long }).link.length).toBe(2000);
  });
});

describe("sanitizeDraft — coercion", () => {
  it("coerces unknown status to 'applied'", () => {
    expect(sanitizeDraft({ company: "A", role: "R", status: "hired" }).status).toBe("applied");
  });
  it("keeps a valid status", () => {
    expect(sanitizeDraft({ company: "A", role: "R", status: "interview" }).status).toBe("interview");
  });
  it("coerces referral to boolean", () => {
    expect(sanitizeDraft({ company: "A", role: "R", referral: "yes" }).referral).toBe(true);
    expect(sanitizeDraft({ company: "A", role: "R" }).referral).toBe(false);
  });
  it("handles null/undefined body", () => {
    const d = sanitizeDraft(null);
    expect(d.company).toBe("");
    expect(d.status).toBe("applied");
  });
});
