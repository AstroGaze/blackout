# 12: Suggested Blocks

**What to build:** When content from one source keeps getting hidden for an active topic, Blackout suggests blocking it. After 3 Hidden Items from the same source for the same topic on the same day, a Suggested Block appears on the page and in the popup; one click makes it a Blocked Source. Nothing is blocked without the click.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] Hidden Items are counted per source, per active topic, per day
- [ ] At 3, a Suggested Block is offered on the page and listed in the popup, naming the source and topic
- [ ] Accepting adds it to Blocked Sources; dismissing stops it being suggested again that day
- [ ] Page-seam tests cover the threshold and that nothing is blocked automatically
