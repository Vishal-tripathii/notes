# AI Engineering Notes — Part 01

## LLM Fundamentals ⭐⭐⭐⭐⭐

**Topics:** generative AI · what an LLM is · LLM vs traditional ML · transformers & attention · training vs inference · foundation models · reasoning models · tokens & tokenization · context window · input vs output tokens · pricing · model parameters (temperature, top-p, max tokens, stop, penalties) · LLM limitations.

---

## 1. The one rule

> **An LLM is a frozen next-word guesser.** You can't cheaply retrain it, so you **steer it with prompts** and **tune its picking with dials**. Because its knowledge is **frozen** and it **hallucinates**, you **feed it real, fresh info at inference time — that's RAG** — and you stay alert to **injection**, because it can't tell your instructions from the data.

That one paragraph is the whole track in miniature.

---

## 2. AI basics

### Generative AI = a maker, not a sorter
- **Old AI = a sorter.** Show it something, it puts a label on it ("spam," "cat"). It never makes anything.
- **Generative AI = a maker.** Creates new things that look like what it learned — sentences, images, code.
- How a text model makes things: **it guesses the next word, over and over.** "The sky is…" → "blue" → "and" → "clear." That loop is the whole engine.
- *Interview one-liner:* GenAI learns the pattern of the data well enough to **produce new examples** of it; for text that's **guessing the next token repeatedly** (*autoregressive next-token prediction*).

### What is an LLM?
- **LLM = a giant next-word-guessing machine.** It read a huge pile of text and got very good at: given some words, guess what comes next.
- Loop: (1) chop text into **tokens** → (2) make a **ranked list of likely next pieces** → (3) **pick one** → (4) append, repeat.
- It writes one token at a time. **This is why "explain your steps first" helps:** the reasoning is written *before* the answer, so the answer is built on it, not a blind guess.

### LLM vs traditional ML
- **Traditional ML = a single-purpose gadget** (a toaster only toasts). New job = build a new model.
- **LLM = one smart cook** who makes many dishes. Don't rebuild the cook — **give new instructions.**
- **Key idea: change the instructions, not the model.** That's why RAG and agents are possible.

| | Traditional ML | LLM |
|---|---|---|
| Task | one narrow job per model | one model, many jobs via instructions |
| Adapting | rebuild/retrain | change the prompt |
| Output | a number/label | free-form text |

### Transformer (the engine inside)
- One idea: **it reads all the words at once and works out which words matter to which** (*attention*).
- Before 2017, models read text **one word at a time** — slow, and they forgot the start by the end. The **Transformer** reads the whole text together and lets each word "pay attention" to the words that matter.
- *"The animal didn't cross the street because **it** was tired."* → attention links "it" to "animal."
- Reading everything at once → **trains fast on many GPUs** → models could get huge.
- *Interview trap:* "What made LLMs possible?" → **the Transformer / attention** (parallel training at scale), not "more data" alone.

### Training vs using (inference)
- **Training = going to school.** Very expensive, done once. At the end the "brain" (the weights) is **locked**.
- **Inference = doing the job after school.** Every question uses the locked brain; talking to it doesn't change it.
- Consequences: **knowledge cutoff** (knows nothing after training) and **no memory between calls** (stateless).
- → **Exactly why RAG exists:** you can't cheaply send it back to school, so **you hand it fresh notes inside the question.**

### Foundation models
- A big general model built as a **starting point** for many uses — like flour → bread, pasta, cake (GPT, Claude, Gemini, Llama).
- Two stages: **1) Pre-training** — reads mountains of text, learns to autocomplete (knowledgeable, but may just continue your sentence). **2) Post-training / alignment** — taught to follow instructions and behave (*SFT* = learn from good examples; *RLHF* and similar = learn from human or AI preference ratings).
- The assistant you chat with = raw autocomplete engine **+** "how to be helpful" training on top.

