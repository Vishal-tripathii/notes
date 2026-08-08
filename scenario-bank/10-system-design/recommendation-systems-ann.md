# Recommendation Systems (Spotify/YouTube "up next")

### "How does Spotify suggest the next song, or YouTube pick 'up next,' fast enough to feel instant — for hundreds of millions of users?"

The naive assumption is that some ML model runs a fresh, from-scratch computation the moment you finish a song. It doesn't — that would be far too slow and expensive at that scale. Real recommender systems split the work into an **offline (batch) phase** and a **fast online (serving) phase**, and the split is the entire trick.

**Offline — done ahead of time, on a schedule (hourly/nightly), not per-request**

A model processes all the accumulated listening/watching history to produce **embeddings** — dense vectors representing every user and every item (song/video) in a shared vector space, trained so that "similar" users and items end up close together geometrically (via collaborative filtering, two-tower neural networks, etc.). This is the expensive part — training on billions of interactions — and it happens on a batch schedule, completely decoupled from any single user's request.

These embeddings get loaded into a **vector index** built for fast approximate nearest-neighbor (ANN) search — structures like HNSW or FAISS — the exact same category of data structure your RAG project's vector DB (Qdrant) uses for retrieval.

**Online — what actually happens when you tap "play"**

1. Look up (or cheaply update) your user embedding.
2. Run an ANN search against the item index — this returns the nearest candidate items in **milliseconds**, because ANN search is sub-linear, not a brute-force scan over every song ever uploaded.
3. A lightweight **ranking model** re-orders that candidate list using business signals (freshness, diversity, don't-repeat-what-just-played, promoted content) — this step is small and fast precisely because step 2 already narrowed millions of items down to a few hundred candidates.

```
Offline (batch):  history → train embeddings → build ANN index      [expensive, scheduled]
Online (request): your embedding → ANN search → candidates → rank  [cheap, milliseconds]
```

This two-stage shape — **candidate generation, then ranking** — is the standard pattern behind essentially every large-scale recommender (Netflix, TikTok, Amazon, YouTube). The "instant" feeling isn't a fast model — it's that the expensive work already happened before you ever asked.

**Interview line:** *"It's not computed live — it's split into an offline phase that batch-trains embeddings for every user and item into a shared vector space, and a fast online phase that does an approximate-nearest-neighbor search against a precomputed index, milliseconds, then a lightweight ranking pass on the small candidate set. It's the same candidate-generation-then-ranking shape almost every large recommender uses, and the same ANN-index idea as RAG retrieval, just embeddings-of-items instead of embeddings-of-text-chunks."*

**Tests:** offline/online split for latency, embeddings + ANN search, candidate generation vs ranking as separate stages

*Axis: scale · Source: challenge question*

#### Follow-ups

- What happens for a brand-new user with no listening history — how do you recommend anything (the "cold start" problem)?
- How often do embeddings need to be retrained, and what goes stale if you don't retrain often enough?
- Two songs are genuinely similar in the embedding space but ANN search is *approximate* — what does that trade off, and when would it matter?
- How would the ranking stage avoid recommending the same artist five times in a row even though they're all high-scoring candidates?
