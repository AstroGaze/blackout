# 09: AI-generated Related Terms when a topic is added

**What to build:** Adding a Protected Topic with a model connected reads the topic's Wikipedia page in the background and asks the model for Related Terms, each with a Spoiler Level and Strong/Weak. Results merge into the topic's list by the refresh rules. This ticket establishes the refresh-seam test harness (recorded network responses → assert the stored term list).

**Blocked by:** 06, 08

**Status:** ready-for-agent

- [x] Adding a topic triggers generation when a model is connected; without one, the topic keeps working on its name and the user's terms
- [x] The model receives only the topic name and the collected material, never page content (ADR-0002)
- [x] Merging only adds terms; duplicates are detected after the matcher's normalisation; user terms are never changed
- [x] A term with no Spoiler Level is stored as Major; one with no strength is stored as Strong
- [x] Invalid model output is retried once; a failure keeps the existing list and is recorded on the topic and shown in settings
- [x] Refresh-seam tests cover: well-formed DeepSeek-style reply, malformed reply, missing fields, failing provider, no model

## Comments

Implemented: a background service worker (`src/entrypoints/background.ts`) watches the protection state. When a topic is added while a model is connected, it runs `refreshTopic` (`src/refresh/refresh.ts`):
1. It reads the topic's Wikipedia article. Of the search results, the article about a piece of media wins, so "Severance" gets "Severance (TV series)", not "Severance package".
2. It asks the model for terms as JSON.
3. It merges in the new ones.

While a refresh runs, settings shows "Building Related Terms with your AI model…". Afterwards it shows when the terms were built, how many were added and from which sources, or what went wrong.

The refresh-seam harness is `src/refresh/refresh.test.ts`. It runs on real Wikipedia API responses recorded for "Severance" (`src/refresh/fixtures/`) and DeepSeek-shaped model replies, and asserts the stored term list.

Checked in headless Brave, with a fake model server on localhost and the real Wikipedia:
- Adding Severance showed the building status. Five terms were stored with their levels, with a missing strength stored as Strong.
- An already-open YouTube search for "lumon industries" went from 3 uncovered results to all covered, without a reload.
- A provider answering 402 showed "Couldn't build Related Terms … It said: 'Insufficient Balance'".

Wikipedia outage:
- During this session Wikipedia's API answered 503 to about 9 in 10 requests from this machine, from curl and from the extension alike.
- In Brave the model therefore got the name only, and settings said "from its name only, as no background material could be read".
- The fixtures were recorded in the moments it answered, partly through Firecrawl.

Decisions:
- **Model input:** only `Media: <name>` plus up to 12,000 characters of the article (ADR-0002). User terms and existing terms are never sent.
- **Reading the reply:**
  - A `<think>` block is stripped, and a fenced code block is preferred.
  - Levels and strengths are read case-insensitively.
  - A missing or unknown level is stored as Major, and a missing strength as Strong.
- **Dropped or weakened terms:** a term that is one word of two characters or fewer, or only a number, is dropped. A single everyday word is stored as Weak, using ticket 05's word lists.
- **Retry:** a reply with no usable term, or an empty list, is retried once with a correction. A second failure is recorded and the list kept.
- **Provider errors** are recorded, not retried.
- **Merging:** only adds. Duplicates are compared as the matcher reads them, with `normalize`, so "Cold Harbor" next to "Coldharbor" is kept: they match different text. Only the topic name and AI terms count as duplicates, never the user's own terms (ticket 06). The user-term duplicate check now uses the same comparison.
- **Concurrent writes:** `updateProtection` now holds a Web Lock that the settings page, the popup and the service worker share, so a background write can't overwrite a settings change made at the same moment.
- **One refresh per topic:** a topic isn't refreshed twice at once. `refreshingSince` marks a run in progress, and a run older than its longest possible length counts as unfinished; settings then says so.
- **Service worker lifetime:** while waiting on the network, the worker calls an extension API every 20 seconds to stay alive.
- **Built ahead of ticket 10:** the success line (time, terms added, sources) partly covers ticket 10's "last refresh time and outcome", in settings only.

For ticket 10:
- Only the first browsing language is used so far. Stored terms carry its full tag (`pt-BR`); Wikipedia is read at the primary subtag (`pt`).
- Duplicates ignore language.
- `sourcesRead` is where Fandom and Reddit should be added.
- A topic added before the model was connected gets no AI terms until a refresh: the daily one or "refresh now".
