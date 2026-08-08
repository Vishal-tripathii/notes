# AI Document Ingestion & RAG

### "How does ChatGPT/Claude read a full PDF almost instantly?"

Two different things are happening depending on the PDF's size, and conflating them is the most common misconception.

**1. Extraction is fast because it's not reading — it's parsing structured data**

A PDF isn't text top-to-bottom like a `.txt` file — it's a page-description format: a bag of text objects, each with an `(x, y)` coordinate and a font. A parser (`pypdf`, `pdfplumber`, `pdf.js`) pulls out every text object and *reconstructs* reading order from position — sort by y, then x, group into lines/columns. This is cheap, CPU-bound work — milliseconds to low seconds even for a 100-page doc, because there's no comprehension involved yet, just string extraction. (Scanned/image PDFs are the slow exception — those need OCR, which is genuinely heavier; some tools sidestep this entirely by feeding the page as an *image* straight into a vision-capable model instead of extracting text at all — this is what Claude/GPT-4V do for complex layouts, tables, and charts that text extraction would mangle.)

**2. "Instant comprehension" is a transformer property, not a reading-speed property**

Even after extraction, an LLM doesn't read a document the way a human does — word by word, building understanding incrementally. A transformer's self-attention layer looks at **every token in the context simultaneously, in parallel**, in a single forward pass — not sequentially like an RNN or a human eye moving left to right. So "reading" a 20-page PDF and "reading" one sentence take a similar *shape* of computation (attention over N tokens), just scaled — that's why it doesn't feel like it's spending 20x longer thinking about a 20-page doc. Whether the whole document *fits* is the real constraint — modern context windows (100K–1M+ tokens) mean most PDFs simply fit whole.

**3. When it doesn't fit — this is RAG**

For documents too large for the context window (or when you want cheap repeated queries over a huge corpus), the answer isn't "read faster," it's "don't read all of it":
```
Ingest:  PDF → extract text → chunk (with overlap) → embed each chunk → store in vector DB
Query:   question → embed → similarity search → retrieve top-K relevant chunks → feed ONLY those to the LLM
```
The "instant" feel at query time comes from **not re-processing the whole document per question** — embedding + ingest happens once upfront (amortized), and each query only does a fast vector similarity search (approximate nearest-neighbor, sub-linear) plus a small LLM call over just the retrieved chunks, not the full doc.

**4. Prompt caching is the other lever** — if you re-query the *same* document repeatedly (e.g. a chat session with one PDF pinned), providers cache the already-processed context so each follow-up question doesn't re-pay the cost of re-ingesting the whole document — only the new question gets processed fresh.

| Scenario | What actually happens |
|---|---|
| Small PDF, chat app | Extract once → whole text stuffed into context → parallel attention, not RAG |
| Huge PDF / corpus | Chunk + embed once → retrieve top-K per question |
| Repeated Qs, same doc | Prompt caching avoids re-processing unchanged context |
| Scanned/complex-layout PDF | OCR, or feed page images directly to a vision model |

**Interview line:** *"Extraction is cheap parsing, not comprehension — a PDF's text objects get pulled out and reordered by position in milliseconds. The 'instant' feel of reading it comes from the transformer processing every token in parallel via self-attention rather than reading sequentially like a human, so as long as the document fits the context window it's one fast forward pass. When it doesn't fit, that's RAG — chunk and embed once upfront, then retrieve only the relevant top-K chunks per question instead of re-reading everything."*

**Tests:** how LLM context processing actually works (parallel attention vs sequential reading), RAG architecture, when full-context vs retrieval is the right call

*Axis: performance · Source: challenge question*

#### Follow-ups

- What happens to retrieval quality if your chunk size is too large vs too small — what's actually being traded off?
- How would you handle a PDF that's mostly tables — why does naive text extraction often scramble table data, and what's the fix?
- If a user asks a question that needs information spanning two non-adjacent chunks, how does top-K retrieval fail here, and how would you fix it (larger K, better chunking, re-ranking)?
- Why does prompt caching require the cached prefix to be byte-identical — what invalidates the cache on a follow-up question?
