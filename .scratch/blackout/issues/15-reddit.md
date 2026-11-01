# 15: Reddit

**What to build:** Full protection on the current www.reddit.com interface: every place a Reddit spoiler can reach the user is checked hide-first; threads about a topic get the full-page cover; Weak Terms count inside the topic's own subreddit; subreddits and Reddit users can be Blocked Sources.

**Blocked by:** 04, 11

**Status:** ready-for-agent

- [x] Feeds (home, popular, subreddit), post titles and bodies, comments, subreddit names, flair and search suggestions are checked
- [x] A thread about a topic is fully covered with a masked tab title and confirm-to-continue
- [x] Inside the topic's own subreddit, Weak Terms alone hide content
- [x] "Block this source" works for subreddits and Reddit users; Suggested Blocks count Reddit sources
- [x] Page-seam tests with saved snapshots: home feed, a subreddit, a thread with comments, search suggestions

## Comments

Implemented: a Reddit site adapter (`src/sites/reddit/adapter.ts`) and content script (`*://www.reddit.com/*`), plus three changes to the shared guard.

**What is checked:**
- **Posts:** posts in every feed, and the thread's own post (`shreddit-post`, `shreddit-ad-post`). Their text covers the title, the subreddit and author names shown on the card, flair and body text.
- **Comments:** each comment's own text (`[slot="comment"]`). Replies sit beside that text rather than inside it, so each reply is checked and covered on its own, and covering a comment never hides its replies.
- **Around the feed:**
  - suggested communities (`community-card`)
  - a subreddit's highlights (`community-highlight-card`)
  - related posts beside a thread (`reddit-pdp-right-rail-post`)
  - the "People also ask about" questions
- **Search suggestions:** queries, communities and users. Reddit keeps them in the search box's shadow root (`reddit-search-large`).

**Threads:**
- **Page cover:** a thread page (`/r/<sub>/comments/<id>/`) is the page's subject, so it gets the full-page cover with a masked tab title and "Continue to page" then "Continue".
- **Subreddit name counts:** the subject's text includes its subreddit's name, so every thread in r/GTA6 counts as about GTA 6.
- **Only the current thread:** the subject is trusted only once the post with the thread's own id is on the page, since after navigating the old post can linger.

**The topic's own subreddit:**
- **The rule:** a topic's `sources.subreddit` (the GTA 6 preset has r/GTA6) counts as context in the matcher. An item whose sources include that subreddit is about the topic, so its Weak Terms hide it on their own. This is the rule the spec already described.
- **Which items:** posts carry their subreddit as a source.
- **Comments:** a comment's only source is its author. The thread's subreddit is its place (`SiteAdapter.pagePlace`), which counts as context but isn't a source. So a thread's comments don't count towards Suggested Blocks for its subreddit.
- **Stored names:** subreddit names are read leniently ("GTA6", "r/GTA6", "/r/GTA6/", an address) by one helper, `src/protection/subreddits.ts`, used by the matcher, the adapter and settings.
- **Settings:** a new "On Reddit" card on each topic sets or clears the subreddit. Blackout doesn't read it, so it isn't part of the Refresh card.
- **New topics:** a new topic has none until the user adds one. Asking the model for it at creation could come later.

**Sources, now several per item:**
- **The API change:** `SiteAdapter.itemSource` became `itemSources`, which returns a list.
  - **Posts:** a post's sources are its subreddit, then its author.
  - **Comments:** its author.
- **Blocking:** blocking any one of an item's sources hides the item.
- **The cover's button:** "Block source" offers the first, so the subreddit for a post. Comments have inline covers, which have no room for "Block source", the same as YouTube comments.
- **Right-click:** the menu now has entries per site. On Reddit, "Block this subreddit" and "Block this user" ask the page for that kind of source (`r/` or `u/`).
- **Accounts:** stored as `r/<name>` and `u/<name>` in lowercase, and shown as Reddit shows them.
- **Suggested Blocks:** counted for every source, so a hidden post counts towards both its subreddit and its author. Accepting one says "Block", as ticket 12 set out.

