import { startPageGuard } from '@/guard/page-guard';
import { youtube } from '@/sites/youtube/adapter';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  runAt: 'document_start',
  main() {
    startPageGuard(youtube);
  },
});
