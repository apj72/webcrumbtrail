import { describe, expect, it } from "vitest";
import { shouldCountNewVisit } from "../src/lib/dedupe";

describe("shouldCountNewVisit", () => {
  it("counts first visit", () => {
    expect(shouldCountNewVisit(undefined, 1000, 5)).toBe(true);
  });

  it("skips within window", () => {
    expect(shouldCountNewVisit(1000, 1000 + 60_000, 5)).toBe(false);
  });

  it("counts after window", () => {
    expect(shouldCountNewVisit(1000, 1000 + 5 * 60_000, 5)).toBe(true);
  });

  it("zero minutes forces every event to count", () => {
    expect(shouldCountNewVisit(1000, 1001, 0)).toBe(true);
  });
});
