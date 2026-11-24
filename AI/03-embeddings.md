# AI Engineering Notes — Part 03

## Embeddings ⭐⭐⭐⭐⭐

**Topics:** what an embedding is · semantic vs keyword search · what the numbers capture · embedding models · same-model rule · measuring similarity (cosine, dot product, Euclidean) · the RAG pipeline shape.

---

## 1. The one rule

> **An embedding turns meaning into numbers so a computer can compare it.** It's a vector (list of numbers) with one rule: **similar meaning → nearby vectors.** This is the engine of the "R" (retrieval) in RAG.

---

## 2. What is an embedding? (the map analogy)

- A **map** gives every city a pair of numbers (lat, long); nearby cities → nearby coordinates, and you can measure closeness with simple maths.
- An embedding does the same for **meaning**: every text → a point in "meaning-space"; similar texts → nearby points.
- The difference: a map has **2 dimensions**, an embedding has **hundreds or thousands** (384, 768, 1536…). You can't picture it, but "how close are two points" maths works the same.
- "The dog barked" → `[0.02, -0.31, 0.88, …]` sits **right next to** "The puppy yelped."
- *One-liner:* "A dense vector placing text in a high-dimensional space where distance means difference in meaning."

---

## 3. Semantic vs keyword search

- **Keyword search = matching spelling.** Search "car," miss "automobile."
- **Semantic search = matching meaning.** "car," "automobile," "vehicle" land in the same neighbourhood.
- Semantic search is weak at **exact terms** (product codes, error IDs, rare names) — so the best systems use **both** (hybrid search, [Part 07](07-advanced-retrieval.md)).
- *Interview trap:* "semantic search vs Ctrl+F?" → keyword matches strings; embeddings match meaning, so paraphrases are found with **no shared words**.

---

## 4. What the numbers capture

- Each dimension loosely encodes some learned feature of meaning (topic, tone, formality…). You can't read them one by one; the model learned them.
- The classic demo that the space has real structure (from older word-embedding models):
  ```
  vector("king") - vector("man") + vector("woman") ≈ vector("queen")
  ```

---

## 5. Embedding models

- A specialised model: **text in → vector out** (a chat model is text in → text out). Call one via API or run it locally.
- What matters:
  - **Dimensions** — more = more nuance, more storage and slower search. Some models let you shorten vectors.
  - ⭐ **Same model for everything** — vectors from different models live in **different spaces** and can't be compared. Embed documents *and* queries with the **same model (and version)**. Changing models = **re-embed everything**.
  - **Max input length** — embedding models have token limits → one reason we **chunk** ([Part 05](05-document-ingestion.md)).
  - **Language and domain** — check a multilingual model if your users aren't all English-speaking; benchmarks like MTEB compare models.
- Examples: OpenAI `text-embedding-3-small/large`, Cohere Embed, Voyage, Google; open-source `all-MiniLM-L6-v2`, BGE (`bge-small-en-v1.5`), `nomic-embed` (free, local).
- *Interview gold:* "Embeddings from different models aren't comparable — same model for docs and queries, and re-index when you switch."

---

## 6. Measuring similarity

- **Cosine similarity** ⭐ (the default) — compares the **angle** between vectors, ignores length. Range **-1 → 1** (`1` = same direction/meaning). For text we care about **direction of meaning**, not length.
- **Dot product** — like cosine but also rewards length; faster; **equals cosine when vectors are normalised** (length 1). Many models output normalised vectors.
- **Euclidean (L2)** — straight-line distance. Intuitive; less common for text.
- **Similarity search** = given a query vector, return the **top-K closest** document vectors. Doing that fast over millions = the **vector DB's** job ([Part 04](04-vector-databases.md)).
- *One-liner:* "Cosine is the default — angle, not size. Normalise and dot product equals cosine."

---

## 7. The RAG pipeline shape (memorise this)

```
INGESTION (once):   documents → chunk → embedding model → vectors → store in vector DB
QUERY TIME (each):  question → embedding model → query vector
                             → nearest chunk vectors (cosine)   ← Retrieval
                             → paste chunks into the prompt      ← Augmented
                             → LLM answers from them             ← Generation
```

### Hands-on (Python)
```python
# pip install sentence-transformers scikit-learn
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
model = SentenceTransformer("all-MiniLM-L6-v2")   # free, local, 384 dims
s = ["The dog barked loudly.", "A puppy made noise.", "I love programming in Python"]
v = model.encode(s)
sim = cosine_similarity(v)
print(sim[0][1])   # dog vs puppy  → HIGH  ← same meaning, no shared words
print(sim[0][2])   # dog vs Python → LOW
```

---

## Interview Q&A

**Q: What is an embedding?**
> A vector of numbers that represents the meaning of a piece of text, produced by an embedding model, arranged so that texts with similar meaning are close together. It lets you search by meaning with simple distance maths.

**Q: Why can't you mix embeddings from two models?**
> Each model has its own vector space — the dimensions mean different things, and often the sizes differ. Comparing them is meaningless. Documents and queries must use the same model, and switching models means re-embedding the whole corpus.

**Q: Cosine similarity vs Euclidean distance?**
> Cosine compares the angle — the direction of meaning — and ignores vector length; Euclidean measures straight-line distance, so length matters. For text, cosine is the usual default. With normalised vectors, dot product gives the same ranking as cosine and is faster.

**Q: When does semantic search fail?**
> On exact terms — product codes, error IDs, names it never saw — where keyword search is better. That's why production systems combine both in hybrid search.

---

## Follow-ups (challenge questions)

- *Migration:* you want to switch to a better embedding model, and you have 5M chunks indexed. How do you migrate without downtime or mixing vectors?
- *Failure mode:* users search "ERR-4012" and get unrelated results. Why does pure semantic search miss it, and what's the fix?

---

## Cheat Sheet

```
embedding = meaning → vector · similar meaning = nearby · "a map for meaning"
semantic (meaning, synonyms) vs keyword (exact strings) → hybrid in production
SAME MODEL for docs + queries · switching model = re-embed everything
dimensions (nuance vs cost) · max input length (→ chunking) · multilingual? · MTEB
cosine (angle, default) · dot (= cosine if normalised, faster) · Euclidean (distance)
pipeline: chunk → embed → store · query → embed → top-K → prompt → answer
```

---

**Previous:** [Part 02 — Prompt Engineering & Structured Output](02-prompt-engineering-and-structured-output.md) · **Next:** [Part 04 — Vector Databases](04-vector-databases.md)
