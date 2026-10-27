# 14: Performance budget

**What to build:** Blackout keeps browsing smooth. Each batch of new items is checked within 16 ms on a large saved YouTube feed, and Blackout does nothing on sites it doesn't handle or when no topic is active.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A page-seam test on a large saved feed asserts the per-batch check stays under 16 ms, with headroom for slower machines
- [ ] Items whose check overruns stay hidden rather than shown unchecked
- [ ] No content-script work runs on unhandled sites
- [ ] With no active topic and no Blocked Sources, the guard hides nothing and does no checking
