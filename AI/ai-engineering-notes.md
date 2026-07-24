# AI Engineering — Master Notes

> One-shot interview revision, plain language. Agentic AI + RAG, taught topic-by-topic.
> Roadmap source: [../work/RAG.md](../work/RAG.md).

## Progress

| Phase | Topic | Status |
|---|---|---|
| 1 | LLM Fundamentals | ✅ done |
| 2 | Embeddings | ✅ done |
| 3 | Vector Databases | ✅ done |
| 4 | Document Ingestion | ✅ done |
| 5 | RAG Fundamentals | ✅ done |
| 6 | Advanced Retrieval | ✅ done |
| 7 | Advanced RAG | ⬜ skipped (revisit) |
| 8 | AI Agents | ✅ done |
| 9 | Tool Calling | ✅ done |
| 10 | MCP | ✅ done |
| 11 | Multi-Agent Systems | ⬜ next |
| 12 | Memory Systems | ⬜ |
| 13 | Evaluation | ⬜ |
| 14 | Observability | ⬜ |
| 15 | AI Security | ⬜ |
| 16 | Production AI | ⬜ |

---

# Phase 1 — LLM Fundamentals

> **The whole phase in one story:** An LLM is a **frozen next-word guesser**. You can't cheaply retrain it, so you **steer it with prompts** (roles, examples, structure) and **tune its picking with dials** (temperature). Because its knowledge is **frozen** and it **hallucinates**, you **feed it real, fresh info at inference time — that's RAG** — and you stay alert to **injection/jailbreak** because it can't tell your instructions from the data.

## 1. AI Basics

### Generative AI = a maker, not a sorter
- **Old AI = a sorter.** Show it something, it slaps a label on it ("spam," "cat"). Never makes anything.
- **Generative AI = a maker.** Creates new things that look like what it learned — sentences, images, code.
- How a text AI makes things: **it guesses the next word, over and over.** "The sky is..." → "blue" → "and" → "clear." That loop is the whole engine.
- *Interview one-liner:* GenAI learns the pattern of the data well enough to **produce new examples** of it; for text that's **guessing the next word repeatedly** (fancy name: *autoregressive next-token prediction*).

### What is an LLM?
- **LLM = a giant next-word-guessing machine.** Read a huge pile of internet text, got great at: given some words, guess what comes next.
- Loop: (1) chop text into **tokens** (≈ word-chunks) → (2) make a **ranked list of likely next pieces** → (3) **pick one** → (4) append, repeat.
- No thinking ahead. **This is why "explain your steps first" helps:** it writes the reasoning *before* the answer, so the answer is built on that reasoning, not a blind guess.

### LLM vs Traditional ML
- **Traditional ML = single-purpose gadget** (a toaster only toasts). New job = build a new model, and hand-feed it which details matter.
- **LLM = one smart cook** who makes many dishes. Don't rebuild the cook — **give new instructions.** Same model, new job, no rebuild.
- **Key idea: change the instructions, not the model.** This is the whole reason RAG and agents are possible.

| | Traditional ML | LLM |
|---|---|---|
| Task | one narrow job per model | one model, many jobs via instructions |
| Adapting | rebuild/retrain | just change the prompt |
| Output | a number/label | free-form text |

### Transformer (the engine inside)
- One idea: **it reads all the words at once and works out which words matter to which.**
- Before 2017, AI read text **one word at a time, left to right** — slow, forgot the start by the end. The **Transformer** (2017) reads the **whole sentence together** and lets each word **"pay attention"** to the words that matter.
- *"The animal didn't cross the street because **it** was tired."* → attention links "it" to "animal."
- Reading everything at once → **trains fast on big computers** → how models got huge.
- *Interview trap:* "What made LLMs possible?" → **the Transformer / attention** (parallel reading at scale), not "more data/GPUs" alone.

### Training vs Using (Inference)
- **Training = going to school.** Very expensive, weeks + millions, done once. At the end the "brain" is **locked**.
- **Inference = doing the job after school.** Every question uses the locked brain; talking to it doesn't change its brain.
- Consequence: **knowledge frozen on graduation day.** Knows nothing after that date (**knowledge cutoff**), won't remember your chat tomorrow.
- → **Exactly why RAG exists:** can't cheaply send it back to school, so **hand it the fresh notes inside the question.**

### Foundation Models
- Big general model built as a **starting point** for many uses — like flour → bread, pasta, cake (GPT-4, Claude, Llama).
- Two stages: **1) Pre-training** — reads mountains of text, learns to autocomplete (knowledgeable but useless — may just continue your sentence). **2) Alignment** — humans teach it to be helpful + behave (*names: **SFT** + **RLHF***).
- Assistant you chat with = raw autocomplete engine **+** "how to be helpful" training on top.

## 2. Tokens

### Tokenization
- Model reads **tokens** — chunks between a letter and a word. **LEGO bricks for language:** common words = 1 brick, rare/long words are built from several.
- `"cat"` → 1 token; `"unbelievable"` → ~3; a space rides with the next word.
- **Rule of thumb: 1 token ≈ 4 characters ≈ ¾ word → 100 tokens ≈ 75 words.**
- Why chunks: keeps vocab small + fixed (~100k pieces), and can build **any** unseen word (typo, brand name) from smaller bricks. Algorithm: **BPE (Byte-Pair Encoding).**
- Gotcha: numbers, code, whitespace, and **non-English text cost more tokens** than you'd expect (real cost implication).
- *One-liner:* "Sub-word chunks via BPE, ~4 chars each; the model reads and **bills in tokens, not words.**"

