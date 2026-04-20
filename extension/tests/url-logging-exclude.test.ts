import { describe, expect, it } from "vitest";
import { shouldSkipLoggingForUrl } from "../src/lib/url-logging-exclude";

describe("shouldSkipLoggingForUrl", () => {
  const primer = "https://access.redhat.com/services/primer/session/scribe/?redirectTo=";

  it("skips when URL starts with a listed prefix", () => {
    expect(
      shouldSkipLoggingForUrl(
        `${primer}https%3A%2F%2Faccess.redhat.com%2F`,
        [primer],
      ),
    ).toBe(true);
  });

  it("does not skip when no prefix matches", () => {
    expect(shouldSkipLoggingForUrl("https://access.redhat.com/documentation/", [primer])).toBe(false);
  });

  it("ignores blank prefix entries", () => {
    expect(shouldSkipLoggingForUrl("https://example.com/", ["", "   ", primer])).toBe(false);
    expect(shouldSkipLoggingForUrl(`${primer}x`, ["", primer])).toBe(true);
  });
});
