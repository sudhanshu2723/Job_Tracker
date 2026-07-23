import { describe, it, expect } from "vitest";
import { isMnc, MNC_COMPANIES } from "@/lib/mncs";

describe("isMnc", () => {
  it("matches curated MNCs across naming variations", () => {
    for (const c of [
      "Google", "Google LLC", "Amazon", "Amazon Web Services", "AWS",
      "Microsoft Corporation", "Meta Platforms", "Facebook", "Adobe Inc.",
      "NVIDIA", "Goldman Sachs", "JPMorgan Chase", "JP Morgan", "American Express",
      "D. E. Shaw & Co", "Palo Alto Networks", "ServiceNow", "Walmart Global Tech",
      "Flipkart Internet Pvt Ltd", "Uber India", "MongoDB, Inc.",
    ]) {
      expect(isMnc(c), c).toBe(true);
    }
  });

  it("rejects small / unknown companies", () => {
    for (const c of [
      "Acme Startup", "TechNova Solutions", "Zenith Labs", "CloudKart India",
      "Metabase", "Sapient Global", "", "Freshworks Local",
      "Meta Digital Solutions Pvt Ltd", "Deep.Meta", // must NOT match Meta/Facebook
    ]) {
      expect(isMnc(c), c).toBe(false);
    }
  });

  it("has exactly 50 curated companies", () => {
    expect(MNC_COMPANIES.length).toBe(50);
  });

  it("handles null/undefined", () => {
    expect(isMnc(null)).toBe(false);
    expect(isMnc(undefined)).toBe(false);
  });
});
