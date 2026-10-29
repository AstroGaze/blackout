import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { renderPage, settle } from '@/test/page';
import { youtube } from './adapter';
import liveChat from './fixtures/live-chat.html?raw';
import gtaWatchPage from './fixtures/watch.html?raw';
import otherWatchPage from './fixtures/watch-other.html?raw';
import { viewItem } from './fixtures/view';

const GTA_VIDEO = 'VQRLujxTm3c'; // "Grand Theft Auto VI Trailer 2"
const OTHER_VIDEO = 'gmA6MrX81z4'; // "Red Dead Redemption 2 Trailer"
const MESSAGE = 'yt-live-chat-text-message-renderer';

/** The browser's own window type; `Window` here is happy-dom's class. */
type BrowserWindow = globalThis.Window & typeof globalThis;

let watchWindow: Window;
let guards: PageGuard[] = [];

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(async () => {
  for (const guard of guards) guard.stop();
  guards = [];
  await watchWindow.happyDOM.close();
});

/**
 * Opens a watch page with its live chat in a frame, each with its own guard,
 * as the content script runs in every frame.
 */
async function openWatchPageWithChat(videoId: string, html: string) {
  watchWindow = new Window({
    url: `https://www.youtube.com/watch?v=${videoId}`,
    settings: { enableIframePageLoading: true },
  });
  const watchDocument = watchWindow.document as unknown as Document;
  guards.push(startPageGuard(youtube, watchWindow as unknown as BrowserWindow));
  renderPage(html, watchDocument);
  await settle(watchDocument);

  const frame = watchDocument.createElement('iframe');
  watchDocument.body.append(frame);
  await settle(watchDocument);
  const chatWindow = frame.contentWindow as unknown as BrowserWindow;
  guards.push(startPageGuard(youtube, chatWindow));
  renderPage(liveChat, chatWindow.document);
  await settle(watchDocument, chatWindow.document);
  return { watchDocument, chatDocument: chatWindow.document };
}

/** Adds a chat message the way live chat does as it arrives. */
async function postMessage(chatDocument: Document, text: string) {
  const template = chatDocument.querySelector(MESSAGE)!;
  const message = template.cloneNode(true) as Element;
  message.querySelector('#message')!.textContent = text;
  template.parentElement!.append(message);
  await settle(chatDocument);
  return message;
}

describe('YouTube live chat inside a watch page', () => {
  it('hides a message with only a Weak Term when the page is about GTA 6', async () => {
    const { chatDocument } = await openWatchPageWithChat(GTA_VIDEO, gtaWatchPage);

    const message = await postMessage(chatDocument, 'Jason is so cool');

    expect(viewItem(message)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('shows a message with only a Weak Term when the page is not about GTA 6', async () => {
    const { chatDocument } = await openWatchPageWithChat(OTHER_VIDEO, otherWatchPage);

    const message = await postMessage(chatDocument, 'Jason is so cool');

    expect(viewItem(message)).toMatchObject({ state: 'shown' });
  });

  it('checks the chat again when the page navigates to a video not about GTA 6', async () => {
    const { watchDocument, chatDocument } = await openWatchPageWithChat(GTA_VIDEO, gtaWatchPage);
    const message = await postMessage(chatDocument, 'Jason is so cool');

    watchWindow.history.pushState(null, '', `/watch?v=${OTHER_VIDEO}`);
    const metadata = watchDocument.querySelector('ytd-watch-metadata')!;
    metadata.querySelector('#title h1')!.textContent = 'Red Dead Redemption 2 Trailer';
    metadata.setAttribute('video-id', OTHER_VIDEO);
    await settle(watchDocument, chatDocument);

    expect(viewItem(message)).toMatchObject({ state: 'shown' });
  });
});
