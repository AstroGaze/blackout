import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { renderPage, settle } from '@/test/page';
import { youtube } from './adapter';
import liveChat from './fixtures/live-chat.html?raw';
import { viewItem, viewItems } from './fixtures/view';

const MESSAGE = 'yt-live-chat-text-message-renderer';

let guard: PageGuard | undefined;

beforeEach(async () => {
  fakeBrowser.reset();
  guard = startPageGuard(youtube);
  // The live chat of a GTA stream, as loaded in its own frame.
  renderPage(liveChat);
  await settle();
});

afterEach(() => guard?.stop());

describe('YouTube live chat with the ready-made GTA 6 topic', () => {
  it('covers the messages that name GTA 6 and shows the rest', () => {
    const views = viewItems(MESSAGE);
    expect(views.filter((view) => view.state === 'covered')).toEqual([
      { title: 'I have no gaming pc Im not play gta 6', state: 'covered', reason: 'GTA 6' },
      { title: 'W GTA 6', state: 'covered', reason: 'GTA 6' },
    ]);
    expect(views.filter((view) => view.state === 'shown')).toHaveLength(73);
  });

  it('covers a pinned message about GTA 6', async () => {
    const pinned = document.createElement('yt-live-chat-banner-renderer');
    const message = document.querySelector(MESSAGE)!.cloneNode(true) as Element;
    message.querySelector('#message')!.textContent = 'Pinned: Leonida map leaked, link below';
    pinned.append(message);
    document.querySelector('yt-live-chat-renderer')!.append(pinned);
    await settle();

    expect(viewItem(pinned)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('checks new messages as they arrive', async () => {
    const list = document.querySelector(MESSAGE)!.parentElement!;
    const template = document.querySelector(MESSAGE)!;
    const message = (text: string) => {
      const copy = template.cloneNode(true) as Element;
      copy.querySelector('#message')!.textContent = text;
      return copy;
    };
    list.append(message('LEONIDA ENDING IS CRAZY'), message('hi chat'));
    await settle();

    expect(viewItems(MESSAGE).slice(-2)).toEqual([
      { title: 'LEONIDA ENDING IS CRAZY', state: 'covered', reason: 'GTA 6' },
      { title: 'hi chat', state: 'shown' },
    ]);
  });
});
