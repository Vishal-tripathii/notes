# 🤖 AI Engineering Interview Question Bank — Answered

> **How to use:** cover the answer, say yours out loud, then compare. Answers are written the way you'd say them in an interview — short, plain, with the trade-off. Each section links to the part that explains it in depth.
>
> **~125 questions · 18 sections** · aimed at a full-stack engineer who builds AI features (not an ML researcher).

---

## Sections

| | Topic | Note |
|---|---|---|
| 1 | [LLM fundamentals](#s1) | [Part 01](01-llm-fundamentals.md) |
| 2 | [Tokens, context & cost](#s2) | [Part 01](01-llm-fundamentals.md), [16](16-production-ai.md) |
| 3 | [Prompting & structured output](#s3) | [Part 02](02-prompt-engineering-and-structured-output.md) |
| 4 | [Embeddings](#s4) | [Part 03](03-embeddings.md) |
| 5 | [Vector databases](#s5) | [Part 04](04-vector-databases.md) |
| 6 | [Ingestion & chunking](#s6) | [Part 05](05-document-ingestion.md) |
| 7 | [RAG](#s7) ⭐ | [Part 06](06-rag-fundamentals.md) |
| 8 | [Advanced retrieval & RAG](#s8) | [Part 07](07-advanced-retrieval.md), [08](08-advanced-rag.md) |
| 9 | [Agents](#s9) ⭐ | [Part 09](09-ai-agents.md) |
| 10 | [Tool calling & MCP](#s10) | [Part 10](10-tool-calling.md), [11](11-mcp.md) |
| 11 | [Building it: Node & React](#s11) ⭐ | [Part 12](12-llm-apps-in-node-and-react.md) |
| 12 | [Memory & multi-agent](#s12) | [Part 13](13-memory-and-multi-agent.md) |
| 13 | [Evaluation & observability](#s13) ⭐ | [Part 14](14-evaluation-and-observability.md) |
| 14 | [Security](#s14) ⭐ | [Part 15](15-ai-security.md) |
| 15 | [Production: cost, latency, reliability](#s15) | [Part 16](16-production-ai.md) |
| 16 | [Fine-tuning & models](#s16) | [Part 16](16-production-ai.md) |
| 17 | [System design & AI at work](#s17) | [Part 17](17-ai-system-design.md) |
| 18 | [Your RAG project — deep-dive questions](#s18) ⭐ | [rag-project-plan.md](rag-project-plan.md) |

---

<a name="s1"></a>
## 1. LLM fundamentals

**Q: What is an LLM?**
> A transformer model trained on huge amounts of text to predict the next token. Generating a response is repeating that prediction one token at a time.

**Q: What made modern LLMs possible?**
> The transformer architecture and its attention mechanism, which processes all tokens in parallel and learns which words relate to which. That made training on huge datasets with many GPUs practical.

**Q: Training vs inference?**
> Training adjusts the model's weights on data — expensive, done rarely. Inference is using the frozen model to generate answers. Chatting with a model doesn't change it, which is why it has a knowledge cutoff and no memory between calls.

**Q: What is a foundation model?**
> A large general-purpose model pre-trained on broad data, then post-trained to follow instructions. Apps build on it with prompts, RAG, tools or fine-tuning rather than training their own.

**Q: Why do LLMs hallucinate?**
> They're trained to produce plausible text, not verified facts. You reduce hallucination with grounding, citations, permission to say "I don't know", low temperature and evals — but you can't eliminate it.

**Q: What are reasoning models and when do you use them?**
> Models that think step by step before answering — better at maths, code and planning, but slower and more expensive because thinking tokens are billed. I use them for hard multi-step tasks and a fast model for simple ones.

**Q: Temperature vs top-p?**
> Temperature rescales probabilities — low is focused and repeatable, high is creative. Top-p limits sampling to the most likely tokens covering p of the probability. Adjust one; keep temperature low for factual work.

**Q: Is temperature 0 deterministic?**
> Mostly, but not guaranteed — infrastructure details can cause small differences. Tests should check properties of the answer, not exact strings.

**Q: Prompt injection vs jailbreak?**
> A jailbreak is the user trying to get around the model's safety rules. Prompt injection is instructions hidden in data the app feeds the model — a document, web page or email — hijacking the app's own instructions.

**Q: What are the main limitations of LLMs?**
> Hallucination, knowledge cutoff, limited context with "lost in the middle", no memory between calls, non-determinism, and vulnerability to prompt injection.

---

<a name="s2"></a>
## 2. Tokens, context & cost

**Q: What is a token?**
> A chunk of text the model reads and generates — roughly four characters or three quarters of an English word. Pricing and limits are in tokens. Code, numbers and non-English text use more tokens.

**Q: What is the context window?**
> The maximum tokens a single request can hold — input and output together: system prompt, history, retrieved documents and the answer.

**Q: Context window vs max output tokens?**
> The context window is the total budget; max output tokens is a separate, smaller cap on the reply. If the reply hits it, it's cut off and the API reports a length finish reason.

**Q: Why not paste all documents into a huge context window?**
> Cost and latency grow with input, and accuracy can drop when the key fact is buried in the middle. Retrieving only the relevant pieces is usually cheaper and more accurate — though for a few small, stable documents, long context with caching can be simpler than RAG.

**Q: Why does a long conversation get expensive?**
> The model is stateless, so every turn re-sends the whole history. Fixes: trimming, summarising older turns, and prompt caching.

**Q: Why is output more expensive than input?**
> Output is generated one token at a time, each needing a full model step, while input is processed in parallel. So providers charge several times more per output token.

**Q: Estimate the cost of a feature.**
> Tokens per request — system prompt, context, history, output — times the per-token prices, times requests per day. Example: 2,000 input and 500 output at $3 and $15 per million is about 1.35 cents per request.

---

<a name="s3"></a>
## 3. Prompting & structured output

**Q: What goes in a system prompt?**
> The model's role, the rules, the tone, the output format, and behaviour like "answer only from the context, otherwise say you don't know." It's high-leverage — but not a security boundary.

**Q: Zero-shot vs few-shot?**
> Zero-shot describes the task only. Few-shot adds a few examples and the model follows the pattern — in-context learning, with no weight changes.

**Q: What is chain-of-thought prompting?**
> Asking the model to reason step by step before answering, so the answer is based on written reasoning. Reasoning models do this internally.

**Q: What is prompt chaining?**
> Splitting a task into several smaller prompts where each output feeds the next. Each step is simpler, testable and can use a cheaper model.

**Q: How do you get reliable JSON from an LLM?**
> Use the provider's structured output with a strict schema — or force a tool call — and still validate with zod or pydantic, because the content can be wrong, refused or cut off. On failure, retry once with the error or fall back.

**Q: JSON mode vs structured outputs?**
> JSON mode only guarantees valid JSON. Structured outputs guarantee it matches your schema.

**Q: How do you separate instructions from untrusted data in a prompt?**
> Put the data inside clear tags and tell the model it's information, not instructions. It helps quality and slightly reduces injection, but it's not a real security boundary.

**Q: How do you manage prompts in a codebase?**
> As code: in git, reviewed, versioned, tested against an eval set, and the version logged with each response.

---

<a name="s4"></a>
## 4. Embeddings

**Q: What is an embedding?**
> A vector that represents the meaning of text, so similar meanings are close together. It enables search by meaning instead of keywords.

**Q: How is an embedding model different from a chat model?**
> An embedding model turns text into a fixed-size vector; a chat model turns text into more text.

**Q: Why use the same model for documents and queries?**
> Each model has its own vector space, so vectors from different models can't be compared. Switching models means re-embedding everything.

**Q: Cosine similarity vs dot product vs Euclidean?**
> Cosine compares angle and ignores length — the usual default for text. Dot product equals cosine on normalised vectors and is faster. Euclidean is straight-line distance.

**Q: Where does semantic search fail?**
> On exact strings — product codes, error IDs, rare names. Keyword search handles those, so combine them in hybrid search.

**Q: How do you choose an embedding model?**
> Quality on my own data — tested with my eval questions, with benchmarks like MTEB as a starting point — plus language support, dimensions (storage and speed), max input length, cost, and whether it must run locally.

---

<a name="s5"></a>
## 5. Vector databases

**Q: Why do we need a vector database?**
> To find the nearest vectors among millions in milliseconds, with metadata filtering, updates and deletes. Brute-force comparison doesn't scale.

**Q: What is ANN and why approximate?**
> Approximate nearest neighbour search finds the closest vectors most of the time while checking only a fraction of them. For RAG, near-perfect recall is enough and the speed gain is huge.

**Q: Explain HNSW.**
> A layered graph: top layers have few nodes and long links to jump to the right region quickly; lower layers refine with short hops. Fast and accurate, but memory-heavy.

**Q: What's stored with each vector?**
> The vector for searching, the original text to return, and metadata — document id, source, page, tenant — for filtering and citations.

**Q: How do you ensure users only retrieve their own documents?**
> A mandatory `tenant_id`/`user_id` filter on every search, taken from the server-side session — never from the client or the model. Or separate collections per tenant.

**Q: pgvector or a dedicated vector DB?**
> pgvector if I'm already on Postgres and at moderate scale — one system, transactions and joins. A dedicated vector DB for large scale, heavy filtering or built-in hybrid search.

**Q: Can a vector DB replace your main database?**
> No — it's built for similarity search, not transactions, joins or exact queries. It sits alongside the main DB.

**Q: How do you handle document deletion?**
> Every chunk carries a `doc_id`; deleting a document deletes all its chunks — important for correctness and for GDPR.

---

<a name="s6"></a>
## 6. Ingestion & chunking

**Q: Why chunk documents?**
> Embedding models have input limits, one vector for a long document blurs its meaning, and you only want to send relevant parts to the LLM.

**Q: How do you choose chunk size and overlap?**
> Start with a few hundred tokens and 10–20% overlap using a recursive splitter, then tune with an eval set. Too small loses context; too large dilutes relevance and wastes tokens.

**Q: Which chunking strategies do you know?**
> Fixed-size, recursive on natural boundaries (the default), structure-aware on headings, semantic on topic shifts, and parent-child — match small chunks but send their larger parent.

**Q: Why are PDFs difficult?**
> PDF stores layout, not text structure, so naive extraction mixes columns, breaks tables and keeps headers and footers. Use layout-aware parsing, OCR for scans, or convert to Markdown.

**Q: How do you handle tables?**
> Extract them with a table-aware parser and convert to Markdown or row-wise sentences so numbers keep their column headers.

**Q: How do you keep the index up to date?**
> Ingestion runs as background jobs. Each document has a content hash and `doc_id`; changes delete old chunks and insert new ones; deletes remove all chunks; a new embedding model means re-indexing into a new collection.

**Q: What metadata do you store per chunk?**
> doc_id, source, page, section heading, date and tenant_id — for citations, filtering, deletes and debugging.

---

<a name="s7"></a>
## 7. RAG ⭐

**Q: What is RAG?**
> Retrieval-Augmented Generation: fetch relevant pieces of your data and put them in the prompt so the model answers from them. It grounds answers, adds fresh and private data, enables citations and lets you control access by filtering what's retrieved.

**Q: Walk through a RAG pipeline.**
> Offline: parse, chunk, embed and store chunks with metadata. Per query: embed the question, search with filters, optionally rerank, build a prompt with the chunks and instructions to answer only from them with citations, then generate — usually streamed.

**Q: RAG vs fine-tuning?**
> RAG adds knowledge at query time — great for changing, private or citable facts. Fine-tuning changes the weights to teach behaviour or format. Knowledge → RAG; style or narrow skill → fine-tuning; sometimes both.

**Q: How do you reduce hallucinations in RAG?**
> Good retrieval; a prompt that says answer only from the context and say "I don't know" otherwise; citations; low temperature; a relevance threshold; and faithfulness evals.

**Q: A RAG answer is wrong — how do you debug it?**
> Check the retrieved chunks first. If the right chunk is missing, it's retrieval — parsing, chunking, query, filters, hybrid search, reranking. If it's there, it's the prompt or the model.

**Q: Why do citations matter?**
> Users can verify answers, which builds trust, and you can spot bad answers faster.

**Q: Why can a smaller model work well in RAG?**
> The model is reading and summarising given text instead of recalling facts, which is an easier task.

**Q: How do you handle two documents that conflict?**
> Prefer the newer or authoritative source using metadata — dates, versions, status — remove superseded documents at ingestion, and tell the model to prefer the latest dated source and mention conflicts.

**Q: When would you not build RAG?**
> When the data is small and stable enough to put in the prompt with caching, or when the task doesn't need external knowledge.

---

<a name="s8"></a>
## 8. Advanced retrieval & RAG

**Q: What is hybrid search?**
> Combining semantic vector search with keyword search like BM25 and merging the results, often with Reciprocal Rank Fusion. It catches both meaning and exact terms.

**Q: What is reranking?**
> A second stage where a cross-encoder reads the query with each candidate and scores relevance precisely. Retrieve about 30 quickly, rerank and keep the top few. Usually the biggest single quality gain.

**Q: Bi-encoder vs cross-encoder?**
> A bi-encoder encodes query and documents separately — fast, pre-computable, less precise. A cross-encoder processes the pair together — precise but slow, so it's used only for reranking.

**Q: What is query rewriting and why is it important in chat?**
> Using a small LLM call to turn a follow-up like "what about the second one?" into a standalone question using the history. Without it, follow-ups retrieve irrelevant chunks.

**Q: What is HyDE?**
> Generating a hypothetical answer to the question and searching with its embedding, because it resembles real answers more than the question does. Costs an extra call.

**Q: What is contextual retrieval?**
> Prepending a short description of the chunk's document and section before embedding and indexing, so isolated chunks are findable.

**Q: What is agentic RAG?**
> Retrieval as a tool in an agent loop: the model decides whether and what to search, judges results and can search again or use other sources. Better for complex questions; slower and costlier.

**Q: What is GraphRAG and when is it useful?**
> Building a knowledge graph of entities and relationships from the documents and querying it. Useful for relationship questions or summaries of the whole corpus; expensive to build.

**Q: How do you pick which advanced technique to add?**
> From the failure shown by evals: missed exact terms → hybrid; right chunk ranked low → reranker; follow-ups fail → query rewriting; context-less chunks → contextual retrieval; multi-step questions → agentic RAG.

---

<a name="s9"></a>
## 9. Agents ⭐

**Q: What is an AI agent?**
> An LLM in a loop that reasons, calls tools, observes results and decides the next step until the goal is done. The model, not my code, decides the control flow.

**Q: Agent vs workflow?**
> A workflow has steps fixed in code; an agent picks its steps at runtime. Workflows are more predictable and cheaper, so I use an agent only when the steps can't be known in advance.

**Q: Explain ReAct.**
> The model alternates Thought, Action — a tool call — and Observation of the result, repeating until it can answer.

**Q: Plan-and-execute vs ReAct?**
> Plan-and-execute plans all steps first, then runs them — efficient but brittle. ReAct decides one step at a time — adaptive but can wander. Often combined with re-planning on failure.

**Q: How do you stop an agent from looping forever?**
> Max steps, token or cost budgets, timeouts, repeated-call detection, and a fallback answer or handoff to a human.

**Q: What is context management in agents?**
> Keeping the growing history of thoughts and tool results within limits — trimming big tool outputs, summarising old steps, keeping only what the next step needs.

**Q: What is reflection?**
> The model critiques and revises its own output. Improves quality at extra cost.

**Q: How do you make agents safe?**
> Least-privilege tools acting as the user, human approval for risky actions, validated tool inputs, step and cost limits, and full tracing.

**Q: Would you use LangChain/LangGraph?**
> For simple agents the SDK and a short loop are clearer. LangGraph is useful when I need persisted state, resumable long-running flows, human approval steps or built-in tracing.

---

<a name="s10"></a>
## 10. Tool calling & MCP

**Q: How does tool calling work?**
> You send tools with names, descriptions and JSON Schemas. The model returns a tool name and arguments; your code validates and runs it and sends the result back; the model continues.

**Q: Does the LLM execute the tool?**
> No, it only requests it. Execution, validation and permissions are all in your code.

**Q: What makes a good tool?**
> A clear name and a description of when to use it, narrow typed inputs, read-only by default, small outputs and helpful error messages.

**Q: What happens with too many tools?**
> Worse tool selection and more input tokens. Group, route to a subset, or merge into fewer clearer tools.

**Q: How do you handle tool errors?**
> Return them as tool results with a clear message so the model can retry or explain, and enforce timeouts and retry limits.

**Q: What is MCP?**
> The Model Context Protocol — an open standard for connecting AI apps to tools and data. Servers expose tools, resources and prompts; hosts connect through clients. Build once, use in any compatible app.

**Q: MCP vs tool calling?**
> Tool calling is how a model requests a function. MCP is a standard way to package, discover and share tools across apps; MCP tools still reach the model as tool calls.

**Q: MCP transports?**
> stdio for local servers and Streamable HTTP for remote ones, with OAuth for authorisation.

**Q: MCP security risks?**
> Untrusted servers, tool poisoning through descriptions, over-broad credentials, and combining servers that read untrusted content with ones that can send data out.

---

<a name="s11"></a>
## 11. Building it: Node & React ⭐

**Q: Why not call the LLM API from the browser?**
> The key would be exposed. The server holds the key and handles auth, rate limits, the system prompt, retrieval with tenant filters and logging.

**Q: How do you stream a response to React?**
> The server requests a streamed completion and writes each chunk to the HTTP response; the client reads `response.body` with a reader and appends to state. AbortController for Stop; the server aborts upstream when the connection closes. SSE format when I need structured events like sources.

**Q: Why use fetch instead of EventSource for chat streaming?**
> EventSource only supports GET, and chat needs a POST body. fetch with a stream reader works for POST.

**Q: How do you handle 429 rate-limit errors?**
> Exponential backoff with jitter (SDKs do it), timeouts, queues with limited concurrency for bulk work, per-user limits on my own endpoint, and a fallback model.

**Q: How do you protect a chat endpoint from abuse?**
> Authentication, per-user rate and token limits, capped input size, server-owned system prompt, max_tokens, and spend monitoring with alerts.

**Q: Where do you store conversation history?**
> In the database with role, content, tokens, model and prompt version. The server loads and trims it each turn.

**Q: Is rendering model Markdown safe?**
> Only with raw HTML disabled or sanitised output, and with care around auto-loading links and images — output is untrusted.

**Q: What does good AI UX include?**
> Streaming, a stop button, regenerate, sources, feedback buttons, clear errors, and confirmation before actions.

**Q: What does the Vercel AI SDK give you?**
> A single API across providers for streaming, structured output and tool calls, plus React hooks like useChat that handle streaming state. A convenience layer over the same concepts.

---

<a name="s12"></a>
## 12. Memory & multi-agent

**Q: How do you implement chat memory?**
> Store the conversation and resend a trimmed version — recent messages plus a summary of older ones. For long-term memory, extract facts per user, store them, and retrieve relevant ones into the prompt.

**Q: Short-term vs long-term memory?**
> Short-term is the current conversation in the context window. Long-term is stored outside — a DB or vector store — and retrieved in later sessions.

**Q: Privacy concerns with memory?**
> Users should see and delete it, sensitive data shouldn't be stored, it must be scoped per user, and it can be poisoned by injected content.

**Q: When use multiple agents?**
> When tasks need different tools or permissions, can run in parallel, or would flood a single context. Otherwise one agent is cheaper and easier to debug.

**Q: Orchestrator–worker pattern?**
> A lead agent splits the task, hands sub-tasks to worker agents and combines their results.

---

<a name="s13"></a>
## 13. Evaluation & observability ⭐

**Q: How do you evaluate an LLM feature?**
> An eval set of real examples with expected outcomes; graded by code checks where possible, an LLM judge for faithfulness and relevance, and humans to calibrate. Run on every change; compare quality, cost and latency.

**Q: What metrics for RAG?**
> Retrieval: recall@K, MRR, context precision. Generation: faithfulness, answer relevance, correctness, correct refusals.

**Q: What is LLM-as-judge, and its risks?**
> A model scores outputs against a rubric. Scales well, but has biases — length, its own style, position — so use simple criteria and check agreement with humans.

**Q: What is faithfulness?**
> Whether every claim in the answer is supported by the retrieved context — the hallucination metric for RAG.

**Q: How do you build an eval set without labelled data?**
> Take real questions from logs or support tickets, have experts write the expected key facts, include edge cases and unanswerable questions, and add every production failure.

**Q: What do you trace in production?**
> Each step per request — prompt version, model, inputs and outputs (redacted), tokens, cost, latency, retrieved chunks, tool calls, errors and user feedback.

**Q: Online vs offline evaluation?**
> Offline runs a fixed eval set before release. Online samples real traffic in production — judges, user feedback, A/B tests.

---

<a name="s14"></a>
## 14. Security ⭐

**Q: How do you defend against prompt injection?**
> You can't fully prevent it, so limit the damage: least-privilege tools acting as the user, human approval for risky actions, no secrets in prompts, access control in code, untrusted output handling, input and output checks, monitoring and red-teaming.

**Q: What is indirect prompt injection?**
> Malicious instructions hidden in content the model processes — documents, web pages, emails, tool results — rather than typed by the user.

**Q: What is the "lethal trifecta"?**
> Private data access, exposure to untrusted content, and a way to send data out. Together they allow data theft through injection; remove at least one.

**Q: What is excessive agency?**
> Giving an LLM more tools or permissions than it needs, so manipulation can cause real damage.

**Q: Can you enforce access rules via the system prompt?**
> No — prompts can leak or be overridden. Enforce in code: filter retrieval and check permissions inside tools.

**Q: Why is model output a security risk?**
> It can contain XSS, malicious links or injection payloads. Never execute it or render it raw; validate and sanitise like user input.

**Q: What is "denial of wallet"?**
> Abuse that runs up your LLM bill. Prevent with auth, per-user rate and token limits, max_tokens, agent step limits and budget alerts.

**Q: How do you handle PII?**
> Avoid sending it where possible, redact before logging, choose providers with suitable retention and training policies, and support deletion everywhere it's stored.

---

<a name="s15"></a>
## 15. Production: cost, latency, reliability

**Q: How do you reduce LLM cost?**
> Measure first; then prompt caching, trimming context, max_tokens, model routing, response caching, and batch APIs — verified by evals.

**Q: What is prompt caching?**
> The provider caches a repeated prompt prefix — system prompt, tools, documents — and charges less for it with lower latency. Static content first, dynamic last.

**Q: What is semantic caching, and its risk?**
> Reusing an answer for a similar question via embeddings. Risk: similar but different questions get wrong answers, and cross-user caching can leak data.

**Q: What is model routing?**
> Sending each request to the cheapest model that handles it well — simple ones to a small model, hard ones to a large or reasoning model.

**Q: How do you reduce latency?**
> Stream to cut perceived wait, reduce sequential calls, parallelise independent steps, use smaller models where possible, cache prompts, and move slow work to background jobs.

**Q: How do you handle provider outages?**
> Timeouts, retries, fallbacks to another model or provider, a degraded non-AI response, and a circuit breaker.

**Q: Why pin model versions?**
> Provider updates can change behaviour. Pinning keeps it stable; upgrades go through evals.

**Q: When use a batch API?**
> For non-urgent bulk work like nightly summaries — cheaper, results later.

---

<a name="s16"></a>
## 16. Fine-tuning & models

**Q: When should you fine-tune?**
> For consistent behaviour, format or style, or to make a small model good at a narrow task, when prompting and RAG aren't enough and you have good examples. Not for adding facts.

**Q: What is LoRA?**
> Training small adapter weights instead of the whole model — much cheaper, and adapters can be swapped. QLoRA does this on a quantised model to fit smaller GPUs.

**Q: Open-weight vs closed models?**
> Closed models via API usually lead in quality with no ops work. Open-weight models can be self-hosted for data control, customisation and high-volume cost, but need GPU infrastructure.

**Q: What is quantization?**
> Storing weights with fewer bits — 8 or 4 instead of 16 — to cut memory and speed up inference, with a small quality loss.

**Q: What is distillation?**
> Training a smaller model on a larger model's outputs to get similar quality on a task at lower cost.

---

<a name="s17"></a>
## 17. System design & AI at work

**Q: Design a document Q&A for a multi-tenant SaaS.**
> Async ingestion — storage, queue, workers parsing, chunking and embedding with tenant_id and doc_id. Query path — history, query rewrite, hybrid search filtered by session tenant, rerank, grounded prompt with citations, streamed answer. Postgres for app data, pgvector to start, tracing and per-tenant cost, evals in CI, no write tools, rate limits.

**Q: How do you decide if a feature needs an LLM?**
> If rules or a classic model do it reliably, use those. LLMs fit fuzzy language tasks where some errors can be tolerated and handled.

**Q: How would you design a support bot that can take actions?**
> RAG over help docs, read-only tools acting as the logged-in user, risky actions prepared by the bot but approved by a human or a rule, handoff to humans with a summary, and metrics like resolution rate and feedback.

**Q: How do you use AI tools in your work?**
> For boilerplate, tests, explaining unfamiliar code and larger refactors with agentic tools. I give clear context and small tasks, review the output like a PR, run tests, watch for made-up APIs and security issues, and don't share secrets or customer data with unapproved tools.

**Q: What are the risks of AI-generated code?**
> Subtle bugs, outdated patterns, security holes, hallucinated packages (a supply-chain risk), and code nobody on the team understands. Mitigate with review, tests and ownership.

---

<a name="s18"></a>
## 18. Your RAG project — deep-dive questions ⭐

> Interviewers will dig into the project on your résumé. Answer from what you actually built; see [rag-project-plan.md](rag-project-plan.md) and the [résumé deep-dive](../scenario-bank/16-resume-deep-dive/rag-platform.md).

**Q: Walk me through your RAG architecture.**
> Use the two paths: ingestion (upload → parse → clean → chunk → embed → upsert to Qdrant with text and metadata) and query (embed → search with filters → grounded prompt → LLM → cited answer). Name your actual choices and why.

**Q: Why that embedding model?**
> Trade-offs you weighed: quality on your documents, dimensions (speed and storage), running locally vs API cost, language support.

**Q: Why Qdrant (and not pgvector / Pinecone)?**
> Explain: hybrid search and filtering support, self-hosting, performance — and when you'd choose pgvector instead (already on Postgres, moderate scale).

**Q: What chunk size did you use and how did you pick it?**
> Give the number and the reasoning; ideally "I tested a few sizes against sample questions." If you didn't measure, say how you would.

**Q: How did you evaluate it?**
> Retrieval hit rate on test questions, faithfulness, manual review. If there were no formal evals, say what you'd add (a golden set + RAGAS in CI).

**Q: What was the hardest problem?**
> Pick a real one — PDF parsing, chunk boundaries, follow-up questions, latency — and explain the fix and the result.

**Q: How would you scale it to 100× documents and users?**
> Async ingestion with queues, a separate embedding service, Qdrant scaling (sharding, replicas, quantization), caching, rate limiting, per-tenant filters, and observability.

**Q: How does your self-hosted version compare to Amazon Bedrock?**
> Self-hosted: full control over models and pipeline, potentially cheaper at scale, but you run and scale it. Bedrock: managed models and knowledge bases, less ops, faster to integrate, less control.

**Q: What would you do differently now?**
> Add evals from day one, hybrid search and reranking, contextual chunk headers, tracing, and stricter security around ingested documents.

---

*Back to the [AI roadmap](00-ROADMAP.md).*
