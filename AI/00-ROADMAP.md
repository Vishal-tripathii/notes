# 🤖 AI Engineering Notes — Master Roadmap

> **Purpose:** the study plan for building AI features as a **full-stack engineer**: LLM basics, prompting, RAG, agents, tools, and taking it to production safely. 17 parts, in order. Same format as the other tracks: a plain-language rule, an analogy, code, interview Q&A, follow-ups, and a cheat sheet.
>
> **Target:** interview-ready for a 3–4-year full-stack role where AI features are part of the job — not ML research. You should be able to explain the ideas, build a streaming RAG chat end to end, and talk about cost, evals and security.
>
> **Versions:** written in November 2026. Models, SDKs and prices change fast — the **concepts** here are stable; check provider docs for current model names and API details.
>
> 📋 **[Interview Question Bank](QNA-INTERVIEW-BANK.md)** — ~125 questions across 18 sections, including deep-dive questions on your own RAG project.
> 🛠️ **[RAG Project Plan](rag-project-plan.md)** — the hands-on project that ties the track together.

---

## Progress tracker

| # | Part | Priority | Status |
|---|---|---|---|
| 01 | [LLM Fundamentals](01-llm-fundamentals.md) — how LLMs work, reasoning models, tokens, context, cost, dials, limitations | ⭐⭐⭐⭐⭐ | ✅ done |
| 02 | [Prompt Engineering & Structured Output](02-prompt-engineering-and-structured-output.md) — roles, few-shot, chaining, JSON schemas, zod validation | ⭐⭐⭐⭐⭐ | ✅ done |
| 03 | [Embeddings](03-embeddings.md) — meaning as vectors, same-model rule, cosine | ⭐⭐⭐⭐⭐ | ✅ done |
| 04 | [Vector Databases](04-vector-databases.md) — ANN, HNSW, metadata filters, multi-tenancy, pgvector | ⭐⭐⭐⭐☆ | ✅ done |
| 05 | [Document Ingestion](05-document-ingestion.md) — parsing, chunking, metadata, keeping the index fresh | ⭐⭐⭐⭐☆ | ✅ done |
| 06 | [RAG Fundamentals](06-rag-fundamentals.md) — pipeline, grounded prompt, citations, RAG vs fine-tuning, debugging | ⭐⭐⭐⭐⭐ | ✅ done |
| 07 | [Advanced Retrieval](07-advanced-retrieval.md) — query rewriting, hybrid search, reranking | ⭐⭐⭐⭐☆ | ✅ done |
| 08 | 🆕 [Advanced RAG](08-advanced-rag.md) — contextual retrieval, HyDE, corrective & agentic RAG, GraphRAG | ⭐⭐⭐☆☆ | ✅ done |
| 09 | [AI Agents](09-ai-agents.md) — the loop, ReAct, workflows vs agents, a raw agent, frameworks | ⭐⭐⭐⭐⭐ | ✅ done (updated) |
| 10 | [Tool Calling](10-tool-calling.md) — schemas, tool_choice, validating & authorising calls, tool design | ⭐⭐⭐⭐⭐ | ✅ done (expanded) |
| 11 | [MCP](11-mcp.md) — hosts/clients/servers, tools/resources/prompts, transports, security | ⭐⭐⭐⭐☆ | ✅ done (updated) |
| 12 | 🆕 [LLM Apps in Node & React](12-llm-apps-in-node-and-react.md) — keys, streaming to React, zod output, 429s, protecting the endpoint, safe rendering, AI UX | ⭐⭐⭐⭐⭐ | ✅ done |
| 13 | 🆕 [Memory & Multi-Agent Systems](13-memory-and-multi-agent.md) | ⭐⭐⭐☆☆ | ✅ done |
| 14 | 🆕 [Evaluation & Observability](14-evaluation-and-observability.md) — eval sets, LLM-as-judge, RAG metrics, tracing | ⭐⭐⭐⭐⭐ | ✅ done |
| 15 | 🆕 [AI Security](15-ai-security.md) — prompt injection, lethal trifecta, OWASP LLM Top 10, defences | ⭐⭐⭐⭐⭐ | ✅ done |
| 16 | 🆕 [Production AI](16-production-ai.md) — caching, routing, latency, fallbacks, self-hosting, fine-tuning | ⭐⭐⭐⭐☆ | ✅ done |
| 17 | 🆕 [AI System Design & Using AI at Work](17-ai-system-design.md) | ⭐⭐⭐⭐☆ | ✅ done |

