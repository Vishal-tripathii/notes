# AI Engineering Notes — Part 17

## AI System Design & Using AI at Work ⭐⭐⭐⭐☆

**Topics:** a framework for "design an AI feature" questions · worked example: document Q&A for many tenants · smaller worked examples (support bot, ticket classifier) · "should this even use an LLM?" · using AI coding tools at work (and talking about it in interviews).

---

## 1. The one rule

> **An AI feature is a normal system with one unreliable, slow, expensive component in the middle.** Design everything around it the way you'd design around a flaky third-party API: validate, limit, cache, fall back, observe.

Use the usual system design framework ([System-design framework](../System-design/00-DESIGN-PROBLEM-FRAMEWORK.md)) and add the AI-specific questions below.

---

## 2. Framework — the AI-specific questions

1. **Is an LLM even needed?** A rule, a search box or a classic classifier may be cheaper, faster and testable.
2. **What does "good" mean?** Accuracy target, acceptable "I don't know" rate, latency target (TTFT), cost per request/user. → becomes the **eval set**.
3. **What data, and who can see what?** Sources, size, update frequency, **tenant/user permissions**.
4. **Which pattern?** Single call → workflow → RAG → agent. Simplest that meets the bar.
5. **Model choice & routing**; hosted vs self-hosted (data rules).
6. **Failure modes:** hallucination, injection, provider outage, rate limits, runaway cost.
7. **Evaluation & observability** — how you'll know it works and keeps working.
8. **Cost estimate** — tokens × volume.

---

## 3. ⭐ Worked example — "Chat with your company documents" for 500 tenants

**Requirements:** each company uploads docs (PDF, DOCX, HTML); employees ask questions; answers with citations; tenants never see each other's data; ~5M chunks total; p95 TTFT < 2 s.

```
            ┌──────── React chat (streaming, citations, feedback) ────────┐
                                      │
                         API (Node/FastAPI): auth → rate limit → /chat
                                      │
   ┌──────────────── QUERY PATH ────────────────────────────────────────┐
   │ load history (DB) → rewrite query (small model)                   │
   │ → hybrid search, FILTER tenant_id (from session) → top 30         │
   │ → rerank → top 5 → grounded prompt (cached static prefix)         │
   │ → LLM (stream) → save message + trace                             │
   └────────────────────────────────────────────────────────────────────┘

   ┌──────────────── INGESTION PATH (async) ────────────────────────────┐
   │ upload → object storage (S3) → queue → worker:                     │
   │ parse/OCR → clean → chunk + contextual header → embed (batch)      │
   │ → upsert {vector, text, doc_id, tenant_id, page} → status = ready  │
   └────────────────────────────────────────────────────────────────────┘

   Postgres: tenants, users, documents (status, hash), conversations, messages
   Vector store: pgvector (start) → Qdrant if scale/hybrid needs grow
   Observability: traces (Langfuse/OTel), cost per tenant, eval runs in CI
```

**Key decisions to say out loud:**
- **Tenant isolation** — `tenant_id` filter from the **server session** on every search (or a collection per large tenant). Tested with a dedicated eval case.
- **Ingestion is async** — queue + workers, retries, per-document status; content hash skips unchanged files; delete removes all chunks.
- **Retrieval** — hybrid + rerank; query rewriting for follow-ups. Add contextual headers at ingestion.
- **Prompt** — answer only from context, "I don't know", numbered citations; static instructions first for caching.
- **Cost** — e.g. 2k input + 300 output tokens per question; × 200k questions/day → estimate; route simple chit-chat to a small model; per-tenant budgets.
- **Security** — documents can contain injection → the bot has **no write tools**; output rendered safely; per-user rate limits.
- **Evals** — per-tenant sample questions; faithfulness + recall@K; run on every change.
- **Scale later** — separate embedding service, dedicated vector DB, read replicas, caching popular answers per tenant.

---

## 4. Smaller examples (practise these out loud)

**Support ticket classifier** (route tickets to teams):
- Is an LLM needed? For 5 clear categories with lots of labelled history, a classic classifier might do. LLM wins with few labels or fuzzy categories.
- Design: structured output (enum categories + confidence) → validate → low confidence → human queue. Batch API for backlog. Eval with labelled history (accuracy per category).

