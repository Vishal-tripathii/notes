# AI Engineering Notes — Part 04

## Vector Databases ⭐⭐⭐⭐☆

**Topics:** why vector DBs exist · exact vs approximate nearest neighbour (ANN) · HNSW · collections, index, payload, metadata · insert / update / delete / search · metadata filtering & multi-tenancy · vector DB vs a normal DB · pgvector · choosing one.

---

## 1. The one rule

> **A vector DB stores embeddings and finds the nearest ones in milliseconds using *approximate* search, plus filtering.** It's a specialised search index that sits **next to** your normal database — not a replacement for it.

---

## 2. Why they exist

- Retrieval = "find the vectors closest to my query vector." With millions of chunks, checking **every** vector (**brute force / exact k-NN**) is too slow — like finding a friend by walking up to all 50,000 people in a stadium.
- A vector DB does this fast and also handles insert/update/delete, filtering and scale.

---

## 3. Approximate nearest neighbour (ANN)

- Exact search is 100% accurate but checks every vector (O(n)) — too slow at scale.
- **ANN** finds the true nearest neighbours **most of the time (often ~95–99% recall) but far faster.** Occasionally it returns #4 instead of #3 — **fine for RAG**, where you want a few relevant chunks, not a perfect ranking.
- Stadium analogy: don't check all 50,000 — **ask which section, go there, search that section.**
- **The core trade-off: accuracy (recall) vs speed.** Index settings let you tune it.
- *Interview gold:* "Why approximate?" → exact search is linear in the data size; ANN gives high recall at a fraction of the cost, which is enough for RAG.

---

## 4. HNSW (the ANN algorithm to name)

- **Hierarchical Navigable Small World** — the index most vector DBs use (Qdrant, Weaviate, Milvus, pgvector, Elasticsearch/OpenSearch).
- **Airport analogy**, built in layers: **top layer** = a few hub airports, long-distance jumps; **bottom layer** = every local airport, short hops. To search: **start at the top** (big jumps to the right region), then **drop down layer by layer** taking smaller hops until you reach the nearest neighbours.
- Fast because you **skip across** the space instead of checking every point. Cost: the graph mostly lives **in RAM**, and building it takes time.
- Other index type you may hear: **IVF** (cluster vectors into buckets, search only the closest buckets) — often combined with **quantization** (compress vectors to save memory).
- *One-liner:* "A layered graph — long hops at the top to reach the right region, short hops at the bottom to refine."

---

## 5. The vocabulary

- **Collection** — a named group of vectors (like a table). All vectors share the **same dimension** (same embedding model).
- **Index** — the structure (usually HNSW) that makes search fast.
- **Payload / document** — the **original chunk text** stored with the vector, so you can return something readable.
- **Metadata** — structured fields (`source, page, date, tenant_id`) used for **filtering** and citations.

```
{ id: "chunk_4823",
  vector:  [0.02, -0.31, ...],                              ← SEARCH on it (meaning)
  payload: { text: "Refunds processed in 14 days...",       ← RETURN it
             source: "policy.pdf", page: 12, tenant_id: "acme" } }   ← FILTER on it
```

*One-liner:* "Vector = search on it, text = return it, metadata = filter on it."

---

## 6. Operations

