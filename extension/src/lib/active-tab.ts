/**
 * Active tab in the most recently focused *normal* browser window (not extension popups).
 * Call this from the action popup so we do not accidentally use the popup’s own * chrome-extension:// context when querying “current” tab.
 */
export async function getActiveTabInLastFocusedNormalWindow(): Promise<chrome.tabs.Tab | undefined> {
  try {
    const w = await chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal"] });
    return w.tabs?.find((t) => t.active);
  } catch {
    return undefined;
  }
}
