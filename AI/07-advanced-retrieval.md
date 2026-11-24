# AI Engineering Notes — Part 07

## Advanced Retrieval ⭐⭐⭐⭐☆

**Topics:** top-K · metadata filtering · query rewriting · query expansion & multi-query · self-query · dense vs sparse (BM25) · hybrid search & RRF · reranking with cross-encoders · context compression · the production retrieval funnel.

---

## 1. The one rule

> **Retrieve wide and cheap, then narrow precisely.** Clean up the query going in and the context coming out. Each technique below fixes one specific failure — add it when you see that failure, not before.

---

## 2. The knobs

- **Top-K** — how many chunks you fetch. **Too low** → miss the answer (low recall). **Too high** → noise, "lost in the middle," cost. Pattern: **retrieve ~20–50, rerank down to 3–8.**
- **Metadata filtering** — `AND tenant_id = me AND year >= 2024` — relevance **and** security ([Part 04 §6](04-vector-databases.md)).

---

## 3. Fixing the query

- ⭐ **Query rewriting** — chat follow-ups are meaningless alone ("what about the second one?"). Use a cheap LLM call to **rewrite it into a standalone question** using the chat history → "What are the side effects of ibuprofen?" **Essential for conversational RAG.** Without it, follow-ups retrieve garbage.
- **Query expansion** — add synonyms and related terms ("heart attack" → also "myocardial infarction").
- **Multi-query** — generate 3 rewordings, retrieve for each, merge and dedupe → more robust.
- **Self-query** — LLM turns the question into a **search + filter**: "What did Apple say about revenue in 2023?" → `query="revenue"`, `filter={company:"Apple", year:2023}`. ⚠️ Never let it set security filters like `tenant_id` — those come from the server.

---

## 4. ⭐ Hybrid search — dense + sparse

| | Dense (embeddings) | Sparse (keyword, **BM25**) |
|---|---|---|
| good at | meaning, synonyms, paraphrases | **exact terms**: codes, IDs, names, acronyms |
| bad at | "ERR-4012", "Section 4.2(b)", rare names | synonyms, paraphrases |

**Hybrid** runs both and merges the results, usually with **RRF (Reciprocal Rank Fusion)** — each result scores `1 / (k + rank)` in each list, and the scores are added. Simple, needs no score normalisation, works well.

Most vector DBs (Qdrant, Weaviate, Elasticsearch/OpenSearch, MongoDB Atlas) and Postgres (pgvector + full-text search) support it. **The production default** for anything with codes, names or jargon.

---

## 5. ⭐⭐ Reranking — the biggest single quality win

Embedding search is fast but its **ordering is rough** — the best chunk may be #8.

```
vector/hybrid search → top 30 (fast, rough)
       → cross-encoder reranker reads (query, chunk) TOGETHER → scores each
       → keep the best 5 (slow, precise — but only on 30 items)
```

- **Bi-encoder** (embeddings): query and chunk are encoded **separately**, then compared. Fast, can pre-compute, loses nuance.
- **Cross-encoder** (reranker): reads query **and** chunk **in one pass**. Much more accurate, too slow for millions — perfect for 30.
- Tools: Cohere Rerank, Voyage rerank, `bge-reranker`, Jina reranker; or an LLM as a reranker (costlier).
- *Gold:* "Bi-encoder retrieves fast but coarse; cross-encoder reranks the top-K by reading query and chunk together. Retrieve wide, rerank narrow."

```python
# pip install sentence-transformers
from sentence_transformers import CrossEncoder
reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
query = "How long do refunds take?"
candidates = ["Our office is open 9am to 5pm on weekdays.",
              "Refunds are processed within 14 days of purchase.",
              "We offer free shipping over $50.",
              "Customers can request a refund by emailing support."]
scores = reranker.predict([(query, c) for c in candidates])
for c, s in sorted(zip(candidates, scores), key=lambda x: -x[1]):
    print(round(float(s), 2), c)      # refund sentences rise; office hours sink
```

---

## 6. Context compression

A 500-token chunk may have 2 relevant sentences. Keep only the relevant parts before building the prompt → less noise, lower cost. Often unnecessary with good chunking + reranking; add it if context size or cost hurts.

---

## 7. The production retrieval funnel

```
question
  → query rewriting (standalone, chat-aware)
  → (optional) expansion / multi-query
  → HYBRID search (dense + BM25) + mandatory tenant filter   → top 20–50
  → RERANK (cross-encoder)                                    → best 3–8
  → (optional) compression
  → grounded prompt → LLM → cited answer
```

**Add in this order, measuring each step** ([Part 14](14-evaluation-and-observability.md)): query rewriting (if it's a chat) → hybrid → reranker → the rest only if evals show a gap.

> 🧠 **Remember:** **hybrid + rerank + rewrite** covers most real-world retrieval problems.

---

## Interview Q&A

**Q: What is hybrid search and why use it?**
> Running semantic (embedding) search and keyword search like BM25 together and merging the results, often with Reciprocal Rank Fusion. Embeddings catch meaning and synonyms; keywords catch exact codes, names and IDs. Real queries need both.

**Q: What is reranking and why does it help?**
> After a fast first search returns, say, 30 candidates, a cross-encoder reads the query and each candidate together and scores relevance much more accurately. You keep the top few. It's usually the single biggest quality improvement in RAG.

**Q: Bi-encoder vs cross-encoder?**
> A bi-encoder embeds query and document separately, so documents can be pre-computed and searched quickly, but nuance is lost. A cross-encoder processes the pair together — far more accurate but too slow to run over the whole corpus, so it's used for reranking.

**Q: How do you handle follow-up questions in a RAG chat?**
> Query rewriting: before retrieval, a small LLM call turns the follow-up plus recent history into a standalone question. Otherwise "what about the second one?" retrieves nothing useful.

**Q: What is RRF?**
> Reciprocal Rank Fusion merges ranked lists by giving each item `1/(k + rank)` from each list and summing. It only uses ranks, so you don't have to normalise scores from different search methods.

---

## Follow-ups (challenge questions)

- *Trade-off:* adding a reranker improved answer quality by 12% but added 300 ms. How do you decide, and how could you reduce the latency?
- *Failure mode:* after adding self-query, a user asks "show me other companies' contracts" and the model generates a filter for a different `tenant_id`. What should have prevented that?

---

## Cheat Sheet

```
retrieve WIDE (20–50, cheap) → narrow PRECISELY (rerank to 3–8)
query fixes: REWRITE (chat follow-ups ⭐) · expansion · multi-query · self-query (never security filters)
dense = meaning · sparse BM25 = exact terms → HYBRID + RRF (1/(k+rank)) = default
RERANK: cross-encoder reads (query, chunk) together · bi-encoder = separate, fast, coarse
compression: optional
add in order: rewrite → hybrid → rerank → others only if evals say so
```

---

**Previous:** [Part 06 — RAG Fundamentals](06-rag-fundamentals.md) · **Next:** [Part 08 — Advanced RAG](08-advanced-rag.md)
