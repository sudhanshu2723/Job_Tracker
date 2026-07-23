import { describe, it, expect } from "vitest";
import { pageNumbers } from "@/components/Pager";

describe("pageNumbers", () => {
  it("lists every page when there is no gap", () => {
    expect(pageNumbers(2, 3)).toEqual([1, 2, 3]);
  });
  it("inserts ellipses around the current page in a long range", () => {
    expect(pageNumbers(5, 20)).toEqual([1, "…", 4, 5, 6, "…", 20]);
  });
  it("has no leading ellipsis near the start", () => {
    expect(pageNumbers(1, 20)).toEqual([1, 2, "…", 20]);
  });
  it("has no trailing ellipsis near the end", () => {
    expect(pageNumbers(20, 20)).toEqual([1, "…", 19, 20]);
  });
  it("handles a single page", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
  });
});