- **Upsert** — insert-or-update by id. This is ingestion.
- **Update** — document changed → re-embed and upsert the same ids. (Use stable ids like `docId:chunkIndex` so you can replace a document's chunks.)
- **Delete** — retracted documents, or user data deletion (**GDPR / right to be forgotten**) — delete by metadata (`doc_id = X`).
- **Similarity search** — query vector → top-K nearest with text and scores.
- ⭐ **Metadata filtering** — "similar to the query **AND** `tenant_id = 'acme'` **AND** `year >= 2024`." Used for:
  - **Security / multi-tenancy** — users must only retrieve **their own** organisation's documents. The filter must come from the **server-side session**, never from the client or the LLM.
  - **Relevance** — narrow by document type, date or language.
  - *Interview:* "How do you stop tenant A seeing tenant B's docs in RAG?" → **a mandatory server-side metadata filter on `tenant_id`** (or a separate collection per tenant for strict isolation).

---

## 7. Vector DB vs normal DB (classic interview question)

**Can a vector DB be your main database? Technically partly, but you shouldn't** — like using a race car to carry groceries.

- Normal DBs answer **exact** questions ("row where id=42", joins, transactions, totals). Vector DBs answer **"what's similar to this"** (fuzzy, top-K).
- Weak spots of a vector DB as a main store: no real joins or transactions, exact lookups aren't its strength, RAM-heavy indexes are expensive, and you'd rebuild what Postgres already does.
- **pgvector** adds vector search **inside Postgres** — normal columns and a vector column in one table:

```sql
SELECT title, price FROM products
WHERE category = 'shoes'                     -- exact filter
ORDER BY embedding <=> $1                    -- <=> = cosine distance
LIMIT 5;
```

| Need | Right tool |
|---|---|
| exact lookups, joins, transactions | Postgres / MySQL |
| flexible documents, caching | MongoDB, Redis |
| "find things that *mean* this" | a vector DB (Qdrant, Pinecone, Weaviate, Milvus) |
| both, modest scale, one system | **Postgres + pgvector** (or MongoDB Atlas Vector Search) |

**Choosing, without over-engineering:**
1. Prototype / small static data → in-memory (Chroma, FAISS).
2. Already on Postgres and under a few million vectors → **pgvector**. One less system to run.
3. Many millions of vectors, heavy filtering, high traffic, hybrid search built in → a dedicated vector DB (Qdrant, etc.).

> 🧠 **Remember:** **start with what you already run.** Add a dedicated vector DB when numbers say you need it.

### Hands-on (Python — local, no server)
```python
# pip install chromadb sentence-transformers
import chromadb
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("all-MiniLM-L6-v2")
col = chromadb.Client().create_collection("docs")
chunks = [("c1", "Refunds are processed within 14 days.", {"dept": "finance"}),
          ("c2", "Employees get 20 days of paid leave.", {"dept": "hr"}),
          ("c3", "The API rate limit is 100 requests/min.", {"dept": "eng"})]
col.add(ids=[c[0] for c in chunks],
        embeddings=[model.encode(c[1]).tolist() for c in chunks],
        documents=[c[1] for c in chunks],
        metadatas=[c[2] for c in chunks])
res = col.query(query_embeddings=[model.encode("how long till I get my money back?").tolist()],
                n_results=1, where={"dept": "finance"})   # similarity + metadata filter
print(res["documents"])   # → the refunds chunk, found by meaning
```

---

## Interview Q&A

**Q: Why do vector databases use approximate search?**
> Exact nearest-neighbour search compares the query with every vector, which is too slow for millions. ANN indexes like HNSW find the true nearest neighbours most of the time at a fraction of the cost, and for RAG a few relevant chunks is all you need.

**Q: Explain HNSW simply.**
> A layered graph. The top layers have few nodes with long links, so you quickly jump to the right region; lower layers have more nodes with short links to refine the search. It's fast and accurate but memory-hungry.

**Q: How do you keep tenants' documents separate in RAG?**
> Store a `tenant_id` on every chunk and always apply it as a filter, taken from the authenticated session on the server — never from the client or the model. For stricter isolation, a separate collection or namespace per tenant.

**Q: pgvector or a dedicated vector DB?**
> If I'm already on Postgres and the data is up to a few million vectors, pgvector — one system, joins with real data, transactions. A dedicated vector DB makes sense at larger scale or when I need built-in hybrid search, heavy filtering or independent scaling.

---

## Follow-ups (challenge questions)

- *Failure mode:* a user deletes a document, but the bot still quotes it a week later. What went wrong in the pipeline, and how should deletes work?
- *Scale:* the HNSW index no longer fits in RAM. What are your options, and what do you trade?

---

## Cheat Sheet

```
vector DB = fast similarity search index, sits NEXT TO your main DB
exact k-NN = O(n) · ANN = ~high recall, much faster · trade-off: recall vs speed
HNSW = layered graph (airports: hubs → local) · RAM-heavy · IVF + quantization = alternatives
record = vector (search) + text (return) + metadata (filter)
ops: upsert (stable ids) · delete by doc_id (GDPR) · top-K search · metadata filter
multi-tenancy: tenant_id filter from the SERVER session (or collection per tenant)
choose: Chroma/FAISS (prototype) → pgvector (already on PG) → Qdrant/Pinecone (big scale)
```

---

**Previous:** [Part 03 — Embeddings](03-embeddings.md) · **Next:** [Part 05 — Document Ingestion](05-document-ingestion.md)
