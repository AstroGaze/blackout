# 11: Blocked Sources on YouTube

**What to build:** The user can block a YouTube channel so everything it posts is hidden whatever its title says, from a "Block this source" option on any video or comment, and manage the list in settings. Blocked Sources apply whichever topics are active.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [x] "Block this source" is available on video tiles, Shorts and comments, including on Hidden Items
- [x] Content from a Blocked Source is hidden with a "Blocked Source" label
- [x] Settings list Blocked Sources (site + account) and allow unblocking
- [x] Blocked Sources apply whenever at least one topic is active
- [x] Page-seam tests cover a blocked channel's tiles and comments

## Comments

Implemented: Blocked Sources on YouTube, following the "Blackout UI" canvas's HiddenItem artboard.

**Blocking:**
- **From a cover:** a tile or Short covered for a topic offers **Block source** next to Reveal, and so does a watch page covered for a topic.
- **From the right-click menu:** **Block this channel** works anywhere on youtube.com, on uncovered items too: tiles, the Shorts player, comments, a channel's name under a video, and covered items as well. The page reports the channel of what was right-clicked (`src/guard/source-under-pointer.ts`). The background stores it.
- **Where changes are stored:** pages ask the background to block or unblock, so every change goes through the lock the extension's own pages share. Content scripts run with youtube.com's own locks, not the extension's.

**Hiding:**
- **Covers:** content from a Blocked Source gets a cover labelled **Blocked Source** with the channel's name, plus **Reveal** and **Unblock**. A comment's cover reads "Hidden · Blocked Source" with Reveal.
- **Watch pages:** a watch page from a Blocked Source gets the full-page cover, "This page comes from a Blocked Source · Rockstar Games", with Go back, Unblock and Continue to page.
- **Precedence:** when an item is from a Blocked Source and also matches a topic, the Blocked Source label wins, since unblocking is the action that applies.
- **When they apply:** Blocked Sources apply while at least one topic is active. Paused and switched-off topics don't count.
- **Fail-closed:** reading an item's channel during a check fails closed. A malformed link is skipped, and any other error keeps the item hidden.

**Settings → Blocked Sources:** lists each source with its name, account and site, and an Unblock button.

**Identity:**
- A channel is its handle in lowercase (`@rockstargames`), or its channel id when it has no handle. It's taken from the item's first channel link.
- A watch page's description is credited to the video's own channel, not the game or other channels it links to.

**Checked in headless Brave** on a live search for "gta 6 trailer", with the GTA 6 preset:
- "Block source" on a covered Rockstar Games tile stored `{site: 'youtube', account: '@rockstargames', name: 'Rockstar Games'}`.
- All of the channel's results turned "Blocked Source".
- Settings listed it, and Unblock there turned them back to "GTA 6" at once.
- A Rockstar watch page showed the Blocked Source page cover.
- The right-click menu itself can't be clicked in headless Brave. Page-seam tests cover it by dispatching `contextmenu` and running the background handler.

**Known limits:**
- **Shorts in shelves, live chat and notifications** carry no channel link, so they can't be blocked by channel, and a blocked channel's Shorts in a shelf stay visible. The Shorts player works.
- **One channel can appear under two ids.** A handle and a `/channel/UC…` id for the same channel don't match each other. Every surface checked links handles, so this is rare. Ticket 12's per-source counts share the limit.
- **YouTube's player** replaces the browser's right-click menu with its own, so block a video's channel from its name under the video, or from the page cover.
- **No feedback from the menu.** The menu entry shows everywhere on youtube.com and does nothing when what was right-clicked has no channel. A successful block shows itself by the items turning "Blocked Source".
- **Labels:** the spec's "Block this source" is labelled "Block source" on covers, as in the design, and "Block this channel" in YouTube's right-click menu.
