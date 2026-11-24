# AI Engineering Notes — Part 08

## Advanced RAG ⭐⭐⭐☆☆

**Topics:** naive → advanced → agentic RAG · contextual retrieval · HyDE · corrective RAG (judge and retry) · agentic RAG · GraphRAG · multimodal RAG · when *not* to use these.

> Know what each one is and **which problem it solves**. In interviews, "I'd add X only if evals showed Y" beats listing techniques.

---

## 1. The one rule

> **Plain RAG always retrieves once and answers. Advanced RAG adds decisions:** *should I retrieve? were these results good? should I search again, differently?*

```
Naive RAG:    retrieve once → answer
Advanced RAG: better query + hybrid + rerank → answer          (Part 07)
Agentic RAG:  decide → maybe retrieve → judge → retry/other tool → answer   (a loop)
```

---

## 2. Contextual retrieval

**Problem:** a chunk like "Revenue grew 3% over the previous quarter" doesn't say *which* company or quarter, so it's hard to find.

**Fix:** before embedding, prepend a short context to each chunk — either the document title + section headings (free), or a one-sentence LLM-written summary of where the chunk sits in the document. Apply it to both the embedding and the BM25 index.

Cheap at ingestion (especially with prompt caching for the LLM version), and a solid improvement. **One of the best effort-to-gain ratios.**

---

## 3. HyDE (Hypothetical Document Embeddings)

**Problem:** questions and answers are worded differently ("How do I get my money back?" vs "Refunds are processed…").

**Fix:** ask the LLM to write a **fake answer** to the question, embed *that*, and search with it — a fake answer looks more like the real answer than the question does.

Costs an extra LLM call per query and can mislead if the fake answer is way off. Try only if evals show question/answer mismatch.

---

## 4. Corrective RAG — judge and retry

After retrieving, ask a cheap model (or the reranker's scores): **"Are these chunks relevant enough to answer?"**

- yes → answer
- partly → rewrite the query and search again
- no → fall back (web search, another source) or say "I don't know"

Simple version: **if the best reranker score is below a threshold, don't answer from it.** That alone avoids many confident wrong answers.

---

## 5. Agentic RAG

RAG becomes **one tool** an agent can call ([Part 09](09-ai-agents.md)). The agent decides:
- whether it needs to search at all ("hi" needs no retrieval),
- which source (docs search, SQL database, web, a ticket API),
- how to break a complex question into several searches ("Compare our 2023 and 2024 refund policies" → two searches),
- whether the results are good enough, or to search again.

**Pros:** handles multi-part questions and multiple sources. **Cons:** more LLM calls → slower, costlier, less predictable, harder to test. **Use it when questions genuinely need multiple steps or sources.**

---

## 6. GraphRAG

**Problem:** questions about **relationships across many documents** ("Which suppliers are linked to delayed projects?") or **whole-corpus themes** ("What are the main complaints this year?") — no single chunk holds the answer.

**Idea:** at ingestion, an LLM extracts **entities and relationships** into a **knowledge graph** (often with summaries of clusters of related entities). At query time, traverse the graph and/or use the summaries.

**Cost:** ingestion is expensive (many LLM calls) and the graph must be maintained. Worth it for relationship-heavy or "summarise everything" questions; overkill for normal FAQ/document Q&A.

---

## 7. Multimodal RAG

Documents with **charts, diagrams, screenshots, scanned forms**:
- extract images and have a vision model **describe** them as text, then embed the text, or
- use **multimodal embeddings** / page-image retrieval (embed whole page images and send the matched page image to a vision LLM).

Useful for slide decks, manuals and invoices where the meaning is in the visuals.

---

## 8. Don't over-engineer

| Symptom (seen in evals) | Try |
|---|---|
| chunks lack context ("it", "the company") | contextual retrieval |
| exact codes/names missed | hybrid search ([Part 07](07-advanced-retrieval.md)) |
| right chunk retrieved but ranked low | reranker |
| follow-ups fail | query rewriting |
| confident answers from weak matches | relevance threshold / corrective RAG |
| multi-part questions, multiple sources | agentic RAG |
| relationship / whole-corpus questions | GraphRAG |

> 🧠 **Remember:** **symptom first, technique second.** Each technique adds cost, latency and moving parts.

---

## Interview Q&A

**Q: What is agentic RAG?**
> Retrieval as a tool inside an agent loop. The model decides whether to search, what to search, which source to use, checks if the results are good enough, and searches again if not. It handles complex multi-step questions better, at the cost of latency, cost and predictability.

**Q: What is contextual retrieval?**
> Adding a short description of where a chunk comes from — document title, section, or an LLM-written one-liner — to the chunk before embedding and keyword indexing. Chunks that say "it grew 3%" become findable because they now say which company and period.

**Q: When would you use GraphRAG?**
> When answers depend on relationships across many documents or on themes across the whole corpus, which no single chunk contains. It's expensive to build and maintain, so not for regular document Q&A.

**Q: How do you stop the bot answering confidently from irrelevant chunks?**
> Check relevance before answering — a reranker score threshold or a quick LLM relevance check — and if nothing is good enough, rephrase and retry once or say "I don't know."

---

## Follow-ups (challenge questions)

- *Design:* users ask "How has our refund policy changed over the last three years?" — what does plain RAG return, and what's the minimum change that answers it well?
- *Cost:* agentic RAG doubled answer quality on hard questions but tripled cost on all questions. How do you get the quality without paying for it everywhere?

---

## Cheat Sheet

```
naive (retrieve once) → advanced (rewrite + hybrid + rerank) → agentic (decide/judge/retry loop)
CONTEXTUAL RETRIEVAL: prepend doc/section context to each chunk · cheap, high value
HyDE: embed a fake answer instead of the question · extra call
CORRECTIVE: relevance check / score threshold → retry or "I don't know"
AGENTIC RAG: retrieval = a tool · multi-step, multi-source · slower, costlier
GraphRAG: entities + relations graph · relationship / whole-corpus questions · expensive ingestion
MULTIMODAL: describe images or embed page images → vision LLM
symptom first, technique second
```

---

**Previous:** [Part 07 — Advanced Retrieval](07-advanced-retrieval.md) · **Next:** [Part 09 — AI Agents](09-ai-agents.md)
