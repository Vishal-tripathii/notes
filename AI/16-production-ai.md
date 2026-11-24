# AI Engineering Notes — Part 16

## Production AI — Cost, Latency, Reliability ⭐⭐⭐⭐☆

**Topics:** cost model · prompt caching · response & semantic caching · model routing · latency (TTFT, streaming, parallel calls) · reliability (timeouts, retries, fallbacks, gateways) · batch APIs · hosted vs self-hosted models · when to fine-tune (LoRA) · rollout & versioning.

---

## 1. The one rule

> **Make it work with the best model first, measure it, then make it cheaper and faster without losing quality** — checked by your eval set ([Part 14](14-evaluation-and-observability.md)).

Optimising before you have evals just moves you in the dark.

---

## 2. Cost — where the money goes

```
cost per request = input tokens × input price + output tokens × output price (+ thinking tokens)
monthly cost     = cost per request × requests per day × 30
```

Biggest drivers: **long system prompts + RAG context + chat history** (input, every turn), **long answers** (output), **agent loops** (many calls per request), **reasoning models** (thinking tokens).

### Levers, roughly in order of effort

| Lever | Saves | Notes |
|---|---|---|
| **`max_tokens`, concise instructions** | output tokens | "answer in ≤ 3 sentences" |
| ⭐ **Prompt caching** | input cost & latency on repeated prefixes | provider caches the **unchanging start** of the prompt (system prompt, tool definitions, documents); cached tokens are much cheaper. **Put static content first, changing content last.** |
| **Trim context** | input tokens | fewer, better chunks (rerank); summarise history |
| ⭐ **Model routing** | big | simple tasks → small/cheap model; hard → large/reasoning model. A rule or a tiny classifier decides |
| **Response caching** | whole calls | identical request → stored answer (FAQ-style, deterministic tasks) |
| **Semantic caching** | whole calls | *similar* questions → reuse answer (embedding similarity). ⚠️ risk of wrong reuse ("refund for order A" vs "order B"), and never across users/tenants with private data |
| **Batch API** | ~50% on non-urgent jobs | results within hours — nightly summaries, bulk classification |

---

## 3. Latency

- **TTFT (time to first token)** is what users feel → **stream** ([Part 12 §3](12-llm-apps-in-node-and-react.md)).
- **Total time ≈ number of sequential LLM calls × each call's time** → cut sequential steps; run independent ones **in parallel** (`Promise.all`: retrieval + query classification).
- Smaller models and shorter outputs are faster; reasoning models are slower.
- Prompt caching also cuts TTFT for long prompts.
- Put slow, non-interactive work in **background jobs** with progress UI.

---

## 4. Reliability

- **Timeouts** on every call; **retries with backoff** for 429/5xx.
- **Fallbacks** — another model or provider when the primary fails; or a degraded answer ("here are the top matching documents").
- **AI gateway** (LiteLLM, OpenRouter, Portkey, Cloudflare/Vercel AI Gateway) — one API over many providers with fallbacks, caching, rate limiting and cost tracking. Useful once you use several providers; **not needed for one**.
- **Pin model versions** (dated snapshots) so behaviour doesn't change under you; upgrade deliberately with an eval run.
- **Circuit breaker** — stop hammering a provider that's down.

---

## 5. Hosted API vs self-hosted (open-weight) models

| | Hosted API (OpenAI, Anthropic, Google, Bedrock, Azure) | Self-hosted (Llama, Qwen, Mistral, Gemma via vLLM / Ollama) |
|---|---|---|
| quality | usually best frontier models | good and improving; smaller models |
| ops | none | GPUs, scaling, monitoring — real work |
| cost | pay per token | pay for GPUs whether busy or idle — cheaper only at high steady volume |
| data | goes to provider (check policies, regions) | stays with you |
| use when | default | strict data rules, offline/edge, very high volume, custom models |

**Managed middle ground:** cloud platforms (AWS Bedrock, Azure OpenAI, Google Vertex) offer many models inside your cloud account with your network and compliance controls.

---

## 6. When to fine-tune

Try in this order: **better prompt → few-shot examples → RAG → fine-tuning.**

Fine-tune when:
- you need a **consistent format/style/behaviour** that prompting doesn't reliably give,
- you want a **smaller, cheaper model** to match a bigger one on **one narrow task** (distillation),
- you have **hundreds to thousands of good examples**.

Don't fine-tune to add **facts** (use RAG — facts change and need citations).

**LoRA / PEFT** — instead of updating all the weights, train small "adapter" layers → much cheaper, and you can swap adapters. **QLoRA** = LoRA on a compressed (quantised) model → fits on smaller GPUs. Hosted fine-tuning APIs hide all this.

---

## 7. Shipping changes safely

- **Version** prompts, models, chunking and embedding models together; log the version with every response.
- **Eval before release** → **shadow/A-B** a small % of traffic → watch quality, cost, latency → roll out.
- **Feature flags** to switch prompt/model versions without a deploy.
- Embedding model change = **re-index into a new collection**, then switch the pointer.

> 🧠 **Remember:** **measure → cache → route → trim.** And every change goes through the eval set.

---

## Interview Q&A

**Q: How would you cut the cost of an LLM feature?**
> First measure where tokens go. Then: prompt caching with static content first, fewer and better RAG chunks, trimmed history, `max_tokens` and concise answers, routing simple requests to a smaller model, caching repeated answers, and the batch API for offline work — checking each change against the eval set.

**Q: What is prompt caching?**
> The provider stores the processed form of a prompt prefix that repeats across requests — system prompt, tools, large documents — and charges much less for those tokens next time, with lower latency. To benefit, keep the static parts at the start and the changing parts at the end.

**Q: Semantic caching — good idea?**
> It can save a lot for repetitive questions, but similar isn't identical: two questions can look alike and need different answers, and caching across users can leak private data. I'd use it only for public, generic content, with a high similarity threshold, scoped per tenant.

**Q: When would you self-host a model?**
> When data can't leave our environment, at very high steady volume where GPUs are cheaper than per-token pricing, or for offline use. Otherwise hosted APIs — or managed platforms like Bedrock inside our cloud — are better quality for much less operational work.

**Q: When is fine-tuning the right choice?**
> For consistent behaviour, format or style, or to make a small model good at one narrow task — when I have enough good examples and prompting plus RAG isn't enough. Not for adding knowledge; that's RAG.

---

## Follow-ups (challenge questions)

- *Cost:* the bot costs $12k/month. 70% of questions are about order status and shipping times. Design the cheaper version and how you'd prove it's not worse.
- *Reliability:* your only LLM provider has a 2-hour outage. What does the user see today, and what should they see?

---

## Cheat Sheet

```
work with the best model → measure (evals) → cheaper/faster without losing quality
cost = in × price_in + out × price_out (+ thinking) × volume · drivers: context, history, agent loops
levers: max_tokens · PROMPT CACHING (static first) · trim · MODEL ROUTING · response cache · semantic cache (careful) · batch API
latency: TTFT → stream · fewer sequential calls · parallel · smaller models · background jobs
reliability: timeouts · backoff · fallbacks · gateway (when multi-provider) · pin versions · circuit breaker
hosted (default) vs self-hosted (data rules, huge steady volume) · Bedrock/Azure/Vertex = middle
fine-tune: prompt → few-shot → RAG → fine-tune · behaviour not facts · LoRA/QLoRA adapters
ship: version everything · eval → A/B → rollout · flags · re-index on embedding change
```

---

**Previous:** [Part 15 — AI Security](15-ai-security.md) · **Next:** [Part 17 — AI System Design](17-ai-system-design.md)
