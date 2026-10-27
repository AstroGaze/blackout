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

- Snapshots are real logged-out pages, except `fixtures/notifications.html`. It is hand-written because notifications need a signed-in account. Replace it with a saved snapshot when one is available.
- Small items (suggestions, comments, chat, notifications) get a one-row cover; tiles and results keep the card cover.
- When items nest (a Shorts lockup inside a home-feed tile), only the outer one is checked and covered.
- The content script now runs in all YouTube frames so it reaches live chat. That includes YouTube embeds on other sites.
- Known gap: a covered or still-unchecked Short keeps playing its sound. Spoken spoilers can get through until it is paused. Not addressed here.
- The video's own title and description on a watch page are left for ticket 04 (full-page cover).
