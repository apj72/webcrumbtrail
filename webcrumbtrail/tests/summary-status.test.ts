import { describe, expect, it } from "vitest";
import type { PageRecord, SummaryStatus } from "../src/shared/types";

/**
 * Mirrors the decision in the service worker for whether to run a new summary.
 */
function shouldRunSummaryRequest(
  page: Pick<PageRecord, "summary_status" | "latest_summary">,
  refresh: boolean,
): { ok: boolean; reason?: string } {
  if (!refresh && page.summary_status === "completed" && page.latest_summary) {
    return { ok: false, reason: "exists" };
  }
  return { ok: true };
}

function nextStatusAfterRequest(): SummaryStatus {
  return "queued";
}

describe("summary status transitions", () => {
  it("blocks duplicate request when completed", () => {
    const r = shouldRunSummaryRequest(
      { summary_status: "completed", latest_summary: "x" },
      false,
    );
    expect(r.ok).toBe(false);
  });

  it("allows refresh when completed", () => {
    const r = shouldRunSummaryRequest(
      { summary_status: "completed", latest_summary: "x" },
      true,
    );
    expect(r.ok).toBe(true);
  });

  it("allows first request when not_requested", () => {
    const r = shouldRunSummaryRequest({ summary_status: "not_requested", latest_summary: null }, false);
    expect(r.ok).toBe(true);
  });

  it("allows retry when failed", () => {
    const r = shouldRunSummaryRequest({ summary_status: "failed", latest_summary: null }, false);
    expect(r.ok).toBe(true);
  });

  it("request sets queued", () => {
    expect(nextStatusAfterRequest()).toBe("queued");
  });
});
