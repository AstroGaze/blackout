# 05: Manage Protected Topics

**What to build:** The user controls protection from a popup and a settings page. They can add a Protected Topic by typing only its name (protected immediately by its name and its spacing/hashtag variants as a Strong Term, no AI needed), switch topics on and off, delete them, run several at once, and Pause a topic for a set time. Open YouTube tabs react immediately to every change.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Popup and settings page are built with shadcn/ui components, matching the "Blackout UI" design canvas
- [ ] Popup lists Protected Topics with on/off switches and a Pause action
- [ ] Settings page lets the user add a topic by name and delete topics
- [ ] A new topic hides content matching its name and variants straight away
- [ ] Pause offers set durations and switches protection back on by itself when it ends, even if the browser was closed
- [ ] Turning a topic off, pausing or deleting it un-hides its Hidden Items on open pages without a reload; turning it back on hides them again
- [ ] Several topics can be active at once
