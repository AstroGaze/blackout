# Match page content locally against an AI-built term list

AI is used only to build each Protected Topic's list of Related Terms; deciding whether a video, post or comment should be hidden happens entirely in the browser, by matching its text against that list. Asking the AI about every item would catch subtler references, but it is too slow to hide content before it appears, costs money on every page, and would send the user's browsing to a third party.

## Consequences

- The AI never sees what the user browses: it receives only the topic name and the background material collected about it.
- Content that implies a topic without using any Related Term, such as an image-only thumbnail, is not caught. The optional "blur all thumbnails" switch is the stopgap.
