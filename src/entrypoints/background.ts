import { BLOCK_MENU_ENTRIES, blockSourceUnderPointer, listenForSourceRequests } from '@/protection/blocked-sources';
import { listenForHiddenItems } from '@/protection/suggested-blocks';
import { startBackgroundRefresh } from '@/refresh/schedule';

export default defineBackground(() => {
  startBackgroundRefresh();
  listenForSourceRequests();
  listenForHiddenItems();

  // "Block this channel" on any YouTube video, Short or comment; "Block this
  // subreddit" and "Block this user" on any Reddit post or comment.
  browser.runtime.onInstalled.addListener(async () => {
    await browser.contextMenus.removeAll();
    for (const entry of BLOCK_MENU_ENTRIES) {
      browser.contextMenus.create({
        id: entry.id,
        title: entry.title,
        contexts: ['page', 'link', 'image', 'video', 'selection'],
        documentUrlPatterns: [...entry.sites],
      });
    }
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    const entry = BLOCK_MENU_ENTRIES.find((candidate) => candidate.id === info.menuItemId);
    if (entry && tab?.id !== undefined) void blockSourceUnderPointer(tab.id, info.frameId ?? 0, entry.accountPrefix);
  });
});
