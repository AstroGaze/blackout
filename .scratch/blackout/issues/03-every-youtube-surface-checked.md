# 03: Every YouTube surface checked

**What to build:** Protection extends from the home feed to every place a YouTube spoiler can reach the user, all hide-first and with the same cover.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] Search results and search suggestions
- [x] Shorts (shelf and Shorts player)
- [x] Comments and replies
- [x] Live chat messages
- [x] Notifications
- [x] Video descriptions and channel names count as part of an item's text
- [x] Recommendations beside a watch page
- [x] Page-seam tests with a saved snapshot for each surface

## Comments

Implemented. Checked in headless Brave against live YouTube: search results, the Shorts shelf, search suggestions, comments, recommendations, the player end screen, the Shorts player and live chat (in-page and pop-out).

- Snapshots are real pages: logged out for search, watch, Shorts and live chat; `fixtures/notifications.html` is the notifications menu saved from a signed-in session, with images, styles and link parameters stripped.
- Small items (suggestions, comments, chat, notifications) get a one-row cover; tiles and results keep the card cover.
- When items nest (a Shorts lockup inside a home-feed tile), only the outer one is checked and covered.
- The content script now runs in all YouTube frames so it reaches live chat. That includes YouTube embeds on other sites.
- Known gap: a covered or still-unchecked Short keeps playing its sound. Spoken spoilers can get through until it is paused. Not addressed here.
- The video's own title and description on a watch page are left for ticket 04 (full-page cover).
- Follow-up fixes (on the ticket 04 branch):
  - **Hover preview.** YouTube's hover preview player is now a mirrored item: it stays covered while the tile or Short it shows is.
  - **Presses on the cover.** Presses on a cover never reach YouTube, so a covered search suggestion can't run its search.
  - **Arrow keys.** They step past covered suggestions, so the search box never ends up showing one. Within a single press, YouTube still sets the box to a covered suggestion for an instant while Blackout steps past it; nothing is drawn in between.
