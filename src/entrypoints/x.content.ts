import { startPageGuard } from '@/guard/page-guard';
import { x } from '@/sites/x/adapter';

export default defineContentScript({
  // twitter.com only redirects here.
  matches: ['*://x.com/*'],
  runAt: 'document_start',
  main() {
    startPageGuard(x);
  },
});
