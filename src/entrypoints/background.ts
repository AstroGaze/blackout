import { BLOCK_MENU_ID, blockSourceUnderPointer, listenForSourceRequests } from '@/protection/blocked-sources';
import { listenForHiddenItems } from '@/protection/suggested-blocks';
import { startBackgroundRefresh } from '@/refresh/schedule';

export default defineBackground(() => {
  startBackgroundRefresh();
  listenForSourceRequests();
  listenForHiddenItems();

  // "Block this channel" on any YouTube video, Short or comment.
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: BLOCK_MENU_ID,
      title: 'Block this channel',
      contexts: ['page', 'link', 'image', 'video', 'selection'],
      documentUrlPatterns: ['*://www.youtube.com/*'],
    });
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === BLOCK_MENU_ID && tab?.id !== undefined) {
      void blockSourceUnderPointer(tab.id, info.frameId ?? 0);
    }
  });
});