**Shadow roots in the guard:**
- **Declaring them:** adapters can name `shadowHosts`, elements whose open shadow root holds items.
- **Watching them:** the guard puts its own copy of the hide-first stylesheet in each such root, observes it, and includes it in rechecks and idle.
- **Late roots:** hosts seen before their shadow root is attached are tried again on later changes.
- **Snapshots:** they keep the search box's shadow root as declarative shadow DOM, and `renderPage` attaches it as the browser's parser does.

**From the two-axis review, fixed:**
- **Wake-up:** a search box added while the guard was idle is now found when protection starts again.
- **Late shadow roots:** a shadow root attached after its host arrives, with no other change to the page, is now found within a frame. Hosts are retried every frame for up to 10 s.
- **Double count:** a thread and its own post have the same key (`t3_<id>`), so one thread view counts once towards Suggested Blocks.
- **Ads:** ads among comments and in the sidebar are now checked.
- **Name formats:** a stored subreddit name is now read leniently: `" r/GTA6"`, `"GTA6/"` and addresses all work.
- **New tests:**
  - the own-subreddit rule for a comment in a thread that isn't covered
  - waking with a search box added while idle
  - a late shadow root
  - subreddit name parsing

**Decisions for the user:**
- **Subreddit name in thread checks:** a thread's subreddit name is part of what its page check reads, since the page shows it above the thread. So every thread in r/GTA6 is covered for GTA 6, even with the topic's subreddit cleared in settings. Posts in feeds are checked by what their card shows, which on a subreddit's own page doesn't include its name.
- **The "On Reddit" card:** it is new settings UI. Ticket 10 said ticket 15 would need a way to set the subreddit, and this is it.

**Covers and site headers:** covered items now isolate their stacking context. Before, a cover could float above Reddit's sticky header as the right rail scrolled under it.

**Snapshots** (`src/sites/reddit/fixtures/`) were captured logged out in headless Brave on 2026-10-29: the home feed, r/GTA6, the "GTA 6 Launch Trailer" thread with 35 comments, and the home page with "gta" typed in the search box. On the first home load Reddit ran a JavaScript check, which the browser passed by itself; nothing was done to get around it.

**Checked in headless Brave on live Reddit** with the GTA 6 preset:
- **Home feed:** 14 posts after scrolling, all shown, since none were about GTA 6.
- **r/GTA6:** the posts naming GTA 6 were covered, and 4 of its 5 highlights.
- **A thread in r/GTA6:**
  - The page was covered and the tab title masked.
  - After continuing, 6 of 25 comments were covered, inline under their author line, and all 25 related posts beside it were covered.
- **Search for "gta":** 6 of 10 suggestions were covered, both queries and communities, and "gta online" was shown.
- **Arrow keys in the search box:** these move focus onto the suggestion links. Covered suggestions are inert, so focus skips them. Whether the box's own text changes as focus moves wasn't checked, since the script couldn't read the input inside Reddit's shadow root.
- **No page errors.**

**Edge cases the user found (2026-10-31), from a signed-in screenshot of the empty search box and the home sidebar:**
- **Fixed, the empty search box:**
  - **The gap:** before anything is typed, the box shows trending searches and, when signed in, recent searches. Their rows carry no `data-testid`, so `li[data-testid^="search-sdui-"]` missed them, and "GTA 6 Gameplay Reveal on South Park" showed in Trending.
  - **The fix:** the item is now every row of the dropdown (`#search-dropdown-results-container li`), an id found only inside the search box. A new snapshot of the empty box (`search-trending.html`) tests it, along with rows shaped like Reddit's trending and recent ones.
  - **Checked live:** the trending GTA 6 row is covered.
- **Signed-in only, fixed on 2026-11-01:** the user copied the markup from their own browser with a Console snippet; Claude in Chrome and the app's browser pane both refuse reddit.com.
  - **Recent communities:** a row of tiles at the top of the empty box (`[data-suggested-subreddit-dismiss-item]`).
  - **Recent searches:** `.recent-search-item-container`. The query is drawn inside the item's own nested shadow root, so the text checked includes its delete button's label ("Delete r/GTA6 ending from recent searches").
  - **"Recent posts":** the panel beside the home feed (`recent-posts [slot="posts"] > div`), whose rows show the subreddit and the title.
  - **Tests:** they use hand-built markup in the same shape. The capture itself holds the user's account id and history, so it isn't saved.

