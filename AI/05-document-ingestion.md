# AI Engineering Notes — Part 05

## Document Ingestion — Parsing & Chunking ⭐⭐⭐⭐☆

**Topics:** parsing PDF / DOCX / HTML / Markdown · OCR · text cleaning · why chunk · chunk size & overlap · chunking strategies (fixed, recursive, semantic, parent-child) · metadata per chunk · re-ingesting changed documents.

---

## 1. The one rule

> **Retrieval quality is capped by chunk quality.** Garbage in → garbage retrieved → garbage answer. Most RAG systems fail *here*, not in the fancy parts.

> **Analogy 🍳 — kitchen prep.** Two jobs before cooking: (A) clean the vegetables (**parsing** — get clean text out of messy files), (B) cut them to the right size (**chunking**).

---

## 2. Parsing — messy files → clean text

The embedding model only takes **plain text**.

| Format | Difficulty | Notes & tools |
|---|---|---|
| **PDF** | hardest & most common | a **visual layout** format ("draw this glyph at x,y"), not text → multi-column pages get mixed, **tables** jumble, headers/footers appear mid-sentence. Simple: `pypdf`, `pdfplumber`. Layout-aware: `unstructured`, Docling, LlamaParse, AWS Textract, Azure Document Intelligence |
| **DOCX** | friendly | structured XML (paragraphs, headings, tables). `python-docx`, `mammoth`. Keep headings as metadata |
| **HTML** | noisy | text buried in tags + navbars, ads, footers. Extract the **main content**: `trafilatura`, Readability, BeautifulSoup |
| **Markdown** | easiest | `#` headings are natural cut points → many pipelines convert everything **to Markdown** first |
| **Scanned docs / images** | OCR | a scanned PDF has pixels, no text. Tesseract, Textract, Google Document AI — or a **vision-capable LLM** for hard layouts. OCR errors poison embeddings |

**Text cleaning:** fix broken line breaks and hyphenated words, collapse whitespace, remove repeated headers/footers and page numbers. The model embeds **whatever you give it**.

**Tables:** convert to Markdown tables or one "row as a sentence" per line, so numbers keep their column names.

---

## 3. Why chunk?

1. Embedding models have a **token limit** — a whole book doesn't fit.
2. One vector holds limited meaning — squash 50 pages into one vector and the meaning **averages into mush**; the refund paragraph is drowned out. Split it, and a query matches the **specific** chunk.
3. You only want to pay to send the **relevant** part to the LLM.

Analogy: index a textbook **by paragraph, not by whole book.**

---

## 4. Chunk size & overlap

- **Too small** (a sentence) → precise but **loses context** ("It must be returned in 14 days" — *what* must?).
- **Too big** (3 pages) → **diluted meaning**, imprecise retrieval, **wasted tokens**.
- **Starting point ~300–800 tokens** (a few paragraphs); tune per corpus with an eval set ([Part 14](14-evaluation-and-observability.md)).
- **Overlap ~10–20%** — each chunk repeats the end of the previous one, so an idea cut in half at a boundary still appears whole in one chunk. Analogy: **overlapping roof tiles** cover the seams.
- *One-liner:* "Chunk size trades context against precision; overlap protects ideas that fall on a boundary."

---

## 5. Strategies (simple → sophisticated)

1. **Fixed-size** — cut every N tokens. Simple, cuts mid-sentence. Baseline only.
2. **Recursive** ⭐ (sane default) — split on a **priority list of natural boundaries**: sections → paragraphs → sentences → words, going finer only when a piece is still too big. (LangChain `RecursiveCharacterTextSplitter`.)
3. **Structure-aware** — split on document structure: Markdown headings, HTML sections, code functions. Great when documents have good headings.
4. **Semantic** — embed sentences and cut where the topic **shifts**. Coherent chunks, but slower and costlier. Use when an eval shows it helps.
5. **Parent-child** ⭐ ("small-to-big") — **search small, feed big**: embed small **child** chunks for precise matching; each points to a larger **parent**; at query time **match the child, return the parent**. Gets around the size trade-off.

> 🧠 **Remember:** **recursive first.** Move to fancier chunking only when your eval set shows a problem.

---

## 6. Metadata per chunk

Attach **`doc_id`, source, page, section heading, date, tenant_id`** to every chunk → powers **citations** ("policy.pdf p.12"), **filtering** ([Part 04](04-vector-databases.md)), deletes and debugging. Cheap — always do it.

**Contextual headers:** prefix each chunk with its document title and section before embedding (`"Refund Policy > International orders: …"`) so a chunk that says "it takes 14 days" still knows what "it" is. Cheap and effective (see contextual retrieval, [Part 08](08-advanced-rag.md)).

---

## 7. Keeping the index fresh

- Ingestion is a **pipeline**, often a **background job** ([nodejs Part 12](../nodejs/12-background-jobs-and-scheduling.md)): upload → queue → parse → chunk → embed → upsert. Don't block the upload request on it; show "processing" status.
- **Changed document** → delete its old chunks (`doc_id`) and insert new ones. Store a **content hash** to skip unchanged files.
- **Deleted document** → delete its chunks (users expect it to be gone).
- Changing chunking or embedding model → **re-ingest everything** into a new collection, then switch.

### Hands-on (Python)
```python
# pip install langchain-text-splitters
from langchain_text_splitters import RecursiveCharacterTextSplitter
splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)   # characters here
for i, c in enumerate(splitter.split_text(text)):
    print(f"--- chunk {i} ({len(c)} chars) ---\n{c}\n")
# try chunk_size 100 vs 2000 → feel the context/precision trade-off
```

---

## Interview Q&A

**Q: Why are PDFs hard for RAG?**
> PDF is a layout format — it stores where to draw characters, not paragraphs. Naive extraction mixes columns, scrambles tables and leaves headers and footers inside sentences. Layout-aware parsers, OCR for scans, or converting to Markdown help.

**Q: How do you choose chunk size?**
> Start around a few hundred tokens with 10–20% overlap and a recursive splitter, then tune against an evaluation set of real questions. Too small loses context; too big dilutes the match and wastes tokens.

**Q: What is parent-child chunking?**
> Embed small chunks for precise matching, but store a link to the larger section they came from. When a small chunk matches, send the larger parent to the LLM — precise retrieval with enough context to answer.

**Q: A document was updated. How does your RAG system handle it?**
> Ingestion keys chunks by `doc_id`. On update, a background job deletes the old chunks and inserts the new ones; a content hash skips unchanged documents. Deletes remove all chunks for that `doc_id`.

---

## Follow-ups (challenge questions)

- *Failure mode:* answers about pricing are often wrong, and you find the prices live in PDF tables. What do you check first, and what do you change?
- *Scale:* a customer uploads 20,000 documents at once. Design the ingestion flow so the app stays responsive and failures can be retried.

---

## Cheat Sheet

```
"chunk quality caps retrieval quality" · kitchen prep: parse (clean) + chunk (cut)
PDF = layout, hardest → layout-aware parser / OCR / to Markdown · HTML → main content only · tables → markdown rows
clean: line breaks, whitespace, headers/footers
chunk: ~300–800 tokens, 10–20% overlap — TUNE with evals
strategies: fixed < RECURSIVE (default) < structure-aware < semantic · parent-child = search small, feed big
metadata: doc_id, source, page, section, date, tenant_id · contextual header per chunk
freshness: background job · hash to skip unchanged · update = delete doc_id + insert · model change = re-index
```

---

**Previous:** [Part 04 — Vector Databases](04-vector-databases.md) · **Next:** [Part 06 — RAG Fundamentals](06-rag-fundamentals.md)
