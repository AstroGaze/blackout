import { watchForNewTopics } from '@/refresh/refresh';

export default defineBackground(() => {
  watchForNewTopics();
});