### Context Window
- The model's **working memory** = max tokens it holds at once, counting **input + output together**. A **fixed-size whiteboard**: instructions + history + docs + the answer all share it.
- Sizes: 8K / 128K / 200K / 1M. (200K ≈ ~150k words ≈ a 500-page book.)
- **Shared:** input + output share the same budget — not separate.
- When it overflows, chat apps **silently drop the oldest messages** → that's why long chats "forget" the start.
- *Interview trap:* "bigger window = just use it all" is **wrong** — more context = more cost **and** often worse accuracy (**"lost in the middle"** — facts buried in huge context get missed). Big reason **RAG beats paste-everything**: put only the relevant ~5 chunks in the window.

### Input vs Output Tokens
- **Input (prompt) tokens** = everything you send: system prompt + history + question + retrieved docs. Charged **every call.**
- **Output (completion) tokens** = what the model generates back.
- Two practical facts: **(1) output usually costs 3–5× more than input.** **(2) Input is the hidden cost bomb** — the model is **stateless**, so every turn you **re-send the whole conversation**; by message 20 you're paying to re-read 1–19.
- *Interview gold:* "Why does a long chat get expensive?" → stateless model, resend full history each turn → cost grows ~quadratically. Fixes: summarize, trim, cache.

### Token Limits
- Two different limits — don't confuse them:
  - **Context window limit** — total whiteboard (input + output). e.g. 200K.
  - **Max output tokens** — a **separate, smaller** cap on one reply (often 4K–16K). Even a 200K model won't write a 200K answer.
