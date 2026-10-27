# 08: AI model connection

**What to build:** The user connects any AI model through one OpenAI-compatible form (server address, API key, model name), with presets that fill it in, and confirms it works with a test button (ADR-0001).

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Presets: DeepSeek (first), OpenAI, OpenRouter, Groq, Gemini, Anthropic, Ollama, LM Studio, and Custom
- [ ] Access to the provider's address is requested when the user connects, not at install
- [ ] "Test connection" reports success or a readable error
- [ ] Choosing Ollama shows the steps to allow browser extensions to reach it
- [ ] The API key is stored only in this browser's local storage and never synced
