# 10: Daily refresh from Fandom and Reddit

**What to build:** Each active Protected Topic's term list stays current. On creation the model suggests the topic's Fandom wiki and subreddit, which the user can correct. Every day while the topic is active, and on "refresh now", Blackout reads Wikipedia, the Fandom wiki and the subreddit's newest and top-of-day posts (weighted most), and asks the model for terms in each browsing language.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] On topic creation the model suggests a Fandom wiki and subreddit; settings show them and let the user change them
- [ ] A daily alarm refreshes every active (not switched off) topic
- [ ] "Refresh now" exists per topic; the last refresh time and outcome are shown in settings and the popup
- [ ] Subreddit material (newest + top-of-day posts with top comments) is prioritised when material is trimmed to fit the model's context
- [ ] A browsing-languages setting (English by default) is passed to the model, and terms are stored with their language
- [ ] Refresh-seam tests cover the combined sources, weighting, languages and suggested sources
