import { describe, expect, it } from "vitest";
import { buildChatGptJournalDocument, parseChatGptJournalReply } from "../src/lib/chatgpt-journal";

describe("buildChatGptJournalDocument", () => {
  it("includes url and body", () => {
    const d = buildChatGptJournalDocument({
      pageUrl: "https://example.com/a",
      tabTitle: "T",
      visibleText: "Hello world",
    });
    expect(d).toContain("https://example.com/a");
    expect(d).toContain("Hello world");
    expect(d).toContain("TITLE:");
    expect(d).toContain("DESCRIPTION:");
    expect(d).toContain("cannot open or fetch");
  });
});

describe("parseChatGptJournalReply", () => {
  it("parses standard reply", () => {
    const r = parseChatGptJournalReply(`TITLE: My doc title
DESCRIPTION: First sentence. Second sentence.`);
    expect(r).toEqual({
      summary_title: "My doc title",
      description: "First sentence. Second sentence.",
    });
  });

  it("returns null for garbage", () => {
    expect(parseChatGptJournalReply("no structure")).toBeNull();
  });
});
