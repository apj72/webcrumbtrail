/** Document to paste into ChatGPT (web) for a manual journal entry. */
export function buildChatGptJournalDocument(args: {
  pageUrl: string;
  tabTitle: string;
  visibleText: string;
}): string {
  const body = args.visibleText.slice(0, 100_000);
  return `You are helping me with a personal reading journal (WebCrumbTrail). Using ONLY the page information below, reply with EXACTLY this format (two labelled lines, then a blank line):

TITLE: <short descriptive title, max ~100 characters>
DESCRIPTION: <one or two sentences stating what this page covers and why it might matter for my work>

Important: You cannot open or fetch the URL below—it may be internal, VPN-only, or behind a firewall. The substantive content is everything under "Page content"; that text was copied from my browser after I loaded the page.

---
URL (for my reference only): ${args.pageUrl}
Browser tab title: ${args.tabTitle}
---

Page content (copied from my browser; may be truncated):
${body}`;
}

/** Parse ChatGPT reply when it follows TITLE: / DESCRIPTION: format. */
export function parseChatGptJournalReply(text: string): { summary_title: string; description: string } | null {
  const t = text.trim();
  const titleM = t.match(/^TITLE:\s*(.+)$/im);
  const descM = t.match(/^DESCRIPTION:\s*([\s\S]+)$/im);
  if (titleM && descM) {
    const summary_title = titleM[1].trim();
    const description = descM[1].trim().replace(/\s+/g, " ");
    if (summary_title && description) return { summary_title, description };
  }
  return null;
}
