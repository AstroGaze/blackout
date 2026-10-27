import { startPageGuard } from '@/guard/page-guard';
import { youtube } from '@/sites/youtube/adapter';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  // Live chat runs in its own frame inside the watch page.
  allFrames: true,
  runAt: 'document_start',
  main() {
    startPageGuard(youtube);
  },
});
