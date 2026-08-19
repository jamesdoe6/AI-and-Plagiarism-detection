# API setup

The application is **static and 100 % client-side**. It can only call APIs that allow CORS from a
browser. No key passes through any third-party server: keys stay in your browser's `localStorage`
and are only ever sent to the provider you select.

Everything is configured in **⚙ Settings**.

> A condensed version of this guide, with a decision diagram, lives in the
> [README](../README.md#-setting-up-the-search-apis).

---

## Without any API

AI analysis runs **entirely offline**. Only plagiarism web search needs a provider.

To detect plagiarism without an API, use the **Local sources** field: paste your reference
documents there (student papers, internal corpus, source articles), separated by a line containing
`---`. Comparison happens locally, with the same similarity measures.

---

## Web search

### Google Programmable Search *(recommended to start)*

Free tier: 100 queries/day.

1. Create an engine at <https://programmablesearchengine.google.com/> and enable
   **Search the entire web**.
2. Note the **Search engine ID** (`cx`).
3. Enable the *Custom Search API* in the Google Cloud console and create a key.
4. In Settings: provider *Google Programmable Search*, paste the key and the `cx` ID.

Restrict the key to the Custom Search API. In a client-side app the key is visible to anyone using
your deployment; for a public instance, put it behind a [custom endpoint](#custom-endpoint) instead.

### Serper.dev

Google results, 2,500 free credits on sign-up.
Create a key at <https://serper.dev> and paste it. Nothing else to configure.

### Brave Search API

Free tier of 2,000 queries/month. Key at <https://brave.com/search/api/>.

### Bing Web Search (Azure)

Create a *Bing Search v7* resource in the Azure portal and copy the key.

### Custom endpoint

To plug any engine in behind your own proxy. The app calls `GET <your-url>?q=<query>` and expects:

```json
{ "results": [ { "url": "...", "title": "...", "snippet": "..." } ] }
```

A bare array is accepted too, as are the keys `link`, `name` and `description`. If you supply an
API key, it is sent as `Authorization: Bearer <key>`.

This is also the answer when your preferred engine does not allow CORS: a ten-line proxy is enough.
The README carries a [ready-to-deploy Cloudflare Worker](../README.md#option-e--custom-endpoint-your-own-proxy).

### Query budget

Adjustable from 4 to 120 queries per analysis (24 by default). Each query consumes your quota. The
higher the budget, the finer the document coverage — queried passages are spread across its whole
length, not concentrated at the start.

---

## Page content extraction

A browser cannot download a third-party page (same-origin policy). Without an extraction service,
comparison is limited to the few lines returned by the engine — markedly less reliable.

Default: `https://r.jina.ai/{url}`, which returns a page's plain text and allows CORS. `{url}` is
replaced by the candidate address.

**What this implies:** the URLs found pass through that service. Your text is not transmitted. If
that is not acceptable, untick *Download pages for detailed comparison* or replace the URL template
with your own extractor.

---

## Remote AI detector (optional)

⚠️ **The analysed text is sent to the chosen provider** (truncated to 12,000 characters). Off by
default.

### Claude (Anthropic)

Provider *Claude*, key from <https://console.anthropic.com>.
Default model: `claude-sonnet-5`.
The `anthropic-dangerous-direct-browser-access` header is sent automatically; it is required to call
the API from a browser.

### OpenAI-compatible endpoint

For OpenAI, a local model (Ollama, LM Studio, vLLM) or any service exposing `/chat/completions`.
Enter the base URL (without `/chat/completions`), the key and the model name.

A local model avoids sending data to a third party entirely.

### Hugging Face Inference (classifier)

Plugs in a genuinely trained "human vs AI" classifier. Default model:
`openai-community/roberta-base-openai-detector`.

Other usable models: `Hello-SimpleAI/chatgpt-detector-roberta`, `desklib/ai-text-detector-v1.01`.

The text is split into ~1,400-character segments on sentence boundaries (8 segments maximum) and the
scores are averaged. High dispersion between segments is flagged: it often indicates mixed
human + AI text.

> These public models were trained on older generations. They add a voice to the ensemble, not a
> verdict.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `key rejected (HTTP 401/403)` | Invalid key, or API not enabled on the provider side |
| `quota exceeded (HTTP 429)` | Quota exhausted — lower the query budget |
| `Could not read …` | The extraction service could not read the page (paywall, robots, timeout). The analysis continues on the search snippet |
| `Timed out` | Slow network or provider unavailable. Queries are retried twice with growing backoff |
| CORS error in the console | The provider does not allow browser calls: use a custom endpoint |

The log shown during analysis details every incident. Errors never abort the analysis: the
plagiarism score is then partial, and the interface flags it explicitly as a lower bound.
