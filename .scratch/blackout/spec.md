# Spec: Blackout v1

Status: ready-for-agent

## Problem Statement

When a big piece of media comes out (a game like GTA 6 on November 19, 2026, a series finale, a book), the internet fills with spoilers within minutes. They sit in YouTube titles, thumbnails, Shorts, comments and live chat; in Reddit posts, comments and search suggestions; in posts on X. Some channels and accounts exist only to post endings and leaks as fast as possible. Spoilers often don't even name the thing they spoil: a post that only says "Lucia" or "the Leonida ending" spoils GTA 6 just as well.

Existing spoiler blockers rely on keyword lists the user types themselves. That fails in two ways. It misses anything that doesn't use those exact words, and building a good list means looking up character names, places and events, which spoils you while you build it. For a book or series you're partway through, even knowing a later character's name is a spoiler.

## Solution

Blackout is a browser extension (Chromium, running in Brave for v1) that hides everything about the media you want to protect: your **Protected Topics**. You type a topic's name, such as "GTA 6". Blackout asks an AI model of your choosing to build the full list of **Related Terms** (other names, characters, places, factions, events) from background material that Blackout reads for you, so you never see it. It refreshes that list daily, which catches characters that only become known after release.

On YouTube, Reddit and X, Blackout hides every new piece of content as it arrives, checks it against the term list on your computer, and only shows it once it passes. Anything that matches stays hidden behind a blur that names the topic, and you reveal it only after confirming. Pages that are entirely about the topic get covered completely. You can block spoiler channels and accounts outright, and Blackout suggests sources to block when they keep posting about your topic.

**Strict Mode** is the only mode in v1: if it relates to the topic, it's hidden, even when it gives nothing away. Protection stays on until you turn the topic off, with a timed Pause for when you deliberately want to look something up.

## User Stories

### Protected Topics

1. As a user, I want to add a Protected Topic by typing only its name, so that I can protect myself without researching (and spoiling) its details.
2. As a user, I want to protect any kind of media (games, films, series, books), so that Blackout isn't limited to one release.
3. As a user, I want GTA 6 to come ready-made as a Protected Topic, so that I'm protected before launch day with no setup.
4. As a user, I want to have several Protected Topics active at once, so that I can avoid spoilers for everything I'm currently playing, watching or reading.
5. As a user, I want to turn a Protected Topic off when I've finished it, so that content about it shows normally again.
6. As a user, I want to Pause a Protected Topic for a set time (for example 1 hour), so that I can deliberately look something up without forgetting to switch protection back on.
7. As a user, I want a Pause to end by itself, so that I'm never left unprotected by accident.
8. As a user, I want to delete a Protected Topic entirely, so that my list stays tidy.

### Related Terms

9. As a user, I want Blackout to generate a topic's Related Terms with AI, so that content using character names, places or events is hidden even when the topic's name is absent.
10. As a user, I want the term list to be hidden from me by default, so that building protection never spoils me.
11. As a user, I want to be able to view the term list behind a warning, so that I can see what Blackout is looking for if I choose to.
12. As a user, I want terms grouped by Spoiler Level (Common knowledge, Minor, Major), so that viewing the list shows me the least revealing terms first.
13. As a user, I want a separate confirmation before each Spoiler Level is shown, so that I can stop after "Common knowledge" without seeing anything more revealing.
14. As a user, I want terms whose Spoiler Level is uncertain to be put in the higher level, so that I'm never surprised by something worse than I agreed to see.
15. As a user, I want to add my own Related Terms, so that I can cover anything I already know might spoil me.
16. As a user, I want my own terms to be shown without warnings, so that I can manage them freely, since I wrote them.
17. As a user, I want my own terms to count as Strong Terms by default, so that they hide content on their own.
18. As a user, I want to mark one of my terms as a common word, so that it acts as a Weak Term and doesn't hide every unrelated post.
19. As a user, I want my own terms never to be changed or removed by a refresh, so that what I add stays exactly as I wrote it.
20. As a user, I want the term-list warning to explain that most terms are just names, places and factions that don't necessarily spoil anything, so that I can decide calmly whether to look.
21. As a user, I want everyday words like "Jason" to only hide content when they appear alongside another Related Term or in a context about the topic, so that half of the internet isn't hidden.
22. As a user, I want terms that are unique to the topic, like "Leonida", to hide content on their own, so that indirect references are caught.
23. As a user, I want Related Terms generated in every language I browse in, so that spoiler phrases in those languages are caught too.
24. As a user, I want to choose my browsing languages in settings (English by default), so that term generation fits how I actually use the internet.

