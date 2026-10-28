# 08: AI model connection

**What to build:** The user connects any AI model through one OpenAI-compatible form (server address, API key, model name), with presets that fill it in, and confirms it works with a test button (ADR-0001).

**Blocked by:** 05

**Status:** ready-for-agent

- [x] Presets: DeepSeek (first), OpenAI, OpenRouter, Groq, Gemini, Anthropic, Ollama, LM Studio, and Custom
- [x] Access to the provider's address is requested when the user connects, not at install
- [x] "Test connection" reports success or a readable error
- [x] Choosing Ollama shows the steps to allow browser extensions to reach it
- [x] The API key is stored only in this browser's local storage and never synced

## Comments

Implemented: an "AI model" section in settings, reached from the sidebar or `options.html#model`, following the "Blackout UI" canvas's ModelConnection artboard.
- Nine provider presets fill in one form: server address, API key and model name.
- "Test connection" asks for access to that server, sends a one-line chat-completions request, and on success stores the connection.
- The status reads, for example, "Connected · replied in 1.2 s", or names the problem in words.
- A Disconnect button forgets the connection and gives back the access. It isn't in the design.

Checked in headless Brave, against a fake OpenAI-compatible server on localhost:8787:
- Connecting sent `{model, messages}` to `/v1/chat/completions` with `Authorization: Bearer …`. The connection landed in `chrome.storage.local`, and sync storage stayed empty.
- After a reload the section still read "Connected".
- The error messages read correctly for a wrong key, a dead port, and site access removed in the browser ("Blackout can no longer reach …").
- Disconnect cleared the connection and the access.
- This machine's real Ollama answered 403 to the extension, and the OLLAMA_ORIGINS message showed.

Not checked:
- **The permission prompt itself.** Headless Brave never shows it, so access was granted the way the extension details page's Site access control does.
- **Every cloud preset**, for lack of keys. The default model names are a best guess, and every field stays editable. They are: deepseek-chat, gpt-5-mini, deepseek/deepseek-chat (OpenRouter), llama-3.3-70b-versatile (Groq), gemini-2.5-flash and claude-haiku-5-5.
- **Anthropic's compatibility endpoint from a browser extension.** Its docs don't cover browser or extension requests. If it refuses them, the test shows its error.

Decisions:
- **Access:** asked for on "Test connection", per server host. A match pattern covers every port, so `http://localhost/*` covers Ollama, LM Studio and others. Blackout keeps access only to the connected server: a failed test gives back access it asked for, and connecting a different server gives back the old one.
- **What's stored:** only after a successful test. A failed test leaves an earlier connection in place.
- **Test request:** it sends no output limit. OpenAI's reasoning models reject `max_tokens`, and Anthropic's compatibility layer accepts either field.
- **Ollama instructions:** always shown in their box, and expanded when Ollama is chosen. Brave is the v1 target, so they give `chrome-extension://*`. A Firefox build would need `moz-extension://*`.

For ticket 10 (refresh from the service worker):
- Export `chatCompletion` and give its errors a form that can be recorded on the topic.
- Check `hasModelAccess` before calling, since access can be taken back in the browser.
- Allow longer than the 60 s timeout for long prompts on local models.
- Anthropic's compatibility layer ignores `response_format`, so parse JSON from the reply text rather than relying on a JSON mode.
