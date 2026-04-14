import { describe, expect, it } from "vitest";
import { googleWorkspaceDocumentRollupKey } from "../src/lib/google-workspace-url";

describe("googleWorkspaceDocumentRollupKey", () => {
  it("matches across account segment and mode", () => {
    const id = "1abcDEFghiJKL";
    const k1 = googleWorkspaceDocumentRollupKey(
      `https://docs.google.com/document/u/0/d/${id}/preview?tab=t.0`,
    );
    const k2 = googleWorkspaceDocumentRollupKey(`https://docs.google.com/document/d/${id}/mobilebasic`);
    expect(k1).toBe(`document:${id}`);
    expect(k2).toBe(`document:${id}`);
  });

  it("returns null for other hosts", () => {
    expect(googleWorkspaceDocumentRollupKey("https://example.com/doc")).toBeNull();
  });
});
