import { startBackgroundRefresh } from '@/refresh/schedule';

export default defineBackground(() => {
  startBackgroundRefresh();
});