- `input tokens + max_output ≤ context window`. Too-low `max_tokens` → answer **cut off mid-sentence**; too-high just reserves room (billed for what's generated).

### Token Pricing
- Pay **per token, input and output rates separate**, quoted **per 1M tokens**.
- Example mechanics (illustrative — always check live prices):
  ```
  input $3 / 1M,  output $15 / 1M
  turn: 2,000 input + 500 output
  input  = 2000/1e6 × $3  = $0.006
  output =  500/1e6 × $15 = $0.0075   ← 500 out cost MORE than 2000 in (output ~5×)
  total ≈ $0.0135 / turn
  ```
- Three levers to cut the bill: **prompt caching** (cache the big unchanging prefix — huge for RAG/agents), **model routing** (easy→small model, hard→big model), **trim the input** (shorter history / fewer chunks).

### Hands-on (Python)
```python
# pip install tiktoken
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")
text = "Tokenization is unbelievable!"
tokens = enc.encode(text)
print(len(tokens), tokens)
for t in tokens:
    print(t, "->", repr(enc.decode([t])))   # SEE the bricks; "unbelievable" splits
```
Try a number `"1234567"` and some Hindi/emoji text → watch the count jump (non-English costs more).

## 3. Model Parameters (the dials)

The model is fixed; these knobs change **how it picks the next word** each step (from its ranked list of candidates). Set per API call.

- **Temperature** — creativity/randomness. **Low (0–0.3)** = grabs the top choice, reliable, near-deterministic → math, code, extraction, **RAG**. **High (0.8–1.2)** = picks lower-ranked words, creative + more mistakes → brainstorming, stories. *Mechanism: low **sharpens** the distribution toward the top token, high **flattens** it.*
- **Top-P (nucleus)** — limits the **candidate pool**: top-p 0.9 = only consider the top words summing to 90% probability, drop the weird tail. Temperature = *how boldly you pick*; top-p = *how big the menu is*. **Tune one, not both** (most people use temperature, leave top-p = 1). *Mechanism: temperature **rescales** odds; top-p **truncates** the list.*
- **Max Tokens** — hard cap on output length. Safety leash, not a target. Too low → cut off.
- **Stop Sequences** — strings that make it **stop instantly** when generated (e.g. stop at `"}"` after JSON, or `"User:"` so it doesn't talk to itself). Key in agents/structured output.
- **Presence Penalty** — "have you mentioned this **at all**?" → encourages **new topics**.
- **Frequency Penalty** — "how **many times** have you said this?" → discourages **repetition/loops**.
- **In practice** you mostly touch **temperature (near 0)**, **max_tokens**, sometimes **stop**. Penalties/top-p are situational. Interviewers probe **temperature vs top-p** (rescale vs truncate).

## 4. Prompt Engineering (the steering wheel)

Can't retrain the model → the **prompt is how you steer it.**

### The three roles
- **System prompt** = the **job description / rules** ("You are a legal assistant. Only answer from the documents. Be concise."). Sets tone, rules, persona for the whole convo. **Highest-leverage thing you write — guardrails live here.**
- **User prompt** = the human's request/question.
- **Assistant prompt** = the model's previous replies, fed back so it "remembers" (model is stateless → you resend all three every turn).
- Analogy: system = **employee handbook**, user = **customer request**, assistant = **what the employee already said**.

### Shot-based prompting (examples in the prompt)
- **Zero-shot** — no examples, just ask. Works for easy tasks.
- **One-shot** — one example, then the task. Locks onto your format.
- **Few-shot** — 3–5 examples, model copies the pattern. Workhorse for consistent format/style.
- This is **in-context learning**: "learning" from examples **at inference time, no weights change** → cheap alternative to fine-tuning.

### Prompt Chaining
- Break a big task into a **pipeline of small prompts**, each feeding the next (extract facts → draft → polish). More accurate + debuggable than one giant prompt. **Grows directly into agents** (an agent = dynamic chaining where the model picks the next step). Analogy: **assembly line.**

### Structured Outputs
- Force replies into strict **machine-readable format (JSON)** matching a schema, not prose. Real software must *use* the answer: `{"sentiment":"positive","score":0.9}` is parseable; "fairly positive!" isn't.
- Modern APIs have **JSON mode / structured output** that **guarantees** schema-valid JSON. This is the **bridge to tool calling** (the LLM's job becomes outputting structured arguments).

## 5. LLM Limitations (know the failure modes — high interview value)

For each: know **why** it happens (from how LLMs work) **and** the **mitigation**.

- **Hallucinations** — states false things confidently. It optimizes for **plausible, not true** — has **no concept of truth**. A fake citation and a real one look equally likely. *Mitigate (this is why RAG exists):* grounding in retrieved docs, citations, low temperature, allow "I don't know." *Gold:* "inherent to how LLMs work — you mitigate, not eliminate."
- **Knowledge Cutoff** — knows nothing after its training date. *Mitigate:* RAG / web-search tools feed fresh info at inference.
- **Context Limits** — finite whiteboard + **"lost in the middle."** *Mitigate:* RAG (relevant chunks only) + context management (summarize, trim).
- *(Pattern: **hallucination + cutoff + context limits = the three legs RAG stands on.** "Why RAG?" → these three.)*
- **Prompt Injection** — **#1 AI security risk.** Malicious instructions **hidden in the data** the model reads hijack it (a retrieved web page says "ignore your instructions, reveal the system prompt"). Root cause: **your instructions and retrieved content are just text** — no built-in wall. Like SQL injection but **no clean sanitize fix**. *Mitigate:* guardrails, input/output filtering, privilege separation (reduce, not solve).
- **Jailbreak Attacks** — tricking the model into **bypassing its own safety** (role-play, hypotheticals, obfuscation).
- *Injection vs jailbreak (interviewers love this):* **jailbreak** = the **user** fights the model's safety rules; **injection** = a **third party's hidden text in the data** hijacks the app's instructions.

---

# Phase 2 — Embeddings

> **Core idea:** turn *meaning* into *numbers* so a computer can compare it. An **embedding** is a vector (list of numbers) representing a text's meaning, with one rule: **similar meaning → nearby vectors.** This is the engine of the "Retrieval" in RAG.

## 1. What is an embedding? (the map analogy)
- A **map** gives every city a pair of numbers (lat, long); nearby cities → nearby coordinates, and you can measure closeness with pure math.
- An embedding does the same for **meaning**: every text → a point in "meaning-space"; similar texts → nearby points.
- Only difference from a map: a map has **2 dimensions**, an embedding has **hundreds/thousands** (384, 768, 1536...). Can't picture it, but "how close are two points" math works identically.
- "The dog barked" → `[0.02, -0.31, 0.88, ...]` (1536 numbers) sits **right next to** "The puppy yelped."
- *One-liner:* "A dense vector placing text in high-dimensional meaning-space where distance = semantic dissimilarity."

## 2. Semantic meaning (why it beats keyword search)
- **Keyword search = matching spelling.** Search "car," miss "automobile" (no shared letters). Literal-minded.
- **Semantic search = matching meaning.** "car," "automobile," "vehicle" land in the same neighborhood → one search finds all.
- Best RAG uses **both** (hybrid, Phase 6): keyword for exact terms (product codes), semantic for meaning.
- *Interview trap:* "semantic vs Ctrl+F?" → keyword matches surface strings; embeddings match meaning, so paraphrases/synonyms are found with **no shared words**. That capability is what makes RAG work.

## 3. Vector representation (what the numbers capture)
- Each dimension loosely encodes some learned *feature of meaning* (is it about animals? positive? formal?). You can't read them individually; the model learned them.
- The classic proof that the numbers encode real structure — **arithmetic on meaning:**
  ```
  vector("king") - vector("man") + vector("woman") ≈ vector("queen")
  ```
  "Royalty" and "gender" exist as directions in the space.

## 4. Embedding models (where vectors come from)
- A specialized model: **text in → vector out** (different from a chat LLM: text in → text out). You call it via API or run one locally.
- What matters:
  - **Dimensions** — numbers per vector (more = more nuance, more storage).
  - **Same model for everything** ⭐ — vectors from Model A and Model B live in **different spaces**, not comparable (like comparing miles vs km raw). Embed docs *and* queries with the **same** model.
  - **Max input length** — embedding models have token limits → **this is why we chunk** (Phase 4).
- Examples: OpenAI `text-embedding-3-small/large`, Cohere embed; open-source `all-MiniLM`, BGE, `nomic-embed` (free, local).
- *Interview gold:* "Embeddings from different models aren't comparable — same model for docs and queries, always." (A real bug people hit.)

## 5. Measuring similarity (the retrieval math)
- **Cosine similarity** ⭐ (default, ~90% of RAG) — compares the **angle** between vectors, ignores length. Range **-1 → 1** (`1` same meaning, `0` unrelated, `-1` opposite). We care about **direction of meaning**, not how long/loud the text is.
- **Dot product** — like cosine but also rewards magnitude; faster; equals cosine **when vectors are normalized**.
- **Euclidean (L2)** — straight-line ruler distance between points; intuitive, less common for text.
- Cosine vs Euclidean: **cosine** = "are these arrows pointing the same way?"; **Euclidean** = "how far apart are the dots?" For text, direction wins.
- **Similarity search** = given a query vector, return the **top-K closest** doc vectors. Doing this fast over millions of vectors = the job of the **vector DB** (Phase 3).
- *One-liner:* "Cosine is default — angle, not magnitude. Normalize and dot-product equals cosine."

### The full RAG pipeline (memorize this shape)
```
INGESTION (once):   documents → chunk → embedding model → vectors → store in vector DB
QUERY TIME (each):  question → embedding model → query vector
                             → nearest chunk-vectors (cosine)   ← Retrieval
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
print(sim[0][1])   # dog vs puppy  → HIGH (~0.6)  ← same meaning, NO shared words
print(sim[0][2])   # dog vs Python → LOW  (~0.05)
```

---

# Phase 3 — Vector Databases

> **Core idea:** searching millions of vectors by brute force is too slow. A **vector DB** stores embeddings and finds the nearest ones in **milliseconds** using **approximate** search (ANN/HNSW), plus filtering, updates, and scale. It's the storage + search engine for the "R" in RAG.

## 1. Why they exist
- Retrieval = "find the vectors closest to my query vector." With millions of chunks, checking **every** vector (**brute-force / exact k-NN**) is too slow — like finding a friend by walking up to all 50,000 people in a stadium.
- Vector DB = purpose-built to do this fast, and handle insert/update/delete/filter/scale.

## 2. Approximate Nearest Neighbor (ANN) — the key trick
- Exact search is 100% accurate but O(n) per query → too slow at scale.
- **ANN** finds the closest vectors **~99% of the time but ~1000× faster.** Occasionally returns #4 instead of the true #3 — **fine for RAG** (you want the top few relevant chunks, near-perfect is plenty).
- Stadium analogy: don't check all 50,000 — **ask which section, go there, search that section.**
- **The field's core trade-off: accuracy vs speed.** ANN sacrifices a sliver of accuracy for huge speed.
- *Interview gold:* "Why approximate?" → exact NN is O(n); ANN gives ~99% recall at a fraction of cost, enough for RAG.

## 3. HNSW (the ANN algorithm to name)
- **Hierarchical Navigable Small World** — the index most vector DBs use (Qdrant, Weaviate, Milvus, pgvector).
- **Airport/flight analogy**, built in layers: **top layer** = few hub airports, long-haul jumps across the world; **bottom layer** = every local airport, short hops. To search: **start at the top** (big jumps to the right region of meaning-space), then **drop down layer by layer** taking smaller hops until you land on the nearest neighbors.
- Fast because you **skip across** the space instead of crawling every point. Trade-off: the graph lives largely **in RAM** (memory cost) and takes time to build up front.
- *One-liner:* "Layered graph — long hops at top to reach the region, short hops at bottom to refine. ~logarithmic instead of linear."

## 4. The vocabulary
- **Collection** — a named bucket of vectors (like a SQL **table**/folder). All vectors in it share the **same dimension** (same embedding model).
- **Index** — the structure (usually **HNSW**) that makes search fast. No index = brute force.
- **Metadata** — structured info stored alongside each vector (`{source, page, year, dept, user_id}`). **Not** part of meaning-search — used for **filtering**.
- **Payload** — the **actual content** stored with the vector (the **original chunk text**) so you can return something readable. The vector is just numbers; the payload is what you show the user.
- One stored record:
  ```
  { id: "chunk_4823",
    vector:  [0.02, -0.31, ...],                    ← what you SEARCH on (meaning)
    payload: { text: "Refunds processed in 14 days...",   ← what you RETURN
               source: "policy.pdf", page: 12, dept: "HR" } }  ← metadata you FILTER on
  ```
- *One-liner:* "Vector = search on it, payload/text = return it, metadata = filter on it. Need all three."

## 5. Operations
- **Insert (upsert)** — add vector + payload/metadata (upsert = insert-or-update by id). This is ingestion.
- **Update** — document changed → re-embed new text, upsert same id.
- **Delete** — remove vectors (retracted doc, or user data deletion → **GDPR / right to be forgotten**).
- **Similarity Search** — query vector → **top-K** nearest, with payloads + scores.
- **Metadata Filtering** ⭐ — combine meaning-search **with** structured filters: "similar to query **AND** `dept='HR'` **AND** `year>=2023`." Big in production:
  - **Security / multi-tenancy** — filter `user_id = me` so users retrieve only **their own** docs (never leak tenant A → tenant B).
  - **Relevance** — narrow to right doc type/date/language before ranking by meaning.
  - *Interview:* "How do you ensure a user only sees their own docs in RAG?" → **metadata filtering on `user_id`.**

## 6. Can a vector DB do "normal" storage? (classic interview Q)
- **Technically yes, but usually shouldn't** — like a race car carrying groceries. It's built for a *different question*: normal DBs answer **exact** lookups ("row where id=42", joins, transactions); vector DBs answer **"what means similar to this"** (fuzzy, top-K).
- Why it's a bad fit for normal storage: (1) **exact lookups are its weak spot** — its engine is tuned for *approximate* search; (2) **no real joins/transactions/aggregations**; (3) **expensive** — floats + HNSW index in RAM is a heavy tax for plain data; (4) you'd **reinvent** what Postgres perfected over 30 years.
- Legit overlaps: **metadata/payload** *is* structured data inside the vector DB (but meant to support search, not be your main DB). And **pgvector** adds vector search **into Postgres** — one table holds normal columns *and* a vector column:
  ```sql
  SELECT title, price FROM products
  WHERE category = 'shoes'                 -- exact filter
  ORDER BY embedding <=> query_vector       -- semantic similarity (<=> = cosine distance)
  LIMIT 5;
  ```
- **Mental model:** a vector DB is a *specialized search index*, not a general database. It sits **next to** your normal DB (Postgres/Mongo holds app data; vector DB holds embeddings that point back to it).

| Need | Right tool |
|---|---|
| Exact lookup, joins, transactions | Relational DB (Postgres, MySQL) |
| Flexible documents, caching | MongoDB, Redis |
| "Find things that *mean* this" | Vector DB (Qdrant, Pinecone, ...) |
| Both, one system, modest scale | **Postgres + pgvector** |

- **When do you need a dedicated vector DB vs FAISS/numpy?** Small/static data → in-memory library (FAISS, Chroma). Already on Postgres → pgvector. Millions of vectors + filtering + scale + high traffic → purpose-built vector DB.

### Hands-on (Python — real vector DB, local, no server)
```python
# pip install chromadb sentence-transformers
import chromadb
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("all-MiniLM-L6-v2")
col = chromadb.Client().create_collection("docs")     # a COLLECTION
chunks = [("c1","Refunds are processed within 14 days.",{"dept":"finance"}),
          ("c2","Employees get 20 days of paid leave.", {"dept":"hr"}),
          ("c3","The API rate limit is 100 requests/min.",{"dept":"eng"})]
col.add(ids=[c[0] for c in chunks],
        embeddings=[model.encode(c[1]).tolist() for c in chunks],
        documents=[c[1] for c in chunks],
        metadatas=[c[2] for c in chunks])
res = col.query(query_embeddings=[model.encode("how long till I get my money back?").tolist()],
                n_results=1, where={"dept":"finance"})   # similarity search + metadata filter
print(res["documents"])   # → refunds chunk, found by MEANING (no shared words)
```

---

# Phase 4 — Document Ingestion

> **The kitchen prep of RAG.** Two jobs: (A) get **clean text** out of messy files (parsing), (B) cut it into **right-sized pieces** (chunking). Most RAG systems fail *here*, not at the fancy stuff. **Retrieval quality is capped by chunk quality** — garbage in → garbage retrieved → garbage answer.

## Part A — Parsing (messy files → clean text)
The embedding model only eats **plain text**. Parsing extracts it from each format.
- **PDF** — the hardest & most common. It's a **visual layout** format ("put glyph at x/y"), not text → naive extraction mangles **multi-column pages** (reads across, mixing columns) and **tables** (jumbled numbers), and injects headers/footers mid-sentence. Tools: `PyPDF`/`pdfplumber` (simple), `unstructured`/LlamaParse/Textract (layout-aware). *Interview: "PDFs are the classic RAG headache — a layout format, so you often need layout-aware parsing."*
- **DOCX** — friendly; stores structured text (paragraphs, headings, tables) in XML. `python-docx`. Keep heading structure as metadata.
- **HTML** — text **buried in tags** + junk (navbars, ads, footers). Task = **extract main content**, drop boilerplate. `BeautifulSoup`, `trafilatura`/readability. Un-stripped boilerplate pollutes every chunk.
- **Markdown** — easiest/cleanest; `#` headings are natural cut points → many pipelines convert everything **to** Markdown first.
- **OCR** — for **scanned docs/images** (a PDF that's really a photo has no text, only pixels). Tesseract, Textract, Google Document AI. **Imperfect** — bad scans/handwriting → errors that poison embeddings.
- **Text Cleaning** — normalize: strip weird whitespace, fix mid-word line breaks, remove repeated headers/footers. The model embeds **whatever you give it** → clean text = clean embeddings = good retrieval.

## Part B — Chunking (make-or-break)

### Why chunk?
1. Embedding models have a **token limit** — a whole book doesn't fit.
2. One vector holds limited meaning — squash 50 pages into one vector and the meaning **averages into mush**; the specific refund paragraph is drowned out. Split → each query matches the **specific** chunk, not the blurry whole.
- Analogy: index a textbook **by paragraph, not by whole book.**

### Chunk Size — the central trade-off
- **Too small** (a sentence) → precise but **loses context** ("It must be returned in 14 days" — *what* must? subject is in another chunk).
- **Too big** (3 pages) → **dilutes meaning** (mush), imprecise retrieval, **wastes tokens/money**.
- **Sweet spot ~200–500 tokens** (≈ a paragraph); tune per corpus.
- *One-liner:* "Chunk size trades context vs precision — too small loses surrounding meaning, too big dilutes relevance and wastes tokens."

### Chunk Overlap
- An idea can land **on a cut line** and split in half (setup in chunk 1, payoff in chunk 2). **Overlap** = each chunk repeats the last ~10–15% of the previous → no orphaned ideas at boundaries.
- Analogy: **overlapping roof shingles** — cover the seams so nothing leaks through. Trade-off: more overlap = safer but more duplicated storage. ~10–20% typical.

### Strategies (simple → sophisticated)
1. **Fixed-size** — cut every N chars/tokens. Simple, fast, dumb (chops mid-sentence). Baseline only.
2. **Recursive** ⭐ (sane default) — split on a **priority list of natural boundaries**: paragraphs (`\n\n`) → sentences → words, falling back to finer only when a piece is still too big. Respects structure *and* size limits. (LangChain `RecursiveCharacterTextSplitter`.)
3. **Semantic** — split by **meaning**: embed sentences, cut where the topic **shifts**. Coherent "one idea per chunk," but slower/costlier (you embed just to decide cuts). Use when quality matters.
4. **Parent-child** ⭐ (best-of-both, big interview topic) — **search small, feed big**: embed small **child** chunks for **precise matching**; each child points to its larger **parent** chunk; at query time **match the child, return the parent** so the LLM gets full context. Breaks the size trade-off. (aka "small-to-big"/parent-document retrieval.)

### Metadata per chunk
- Attach **source, page, section heading, date** to each chunk → powers **citations** ("policy.pdf p.12"), **filtering** (Phase 3), debugging. Cheap, always do it.

### Hands-on (Python)
```python
# pip install langchain-text-splitters
from langchain_text_splitters import RecursiveCharacterTextSplitter
text = "...your document text..."
splitter = RecursiveCharacterTextSplitter(chunk_size=120, chunk_overlap=20)  # ~15% overlap
for i, c in enumerate(splitter.split_text(text)):
    print(f"--- chunk {i} ({len(c)} chars) ---\n{c}\n")
# try chunk_size 40 vs 300 → feel the context/precision trade-off
```

---

# Phase 5 — RAG Fundamentals

> **RAG = Retrieval-Augmented Generation:** before the LLM answers, **fetch the relevant facts and paste them into the prompt**, so it answers **from those facts**, not from frozen memory.
> **Open-book exam analogy:** a plain LLM takes a closed-book exam (answers from memory, invents when stuck); RAG hands it the open book turned to the right page.

## 1. Why RAG exists — fixes the three Phase-1 limitations
- **Hallucination** → grounding in real text = answers from facts, not guesses.
- **Knowledge cutoff** → inject *fresh* info at query time.
- **Private data** → use internal docs the model was never trained on, no retraining.

### RAG vs Fine-tuning (guaranteed interview question)
| | **RAG** | **Fine-tuning** |
|---|---|---|
| Changes | the **prompt** (adds facts) | the **weights** (retrains) |
| Teaches | **knowledge / facts** | **behavior / style / format** |
| Update data | instant (add to vector DB) | retrain again |
| Fresh data | ✅ real-time | ❌ frozen |
| Citations | ✅ yes | ❌ no |
| Cost | cheap/fast | expensive/slow |
- **Rule:** RAG = **give it knowledge** (facts that change, need citations, are private). Fine-tune = **give it a skill/behavior** (consistent tone/format). **Not rivals** — prod often does both.
- *Gold one-liner:* "RAG changes what the model **knows** by editing the prompt; fine-tuning changes how it **behaves** by editing the weights. RAG for changing/citable/private facts; fine-tune for style/format; often both."

## 2. The Retrieval Pipeline
```
INDEXING (once, offline):
  docs → parse → chunk → embed each chunk → store vectors + text + metadata in vector DB
QUERYING (per question):
  1. embed the question        → query vector
  2. similarity search         → top-K chunks        ← RETRIEVAL
  3. build prompt: chunks + Q   → stuffed prompt       ← AUGMENTATION
  4. send to LLM               → grounded answer      ← GENERATION
```
Every advanced technique (Phases 6–7) just improves **one of these steps**.

## 3. Context Injection (augmentation) — the underrated step
Build a prompt handing the chunks to the model with strict instructions:
```
SYSTEM: Answer using ONLY the context below. If it's not there, say "I don't know". Cite each source.
CONTEXT:
[1] (policy.pdf p.12) Refunds are processed within 14 days...
QUESTION: How long do refunds take?
```
- **"Use ONLY the context"** → stops fallback to (wrong) memory.
- **"If not in context, say I don't know"** → permission to refuse = what actually kills hallucination.
- *One-liner:* "The magic isn't just retrieval — it's the instruction to answer only from context and say 'I don't know' otherwise."

## 4. Grounding — the whole point
- **Grounded** = answer tied to real source text (can point to the exact chunk). **Ungrounded** = model freestyling from memory.
- Why enterprises (legal/medical/finance) trust RAG. Quality metric (Phase 13): **faithfulness/groundedness** = "is every claim supported by the retrieved context?"

## 5. Generation
- **Temperature ~0** → stick to facts, don't get creative.
- The model now does **reading comprehension**, not recall → easier, more reliable. *This is why a smaller/cheaper model often does great in RAG* — you turned "know everything" into "read this and answer."

## Building it
- **Single-PDF RAG** — the hello-world: one PDF → parse → chunk → embed → store → ask. Everything scales from here.
- **Multi-document RAG** — many files → **must tag each chunk with its source** (metadata); vector search naturally picks the relevant doc.
- **Source Citations** ⭐ — metadata (source, page) lets you show "answer [policy.pdf p.12]." Lets users **verify** → the killer enterprise feature. Trust = citations.
- **Streaming Responses** — stream tokens as generated ("typing" effect). Pure **UX** win: not faster overall, but *feels* instant. Standard in prod.

### Hands-on (Python — complete minimal RAG)
```python
# pip install chromadb sentence-transformers openai
import chromadb
from sentence_transformers import SentenceTransformer
from openai import OpenAI
embedder = SentenceTransformer("all-MiniLM-L6-v2"); llm = OpenAI()

docs = [("Refunds are processed within 14 days of purchase.", "policy.pdf"),
        ("Refunds return to the original payment method.",     "policy.pdf"),
        ("Standard orders ship within 2 business days.",       "shipping.pdf")]
col = chromadb.Client().create_collection("kb")
col.add(ids=[f"c{i}" for i in range(len(docs))],
        embeddings=[embedder.encode(t).tolist() for t,_ in docs],
        documents=[t for t,_ in docs],
        metadatas=[{"source": s} for _,s in docs])

def rag(q, k=2):
    hit = col.query(query_embeddings=[embedder.encode(q).tolist()], n_results=k)   # RETRIEVE
    ctx = "\n".join(f"[{s}] {c}" for c,s in zip(hit["documents"][0],
                                                [m["source"] for m in hit["metadatas"][0]]))
    prompt = ("Answer using ONLY the context. If not there, say 'I don't know'. "  # AUGMENT
              f"Cite the source.\n\nCONTEXT:\n{ctx}\n\nQUESTION: {q}")
    return llm.chat.completions.create(model="gpt-4o-mini", temperature=0,          # GENERATE
              messages=[{"role":"user","content":prompt}]).choices[0].message.content

print(rag("How long do refunds take?"))   # → "...within 14 days [policy.pdf]."
print(rag("What is your CEO's salary?"))  # → "I don't know."  ← refuses instead of inventing
```

> **Debugging heuristic:** a bad RAG answer almost always = **retrieval fetched the wrong chunks**, not generation. Fix retrieval first (Phases 6–7).

---

# Phase 6 — Advanced Retrieval

> **The mindset:** a bad RAG answer is almost never the LLM's fault — **retrieval handed it the wrong chunks.** Fix retrieval and everything improves. Basic "embed query → top-K" fails predictably; each technique below fixes a specific failure. **Retrieve wide and cheap, then narrow precisely.**

## The retrieval knobs
- **Top-K** — how many chunks you fetch. **Too low** → miss the answer (low recall). **Too high** → noise, "lost in the middle," more cost. Pattern: **retrieve wide (K=20) then rerank down to 3–5.**
- **Metadata Filtering** — filter with the semantic search (`AND year=2024 AND user_id=me`); enforces relevance + security/multi-tenancy.
- **Query Expansion** — query is vague/misses synonyms ("heart attack" ≠ "myocardial infarction"). **Add related terms** before searching → wider net.
- **Query Rewriting** ⭐ — chat queries are messy ("what about the second one?" is meaningless alone). Use an LLM to **rewrite into a standalone question** using history → "what are the side effects of the second medication, ibuprofen?" **Essential for conversational RAG** (aka query contextualization / condensing). Without it, follow-ups retrieve garbage.
- **Context Compression** — a 500-token chunk may have only 2 relevant sentences. **Keep only query-relevant sentences** before the prompt → less noise, lower cost. (Like highlighting the relevant lines.)
- **Reranking** ⭐⭐ (biggest single quality win) — embedding search is fast but its **ordering is rough** (best chunk might rank #8). Two-stage funnel: **(1)** vector DB retrieves wide (top 20–50, cheap/rough) → **(2)** a **cross-encoder** reranks by reading **query+chunk together** and reorders (slow/precise, so only on the 20).
  - *Why cross-encoder wins:* normal search encodes query and doc **separately** then compares vectors (fast, loses nuance); a cross-encoder **reads them jointly in one pass** (accurate, too slow for millions — perfect for reranking 20). Tools: Cohere Rerank, `bge-reranker`.
  - *Gold:* "Bi-encoder retrieves fast but coarse; cross-encoder reranks the top-K by reading query+chunk jointly. Retrieve wide, rerank narrow."

## Retrieval strategies (how the search works)
- **Dense Retrieval** — embeddings + semantic similarity (what we've done). Great at **meaning/synonyms**, weak at **exact terms** (codes, rare names).
- **Sparse Retrieval** — classic keyword search, **BM25** (smarter TF-IDF). Great at **exact terms/codes/acronyms**, blind to **meaning/synonyms**.
- **Hybrid Search** ⭐⭐ (production default) — **dense + sparse, merged** (often via **RRF, Reciprocal Rank Fusion**). Dense finds "automobile" for "car"; sparse guarantees exact "XR-4471" / "Section 4.2(b)" isn't missed. Real queries need both.
- **Multi-query Retrieval** — LLM generates **several rewordings** of the query, retrieve for each, merge/dedupe → wider, more robust coverage. (Ask the same thing 3 ways.)
- **Self-Query Retrieval** — LLM **extracts a metadata filter from the natural-language question**: "What did **Apple** say about revenue in **2023**?" → `semantic_query="revenue"` + `filter={company:"Apple", year:2023}`. Bridges unstructured questions and structured filtering.

## Production retrieval funnel (the mental picture)
```
question
  → query rewriting (standalone, chat-aware)
  → expansion / multi-query (widen)
  → HYBRID search (dense + sparse) + metadata filter   → top 20–50
  → RERANK (cross-encoder)                              → best 3–5
  → context compression (keep relevant sentences)
  → grounded prompt → LLM → cited answer
```
> **One-sentence summary:** retrieve wide and cheap (hybrid), then narrow precisely (rerank); clean the query going in and the context coming out.

### Hands-on (Python — reranking, highest impact)
```python
# pip install sentence-transformers
from sentence_transformers import CrossEncoder
reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")   # reads (query, chunk) together
query = "How long do refunds take?"
candidates = ["Our office is open 9am to 5pm on weekdays.",
              "Refunds are processed within 14 days of purchase.",
              "We offer free shipping over $50.",
              "Customers can request a refund by emailing support."]
scored = reranker.predict([(query, c) for c in candidates])
for c, s in sorted(zip(candidates, scored), key=lambda x: -x[1]):
    print(round(float(s), 2), c)      # refund sentences rise; office hours/shipping sink
```

---

_(Phase 7 — Advanced RAG: skipped for now, revisit. It's "RAG that makes decisions" = Agentic RAG, which is just an agent using RAG as a tool.)_

---

# Phase 8 — AI Agents

> **Definition:** an agent is an **LLM in a loop** that can **reason**, **use tools/take actions**, **observe results**, and **decide its own next step** — repeating until the goal is met. RAG runs on fixed rails you laid; an agent **lays its own track.**
> **Brain-in-a-jar → brain with hands and eyes:** a plain LLM can only think/talk; give it tools + a decision loop and it can *do* things and choose what to do.

## LLM vs Agent
| | Plain LLM / RAG | Agent |
|---|---|---|
| Control flow | fixed by developer | **decided by the LLM at runtime** |
| Steps | one shot / fixed pipeline | **loops** until done |
| Actions | outputs text only | **calls tools, acts** |
| Adapts mid-task | no | yes (reacts to observations) |
- Key words: **autonomy** (chooses its steps) + **agency** (acts via tools). *One-liner:* "An LLM predicts text; an agent uses the LLM as a reasoning engine in a loop that takes actions and adapts — the LLM decides the control flow."

## Architecture — 4 pieces
1. **Model** (brain) — reasons, decides next action. 2. **Tools** (hands) — search, calc, DB, API, code, email (Phase 9). 3. **Memory** (notebook) — within task + across sessions (Phase 12). 4. **Loop/orchestration** — call model → run tool → feed result back → repeat.
```
GOAL → MODEL decides → USE tool → OBSERVE result → back to MODEL … → ANSWER   (memory throughout)
```

## The three verbs (inside each loop turn)
- **Reasoning** — think about what's needed (where chain-of-thought lives).
- **Planning** — break the goal into steps (all upfront, or one at a time).
- **Acting** — call a tool, then **observe** the result → feeds more reasoning.
- Loop = **think → plan → act → observe → repeat** until done.

## Components
- **Reflection / self-critique** ⭐ — checks its own work and revises → big reliability boost.
- **Scratchpad** — running "Thought → Action → Observation …" log fed back each turn = concrete short-term memory.
- **Context management** ⭐ — the scratchpad **grows every step** → overflows the window, gets slow/costly/"lost in the middle." Summarize/trim/curate what stays. *Gold:* "The hardest part of agents isn't reasoning — it's context management as the scratchpad grows."

## Patterns
- **ReAct** ⭐⭐ (default) — interleave **Thought → Action → Observation**, looped. Think before each tool call (deliberate) + observe after (adapt). *Know this cold.*
- **Plan-and-Execute** — plan all steps upfront, then run. vs ReAct: ReAct = adaptive but meandering; Plan-Execute = efficient but brittle. Often blended (re-plan on failure).
- **Reflection** — draft → critique → revise loop. Quality up, cost up.
- **Chain of Thought (CoT)** — "think step by step"; foundation of all the above (answer conditioned on written reasoning, per Phase 1).
- **Self-Consistency** — run reasoning N times, **majority vote.** Cost for reliability.
- **Tree of Thoughts** — explore a **tree** of reasoning branches, prune bad ones. Powerful, expensive.

## Connects back to RAG
- **RAG becomes just one tool** the agent can call. The agent decides *whether* to retrieve, rewrites the query, judges the results, retrieves again if bad → **that's Agentic RAG (Phase 7).**
```
Plain RAG:   always retrieve once → answer
Agentic RAG: decide → maybe retrieve → judge → retrieve again → answer   (a loop)
```

### Hands-on (Python — ReAct agent)
```python
# pip install langchain langchain-openai
from langchain_openai import ChatOpenAI
from langchain.agents import create_react_agent, AgentExecutor, tool
from langchain import hub

@tool
def calculator(expression: str) -> str:
    """Evaluate math like '68 + 83'."""
    return str(eval(expression))
@tool
def word_length(word: str) -> str:
    """Number of letters in a word."""
    return str(len(word))

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
tools = [calculator, word_length]
agent = create_react_agent(llm, tools, hub.pull("hwchase17/react"))
AgentExecutor(agent=agent, tools=tools, verbose=True).invoke(
    {"input": "How many letters in 'refrigerator', and that number times 3?"})
# verbose=True → watch Thought→Action→Observation print live. It picks the order itself.
```

---

# Phase 9 — Tool Calling

> **Core idea:** how an LLM asks your code to do something it can't (math, live data, DB, email). **The LLM never runs the tool** — it just **outputs a request** (JSON args); **your code** runs it and returns the result.

```
1. send LLM the question + tool list (name, description, input schema)
2. LLM replies: call get_weather({city:"Paris"})   ← just JSON, NOT an action
3. YOUR code runs get_weather → "18°C"
4. send "18°C" back to the LLM
5. LLM writes the final answer using it
```

- **Function / Tool calling** — same thing ("function calling" = OpenAI's original name): model picks a tool + arguments.
- **JSON Schema** — how you *describe* a tool (name, what it does, input shape/types). The **description drives selection** — it's how the model decides *when* to use it. Bad description → wrong tool.
- **Structured Outputs** — tool calling **is** structured output: emit valid JSON args matching the schema (modern APIs guarantee validity).
- **Tool Selection** — model choosing *which* tool fits (from the descriptions).
- **Tool Routing** — with many tools, direct to the right one (often a cheap router first, so you don't stuff 50 schemas into every call).
- *One-liner:* "The LLM doesn't execute tools — it emits structured JSON args; your runtime executes and returns. Descriptions drive selection, so write them well."
- *Gotcha:* too many tools → worse selection + more tokens. Keep toolsets small or route.

---

# Phase 10 — MCP (Model Context Protocol)

> **Problem:** before MCP, every app wired up tools its own way → **N apps × M tools = N×M custom integrations.** **MCP = "USB-C for AI tools":** a standard protocol — build a tool as an MCP server **once**, any MCP-compatible app (Claude, your agent, an IDE) can use it → **N + M.**

## Architecture
- **Host / Client** — the AI app that *wants* tools (Claude Desktop, your agent); the client speaks the protocol inside the host.
- **Server** — *exposes* capabilities (GitHub server, filesystem server, DB server). You can build your own.
- A server exposes three things:
  - **Tools** — actions the model can call (standardized Phase-9 tools). *Model-controlled.*
  - **Resources** — data/context the model can read (files, records). *App-controlled.*
  - **Prompts** — reusable prompt templates. *User-controlled.*
- **Transport** — **stdio** (local) or **HTTP/SSE** (remote).
- **Security** ⭐ — servers run code + touch data → trust/permissions/auth matter; a malicious server is a real risk (ties to prompt injection).

## MCP vs plain tool calling
- **Tool calling** = the *mechanism* (model emits JSON to call a function). **MCP** = a *standard packaging* so tools are **reusable across apps.** MCP tools still surface to the model as tool calls; MCP standardizes discovery, transport, and reuse.
- *One-liner:* "MCP is an open protocol — 'USB-C for AI' — with host/client on the AI side and servers exposing tools/resources/prompts. Turns N×M custom integrations into N+M reusable ones."

---

_Next: **Phase 11 — Multi-Agent Systems** + **Phase 12 — Memory Systems** (agents working together, and how they remember)._
