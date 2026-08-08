# Resume Deep-Dive — RAG Platform — Scenario Bank

> These questions are grounded in your own RAG Platform project (FastAPI · React · PostgreSQL · Qdrant · FastEmbed · Gemini · Docker). Unlike the generic scenario-bank entries, I don't know your actual implementation choices — so each entry gives the technical reasoning framework a strong answer needs, with a prompt for **your** specifics. Fill those in and this becomes a real prepared answer, not a generic one.

---

### "Why a hybrid PostgreSQL + Qdrant architecture instead of one database?"

The reasoning framework: PostgreSQL and Qdrant are good at fundamentally different things. PostgreSQL is a relational store — strong at structured metadata, relationships, transactions, and exact-match/filtered queries (which document belongs to which user, upload timestamps, document status). Qdrant is a **vector database** — purpose-built for high-dimensional similarity search (approximate nearest-neighbor search over embeddings), which a relational database either can't do at all or does far less efficiently even with an extension. Using one database for both would mean either giving up fast vector search, or giving up relational integrity/query flexibility for your metadata.

**Fill in:** What lives in each store in your actual system? (Likely: Postgres holds document records, users, upload metadata, chunk-to-page mappings; Qdrant holds the embedding vectors themselves, linked back to Postgres by an ID.) What breaks if they disagree — did you build anything to detect/handle Postgres and Qdrant falling out of sync (see below)?

**Interview line (template):** *"I split responsibilities — Postgres owns [your structured data: documents, users, metadata] because I need relational integrity and filtered queries there, and Qdrant owns the embedding vectors because it's purpose-built for fast similarity search that Postgres isn't optimized for. They're linked by [your ID scheme]."*

**Tests:** polyglot persistence reasoning, vector DB fundamentals

*Axis: normal · Source: challenge question*

---

### "How does SHA-256 dedup handle a document that's edited and re-uploaded?"

The reasoning framework: SHA-256 hashing the file content means **any** change to the file — even one character — produces a completely different hash, so an edited-and-reuploaded document would *not* be caught as a duplicate by content hash alone; it would ingest as a brand-new document. This is actually correct behavior for "duplicate" defined as "identical file," but it raises a real design question: does your system have a separate mechanism for "this is a new version of an existing document" (versioning, superseding an old ingestion) as opposed to "this is a totally unrelated new upload" — or does an edited document just become an entirely separate, un-linked entry with both old and new chunks now searchable?

**Fill in:** What actually happens in your system if the same logical document is edited and re-uploaded — does old content still show up in search results alongside the new version? Was this a deliberate design decision or a known gap?

**Interview line (template):** *"SHA-256 dedup catches byte-identical re-uploads — same file, different filename, doesn't re-ingest. It does NOT catch 'this is an edited version of a document already ingested,' since the hash changes with any edit. [Your system's actual behavior for that case — versioning, or it's a known gap]."*

**Tests:** honest scope of a dedup mechanism, content-hash limitations

*Axis: consistency · Source: challenge question*

---

### "What happens if PDF ingestion fails partway through — parsing succeeds, embedding generation fails?"

This is the partial-failure pattern from category 01, applied directly to your pipeline. The framework: a multi-step pipeline (parse → clean → chunk → embed → index) needs to either be wrapped in a way that a failure at step 4 doesn't leave steps 1-3's work in a half-committed, inconsistent state (e.g. document marked "ingested" in Postgres but with zero vectors in Qdrant, silently breaking search for that document), or needs explicit per-step status tracking so a retry can resume from the failed step rather than reprocessing or leaving things stuck.

**Fill in:** Does your ingestion pipeline track status per document (e.g. `parsing → chunking → embedding → indexed → failed`)? What does a user/admin see if a document silently failed to fully ingest — do they know it's incomplete, or does it just look "done" with no searchable content?

