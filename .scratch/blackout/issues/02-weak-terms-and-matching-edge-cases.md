# 02: Weak Terms and matching edge cases

**What to build:** Everyday-word Related Terms stop hiding unrelated content. A Weak Term ("Jason") hides an item only when the same item also contains another Related Term of that topic. Matching edge cases (accents, word boundaries, other languages, several active topics) are pinned down with small hand-written pages through the page seam.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] "Jason" alone on a tile leaves it visible; "Jason" plus "Leonida" hides it
- [x] A Strong Term alone always hides
- [x] Word boundaries hold ("Jasonville" does not match "Jason")
- [x] Accented and unaccented spellings match each other
- [x] Terms in non-English languages match
- [x] With two active topics, a Hidden Item is labelled with the topic that matched
- [x] Switched-off topics are ignored
- [x] All covered by page-seam tests using hand-written pages

## Comments

Implemented. Notes from review:

- A Weak Term hides when the same item mentions any other Related Term of its topic, Strong or Weak. Spelling variants of one term ("Vice City", "#ViceCity", "Lucía") count once.
- Every term is found at every word position, so a longer term from another topic ("Leonida Keys") doesn't stop GTA 6's "Leonida" from counting.
- When an item matches several topics, it is labelled with the first one in the stored list.
- In scripts written without spaces (Chinese, Japanese, Thai, Lao, Khmer, Myanmar), each character counts as a word. Word boundaries don't hold there: a Thai term also matches inside a longer Thai word.
- Paused topics still hide. The matcher ignores only switched-off topics; Pause is ticket 05.
