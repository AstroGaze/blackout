# 01: GTA 6 hidden on the YouTube home feed

**What to build:** The tracer bullet. Blackout loads unpacked in Brave with the ready-made GTA 6 Protected Topic. On the YouTube home feed, any video tile whose text contains one of its Strong Terms is hidden before it appears, blurred with a label naming the topic, and only revealed after the user confirms. Tiles that pass the check appear normally; anything whose check fails stays hidden. This ticket also establishes the page-seam test harness (saved real-page snapshot + simulated DOM + protection state → assert Hidden Items).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] WXT + TypeScript project builds a Manifest V3 extension that loads unpacked in Brave
- [ ] React, Tailwind CSS and shadcn/ui (neutral theme, Geist font) are set up; the Hidden Item cover is built from shadcn/ui pieces and rendered inside a Shadow DOM so site styles can't affect it
- [ ] Protection state exists in extension local storage and is seeded with the GTA 6 preset (Strong: GTA 6, GTA VI, Grand Theft Auto VI, #GTA6, Leonida; Weak: Jason, Lucia, Vice City; levels per spec; r/GTA6 and the GTA Fandom wiki as sources)
- [ ] Matching ignores case, accents and repeated whitespace/punctuation, respects word boundaries, and treats spacing and hashtag variants as equal ("GTA 6" = "GTA6" = "#GTA6")
- [ ] Home-feed video tiles are hidden from first paint and only un-hidden after passing the check
- [ ] Matched tiles show a blur with a label naming the Protected Topic, and a reveal that requires confirmation; revealing lasts for that page view only
- [ ] An error during checking leaves the item hidden (fail-closed)
- [ ] Page-seam tests run against a saved YouTube home-feed snapshot and assert which tiles are Hidden Items and why
