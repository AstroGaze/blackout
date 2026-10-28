# 06: Your own Related Terms

**What to build:** The user can add their own Related Terms to any Protected Topic. They are Strong by default, can be marked as a common word (Weak), are shown without spoiler warnings, and are kept separate from AI-generated terms so later refreshes never touch them.

**Blocked by:** 05

**Status:** ready-for-agent

- [x] Settings page lets the user add and remove their own terms per topic
- [x] User terms are Strong by default; a "this is a common word" option makes one Weak
- [x] User terms are listed without any spoiler warning
- [x] Stored terms record whether the user or the AI added them
- [x] A newly added user term takes effect on open pages immediately

## Comments

Implemented: a "Your own terms" section on each topic's settings page, following the "Blackout UI" canvas's Settings artboard. Type a word or phrase, optionally tick "This is a common word", and add it. Your terms show as chips with a remove button, and Weak ones carry a "common word" label. They are listed openly, with no spoiler warning. To change whether a term is a common word, remove it and add it again, as in the design.

Checked in headless Brave:
- An open YouTube search for "lumon industries", with Severance added, still showed 3 results that don't name Severance.
- Adding "Lumon" as a term covered all 17 results without a reload. Removing it showed the 3 again.
- Stored terms read `addedBy: "user"`, Strong by default, Weak with "This is a common word" ticked.
- Adding the topic's own name ("severance") or a variant of an existing term ("#lumon") is refused.

Decisions:
- A user term is stored as `{ level: 'common', language: 'und', addedBy: 'user' }`.
  - Spoiler Levels rate what the AI found, so a user term's level means nothing.
  - 'und' is the BCP 47 code for an undetermined language: the user may type in any language.
- A user term and an AI term for the same word are stored as two entries.
  - Removing your own copy never touches the AI's copy.
  - Where either copy is Strong, the matcher treats the word as Strong. So marking a common word has no effect on a word the AI already holds as Strong, and the UI can't say why without revealing the AI's term. That's accepted under Strict Mode.
- Duplicates are compared in run-together form, as the matcher reads them, so "#Lumon" duplicates "Lumon".
- Typing a single everyday word, a word of two characters or less, or a number shows a hint to mark it as a common word. It uses the same word lists as the topic-name warning.

For later tickets:
- **07 (term viewer):** show and count only `addedBy === 'ai'` terms, as the Related Terms summary already does. Otherwise user terms land under "Common knowledge".
- **10 (refresh):** compare new terms for duplicates only against AI terms. If a user term blocked the AI copy, removing the user term would drop protection. Never filter `language: 'und'` terms by browsing language.
