# 12: Suggested Blocks

**What to build:** When content from one source keeps getting hidden for an active topic, Blackout suggests blocking it. After 3 Hidden Items from the same source for the same topic on the same day, a Suggested Block appears on the page and in the popup; one click makes it a Blocked Source. Nothing is blocked without the click.

**Blocked by:** 11

**Status:** ready-for-agent

- [x] Hidden Items are counted per source, per active topic, per day
- [x] At 3, a Suggested Block is offered on the page and listed in the popup, naming the source and topic
- [x] Accepting adds it to Blocked Sources; dismissing stops it being suggested again that day
- [x] Page-seam tests cover the threshold and that nothing is blocked automatically

## Comments

Implemented: Suggested Blocks, following the "Blackout UI" canvas's Feed (toast) and Popup artboards.

**Counting** (`src/protection/suggested-blocks.ts`):
- **What counts:** each item the page guard covers for a topic, when its channel is known and it has a stable identity (a video id). Each item counts once, however often it's seen. A watch page covered for a topic counts as one of its channel's items. Hover previews don't count, and neither do items hidden because their source is already blocked.
- **Where it's stored:** the counts live in their own local storage item, `suggestedBlockCounts`, not the protection state. They change with every Hidden Item, and a change to the protection state makes every open page check all its items again. The spec's "Protection state" bullet is updated to match.
- **Who writes:** pages report Hidden Items to the background, which writes the counts one change at a time.
- **Days:** a day is the local calendar day, and counts start afresh each day.

**Offering:**
- **On the page:** at 3 Hidden Items from one source for one active topic in a day, a toast offers it in the page's bottom-right corner: "Block Rockstar Games?" / "Blackout hid 3 of its GTA 6 items today." / Not now · Block channel. The toast sits in the page body, so a full-page cover hides it too.
- **In the popup:** the same suggestion appears as a card: "Block Rockstar Games?" / "It posted 3 GTA 6 items today." / Block channel · Not now.
- **One at a time:** one suggestion per source, and the page shows one toast at a time. Answering anywhere takes it down everywhere.
- **Block channel:** blocks the source (ticket 11).
- **Not now:** silences the source, for every topic, until the day ends.
- **Once blocked, settled:** a source that gets blocked, however, is settled for the day too, so unblocking it later that day doesn't bring the suggestion straight back.
- **No automatic blocks:** nothing is ever blocked without the click.
- **Midnight:** a toast left up at midnight is taken down.

**Checked in headless Brave** on a live search for "gta 6 trailer", with the GTA 6 preset:
- Rockstar Games had 5–6 Hidden Items, depending on the run. The toast offered "Block Rockstar Games?", the popup listed it, and nothing was blocked.
- "Not now" took it down in both places, and it stayed gone after a reload.

**Copy:** the toast says "items" where the design says "videos", since comments and watch pages count too. The popup keeps the design's "It posted N … items today."

**Known limits:**
- **One channel can appear under two ids** (ticket 11): a handle and a `/channel/UC…` id. A channel's items can then split between two tallies and reach 3 later, or, rarely, appear as two suggestions. The live check saw one channel counted by its id.
- **The threshold is reached fast.** On a page full of one channel's spoilers, a single view can bring 3 Hidden Items. That's what "3 … on the same day" asks for.
