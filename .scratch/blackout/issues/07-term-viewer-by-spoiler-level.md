# 07: Term viewer by Spoiler Level

**What to build:** The user can choose to see a topic's AI-generated Related Terms. The viewer opens behind a warning explaining that most terms are just names, places and factions that don't necessarily spoil anything, then reveals one Spoiler Level at a time: Common knowledge, then Minor, then Major, each with its own confirm.

**Blocked by:** 05

**Status:** ready-for-agent

- [x] Terms are hidden by default in settings
- [x] Opening the viewer shows the explanatory warning first
- [x] Each Spoiler Level needs its own confirmation, least revealing first; the user can stop at any level
- [x] The viewer closes back to hidden when the user leaves the page
- [x] The GTA 6 preset's seeded terms appear under their levels

## Comments

Implemented: a term viewer dialog that opens from "View terms…" on the settings page's Related Terms card. It follows the "Blackout UI" canvas's TermViewer artboard.
- A note at the top explains that most terms are names, places and factions that don't spoil anything.
- Below it, the levels run from least revealing to most: Common knowledge, Minor, Major.
- Each level starts hidden, with placeholder bars and a "Show … terms" button. That click is the level's confirmation.
- A level stays locked ("Open Minor first") until every less revealing level that has terms has been shown. Levels with no terms read "None" and don't block.

Checked in headless Brave:
- On the GTA 6 preset, Common knowledge reveals its 8 seeded terms, and Weak ones read "common word". Minor and Major read "None".
- With Minor and Major terms seeded, levels open strictly in order. A term with no Spoiler Level lands in Major, and a user-added term doesn't appear.
- Closing the viewer and reopening it starts every level hidden again.
- The tab going into the background closes the viewer. Headless tabs always report "visible", so this was simulated with a `visibilitychange` event.

Decisions:
- **What it shows:** only AI-added terms, as ticket 06 asked. Your own terms are listed openly in their own section.
- **Uncertain levels:** a term whose Spoiler Level is missing or unknown counts as Major when grouped (story 14). It's a safety net when reading; ticket 10 must still store such terms as Major, per "Missing fields fail strict".
- **"Leaving the page":** the page unloading, or the tab becoming hidden. Clicking into another window while the tab still shows leaves the viewer open.
- **Level descriptions:** reworded from the artboard so they fit any medium, not just games (GLOSSARY: a Protected Topic is any media). Common knowledge reads "Its name, other names, and what trailers and marketing already showed." Major reads "What comes late in the story: deaths, twists and endings, plus anything Blackout wasn't sure about."
- **Button wording:** the reveal buttons drop the design's trailing "…" ("Show Minor terms"). The click reveals straight away, and an ellipsis promises a further step.
- **Live updates:** while the viewer is open it updates as terms change. A refresh can add terms to a level you already opened without asking again. Levels you haven't opened stay hidden.
