# AI Engineering Notes — Part 14

## Evaluation & Observability ⭐⭐⭐⭐⭐

**Topics:** why "it looked good" isn't testing · eval sets (golden datasets) · code checks vs LLM-as-judge vs humans · RAG metrics (retrieval + generation) · RAGAS · evals in CI · online evaluation & user feedback · tracing · what to log · cost & latency monitoring · tools.

---

## 1. The one rule

> **You can't improve what you don't measure.** LLM output is non-deterministic and "looks fine" on three tries. Keep a **set of real test questions with expected results**, run it on every change, and **trace** what happens in production.

> **Analogy 🧪 — unit tests for a fuzzy function.** You can't assert an exact string, but you can assert "mentions 14 days," "cites policy.pdf," "is valid JSON," "says I don't know when it should."

---

## 2. ⭐ The eval set (golden dataset)

- **50–200 real examples** to start: question (+ context) → what a good answer must contain, or the expected label.
- Take them from **real user questions** (logs, support tickets), not only ones you invent.
- Include the **hard cases**: questions with no answer in the docs, follow-ups, ambiguous ones, other languages, attempts at injection.
- **Every production bug becomes a new test case.**
- Keep it in git next to the prompts.

---

## 3. Three ways to grade

| Grader | How | Good for | Watch out |
|---|---|---|---|
| **Code checks** | exact match, regex, JSON schema valid, contains a citation, length | structured output, classification, format | can't judge meaning |
| **LLM-as-judge** | another model scores the answer against a rubric ("Is every claim supported by the context? yes/no + reason") | faithfulness, relevance, tone | judges have biases (prefer long answers, their own style); validate the judge against human labels; use clear yes/no rubrics |
| **Humans** | experts review samples | ground truth, nuanced domains | slow, expensive — use to calibrate the others |

Start with code checks wherever possible — they're cheap, fast and deterministic.

---

## 4. RAG metrics — measure the two halves separately

**Retrieval** (did we fetch the right chunks?)
- **Recall@K / hit rate** — is the correct chunk in the top K?
- **MRR / ranking** — how high was it?
- **Context precision** — how much of what we fetched was relevant?

**Generation** (did we use them well?)
- ⭐ **Faithfulness / groundedness** — is every claim supported by the retrieved context? (hallucination check)
- **Answer relevance** — does it actually answer the question?
- **Correctness** — matches the expected answer?
- **Refusal accuracy** — says "I don't know" when the answer isn't in the docs.

**RAGAS** (and similar tools like DeepEval, promptfoo, TruLens) compute these, mostly using LLM-as-judge.

> 🧠 **Remember:** **low faithfulness → generation problem; low recall → retrieval problem.** The metrics tell you where to look ([Part 06 §7](06-rag-fundamentals.md)).

---

## 5. Evals in the workflow

```
change a prompt / model / chunk size
   → run the eval set (CI job or script)
   → compare scores with the last version   (+ cost and latency!)
   → ship only if it's better or equal
```

- Run on **every prompt or model change**, like tests. Model upgrades from the provider also need a run.
- Track **cost and latency** alongside quality — a 2% gain for 3× cost may not be worth it.
- **Online evaluation:** in production, sample live traffic and run judges on it; collect **thumbs up/down** and "user rephrased the question" signals; A/B test prompt versions.

---

## 6. Observability — tracing

A single answer may involve: rewrite query → embed → search → rerank → LLM → tool call → LLM. When it's wrong, you need to see every step.

**A trace** = the tree of steps for one request, each with inputs, outputs, timing, tokens and cost.

**Log per LLM call:**
- prompt version, model, parameters
- input/output (or a redacted version — **PII!**)
- tokens in/out, cost, latency, time to first token
- retrieved chunk ids + scores
- tool calls + results + errors
- user id / conversation id, user feedback

**Dashboards & alerts:** cost per day / per user / per feature, p95 latency, error and 429 rates, refusal rate, thumbs-down rate.

**Tools:** Langfuse (open source), LangSmith, Arize Phoenix, Helicone, Braintrust; **OpenTelemetry** has GenAI conventions so traces can go into your existing tools (Datadog, Grafana). See also [nodejs Part 10.5](../nodejs/10.5-logging-and-observability.md).

⚠️ Logs contain user data — redact PII, restrict access, set retention.

---

## Interview Q&A

**Q: How do you test an LLM feature?**
> With an eval set of real examples and expected outcomes, graded by code checks where possible — schema, labels, required facts — and an LLM judge with a clear rubric for things like faithfulness, calibrated against some human labels. I run it on every prompt or model change and compare quality, cost and latency before shipping.

**Q: What metrics do you use for RAG?**
> For retrieval: recall@K and ranking — did the right chunk come back and how high. For generation: faithfulness — is every claim supported by the context — plus answer relevance, correctness, and whether it correctly says "I don't know." Separating them tells me whether to fix retrieval or the prompt.

**Q: What is LLM-as-judge, and what are its problems?**
> Using a model to score outputs against a rubric. It scales well but has biases — favouring longer answers, its own style, or the first option — so you use simple yes/no criteria, give it the context, and check its agreement with human labels.

**Q: What do you log for an LLM app in production?**
> A trace per request: each step's inputs and outputs, prompt version, model, tokens, cost, latency, retrieved chunks, tool calls, errors and user feedback — with PII redacted. Then dashboards and alerts for cost, latency, errors and negative feedback.

**Q: How do you know a model upgrade is safe?**
> Run the eval set on the new model and compare against the current one on quality, cost and latency, look at the failures, then roll out gradually while watching production metrics.

---

## Follow-ups (challenge questions)

- *Failure mode:* users complain answers got worse last week, but nobody changed the code. What do you check, and what would have caught it earlier?
- *Design:* you have zero labelled data on day one. How do you build your first eval set in a week?

---

## Cheat Sheet

```
"looked good on 3 tries" ≠ tested · eval set = 50–200 REAL examples + hard cases · every bug → new case · in git
graders: CODE checks (first) · LLM-as-judge (rubric, yes/no, calibrate) · humans (ground truth)
RAG: retrieval = recall@K, MRR, context precision · generation = FAITHFULNESS, relevance, correctness, refusal
  low recall → retrieval fix · low faithfulness → prompt/model fix · RAGAS / DeepEval / promptfoo
workflow: change → run evals → compare quality + COST + LATENCY → ship · online: sample + judge + thumbs
TRACE per request: steps, prompt version, model, tokens, cost, latency, chunks, tools, errors, feedback
tools: Langfuse · LangSmith · Phoenix · Helicone · OpenTelemetry GenAI · redact PII
```

---

**Previous:** [Part 13 — Memory & Multi-Agent Systems](13-memory-and-multi-agent.md) · **Next:** [Part 15 — AI Security](15-ai-security.md)
