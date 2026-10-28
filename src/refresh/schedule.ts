// When Related Terms are refreshed: for each new topic, every day for each topic
// not switched off, and when the user asks with "Refresh now".

import { browser } from 'wxt/browser';
import { protectionState } from '@/protection/state';
import { refreshTopic, watchForNewTopics } from './refresh';

export const DAILY_REFRESH_ALARM = 'daily-refresh';

const DAY_MINUTES = 24 * 60;

/** A topic refreshed well this recently, such as one just added, waits for the next day. */
const RECENT_MS = 20 * 60 * 60 * 1000;

interface RefreshRequest {
  type: 'refresh-topic';
  topicId: string;
}

function isRefreshRequest(message: unknown): message is RefreshRequest {
  const request = message as Partial<RefreshRequest> | null;
  return request?.type === 'refresh-topic' && typeof request.topicId === 'string';
}

/** Asks the background to refresh the topic now, from the settings page or the popup. */
export async function requestRefresh(topicId: string): Promise<void> {
  const request: RefreshRequest = { type: 'refresh-topic', topicId };
  await browser.runtime.sendMessage(request);
}

/**
 * Starts refreshing in the background: new topics, the daily refresh and
 * "Refresh now" requests. Returns a function that stops it.
 */
export function startBackgroundRefresh(): () => void {
  const stopWatching = watchForNewTopics();
  const onAlarm = (alarm: { name: string }) => {
    if (alarm.name === DAILY_REFRESH_ALARM) void refreshDueTopics();
  };
  const onMessage = (message: unknown) => {
    if (isRefreshRequest(message)) void refreshTopic(message.topicId);
  };
  browser.alarms.onAlarm.addListener(onAlarm);
  browser.runtime.onMessage.addListener(onMessage);
  void scheduleDailyRefresh();
  return () => {
    stopWatching();
    browser.alarms.onAlarm.removeListener(onAlarm);
    browser.runtime.onMessage.removeListener(onMessage);
  };
}

/** Sets the daily alarm once; the browser keeps it, and fires a missed one at startup. */
async function scheduleDailyRefresh(): Promise<void> {
  if (await browser.alarms.get(DAILY_REFRESH_ALARM)) return;
  await browser.alarms.create(DAILY_REFRESH_ALARM, { delayInMinutes: 1, periodInMinutes: DAY_MINUTES });
}

/**
 * Refreshes each topic that isn't switched off, paused ones too, one after
 * another so the sources aren't asked too much at once. A topic whose last
 * refresh failed is tried again.
 */
async function refreshDueTopics(now = Date.now()): Promise<void> {
  const { topics } = await protectionState.getValue();
  for (const topic of topics) {
    if (topic.enabled === false) continue;
    if (topic.lastRefresh?.ok && now - topic.lastRefresh.at < RECENT_MS) continue;
    await refreshTopic(topic.id);
  }
}