**Leak audit (2026-10-31):**
- **The method:** at the user's request to cover every case, a script opened about 25 kinds of Reddit page and state in headless Brave with Blackout protecting GTA 6. It listed every readable text naming GTA 6 with a Strong Term that no cover hid, and where it sat.
- **The pages:** home, popular, all, news and explore; r/GTA6 (hot, new, top, its wiki); r/gaming and r/GamingLeaksAndRumours; threads, before and after continuing, with replies opened and hover cards; search for posts, communities, comments, people and media; a user's profile and comments; and the search box, empty and typed.
- **Why not Firecrawl:** it was suggested, but it fetches pages logged out like headless Brave, can't open menus or hover, and getting past Reddit's limits on scrapers is what ticket 10 ruled out. Claude in Chrome refuses reddit.com.
- **Gaps it found, all fixed:**
  - **Search results pages:** posts, comments, communities, people and media results; Reddit Answers' summary and its sources line; and related searches. Snapshots: `search-results.html`, `search-comments.html`, `search-media.html`.
  - **A subreddit's own pages:** feeds, wiki and about pages are now a page subject, from the subreddit's name, title and description, so a topic's subreddit gets the full-page cover. r/popular and r/all are left out. Snapshot: `subreddit-header.html`.
  - **The community box:** beside a thread (`aside[aria-label="Community information"]`) and everything beside a subreddit's feed (rules, resource links). Its name and description come from the header's attributes, since it draws them inside its shadow root.
  - **"People also ask about":** the whole box beside a thread, with the answer Reddit opens under a question.
  - **Profiles:** comments on a user's profile (`shreddit-profile-comment`), and the links, communities and trophies beside them. Snapshot: `user-profile.html`.
  - **A term:** "Grand Theft Auto 6" was missing from the GTA 6 preset. It's added, and an update now adds preset terms a stored copy lacks, only adding, like a refresh.
- **Tests:** they assert that no readable text names GTA 6 on each new snapshot, using a `readableText` helper that walks open shadow roots and skips text only screen readers get.
- **Tests' time limit:** page-seam tests now allow 20 s. Several large snapshots parsed in parallel ran past Vitest's 5 s default under load (GTA V was running).
- **Left on purpose:**
  - Image descriptions (alt text), which only screen readers read; the blur-all-thumbnails switch is YouTube only.
  - Text only for screen readers.
  - The search box's "r/GTA6" scope chip on a page the user continued to; it sits in a shadow root nested inside the search box's.

**How covers look, from the user's screenshots (2026-11-01):**
- **Small items:** a card cover narrower than 200 px or shorter than 170 px, such as a recent-community tile in the search box, keeps only the topic and Reveal. It drops the icon, "Hidden for" and "Block source", which stays in the right-click menu. This uses a `compact` container-query variant in `cover.css`.
- **Tall items:** a card cover at least 480 px tall puts its label near the top (`tall` variant) instead of the middle, which could be far below the screen. A subreddit's sidebar is one item about 5,000 px tall.
- **Items drawn in their own shadow root:** these show a cover only if their shadow root has a default slot.
  - **When the cover goes inside:** if there's no default slot, the cover goes inside the shadow root, opaque, since the site's content there can't be blurred.
  - **Drawn later:** if the element hasn't been drawn yet when it's covered, the cover checks every 50 ms for 5 s and moves inside if needed.
  - **Highlights:** they are now covered by the link around each card, which always shows the cover.
- **Not reproduced:** the user's r/GTA6 screenshot also had a blank top of the page (no header or banner). That didn't happen logged out in headless Brave.

**Not done:**
- **Usernames:** a comment's author name, above its text, isn't checked or covered.
- **Untested surfaces:** no snapshot was taken of a search results page or of r/popular. Their posts are `shreddit-post` too, but that wasn't checked live.
- **Hover cards:** the cards Reddit shows when hovering a user or subreddit name aren't checked.
- **Sidebar:** a subreddit's own description and rules aren't checked.
- **Mobile and old Reddit:** `m.reddit.com` and `old.reddit.com` aren't handled.
