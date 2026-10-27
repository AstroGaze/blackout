# 04: Full-page cover for YouTube pages about a topic

**What to build:** Opening a page that is itself about a Protected Topic (for example a GTA 6 video link from a friend) covers the whole page and masks the tab title, with a confirm to continue. On such a page, Weak Terms count because the context is about the topic.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [x] A watch page whose title or channel matches a topic is fully covered before anything shows
- [x] The tab title is masked while covered
- [x] Confirming continues to the page; the cover names the topic
- [x] On a covered-then-continued page, comments with only a Weak Term are still hidden (topic context)
- [x] Navigating between videos inside YouTube (no full reload) re-evaluates the cover
- [x] Page-seam tests for a matching and a non-matching watch page

## Comments

Implemented. Checked in headless Brave against live YouTube:
- A fresh GTA 6 video load showed the full-page cover, a masked tab title and a paused video.
- Continue restored the title and resumed the video, and the "Jason" comments stayed covered.
- Navigating inside YouTube to Red Dead Redemption 2 showed it normally. Navigating back to a GTA 6 video went hidden, then covered; the real title never showed (sampled every 500 ms).

Notes:
- **What the page is about.** It's the watch page's title and channel, read only from metadata marked with the current video's id. The previous video's details are not trusted while YouTube is still swapping them.
- **Before the check.** Until it runs, the page is blank and the tab title reads "Hidden by Blackout". If the video's details don't appear within 8 s, or the check fails, a "couldn't check this page" cover appears with the same confirm to continue.
- **Videos.** Nothing hidden or covered may play, which includes covered Shorts (ticket 03's sound gap). Videos Blackout paused play again once their page or item is shown.
- **Description.** The watch page's own description is now checked as an item.
- **Go back.** It falls back to the YouTube home page when there's no history, such as a link opened in a new tab.
- **Chat context.** Live chat in a watch page counts what the page is about. Blackout in each frame shares its page topic on its window in the extension's isolated world, where Blackout in same-origin child frames can read it but YouTube's scripts can't. Verified on a live GTA 6 stream: a chat message with only "Jason" is covered.
- **Open: pop-out chat.** It has no parent page to inherit from, so Weak Terms alone still show there.
- **Open: title flash.** YouTube can set the real tab title a moment before Blackout masks it again in the same microtask checkpoint. A main-world observer saw it, but the sampled checks never did. The tab strip might flash it.