**Interview line (template):** *"[Your actual answer: e.g. 'I track ingestion status per document, so a failure at the embedding step leaves it in a visibly-failed state rather than silently looking complete, and it's retryable from that step' — or, if this wasn't built, 'that's a real gap I'd want to close — right now a partial failure could leave a document that looks ingested but isn't fully searchable.']"*

**Tests:** partial failure handling in a real pipeline, honest gap acknowledgment

*Axis: failure · Source: challenge question*

---

### "Why does chunking strategy matter for retrieval quality?"

The reasoning framework: chunks are the actual unit that gets embedded and retrieved — the LLM only ever sees whatever chunk(s) got matched, not the whole document. **Too large** a chunk dilutes the embedding (a chunk covering multiple unrelated topics has a "blurry" embedding that doesn't strongly match a specific query, and wastes context window with irrelevant surrounding text when retrieved). **Too small** a chunk loses context (a chunk might contain a sentence fragment that's meaningless without the paragraph around it, and might not contain enough signal to match well semantically at all). This is also why simple fixed-size character chunking is often worse than chunking on natural boundaries (paragraphs, sections) — a fixed-size cut can split a sentence or table row in half.

**Fill in:** What chunking strategy did you actually use (fixed-size with overlap, paragraph/section-based, something else)? Did you tune chunk size, and what did you observe when it was wrong?

**Interview line (template):** *"Chunk size is a direct trade-off — too large and the embedding gets diluted across unrelated content, too small and you lose the surrounding context that makes a chunk meaningful. I used [your actual strategy], [with/without overlap], because [your reasoning]."*

**Tests:** RAG chunking trade-offs, retrieval quality

*Axis: performance · Source: challenge question*

---

### "What's your grounding strategy if retrieved context doesn't actually contain the answer?"

The reasoning framework: an LLM given a question plus retrieved context, when the context doesn't actually answer it, has three possible behaviors: (1) honestly say it doesn't know / isn't in the provided documents, (2) hallucinate an answer using its own general knowledge instead of the retrieved context (dangerous — defeats the point of RAG's citation-backed accuracy), or (3) give a low-confidence partial answer. A well-designed RAG system's prompt should explicitly instruct the model to only answer from the provided context and say so when it can't — and ideally you can measure/detect when this is happening (e.g. low similarity scores on the retrieved chunks signal the question probably isn't well-covered by the ingested documents at all).

**Fill in:** What does your Gemini prompt actually instruct regarding out-of-context questions? Did you ever observe hallucination beyond the retrieved context, and how did you catch/fix it?

**Interview line (template):** *"My prompt explicitly instructs Gemini to only answer from the provided context and say when it can't, rather than falling back on general knowledge — [your specifics on how you enforce/verify this, e.g. citation requirements, confidence thresholds on retrieval scores]."*

**Tests:** RAG grounding, hallucination prevention

*Axis: failure · Source: challenge question*

---

### "What happens if Postgres and Qdrant fall out of sync?"

Direct application of the dual-write consistency problem (category 01/03) to your specific architecture: ingestion writes to both Postgres (document record/metadata) and Qdrant (vectors) — these are two separate systems with no shared transaction, so a crash or error between the two writes can leave one done and not the other (a document row with no vectors — invisible to search; or vectors in Qdrant with no corresponding Postgres record — orphaned, unreachable via your normal document listing).

**Fill in:** Did you build any reconciliation mechanism (a periodic check that every Postgres document has matching Qdrant vectors and vice versa), or rely on the ingestion pipeline's own error handling to prevent this from ever happening? Is this something you'd improve if asked "what would you do differently"?

**Interview line (template):** *"[Your actual mitigation — e.g. 'ingestion writes vectors first, then marks the Postgres record complete only after Qdrant confirms, so a failure leaves an incomplete-but-not-orphaned state that's safe to retry' — or an honest 'I didn't build explicit reconciliation for this; it's a gap I'd address with an outbox-style pattern or a periodic consistency check.']"*

**Tests:** dual-write consistency, honest architecture critique

*Axis: consistency · Source: challenge question*

---