### Refresh

25. As a user, I want each active Protected Topic's term list refreshed once a day, so that characters and events revealed after release are added automatically.
26. As a user, I want Blackout to read the topic's Wikipedia page and Fandom wiki in the background for me, so that the term list is current without me seeing any of that material.
27. As a user, I want the Fandom wiki, including the pages its community added most recently, to be the most important source, so that launch-day revelations are caught as early as possible. (The subreddit was the plan, but Reddit closed its free API in 2026; see After v1.)
28. As a user, I want the AI to suggest the right Fandom wiki and Wikipedia article when I add a topic, so that I don't have to find them myself.
29. As a user, I want to see and correct which Fandom wiki and Wikipedia article a topic uses, so that a wrong suggestion doesn't weaken protection.
30. As a user, I want a refresh to only add terms, never remove them, so that protection can't quietly get weaker.
31. As a user, I want a "refresh now" button, so that I can update a topic right before a risky moment like launch day.
32. As a user, I want to see when a topic was last refreshed and whether it failed, so that I know how current my protection is.
33. As a user, I want a failed refresh to keep the existing term list, so that a provider outage never removes protection.

### AI model connection

34. As a user, I want to connect any AI model through one connection form (server address, API key, model name), so that I can use whichever provider I like.
35. As a user, I want presets that fill in the form for popular providers, DeepSeek first, so that connecting takes only pasting my key.
36. As a user, I want to use a local model through Ollama or LM Studio, so that I can use Blackout without a cloud provider.
37. As a user running Ollama, I want instructions for the one Ollama setting that allows browser extensions, so that my local model connection works.
38. As a user, I want a "test connection" button, so that I know my model works before I rely on it.
39. As a user, I want my API key stored only on this computer, so that it isn't synced or sent anywhere except my chosen provider.
40. As a user, I want Blackout to protect me with the topic name and my own terms when no model is connected, so that it's useful without AI.
41. As a user, I want the AI to never see what I browse, so that my browsing stays private.

### Hiding content on pages

42. As a user, I want new content hidden before it appears and only shown after it's checked, so that I never glimpse a spoiler, even for a moment.
43. As a user, I want content that is still being checked or failed to check to stay hidden, so that errors never expose spoilers.
44. As a user, I want Blackout to check YouTube video titles, channel names, descriptions, comments, Shorts, search suggestions, notifications and live chat, so that every place a YouTube spoiler can reach me is covered.
45. As a user, I want Blackout to check Reddit post titles, post bodies, comments, subreddit names, flair and search suggestions, so that every place a Reddit spoiler can reach me is covered.
46. As a user, I want Blackout to check posts, replies, account names and search suggestions on X, so that launch-day spoilers on X are covered.
47. As a user, I want each Hidden Item blurred with a label naming the Protected Topic, so that I know why it's hidden and can spot a false alarm.
48. As a user, I want to reveal a Hidden Item only after confirming, so that I never reveal a spoiler with one accidental click.
49. As a user, I want a page that is entirely about a Protected Topic (a video, a thread, a post) to be fully covered, including its tab title, so that opening a link from a friend can't spoil me.
50. As a user, I want to continue past a full-page cover after confirming, so that I can still open a page I really want to see.
51. As a user, I want an optional "blur all YouTube thumbnails" switch, so that I can protect myself from image-only spoilers around a launch.
52. As a user, I want scrolling to stay smooth with Blackout running, so that protection doesn't make browsing worse.
53. As a user, I want Blackout to do nothing on sites it doesn't handle, or when no topic is active, so that it costs no performance when it isn't needed.

### Blocked Sources

