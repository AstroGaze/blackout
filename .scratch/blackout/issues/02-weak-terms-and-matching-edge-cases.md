# 02: Weak Terms and matching edge cases

**What to build:** Everyday-word Related Terms stop hiding unrelated content. A Weak Term ("Jason") hides an item only when the same item also contains another Related Term of that topic. Matching edge cases (accents, word boundaries, other languages, several active topics) are pinned down with small hand-written pages through the page seam.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] "Jason" alone on a tile leaves it visible; "Jason" plus "Leonida" hides it
- [ ] A Strong Term alone always hides
- [ ] Word boundaries hold ("Jasonville" does not match "Jason")
- [ ] Accented and unaccented spellings match each other
- [ ] Terms in non-English languages match
- [ ] With two active topics, a Hidden Item is labelled with the topic that matched
- [ ] Switched-off topics are ignored
- [ ] All covered by page-seam tests using hand-written pages
