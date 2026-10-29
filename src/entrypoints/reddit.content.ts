import { startPageGuard } from '@/guard/page-guard';
import { reddit } from '@/sites/reddit/adapter';

export default defineContentScript({
  matches: ['*://www.reddit.com/*'],
  runAt: 'document_start',
  main() {
    startPageGuard(reddit);
  },
});