54. As a user, I want to add a YouTube channel, subreddit, Reddit user or X account as a Blocked Source, so that everything it posts is hidden whatever its title says.
55. As a user, I want a "Block this source" option on any video or post, so that I can block a spoiler channel the moment I see it.
56. As a user, I want to manage my Blocked Sources in settings, so that I can review and unblock them.
57. As a user, I want Blocked Sources to apply whichever topics are active, so that spoiler channels are blocked for everything.
58. As a user, I want Blackout to suggest blocking a source after 3 of its items are hidden for an active topic, so that I find spoiler channels I didn't know about.
59. As a user, I want a Suggested Block to take one click to accept and never apply on its own, so that I don't lose a channel's unrelated content without agreeing to it.
60. As a user, I want content from Blocked Sources hidden with a label saying the source is blocked, so that I understand why it's hidden.

### Everyday control

61. As a user, I want a popup showing my active topics, pauses and on/off switches, so that I can control protection in one click.
62. As a user, I want a settings page for topics, terms, Blocked Sources, the model connection, languages and the thumbnail switch, so that everything is configurable in one place.

## Implementation Decisions

**Platform and stack**
- Chromium Manifest V3 extension built with WXT in TypeScript. Brave is the target browser for v1, loaded unpacked from the build output. WXT keeps a later Firefox build cheap.
- UI is built with shadcn/ui (React, Tailwind CSS, Radix primitives, Lucide icons), using its neutral theme and the Geist font. The popup and settings page use it directly. Hidden Item covers, Suggested Block toasts and the full-page cover are rendered inside a Shadow DOM so the host site's styles can't affect them and theirs can't leak onto the site. The approved mockups are in the "Blackout UI" design canvas.
- Sites in v1, built in this order: YouTube, then Reddit (the current www.reddit.com interface), then X. X has a cut line: if it isn't solid by about November 12, 2026, YouTube and Reddit ship first and X follows.

**Modules**

- **Protection state**: the single source of truth stored in extension local storage (never synced). It holds:
  - Protected Topics: name, on/off, Pause end time, chosen Fandom wiki and Wikipedia article (and a subreddit, kept for later), last refresh time and outcome.
  - Each topic's Related Terms: text, Spoiler Level, Strong or Weak, language, and whether the AI or the user added it.
  - Blocked Sources: site plus account identity.
  - Model connection.
  - Browsing languages.
  - The thumbnail switch.

  Every other module reads and writes through it, and content scripts are notified when it changes.
- **Matcher**: a deep module with a small interface. It compiles active topics and Blocked Sources into a matcher once per state change. It then answers, for one item's text plus its context (source identity, the page or thread it sits in), whether to hide it and which topic or Blocked Source is the reason. Rules:
  - Matching ignores case, accents and repeated whitespace or punctuation, and respects word boundaries. Spacing and hashtag variants count, so "GTA 6", "GTA6" and "#GTA6" all match.
  - A Strong Term hides on its own.
  - A Weak Term hides only when the same item contains another Related Term of that topic, or its context is about the topic: the page or thread is covered by the topic, or the source is the topic's own subreddit (stored on the topic, as the GTA 6 preset has; Blackout no longer reads it, but the Reddit site ticket can still use it as context).
  - A Blocked Source hides regardless of text.
  - Paused or switched-off topics are ignored.
- **Site adapters** (YouTube, Reddit, X): one per site, all with the same shape. Each knows:
  - which elements are checkable items (video tile, Short, comment, chat message, post, reply, search suggestion, notification),
  - how to pull the item's text and source identity,
  - where to place the cover,
  - how to tell whether the page as a whole is about a topic (watch page, thread, single post).

  Adapters contain no matching logic.
- **Page guard**: the content-script core shared by all sites.
  - **Hide-first.** At document start, a stylesheet hides every item kind the adapter declares. A mutation observer batches newly added items, runs them through the matcher and un-hides clean ones.
  - **Covering.** Matched items get the cover. A page-level match gets the full-page cover, and the tab title is masked.
  - **Fail-closed.** Items whose check errors or overruns stay hidden.
  - **Performance budget.** Each batch is checked within 16 ms: checking runs in turns of at most 8 ms, half a frame, and items a turn doesn't reach stay hidden until a later one. The guard does nothing on unhandled sites. When no topic is active it goes idle: it hides nothing, stops observing the page and checks nothing.
  - Applies the optional blur-all-thumbnails switch on YouTube.
