# AI Engineering Notes — Part 02

## Prompt Engineering & Structured Output ⭐⭐⭐⭐⭐

**Topics:** the three roles · writing a good system prompt · zero/one/few-shot · chain of thought · prompt chaining · structured output (JSON mode vs strict schemas) · validating output with zod/pydantic · prompts as code.

---

## 1. The one rule

> **You can't retrain the model, so the prompt is your steering wheel.** Be specific, give context and examples, and ask for output your code can check.

> **Analogy 🧑‍💼 — briefing a smart new hire.** They're clever but know nothing about your company. A vague brief ("handle this") gets a vague result. A clear brief — the goal, the rules, an example of good work, the format you need — gets good work.

---

## 2. The three roles

- **System prompt** = the **job description and rules** ("You are a support assistant for Acme. Answer only from the provided documents. Be concise."). Applies to the whole conversation. **Highest-leverage text you write.**
- **User message** = the human's request.
- **Assistant message** = the model's previous replies, sent back so it "remembers" (the model is stateless — you resend everything every turn).
- Analogy: system = **employee handbook**, user = **customer request**, assistant = **what the employee already said**.

---

## 3. What makes a good prompt

| Do | Example |
|---|---|
| state the **task and audience** | "Summarise this ticket for an on-call engineer in 3 bullets." |
| give **context** the model can't know | product name, user's plan, today's date |
| set **rules and limits** | "If the answer isn't in the documents, say you don't know." |
| show the **format** | "Reply as JSON: `{ "category": ..., "urgency": ... }`" |
| give **examples** for tricky formats | 2–5 input → output pairs |
| separate **instructions from data** | wrap user/document text in tags: `<document>…</document>` |
| say what **to do**, not only what not to do | "Use plain English" beats "Don't be technical" |

**Separating data from instructions** matters for quality *and* security: it makes it clearer to the model which text is content, not commands — though it does **not** fully stop prompt injection ([Part 15](15-ai-security.md)).

---

## 4. Shot-based prompting

- **Zero-shot** — no examples, just ask. Fine for easy tasks.
- **One-shot** — one example, then the task. Locks the format.
- **Few-shot** — 3–5 examples; the model copies the pattern. The workhorse for consistent format and style.
- This is **in-context learning**: "learning" from examples **at inference time, no weights change** → a cheap alternative to fine-tuning.
- Pick **varied** examples — if all your examples are "positive", the model leans positive.

---

## 5. Chain of thought & prompt chaining

**Chain of thought (CoT)** — "think step by step before answering." The answer is then built on written reasoning, which helps multi-step problems. Reasoning models do this internally ([Part 01 §2](01-llm-fundamentals.md)) — with them, just state the problem clearly.

**Prompt chaining** — break a big task into a **pipeline of small prompts**, each feeding the next (extract facts → draft → check). More accurate and much easier to debug than one giant prompt. Analogy: **an assembly line**. It grows directly into agents ([Part 09](09-ai-agents.md)) — an agent is chaining where the model picks the next step.

> 🧠 **Remember:** **one prompt, one job.** If a prompt does five things, split it.

---

## 6. ⭐ Structured output — answers your code can use

Real software must *use* the answer: `{"sentiment":"positive","score":0.9}` is parseable; "fairly positive!" isn't.

Three levels of strictness (names vary by provider):

| Mode | Guarantees |
|---|---|
| **Ask in the prompt** ("reply as JSON") | nothing — usually works, sometimes adds text or breaks JSON |
| **JSON mode** | **valid JSON** — but not necessarily *your* fields |
| **Structured outputs / strict schema** (OpenAI `json_schema` with `strict: true`, Anthropic structured outputs, Gemini `responseSchema`) | output **matches your JSON Schema** |
| **Tool calling** | arguments shaped by the tool's schema ([Part 10](10-tool-calling.md)) |

⚠️ **Still validate.** A schema-valid answer can still be *wrong* (wrong category, made-up value), the model can refuse, or output can be cut off by `max_tokens`. Treat model output like user input:

```ts
import { z } from 'zod';

const Ticket = z.object({
  category: z.enum(['billing', 'bug', 'feature', 'other']),
  urgency: z.enum(['low', 'medium', 'high']),
  summary: z.string().max(200),
});

const parsed = Ticket.safeParse(JSON.parse(modelText));
if (!parsed.success) {
  // retry once with the error message, or fall back to 'other' / a human
}
```

(Python: the same with **pydantic** — `Ticket.model_validate_json(text)`. Many SDKs accept a zod/pydantic schema directly and do the conversion and parsing for you.)

> 🧠 **Remember:** **the schema shapes the output; validation protects your app.** Do both.

---

## 7. Prompts are code

- **Keep prompts in version control**, not pasted in a dashboard nobody reviews.
- **Change one thing at a time** and test it against saved examples (an *eval set* — [Part 14](14-evaluation-and-observability.md)). "It looked better on two tries" isn't a test.
- **Log the prompt version** with each response, so you can tell which prompt caused a bad answer.
- **Don't over-engineer:** start with a clear plain prompt; add examples, chaining or tricks only when a real failure needs them.

---

## Interview Q&A

**Q: What's the role of the system prompt?**
> It sets the model's job, rules, tone and output format for the whole conversation — the highest-leverage text in the app. It's where you put "answer only from the context" and "say you don't know" rules. It's not a security boundary, though: injected text can still override it.

**Q: Zero-shot vs few-shot?**
> Zero-shot just describes the task; few-shot adds a few input-output examples, and the model copies the pattern. Few-shot is the cheap way to get consistent format or style without fine-tuning — it's in-context learning, no weights change.

**Q: JSON mode vs structured outputs?**
> JSON mode guarantees syntactically valid JSON, not your fields. Structured outputs with a strict schema guarantee the output matches the schema. Either way I still validate with zod or pydantic, because a schema-valid answer can be wrong, refused or truncated.

**Q: Why split a task into a chain of prompts?**
> Each step is simpler, so it's more accurate; you can test and debug each step separately; and you can use a cheaper model for easy steps. One huge prompt fails in ways that are hard to trace.

**Q: How do you know a prompt change is an improvement?**
> Run both versions against a saved set of real examples with expected outcomes and compare scores — not by eyeballing a couple of outputs. And version prompts in git so you can roll back.

---

## Follow-ups (challenge questions)

- *Failure mode:* a classifier returns `{"category": "Billing"}` (capital B) 3% of the time and the switch statement drops those tickets. Where should this be caught, and how?
- *Design:* product wants the bot to "sound friendlier." How do you make the change without breaking accuracy, and how do you prove it?

---

## Cheat Sheet

```
roles: system (rules, highest leverage) · user · assistant (history you resend)
good prompt: task + audience · context · rules · format · examples · data in <tags> · say what TO do
zero / one / few-shot = in-context learning (no weights change) · varied examples
CoT = reason before answering (reasoning models do it inside) · CHAINING = assembly line, one prompt one job
STRUCTURED: prompt-only < JSON mode (valid JSON) < strict schema (your shape) · tool calling
  ALWAYS validate (zod / pydantic) → retry once or fall back
prompts = code: git, eval set, one change at a time, log prompt version · start simple
```

---

**Previous:** [Part 01 — LLM Fundamentals](01-llm-fundamentals.md) · **Next:** [Part 03 — Embeddings](03-embeddings.md)
