# 04: Full-page cover for YouTube pages about a topic

**What to build:** Opening a page that is itself about a Protected Topic (for example a GTA 6 video link from a friend) covers the whole page and masks the tab title, with a confirm to continue. On such a page, Weak Terms count because the context is about the topic.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] A watch page whose title or channel matches a topic is fully covered before anything shows
- [ ] The tab title is masked while covered
- [ ] Confirming continues to the page; the cover names the topic
- [ ] On a covered-then-continued page, comments with only a Weak Term are still hidden (topic context)
- [ ] Navigating between videos inside YouTube (no full reload) re-evaluates the cover
- [ ] Page-seam tests for a matching and a non-matching watch page
