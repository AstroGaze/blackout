# 10: Daily refresh from Fandom and Wikipedia

**What to build:** Each active Protected Topic's term list stays current. On creation the model suggests the topic's Fandom wiki and Wikipedia article, which the user can correct. Every day while the topic is active, and on "refresh now", Blackout reads Wikipedia and the Fandom wiki (weighted most), and asks the model for terms in each browsing language.

**Changed 2026-10-27:** Reddit closed its free API in 2026, so the subreddit source moved to the spec's After v1 section. The user chose to drop it for v1.

**Blocked by:** 09

**Status:** ready-for-agent

- [x] On topic creation the model suggests a Fandom wiki and Wikipedia article; settings show them and let the user change them
- [x] A daily alarm refreshes every active (not switched off) topic
- [x] "Refresh now" exists per topic; the last refresh time and outcome are shown in settings and the popup
- [x] Fandom material (the topic's page, led by the wiki's newest page titles) is prioritised when material is trimmed to fit the model's context
- [x] A browsing-languages setting (English by default) is passed to the model, and terms are stored with their language
- [x] Refresh-seam tests cover the combined sources, weighting, languages and suggested sources

## Comments

Implemented.

**Background (`src/refresh/schedule.ts`):**
- A "daily-refresh" alarm refreshes every topic that isn't switched off, paused ones included, one after another.
- It skips a topic refreshed successfully in the last 20 hours; one whose last refresh failed is tried again.
- "Refresh now" in settings and in the popup sends the background a message to refresh that topic straight away.
- New topics still start their first refresh as soon as they're added (ticket 09).

**Sources (`src/refresh/sources.ts`):**
- **First refresh:** the model suggests the topic's Fandom wiki and Wikipedia article. A suggested wiki is kept only if it exists. Suggestions are stored straight away, so a failed refresh keeps them. If the model can't answer, the next refresh asks again.
- **Fandom:** each refresh reads the topic's page as source text, cleaned, led by the titles of the wiki's 50 newest pages. That's where characters and places revealed after release show up first.
- **Wikipedia:** it reads the stored article title. If that title has no article, it searches and stores the article it finds.
- **Sharing out the space:** the model gets up to 16,000 characters. Fandom comes first, with up to three quarters of the room. Wikipedia is trimmed first and always keeps the rest, and room one source doesn't need goes to the other.
- **Your corrections win:** a source the user changes while a refresh runs is kept.

**Languages:**
- A new Languages section in settings sets the browsing languages: English by default, plus any of 16 common ones.
- The model is asked for terms in all of them in one call. Each term is stored with the language the model gives; a missing or invalid code counts as the main language.
- Wikipedia is read in the main language.

**Settings and popup**, following the "Blackout UI" canvas:
- **Settings Refresh card:** "Daily while active · last run … · N terms added", or the failure, plus "Refresh now".
- **Sources list:** the Fandom wiki (marked "Weighted most") and Wikipedia, each with "Change". A bad address gets "Paste a Fandom wiki address, such as gta.fandom.com, or a page on it."
- **Popup:** "N terms · refreshed 6 h ago", "refresh failed …" or "refreshing…", paused topics included, with a Refresh button next to Pause when a model is connected.

**Checked in headless Brave**, with a fake model server and the real Fandom and Wikipedia:
- The alarm is set.
- Adding Severance stored the wiki `https://severance-tv.fandom.com/wiki/Severance` and the article "Severance (TV series)", with `sourcesRead: ["Fandom", "Wikipedia"]`.
- The model was sent about 16,000 characters: the Fandom wiki first, led by "Pages added to the wiki recently: Lumon Gala, …", then Wikipedia.
- After Spanish was added, the next refresh named Spanish, and a Spanish term was stored as `es`.
- The popup showed "refreshing…", then "refreshed just now".
- A minute after install, the daily alarm also refreshed the GTA 6 preset by itself, taking it from 8 to 12 terms.

**Reddit (decided with the user on 2026-10-27):**
- Reddit closed its free API in 2026. Unauthenticated access returns 403 since May 30, 2026, and new API apps need Reddit's approval. Reading Reddit's web pages instead would get around its block, so that isn't an option either.
- The subreddit source moved to the spec's "After v1" section, and Fandom is weighted most instead.
- `sources.subreddit` stays on the topic: the GTA 6 preset has one, and ticket 15 can use it as context on reddit.com.

**For ticket 15 (Reddit site):** settings has no way to set a topic's subreddit any more. If ticket 15 wants a topic's own subreddit as context for Weak Terms, it needs to add one, or ask the model for it as it does for the wiki.

**Notes:**
- Fandom's API has no plain-text endpoint, so pages are read as source text and cleaned: links become their words, infobox fields become "field: value", and galleries, references and categories are dropped.
- Fandom wikis in other languages (`/es/wiki/...`) are read through that language's API path.
- A refresh can take several minutes when Wikipedia is limiting requests, since Blackout waits as it asks.