**Customer support bot with actions** (order status, refunds):
- RAG over help docs + **read-only** tools (`get_order_status` acting as the logged-in user).
- Refunds → the bot **prepares** the request; a **human or a fixed rule** approves.
- Handoff to a human agent with the conversation summary.
- Track deflection rate, CSAT, thumbs-down, escalation rate.

**"AI summary" of long documents in an existing app:**
- Workflow, not agent: chunk → summarise each (parallel, small model) → combine. Background job, cached by document hash, regenerate on change.

---

## 5. Using AI coding tools at work

Interviewers now ask **"How do you use AI in your work?"** They want to hear that you're productive **and** responsible.

**Where it helps:**
- boilerplate, tests, migrations, regex, SQL drafts, refactors across many files
- explaining unfamiliar code, error messages, libraries
- first drafts of docs, PR descriptions, commit messages
- agentic tools (Claude Code, Copilot agent mode, Cursor) for multi-step tasks with tests as the safety net

**How to use it responsibly:**
- **You own every line you commit** — read and understand AI-written code; review it like a junior colleague's PR.
- **Verify with tests and running the code**, not by reading confident explanations.
- Watch for **hallucinated APIs/packages** (also a supply-chain attack: fake package names), outdated patterns, missed edge cases, security holes (injection, auth checks).
- **Don't paste secrets, customer data or proprietary code** into tools your company hasn't approved.
- Give it **context** (files, conventions, the error, the test) and small, clear tasks — the same prompting rules as [Part 02](02-prompt-engineering-and-structured-output.md).

**A good spoken answer:**
> "I use AI assistants daily for boilerplate, tests and understanding unfamiliar code, and agentic tools for larger refactors. I give them clear context and small tasks, and I treat the output like a junior developer's PR — I read it, run the tests, and check edge cases and security. I don't share secrets or customer data with unapproved tools. It makes me faster, but I'm still responsible for what ships."

---

## Interview Q&A

**Q: How would you design a "chat with your documents" feature for a multi-tenant SaaS?**
> Async ingestion — upload to storage, queue, workers that parse, chunk, embed and upsert with `tenant_id` and `doc_id`. A query path that rewrites follow-ups, runs hybrid search filtered by the tenant from the session, reranks, builds a grounded prompt with citations, and streams the answer. Conversations in Postgres, traces and per-tenant cost tracking, an eval set run in CI, no write tools for the bot, and per-user rate limits.

**Q: How do you decide whether a feature should use an LLM at all?**
> If the logic is clear rules, or a classic model with enough labelled data does it reliably, that's cheaper, faster and testable. An LLM makes sense for language-heavy, fuzzy tasks — understanding free text, summarising, answering from documents — where some error is acceptable and can be handled.

**Q: How do you estimate the cost of an AI feature?**
> Tokens per request — system prompt, context, history and output — times prices, times expected volume. Then I look at levers: caching the static prompt, routing simple requests to a small model, trimming context, and per-tenant budgets.

**Q: How do you use AI tools in your daily work?**
> (See §5 — productive and responsible: context, small tasks, review like a PR, tests, no secrets.)

---

## Follow-ups (challenge questions)

- *Scale:* one tenant uploads 2M pages and their searches slow down everyone. What do you change?
- *Product:* the CEO wants "an AI agent that does everything a support agent does." What would you ship first, and how do you show it's working?

---

## Cheat Sheet

```
AI feature = normal system + one unreliable, slow, expensive component → validate, limit, cache, fall back, observe
QUESTIONS: need an LLM? · what's "good" (→ evals) · data + permissions · simplest pattern · model/routing ·
           failure modes · eval + observability · cost estimate
DOC Q&A: async ingestion (S3 → queue → parse/chunk/embed → upsert w/ tenant_id) ·
         query: history → rewrite → hybrid + TENANT FILTER → rerank → grounded prompt → stream → trace
         no write tools · rate limits · per-tenant cost · evals in CI · pgvector → Qdrant when needed
AI TOOLS AT WORK: boilerplate/tests/explain/refactor · own every line · test it · hallucinated packages ·
                  no secrets/customer data in unapproved tools · context + small tasks
```

---

**Previous:** [Part 16 — Production AI](16-production-ai.md) · **Next:** [Q&A Interview Bank](QNA-INTERVIEW-BANK.md)
