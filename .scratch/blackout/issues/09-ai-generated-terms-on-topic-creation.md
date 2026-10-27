# 09: AI-generated Related Terms when a topic is added

**What to build:** Adding a Protected Topic with a model connected reads the topic's Wikipedia page in the background and asks the model for Related Terms, each with a Spoiler Level and Strong/Weak. Results merge into the topic's list by the refresh rules. This ticket establishes the refresh-seam test harness (recorded network responses → assert the stored term list).

**Blocked by:** 06, 08

**Status:** ready-for-agent

- [ ] Adding a topic triggers generation when a model is connected; without one, the topic keeps working on its name and the user's terms
- [ ] The model receives only the topic name and the collected material, never page content (ADR-0002)
- [ ] Merging only adds terms; duplicates are detected after the matcher's normalisation; user terms are never changed
- [ ] A term with no Spoiler Level is stored as Major; one with no strength is stored as Strong
- [ ] Invalid model output is retried once; a failure keeps the existing list and is recorded on the topic and shown in settings
- [ ] Refresh-seam tests cover: well-formed DeepSeek-style reply, malformed reply, missing fields, failing provider, no model