**Gap review (Nov 2026):** the old single file `ai-engineering-notes.md` (Phases 1–10) was split into Parts 01–11 and its errors fixed:
- legacy LangChain agent API → LangChain 1.x / raw loop;
- `eval()` calculator tool → safe typed tools;
- MCP "HTTP/SSE" → Streamable HTTP + OAuth + client features;
- JSON mode vs strict structured outputs separated;
- reasoning models added;
- hard-coded model names → config.

The skipped/missing Phases 7 and 11–16 became Parts 08 and 13–16. Parts 12 and 17 were added for the full-stack role. The Q&A bank is new.

---

# Phases

**PHASE 1 — How LLMs work (01–02):** what the model is, what it costs, how to steer it, how to get structured output.

**PHASE 2 — RAG (03–08):** embeddings → vector DBs → ingestion → the RAG pipeline → better retrieval → advanced patterns.

**PHASE 3 — Agents & tools (09–11):** the agent loop, tool calling, MCP.

**PHASE 4 — Shipping it (12–17):** building it in Node/React, memory, evals, security, cost and reliability, system design.

---

# Interview priority — what to revise last

| Priority | Topics |
|---|---|
| ⭐⭐⭐⭐⭐ | LLM fundamentals · prompting & structured output · embeddings · RAG · agents · tool calling · Node/React streaming · evals · security |
| ⭐⭐⭐⭐☆ | vector DBs · ingestion · advanced retrieval · MCP · production cost/latency · system design |
| ⭐⭐⭐☆☆ | advanced RAG · memory & multi-agent |

**If you have one day left:** Parts 01, 06, 09, 10, 12, 15 → then the Q&A bank sections 7, 9, 11, 14 and 18 (your project) out loud.

---

# Suggested schedule

| Week | Parts |
|---|---|
| 1 | 01 LLM fundamentals · 02 Prompting · 03 Embeddings |
| 2 | 04 Vector DBs · 05 Ingestion · 06 RAG |
| 3 | 07 Advanced retrieval · 08 Advanced RAG · 12 Node & React |
| 4 | 09 Agents · 10 Tool calling · 11 MCP |
| 5 | 13 Memory & multi-agent · 14 Evals · 15 Security |
| 6 | 16 Production · 17 System design · Q&A bank revision |

**Build something:** the [RAG project](rag-project-plan.md), with a streaming React chat ([Part 12](12-llm-apps-in-node-and-react.md)), citations, a small eval set ([Part 14](14-evaluation-and-observability.md)), and one read-only tool. Building it exposes more gaps than re-reading.

---

## Connects to

- **[Node.js track](../nodejs/)** — streams, background jobs, rate limiting, logging: everything around the LLM call.
- **[React track](../React/00-ROADMAP.md)** — streaming UI, forms, Server Actions.
- **[TypeScript track](../typescript/00-ROADMAP.md)** — zod schemas and validating untrusted data.
- **[Database track](../database/00-ROADMAP.md)** — storing conversations, pgvector.
- **[System Design track](../System-design/00-ROADMAP.md)** — queues, caching, rate limiting, multi-tenancy.
- **[work/RAG.md](../work/RAG.md)** — the original learning roadmap these notes follow.

*— One part at a time: understand it, build it, say the answers out loud. —*
