# RAG Project — Stack, Steps & Roadmap

> A single/multi-document RAG app: upload documents, ask questions, get grounded answers with citations.
> Philosophy: **build v1 raw (no heavy framework)** to learn the internals, then layer on production polish.

---

## 1. Tech Stack

### Core (v1 — everything you need to ship)
| Layer | Choice | Why |
|---|---|---|
| **Backend** | Python + **FastAPI** | Industry standard for AI backends; async, fast, clean. |
| **Frontend** | **React** | Chat UI; plays to existing JS strength. |
| **Vector DB** | **Qdrant** (Docker) | Fast, production-grade, native hybrid search + metadata filtering. |
| **Embeddings** | **sentence-transformers** (`all-MiniLM-L6-v2`) | Free, local, 384-dim. Run **inside FastAPI** for v1 (no separate container). |
| **Generation LLM** | **OpenAI `gpt-4o-mini`** (start) → **Ollama Llama 3** (self-hosted later) | The "G" in RAG — writes the final answer from retrieved chunks. |
| **Parsing** | `pypdf` / `pdfplumber` (PDF), `python-docx` (Word), `BeautifulSoup` (HTML) | Extract clean text. Start with PDF only. |
| **Chunking** | `langchain-text-splitters` → `RecursiveCharacterTextSplitter` | Split on natural boundaries with overlap. One import, not the whole framework. |

### Deliberately NOT in v1 (avoid over-engineering)
- ❌ LangChain agents — build the RAG loop by hand to learn the mechanics.
- ❌ Reranker, hybrid search, eval framework — add once v1 works.
- ❌ Separate embedding microservice — only split out when scaling demands it.

### Key decisions & rationale
- **Raw over LangChain (v1):** writing `embed → qdrant.search() → build prompt → call LLM` yourself teaches what frameworks hide, gives full control, and impresses interviewers ("I understand what's under the abstraction").
- **Embeddings inside FastAPI, not a separate container:** a separate embedding service is a *scaling* optimization, unnecessary for single/multi-doc scale. Keep v1 simple; mention the split-out as a "how I'd scale" talking point.
- **OpenAI first, Ollama later:** start with quality + speed, then demonstrate a swap to a self-hosted model (a great portfolio story).

---

## 2. Architecture

```
┌─────────────┐     ┌──────────────────────────────────────┐     ┌──────────┐
│   React     │────▶│  FastAPI (Python)                    │────▶│  Qdrant  │
│  (chat UI)  │◀────│  ┌────────────────────────────────┐  │◀────│ (Docker) │
└─────────────┘     │  │ INGEST: parse → chunk → embed  │  │     └──────────┘
                    │  │ QUERY:  embed → retrieve →     │  │
                    │  │         build prompt → LLM     │  │     ┌──────────┐
                    │  └────────────────────────────────┘  │────▶│   LLM    │
                    │     embeddings: sentence-transformers│     │ OpenAI / │
                    └──────────────────────────────────────┘     │ Ollama   │
                                                                  └──────────┘

INGESTION (on upload):   document → parse → chunk → embed each chunk → store in Qdrant
QUERY (per question):    question → embed → search Qdrant (top-K) → chunks + question
                                  → grounded prompt → LLM → cited answer
```

**One stored record in Qdrant:**
```json
{
  "id": "c1",
  "vector": [0.91, 0.10, ...],
  "payload": {
    "text": "Refunds are processed within 14 days of purchase.",
    "source": "policy.pdf",
    "page": 1
  }
}
```
`vector` = what you search on · `text` = what you return · `source/page` = citations + filtering.

---

## 3. Build Steps (in order)

### Setup
1. `docker-compose up` for **Qdrant** (expose port 6333).
2. FastAPI project + `qdrant-client`, `sentence-transformers`, `pypdf`, `langchain-text-splitters`, `openai`.
3. React app (Vite) with a simple chat + file-upload UI.

