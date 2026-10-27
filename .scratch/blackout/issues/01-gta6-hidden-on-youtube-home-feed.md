# 01: GTA 6 hidden on the YouTube home feed

**What to build:** The tracer bullet. Blackout loads unpacked in Brave with the ready-made GTA 6 Protected Topic. On the YouTube home feed, any video tile whose text contains one of its Strong Terms is hidden before it appears, blurred with a label naming the topic, and only revealed after the user confirms. Tiles that pass the check appear normally; anything whose check fails stays hidden. This ticket also establishes the page-seam test harness (saved real-page snapshot + simulated DOM + protection state → assert Hidden Items).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] WXT + TypeScript project builds a Manifest V3 extension that loads unpacked in Brave
- [x] React, Tailwind CSS and shadcn/ui (neutral theme, Geist font) are set up; the Hidden Item cover is built from shadcn/ui pieces and rendered inside a Shadow DOM so site styles can't affect it
- [x] Protection state exists in extension local storage and is seeded with the GTA 6 preset (Strong: GTA 6, GTA VI, Grand Theft Auto VI, #GTA6, Leonida; Weak: Jason, Lucia, Vice City; levels per spec; r/GTA6 and the GTA Fandom wiki as sources)
- [x] Matching ignores case, accents and repeated whitespace/punctuation, respects word boundaries, and treats spacing and hashtag variants as equal ("GTA 6" = "GTA6" = "#GTA6")
- [x] Home-feed video tiles are hidden from first paint and only un-hidden after passing the check
- [x] Matched tiles show a blur with a label naming the Protected Topic, and a reveal that requires confirmation; revealing lasts for that page view only
- [x] An error during checking leaves the item hidden (fail-closed)
- [x] Page-seam tests run against a saved YouTube home-feed snapshot and assert which tiles are Hidden Items and why

## Comments

Implemented. Open questions from review, not addressed here:

- The home-feed filter chips ("Grand Theft Auto VI", "Anticipating GTA 6") are not items, so they still show. No ticket covers them yet.
- A reveal lives as long as the tile element. YouTube keeps home-feed elements across in-app navigation, so home → watch → home keeps a revealed tile revealed. Decide whether in-app navigation counts as a new page view.
- Jason, Lucia and Vice City are seeded at the Common knowledge Spoiler Level; the spec only states the level for the Strong preset terms.
- Fail-closed is tested through a broken protection state; a per-item check error has no page-seam trigger yet.
- The `ytd-rich-item-renderer` selector also covers the home-feed Shorts shelf and other rich-grid feeds (subscriptions, channel pages), ahead of ticket 03's per-surface tests.
