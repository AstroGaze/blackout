# 13: Blur-all-thumbnails switch

**What to build:** An optional switch, off by default, that blurs every YouTube thumbnail while on, as a stopgap for image-only spoilers around a launch.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [x] Switch available in the popup and settings, off by default
- [x] When on, all YouTube thumbnails (feed, search, Shorts, recommendations) are blurred from first paint
- [x] Hovering or clicking a thumbnail does not unblur it without confirmation
- [x] Turning it off un-blurs thumbnails on open pages without a reload

## Comments

Implemented: the blur-all-thumbnails switch, following the "Blackout UI" canvas's popup artboard (Main): a row under a divider, "Blur all YouTube thumbnails" / "Turn on for launch week". The canvas's settings sidebar lists a Display section but has no artboard for it, so settings got a Display section (`#display`) with the same switch in a card.

**What gets blurred:** each site adapter lists its thumbnails (`thumbnails` in `SiteAdapter`). On YouTube that is:
- **Tiles:** feed, search, recommendation and Shorts tiles, playlist thumbnails, and notification thumbnails.
- **Chapters:** the frames from a search result's chapters.
- **Watch cards:** the big picture on a watch card beside search results.
- **Player stills:** the player's still before it plays, the end screen and end cards, the autoplay "Up next" picture, and what the Shorts player shows while the next Short loads.
- **Videos nobody chose to play:** the video a hovered tile previews, and the video a channel's home page plays by itself. For that trailer only the `<video>` is blurred, because its end screen holds items whose covers must stay readable.

**How:**
- **Its own stylesheet:** the page guard puts the blur in a stylesheet of its own, 24px like a cover's and clipped to each thumbnail's box. It's in place from `document_start`, and it's emptied once the protection state says the switch is off. So thumbnails are blurred before the setting has been read, and stay blurred if it can't be read.
- **Live:** open pages follow the switch at once through the protection-state watch.
- **No per-thumbnail reveal:** nothing on the page unblurs a thumbnail. Hovering or clicking leaves it blurred; clicking still opens the video. Turning the switch off is the way back.
- **Covers stay readable:** a hover preview can carry a cover, so only the preview's video and images are blurred, never the preview itself.

**Left sharp on purpose:**
- **Shorts player:** the video the Shorts player is playing is the content being watched, not a thumbnail.
- **Watch page:** the same goes for the watch page's own video.
- **Channel art:** banners and avatars aren't thumbnails.

**Checked in headless Brave** with the GTA 6 preset:
- **Defaults:** the popup switch was off by default, and clicking it stored `blurAllThumbnails: true`.
- **Pages:** on a "gta 6 trailer" search, all 35 thumbnails were blurred. A watch page's 23 were too.
- **First paint:** a script checking every animation frame of each fresh load never saw a visible thumbnail without blur.
- **Hover:** hovering a clean result played its preview blurred.
- **Switching off:** switching off in the popup un-blurred every thumbnail on the open results page, with no reload.
- **Sweep:** a check for any large sharp picture on search, a channel's home and videos tabs, a playlist and Shorts found only what's listed above.

**Test note:** happy-dom caches computed styles and misses an attribute change on `<html>`, which is one more reason the switch empties a stylesheet rather than toggling a root attribute.

**From the two-axis review:**
- **Gaps fixed:** chapter frames, the "Up next" picture, and the channel trailer, which first blurred its whole player and so its end-screen covers too.
- **Accepted:** a blurred `ytd-thumbnail` also blurs its duration badge and its hover buttons (Watch later, Add to queue). They still work, but can't be read.
- **Open decision:** swiping in the Shorts feed autoplays the next Short with its video sharp. Its text is still checked and covered like any item.
- **Open decision:** "without confirmation" allows a confirm-to-reveal for one thumbnail, but doesn't require one, so none was built.

**Not checked:** the logged-out home feed is empty in a fresh profile, so home-feed thumbnails are covered by the page-seam tests on the saved snapshot only.
