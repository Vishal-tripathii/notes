# System Design Study Notes — Part 25

## Search & the Inverted Index (Full-Text Search, Ranking, Elasticsearch)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams, the inverted index, the analysis pipeline, ranking, and interview Q&A included.
>
> **Continues:** builds on Part 8/9 (why SQL `LIKE` can't search — no usable index), Part 21 (shards & replicas — how Elasticsearch scales), and Part 13/14 (queues & event-driven — how you sync data into search). Bridges to observability (log search / ELK).

---

## Table of Contents

1. [The problem: why a database can't really search](#problem)
2. [The core idea: the inverted index](#inverted)
3. [The analysis pipeline (how docs get indexed)](#analysis)
4. [How a query executes](#query)
5. [Relevance ranking: TF-IDF & BM25](#ranking)
6. [The features it unlocks](#features)
7. [Elasticsearch specifically](#elasticsearch)
8. [Where it sits: syncing from your real DB](#architecture)
9. [Interview questions & answers](#interview)
10. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="problem"></a>
# 1. The problem: why a database can't really search

A million-row `products` table, user types "wireless bluetooth headphone". SQL's only real tool:
```sql
SELECT * FROM products WHERE name LIKE '%bluetooth%';
```
It falls apart:
- **No usable index** — a leading-wildcard `LIKE '%...%'` can't use a B-tree (Part 9) → **full table scan** every query.
- **No relevance ranking** — matches come back unordered; can't put the *best* result first.
- **No linguistics** — "headphone" ≠ "headphones", "running" ≠ "run". No stems, plurals, synonyms.
- **No typo tolerance** — "bluetoth" matches nothing.
- **Multi-word scoring** — partial hits across several words are painful to express and rank.

> Databases **retrieve rows by exact/range keys**. Search engines **rank documents by textual relevance.** Different job → different data structure.

---

<a name="inverted"></a>
# 2. The core idea: the inverted index

## Analogy: the index at the back of a textbook 📖
You don't read 900 pages to find "photosynthesis" — you flip to the back index: `photosynthesis → pp. 44, 210, 388`. An inverted index is exactly that, for documents.

- **Forward index:** `document → words in it`.
- **Inverted index (flip it):** `word → list of documents containing it`.

```
Documents:
  doc1: "the quick brown fox"
  doc2: "the lazy brown dog"
  doc3: "quick brown foxes run"

Inverted index (term → postings list):
  brown → [doc1, doc2, doc3]
  quick → [doc1, doc3]
  fox   → [doc1, doc3]
  lazy  → [doc2]
  dog   → [doc2]
```
Search "quick brown": look up `quick → [1,3]`, `brown → [1,2,3]`, intersect → **doc1, doc3**. Instant, no scan.

Each `word → docs` mapping is a **postings list**; it stores more than doc IDs (term frequency, positions) to enable ranking and phrase matches.

> Everything — Elasticsearch, Lucene, Google — is a sophisticated inverted index + ranking.

---

<a name="analysis"></a>
# 3. The analysis pipeline (how docs get indexed)

Text is run through an **analyzer** so word variations collapse to the same index term:
```
"The Running Foxes!"  →  analysis  →  [run, fox]
```
1. **Tokenization** — split into tokens: `["The","Running","Foxes"]`.
2. **Lowercase / normalize** — `["the","running","foxes"]` so "Fox" = "fox".
3. **Stop-word removal** (optional) — drop "the","a","is" (no search value).
4. **Stemming / lemmatization** — "running"→"run", "foxes"→"fox". Now "fox" matches "foxes".
5. **Synonyms** (optional) — "tv" ↔ "television".

> **Crucial:** the **query is analyzed with the *same* pipeline** — "Foxes" → `fox` matches the indexed `fox`. That symmetry is why search works across word forms.

---

<a name="query"></a>
# 4. How a query executes

```
query "quick foxes"
   → analyze → [quick, fox]
   → postings: quick → [1,3],  fox → [1,3]
   → combine (AND / OR) → candidates [1,3]
   → SCORE each candidate for relevance
   → return sorted by score
```
Lookup + combine is the easy part. The interesting part is **scoring**.

---

<a name="ranking"></a>
# 5. Relevance ranking: TF-IDF & BM25

When many docs match, which comes first? Score each. Classic model **TF-IDF**, modern default **BM25**:

- **TF (Term Frequency)** — more occurrences of the term *in a doc* → more relevant. ("bluetooth" 5× → about bluetooth.)
- **IDF (Inverse Document Frequency)** — a term rare *across all docs* is more informative. "the" is everywhere → ~0 weight; "photosynthesis" is rare → high weight. Matching a rare word counts far more.
- **BM25** refines TF-IDF with:
  - **Saturation** — the 10th occurrence adds less than the 2nd (diminishing returns).
  - **Length normalization** — a match in a short title beats the same match buried in a long body.

> One-liner: **score ≈ TF (how often here) × IDF (how rare overall)**, tuned by BM25. Puts the *best* result on top, not just *a* match.

---

<a name="features"></a>
# 6. The features it unlocks

- **Fuzzy / typo tolerance** — "bluetoth" → "bluetooth" via **edit distance** (Levenshtein).
- **Autocomplete / search-as-you-type** — prefix indexes (edge n-grams).
- **Phrase & proximity** — exact "brown fox", using **positions** stored in postings.
- **Faceting / aggregations** — counts by brand/price range beside results (e-commerce sidebar).
- **Highlighting** — return the matched snippet with the term bolded.

---

<a name="elasticsearch"></a>
# 7. Elasticsearch specifically

- **Built on Apache Lucene** — Lucene is the inverted-index library; Elasticsearch wraps it in a distributed REST/JSON layer.
- **Distributed by design** — an index is split into **shards**, each with **replicas** (Part 21). Each shard is a self-contained inverted index → horizontal scale + availability.
- **JSON docs over REST** — `PUT` a JSON document, query with a JSON DSL. Schema-flexible (document-DB-like).
- **Near-real-time (NRT)** — a new doc is searchable after ~1s (a "refresh"), **not** transactionally instant.
- **ELK / Elastic Stack** — Elasticsearch + **Logstash** (ingest) + **Kibana** (visualize). Heavily used for **log search & observability** (bridge to the next topic).

---

<a name="architecture"></a>
# 8. Where it sits: syncing from your real DB (important)

**Elasticsearch is usually NOT the source of truth.** Primary DB (Postgres/Mongo) stays system of record; you replicate a **searchable copy** into ES.
```
Write:  App → [ Primary DB (source of truth) ] ──sync──▶ [ Elasticsearch (search copy) ]
Read:   Search box  → Elasticsearch (fast, ranked)
        "Open item #42" → Primary DB (authoritative record)
```
**Why not use ES as the DB?** It's not built for strong-consistency transactions, and durable business data shouldn't live only in a search index.

**How to sync** (classic follow-up):
- **Dual write** — app writes DB *and* ES. Simple but fragile: an ES write failure → drift/out-of-sync.
- **Async via queue / CDC** — DB write emits an event, or **Change Data Capture** tails the DB change log → a consumer updates ES. Reliable, decoupled — Part 13/14 in action, and the **preferred** pattern.

> Trade-off to state: search is **eventually consistent** — a small lag between DB write and it appearing in search. Almost always acceptable.

---

<a name="interview"></a>
# 9. Interview questions & answers

### Q: "Why not just search with SQL `LIKE`?"
> *"A leading-wildcard `LIKE '%x%'` can't use an index, so it's a full table scan, and it gives you no relevance ranking, no stemming so 'foxes' won't match 'fox', and no typo tolerance. A relational DB is built to fetch rows by keys, not to rank documents by textual relevance. For real search you want a purpose-built engine backed by an inverted index."*

### Q: "What's an inverted index?"
> *"It's the data structure search engines are built on. Instead of mapping a document to the words in it, you flip it: each term maps to the list of documents that contain it — a postings list — exactly like the index at the back of a book maps a topic to its pages. So a keyword lookup is an instant index read plus a list intersection, not a scan of every document."*

### Q: "How does 'foxes' match a search for 'fox'?"
> *"Both the document text and the query run through the same analysis pipeline: tokenize, lowercase, remove stop words, and stem — so 'Foxes' and 'fox' both reduce to the term 'fox'. Because indexing and querying use the identical analyzer, the forms line up and match."*

### Q: "How are results ranked?"
> *"By a relevance score, classically TF-IDF and by default BM25 in Elasticsearch. Term frequency rewards a term appearing often in a document; inverse document frequency rewards terms that are rare across the whole corpus, so matching a rare word counts much more than a common one. BM25 adds saturation, so repeated occurrences have diminishing returns, and length normalization, so a hit in a short title outranks the same hit in a long body."*

### Q: "What is Elasticsearch and how does it scale?"
> *"It's a distributed search engine built on Lucene, exposing JSON documents over a REST API. An index is split into shards, each a self-contained inverted index, and shards have replicas — the same sharding and replication ideas as any distributed store — which gives horizontal scaling and availability. It's near-real-time: a new document is searchable after about a second, not instantly."*

### Q: "Would you use Elasticsearch as your primary database?"
> *"No. It's not designed for strong-consistency transactions, and I don't want durable business data living only in a search index. I keep the primary database as the source of truth and sync a searchable copy into Elasticsearch, ideally asynchronously through a message queue or change-data-capture rather than dual-writing. That makes the search index eventually consistent, with a small lag, which is normally fine for search."*

### Q: "Dual write vs CDC for syncing?"
> *"Dual write has the app write to both the DB and Elasticsearch; it's simple but fragile, because if the Elasticsearch write fails the two drift apart. The more robust approach is to emit an event on the DB write, or use change data capture to tail the database's change log, and have a consumer update Elasticsearch. That decouples the two systems and makes the sync reliable and retryable."*

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet — everything on one page

### Why not SQL
`LIKE '%x%'` → full scan, no ranking, no stemming, no typo tolerance. DB = fetch by key; search = rank by relevance.

### Inverted index
- Flip `doc → words` into **`term → [docs]`** (postings list). Like a book's back index.
- Postings also store term frequency + positions (for ranking & phrases).
- Query = analyze terms → look up postings → combine (AND/OR) → score → sort.

### Analysis pipeline (index AND query, identically)
tokenize → lowercase → stop-word removal → **stem** (foxes→fox) → synonyms. Same analyzer both sides = variations match.

### Ranking
- **TF** — term frequent in doc → relevant.
- **IDF** — term rare across corpus → informative (rare word > common word).
- **BM25** (default) = TF-IDF + saturation (diminishing repeats) + length normalization (short field wins).

### Features unlocked
Fuzzy/typo (edit distance) · autocomplete (edge n-grams) · phrase/proximity (positions) · faceting/aggregations · highlighting.

### Elasticsearch
- Built on **Lucene**; distributed **shards + replicas** (Part 21); JSON docs over REST DSL.
- **Near-real-time** (~1s refresh, not instant).
- **ELK** = Elasticsearch + Logstash + Kibana → log search / observability.

### Architecture
- **Not the source of truth.** Primary DB authoritative; ES = searchable copy.
- Sync via **queue / CDC** (preferred) over **dual write** (fragile).
- Result: **eventually consistent** search (small lag) — usually fine.

### Connects to
- Part 8/9: why DB `LIKE` can't search (no usable index).
- Part 21: shards & replicas = how ES scales.
- Part 13/14: queues & event-driven / CDC = how you sync into ES.

### Suggested next topics
- **Observability** — logging/metrics/tracing (ELK is the bridge).
- **Idempotency & Saga** — distributed transactions (extends Part 13).
- **WebSockets / real-time** — push vs poll.

*— End of Part 25 —*