- **Cover UI**: the blur, the label naming the topic (or "Blocked Source"), confirm-to-reveal, and the "Block this source" action. Revealing lasts for that page view only.
- **Suggested Block tracker**: counts Hidden Items per source per active topic and day. At 3, it offers a Suggested Block in the page and the popup. Nothing is added to Blocked Sources without the user's click. Its counts are stored apart from the protection state, in their own local storage item that only the background writes: they change with every Hidden Item, and a change to the protection state makes every open page check all its items again.
- **Refresh** (background service worker):
  - **When it runs:** when a topic is added, daily via an alarm for every active topic, and on "refresh now".
  - **Collecting material:** gathers background material from the topic's Wikipedia page and its Fandom wiki: the topic's page, led by the titles of pages the wiki's community added recently. Fandom is weighted most: when the material must be trimmed to fit the model's context, Wikipedia is trimmed first, and Fandom takes up to three quarters of the room. Reading the subreddit was the plan, but Reddit closed its free API in 2026 (unauthenticated access returns 403 since May 30, 2026, and new API apps need Reddit's approval), so it moved to After v1.
  - **Asking the model:** sends the material to the model connection and asks for Related Terms in every browsing language. Each term comes with a Spoiler Level and Strong/Weak.
  - **Merging:** results are validated and merged additively. Duplicates are compared after the same normalisation the matcher uses. User-added terms are never touched.
  - **Missing fields fail strict:** a term with no Spoiler Level becomes Major, and one with no strength becomes Strong.
  - **Failures:** invalid output is retried once. A failure keeps the existing list and records the failure on the topic.
  - **On topic creation** the model also suggests the Fandom wiki and Wikipedia article, which the user can correct. A suggested wiki is kept only if it exists.
- **Model client**: speaks the OpenAI-compatible chat-completions format and nothing else (ADR-0001). It comes with presets for:
  - DeepSeek (first),
  - OpenAI, OpenRouter, Groq, Gemini and Anthropic (each via its OpenAI-compatible endpoint),
  - Ollama and LM Studio (local),
  - a custom option.

  Access to the provider's address is requested when the user connects, not up front. The client includes the "test connection" call and the Ollama allowed-origins instructions.
- **No-model fallback**: with no model connected, or when the model fails, a topic's terms are its name (as a Strong Term with its spacing and hashtag variants) plus the user's own terms.
- **GTA 6 preset**: ships as a ready-made Protected Topic. It is seeded with Strong common-knowledge terms (GTA 6, GTA VI, Grand Theft Auto VI, #GTA6, Leonida) and Weak ones (Jason, Lucia, and Vice City, which also names a 2002 game), with r/GTA6 and the GTA Fandom wiki as its sources. It's protected from day one, even without a model.
- **Popup and settings page**:
  - The popup has topic switches, Pause, refresh status and pending Suggested Blocks.
  - The settings page manages topics and their sources, the term viewer (with a warning per Spoiler Level, least revealing first), user terms, Blocked Sources, the model connection, languages and the thumbnail switch.

**Privacy boundary** (ADR-0002): the model receives only the topic name and the collected background material. Page content never leaves the browser.

**Permissions**: content scripts on YouTube, Reddit and X. Background fetch access to Wikipedia and Fandom. The model provider's address is requested optionally at connect time.

## Testing Decisions

- **What makes a good test:** it checks what the user would see (which items are hidden, why, whether the page is covered) or what ends up stored (the term list). Tests never check how adapters, the matcher or the guard are wired internally, so those can be restructured freely.
- **Seam 1: the page.**
  - **Setup:** a test loads a saved HTML snapshot of a real page into a simulated DOM, sets a protection state, runs the page guard and asserts the outcome: Hidden Items and their reasons, the full-page cover, the tab title, and Suggested Block offers.
  - **Snapshots:**
    - YouTube: home feed, search with suggestions, a watch page with comments and live chat, Shorts, notifications.
    - Reddit: home feed, a subreddit, a thread with comments, search suggestions.
    - X: timeline, a single post with replies, search suggestions.
  - Small hand-written pages cover matcher edge cases:
    - Weak alone vs. Weak plus another term vs. Weak in topic context,
    - spacing and hashtag variants, accents, word boundaries,
    - Blocked Sources, Paused and switched-off topics, multiple topics, other languages,
    - fail-closed on errors.
  - **Performance:** a large feed snapshot checks the 16 ms batch budget, with headroom so slower test machines don't fail it at random.
  - The matcher is tested through this seam, not on its own.
- **Seam 2: the refresh.**
  - **Setup:** a test runs a refresh with the network replaced by recorded responses: Wikipedia and Fandom pages, plus model replies. The model replies include a well-formed DeepSeek-style reply, a malformed reply, a reply missing levels or strengths, a failing provider and no model connected.
  - **Assertions:** the resulting stored term list is checked, including:
    - additions only,
    - user terms untouched,
    - missing fields stored as Major and Strong,
    - the existing list kept on failure, with the failure recorded,
    - the no-model fallback,
    - suggested Fandom wiki and Wikipedia article stored on topic creation.
- **Tools:** Vitest, a simulated DOM, and WXT's fake browser for storage and alarms.
- **Not automated:** the popup and settings page, and the final behaviour in real Brave. These are checked by hand with the checklist in Further Notes.
- **Prior art:** none. This is a new codebase, so these tests set the pattern.
- **Maintenance cost:** YouTube, Reddit and X change their page layouts. When a site changes, its snapshots must be re-saved and its adapter updated. A failing snapshot test is the signal.

## Out of Scope

- Relaxed Mode, or any use of Spoiler Levels to decide what gets hidden. In v1, Spoiler Levels only control what the user views.
- Firefox, Safari and other non-Chromium browsers.
- Sites other than YouTube, Reddit and X, including a basic text scan for any other website, Discord, Google search results and news sites. Old Reddit (old.reddit.com) is also out.
- Recognising what's in images or video (thumbnail contents, video frames). The blur-all-thumbnails switch is the stopgap.
- Sending individual page items to the AI for a decision.
- AI-suggested spoiler channels during refresh.
- A shared or community Blocked Sources list, and linking one spoiler outfit's accounts across sites.
- Firecrawl or any other paid source-collection service.
- Publishing to the Chrome Web Store, plus the privacy policy and support it needs.
- Syncing settings across devices.

## After v1

Planned once v1 is finished (decided 2026-10-27). None of these is part of v1.

- **A research agent.** A server-side agent, likely on Cloudflare, that researches each topic itself: it searches the web, wikis, Fandom and forums with tools, then returns the categorised term list. It speaks OpenAI-compatible chat completions, so Blackout treats it as just another model. The model still never receives anything from the user's browsing (ADR-0002).
- **Reading Reddit.** Reddit closed its free API in 2026, so v1 doesn't read subreddits. The research agent can bring Reddit back through a search provider that indexes it, or Blackout can use Reddit's official API if access is approved.
- **A paid plan.** If Blackout gets popular, users pay for the hosted agent, and that covers the model and search costs for everyone. Bring-your-own-model stays available. Running and paying for model access ourselves reverses ADR-0001's "we never run or pay for model access ourselves", so a new ADR must replace that part when this is built. Publishing to the Chrome Web Store, with the privacy policy and support it needs, comes with it.

## Further Notes

- **Deadline:** GTA 6 launches November 19, 2026 on PS5 and Xbox Series X|S. The PC version is rumoured for early 2027. Leaks usually appear days earlier, so v1 must work in Brave by about November 12, 2026.
- **Competition:** the Chrome Web Store already has keyword-only spoiler blockers, including one specifically for GTA VI. Blackout differs through AI-generated, refreshed Related Terms, Spoiler Levels and Weak Terms that depend on context.
- **Manual Brave checklist** (before relying on v1):
  1. Load the extension unpacked in Brave.
  2. Connect DeepSeek with the preset and test the connection.
  3. Add a fresh topic and confirm terms appear behind warnings, least revealing first.
  4. With GTA 6 active, browse the YouTube home feed, search and a GTA 6 video link. Confirm nothing flashes, items are covered, and the watch page gets the full-page cover with a masked tab title.
  5. Do the same on Reddit: r/GTA6, r/all and a thread link.
  6. Do the same on X: the timeline and a post link.
  7. Block a channel from the "Block this source" option.
  8. Trigger a Suggested Block.
  9. Pause a topic and confirm it switches back on by itself.
  10. Turn on blur-all-thumbnails.
  11. Scroll a long YouTube feed and confirm scrolling stays smooth.
- **Glossary and decisions:** see `GLOSSARY.md` for vocabulary, ADR-0001 (bring your own model) and ADR-0002 (match on your computer against an AI-built term list).
