# 05: Manage Protected Topics

**What to build:** The user controls protection from a popup and a settings page. They can add a Protected Topic by typing only its name (protected immediately by its name and its spacing/hashtag variants as a Strong Term, no AI needed), switch topics on and off, delete them, run several at once, and Pause a topic for a set time. Open YouTube tabs react immediately to every change.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] Popup and settings page are built with shadcn/ui components, matching the "Blackout UI" design canvas
- [x] Popup lists Protected Topics with on/off switches and a Pause action
- [x] Settings page lets the user add a topic by name and delete topics
- [x] A new topic hides content matching its name and variants straight away
- [x] Pause offers set durations and switches protection back on by itself when it ends, even if the browser was closed
- [x] Turning a topic off, pausing or deleting it un-hides its Hidden Items on open pages without a reload; turning it back on hides them again
- [x] Several topics can be active at once

## Comments

Implemented: a popup and a settings page built with shadcn/ui, following the "Blackout UI" canvas's Popup and Settings artboards. The parts of those artboards that belong to tickets 06, 07, 10, 12 and 13 are left out.

Checked in headless Brave:
- Adding "Severance" in settings covered all 20 results on an already-open YouTube search for it, without a reload.
- Adding a duplicate name is refused.
- Pause offers 15 minutes, 1 hour, 4 hours and 1 day. The popup shows "Back on in …" with Resume.

Notes:
- A topic's name is always a Strong Term, with its spacing and hashtag variants, so a new topic protects with no AI.
- A Pause stores when it ends. Pages switch the topic back on with a timer, re-check when a tab comes back into view, and a Pause that ended while the browser was closed is simply over.
- Continuing past a full-page cover lasts for that page view, even if the topic is turned off and on or a Pause ends meanwhile. Revealed items work the same way.
- While the stored protection state can't be read, every item stays hidden and a watch page shows the "couldn't check" cover. Once the state is readable again, everything is checked again.
- Settings shows how many Related Terms a topic has per Spoiler Level, never the terms themselves. That matches the design; ticket 07 adds the viewer.
- Common-word names: adding a topic whose name is a single everyday word (top 5,000 in English or Spanish), two characters or less, or only a number shows a warning in the Add topic dialog, with "Add anyway". The word lists come from hermitdave/FrequencyWords (CC BY-SA 4.0); the generated src/protection/common-words.ts carries the credit and license, and scripts/build-common-words.mjs rebuilds it.