### Ingestion pipeline (`POST /upload`)
4. Receive file → **parse** to plain text (`pypdf`).
5. **Clean** text (strip weird whitespace, fix broken line breaks).
6. **Chunk** with `RecursiveCharacterTextSplitter` (chunk_size ~500, overlap ~50).
7. **Embed** each chunk (`sentence-transformers`).
8. **Upsert** into Qdrant with payload `{text, source, page}`.

### Query pipeline (`POST /chat`)
9. **Embed** the user's question (same model as ingestion — critical).
10. **Search** Qdrant → top-K chunks (start K=3).
11. **Build a grounded prompt:** "Answer using ONLY the context. If not there, say 'I don't know'. Cite sources." + chunks + question.
12. **Call the LLM** (temperature 0) → answer.
13. Return answer + source citations to React.

### Frontend
14. Upload component → hits `/upload`, shows progress.
15. Chat component → sends question to `/chat`, renders answer + citations.
16. (Nice) **stream** the response token-by-token for the "typing" feel.

### Multi-document support
17. Tag each chunk with its `source` (already in payload) → retrieval spans all docs automatically.
18. (Optional) metadata filter by document, so users can scope questions to one file.

---

## 4. Future Scope (product features)

- **Streaming responses** — token-by-token UX (feels instant).
- **Conversational memory** — multi-turn chat with **query rewriting** so follow-ups ("what about that?") retrieve correctly.
- **Per-user document isolation** — metadata filter on `user_id` (multi-tenancy / security).
- **Source highlighting** — click a citation → jump to the exact passage/page in the original doc.
- **Multiple file formats** — add DOCX, HTML, and OCR for scanned PDFs.
- **Document management** — list, delete (removes vectors too), re-index on change.
- **Auth** — user accounts, so each person has their own knowledge base.

---

## 5. Learning / Future Add-ons (skill-building, map to notes)

Add these one at a time — each teaches a concept and upgrades the app:

| Add-on | Teaches (phase) | Impact |
|---|---|---|
| **Reranker** (`bge-reranker` / Cohere) | Advanced Retrieval (6) | Biggest single quality jump: retrieve top-20 → rerank to top-3. |
| **Hybrid search** (dense + sparse) | Advanced Retrieval (6) | Qdrant supports it natively; catches exact terms (codes, names). |
| **Query rewriting / expansion** | Advanced Retrieval (6) | Fixes vague + conversational queries. |
| **Parent-child chunking** | Ingestion (4) | Precise matching + full context to the LLM. |
| **Self-hosted LLM** (Ollama Llama 3) | Production (16) | Privacy + zero API cost; a strong portfolio story. |
| **Evaluation** (RAGAS) | Evaluation (13) | Measure faithfulness + retrieval accuracy; prove it works. |
| **Observability** (LangSmith) | Observability (14) | Trace every step, token cost, latency. |
| **Agentic RAG** (LangGraph) | Agents (8) / Adv RAG (7) | Agent *decides* whether/what to retrieve, judges results, retries. |
| **Guardrails** (input/output validation) | Security (15) | Handle prompt injection from ingested docs. |
| **Caching** (prompt / embedding cache) | Production (16) | Cut cost + latency on repeated queries. |

---

## 6. Interview Talking Points (this project earns them)

- "I built RAG **raw** first to understand the internals, then layered abstractions." (shows depth)
- "Embeddings run in-process for now; I'd split them into a **separate service** to scale independently." (shows scaling awareness)
- "Retrieval quality was the bottleneck, so I added a **cross-encoder reranker** and **hybrid search**." (shows Phase-6 mastery)
- "I ground answers strictly to retrieved context with **citations** and an 'I don't know' fallback." (shows you get hallucination control)
- "Swapped OpenAI for a **self-hosted Llama 3** to show a privacy-friendly deployment." (shows range)

---

_This project exercises Phases 1–6, 8, and 13–16 of the [AI Engineering notes](ai-engineering-notes.md)._