### 🆕 Reasoning models
- Newer models (OpenAI's o-series and GPT-5 "thinking", Claude with extended thinking, Gemini thinking models) **think before answering**: they generate a hidden or summarised chain of reasoning first, then the answer.
- Better at maths, code, multi-step planning. **Slower and more expensive** (thinking tokens are billed as output).
- Often you control a **reasoning effort / thinking budget** instead of temperature — some reasoning models ignore or reject `temperature`.
- Rule: **use a fast, cheap model for simple tasks (classify, extract, summarise); a reasoning model for hard ones.** That's *model routing* ([Part 16](16-production-ai.md)).

---

## 3. Tokens

### Tokenization
- The model reads **tokens** — chunks between a letter and a word. **LEGO bricks for language:** common words = 1 brick, rare or long words = several.
- `"cat"` → 1 token; `"unbelievable"` → ~3.
- **Rule of thumb (English): 1 token ≈ 4 characters ≈ ¾ word → 100 tokens ≈ 75 words.**
- Why chunks: keeps the vocabulary small and fixed, and can build **any** word (typos, brand names) from smaller bricks. Common algorithm: **BPE (Byte-Pair Encoding).**
- Gotcha: numbers, code, whitespace and **non-English text cost more tokens** than you'd expect.
- *One-liner:* "Sub-word chunks, ~4 chars each; the model reads and **bills in tokens, not words.**"

### Context window
- The model's **working memory** = max tokens per request, **input + output together**. A **fixed-size whiteboard**: instructions + history + documents + the answer all share it.
- Sizes today: ~128K to 1M+ tokens. (200K ≈ 150k words ≈ a 500-page book.)
- When a chat gets too long, apps **trim or summarise old messages** → that's why long chats "forget" the start.
- *Interview trap:* "bigger window = just paste everything" is **wrong** — more context = more cost, more latency **and** often worse accuracy (**"lost in the middle"**: facts buried in a huge context get missed). That's a big reason **RAG beats paste-everything**.

### Input vs output tokens
- **Input tokens** = everything you send: system prompt + history + question + retrieved docs. Charged **every call.**
- **Output tokens** = what the model generates (including thinking tokens for reasoning models).
- **(1) Output usually costs several times more per token than input** (often 4–5×). **(2) Input is the hidden cost bomb** — the model is **stateless**, so every turn you **re-send the whole conversation**; by message 20 you pay to re-read messages 1–19.
- *Interview gold:* "Why does a long chat get expensive?" → stateless model, full history re-sent every turn → total cost grows roughly with the **square** of the conversation length. Fixes: summarise, trim, **prompt caching**.

### Token limits
- Two different limits:
  - **Context window** — total whiteboard (input + output).
  - **Max output tokens** — a **separate, smaller** cap on one reply.
- `input + max_output ≤ context window`. Too-low `max_tokens` → answer **cut off mid-sentence** (the API tells you: `finish_reason: "length"` / `stop_reason: "max_tokens"`).

### Token pricing
- Pay **per token**, input and output priced separately, quoted **per 1M tokens**.
- Example (illustrative — always check live prices):
  ```
  input $3 / 1M,  output $15 / 1M
  turn: 2,000 input + 500 output
  input  = 2000/1e6 × $3  = $0.006
  output =  500/1e6 × $15 = $0.0075   ← 500 out cost MORE than 2000 in
  total ≈ $0.0135 / turn  → 100k turns/day ≈ $1,350/day
  ```
- Three levers: **prompt caching** (cache the big unchanging start of the prompt), **model routing** (easy → small model), **trim the input** (shorter history, fewer chunks). More in [Part 16](16-production-ai.md).

### Hands-on (Python)
```python
# pip install tiktoken
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")
tokens = enc.encode("Tokenization is unbelievable!")
print(len(tokens))
for t in tokens:
    print(t, "->", repr(enc.decode([t])))   # SEE the bricks; "unbelievable" splits
```
Try `"1234567"` and some Hindi or emoji text → watch the count jump. (Each provider has its own tokenizer; counts differ a little.)

---

## 4. Model parameters (the dials)

The model is fixed; these knobs change **how it picks the next token** from its ranked list. Set per API call.

- **Temperature** — randomness. **Low (0–0.3)** = picks the top choices, reliable → extraction, code, **RAG**. **High (0.8–1.2)** = picks lower-ranked words, creative but more mistakes → brainstorming. *Mechanism: low **sharpens** the probability distribution, high **flattens** it.* Even temperature 0 isn't perfectly deterministic in practice.
- **Top-P (nucleus)** — limits the **candidate pool**: top-p 0.9 = only consider the top tokens adding up to 90% probability. Temperature = *how boldly you pick*; top-p = *how big the menu is*. **Tune one, not both.** *Temperature **rescales**; top-p **truncates**.*
- **Max tokens** — hard cap on output length. A safety leash, not a target.
- **Stop sequences** — strings that end generation immediately.
- **Presence penalty** — "have you mentioned this at all?" → encourages **new topics**.
- **Frequency penalty** — "how many times have you said this?" → discourages **repetition**.
- **In practice:** temperature (low), max tokens, sometimes stop. With **reasoning models**, you set **reasoning effort** instead and sampling dials may be fixed.

---

## 5. LLM limitations (high interview value)

For each: **why** it happens and the **mitigation**.

| Limitation | Why | Mitigation |
|---|---|---|
| **Hallucination** | optimises for **plausible**, not true — no concept of truth | RAG grounding, citations, allow "I don't know", low temperature, evals. *"You mitigate, not eliminate."* |
| **Knowledge cutoff** | weights frozen at training | RAG / web-search tools |
| **Context limits** | finite window + "lost in the middle" | RAG (only relevant chunks), summarise/trim |
| **Statelessness** | each call is independent | resend history; memory systems ([Part 13](13-memory-and-multi-agent.md)) |
| **Non-determinism** | sampling | low temperature, structured output, validation, retries |
| **Prompt injection** | your instructions and the data are the same thing — text | least privilege, input/output checks, human approval ([Part 15](15-ai-security.md)) |
| **Jailbreaks** | users trick the model past its safety training | provider safety + your own output checks |

- **Hallucination + cutoff + context limits = the three legs RAG stands on.** "Why RAG?" → these three.
- *Injection vs jailbreak:* **jailbreak** = the **user** fights the model's safety rules; **injection** = **hidden text in the data** (a web page, a PDF, an email) hijacks your app's instructions.

---

## Interview Q&A

**Q: What is an LLM, in one sentence?**
> A transformer model trained on huge amounts of text to predict the next token; generating text is just repeating that prediction, one token at a time.

**Q: Why do LLMs hallucinate?**
> They're trained to produce plausible text, not true text — there's no internal fact check. A made-up citation can be as likely as a real one. You reduce it with grounding (RAG), citations, permission to say "I don't know," and evaluation; you can't remove it entirely.

**Q: Temperature vs top-p?**
> Temperature rescales the probabilities — low makes the top choice dominate, high flattens them. Top-p cuts the candidate list to the smallest set covering p of the probability. Tune one of them; for factual tasks keep temperature low.

**Q: Why does a long chat get expensive?**
> The model is stateless, so every turn re-sends the whole history as input tokens. Cost grows much faster than the number of messages. Fixes: trim or summarise history, prompt caching, and cheaper models for simple turns.

**Q: When would you use a reasoning model?**
> For multi-step problems — complex code, maths, planning, tricky analysis. For simple extraction, classification or chat, a fast non-reasoning model is cheaper and quicker. I'd route between them based on the task.

**Q: Is a bigger context window always better?**
> No. Cost and latency grow with input size, and accuracy can drop when the relevant fact is buried in the middle. Sending only the relevant pieces — RAG — is usually cheaper and more accurate.

---

## Follow-ups (challenge questions)

- *Cost:* your support bot averages 30 turns per conversation and the bill doubled last month. Without changing the model, name three changes and what each saves.
- *Failure mode:* the same prompt at temperature 0 gives slightly different answers on two runs, and a test that compares exact strings is flaky. Why, and how should the test change?

---

## Cheat Sheet

```
LLM = frozen next-token guesser (transformer + attention) · training = school (once) · inference = the job
knowledge cutoff + stateless → RAG + resend history
reasoning models: think first → better at hard tasks, slower/costlier · "reasoning effort" dial
TOKENS: ~4 chars / ¾ word · non-English, code, numbers cost more
context window = input + output · max_tokens = separate output cap · "lost in the middle"
cost: output pricier per token · history re-sent every turn · levers: caching, routing, trimming
DIALS: temperature (rescale) vs top-p (truncate) — tune one · max_tokens · stop · penalties
LIMITS: hallucination · cutoff · context · stateless · non-determinism · injection (data) vs jailbreak (user)
```

---

**Next:** [Part 02 — Prompt Engineering & Structured Output](02-prompt-engineering-and-structured-output.md)
