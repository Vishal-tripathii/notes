# Scenario Bank

> A working bank of **production-style interview scenarios**: situations where a known technology, component, or system behaves unexpectedly, fails, races, scales poorly, or becomes inconsistent.
>
> This is **not a topic bank**. Topic banks answer *"What is X?"*. This bank answers *"You have X. Something happens. What do you do?"*

---

## Purpose

Real technical interviews often test engineering judgment rather than API recall.

Examples:

* Redis contains stale data after a MongoDB update.
* An Angular list is expensive to rerender after filtering.
* A Node.js API becomes slow under CPU-heavy work.
* Two requests update the same resource concurrently.
* MongoDB queries become slow as the collection grows.
* 1,000 requests miss the same cache key simultaneously.
* A dependency fails after the database operation succeeds.

The Scenario Bank captures these situations so they can be practiced as **reasoning problems**, not memorized as definitions.

---

## Core Principle

For any technology or concept we learn, consider whether there is a meaningful scenario around:

| Axis          | Question                                              |
| ------------- | ----------------------------------------------------- |
| Normal        | How does this work end to end?                        |
| Failure       | What happens if a dependency or operation fails?      |
| Concurrency   | What happens if multiple requests act simultaneously? |
| Scale         | What changes at 10× or 100× the load?                 |
| Consistency   | Can different parts of the system disagree?           |
| Performance   | Where is the bottleneck?                              |
| Recovery      | How does the system recover?                          |
| Observability | How would we know this failed in production?          |

These are **lenses**, not mandatory questions. Use only the axes that naturally apply.

---

# Agent Workflow

When discussing a technical topic:

### 1. Teach first

Explain the requested concept normally.

Do not interrupt basic learning with unnecessary interview scenarios.

### 2. Identify natural scenarios

Once the concept is understood, determine whether there is a meaningful production/interview scenario.

Prefer scenarios that require reasoning beyond remembering syntax or definitions.

### 3. Challenge the user

Ask a small number of high-value follow-up questions when appropriate.

The number should depend on the topic:

* Simple concept → possibly no scenario.
* Moderate concept → 1–2 scenarios.
* Production-sensitive concept → several connected follow-ups.

Do **not** force a fixed number of questions.

### 4. Prefer progressive drilling

When a scenario is valuable, progressively increase its difficulty.

Example:

```text
Redis cache
    ↓
Cache becomes stale
    ↓
What if invalidation fails?
    ↓
What if two updates happen concurrently?
    ↓
What if Redis goes down?
    ↓
What if 1,000 requests miss simultaneously?
```

The goal is to simulate how a real interviewer follows an answer.

### 5. Identify valuable scenarios

If a scenario is particularly useful, explicitly tell the user:

> **This is worth adding to the Scenario Bank.**

Do not write it automatically.

### 6. Get agreement

Only add the scenario after the user agrees.

**Nothing is written to this bank silently.**

---

# Quality Gate

A scenario should be added only if at least one of these is true:

* It came from a real interview.
* It exposed a misconception or knowledge gap.
* It requires meaningful engineering reasoning.
* It involves a realistic production failure or trade-off.
* It tests concurrency, consistency, scalability, performance, or recovery.
* It has useful interviewer follow-ups.
* It is likely to generalize to other systems.

Do **not** add scenarios merely to:

* fill empty files
* achieve topic coverage
* increase the number of questions
* restate definitions
* test trivial API syntax

### Good

> MongoDB update succeeds but Redis invalidation fails. What happens and how would you handle it?

### Bad

> What is Redis TTL?

The first belongs here.

The second belongs in the Redis topic Q&A bank.

---

# Entry Format

Each scenario should be explained so **anyone can understand the underlying concept first**, then closed with how you'd actually say it in an interview.

```md
### "<scenario phrased the way an interviewer would ask it>"

<Plain-language explanation. Explain the underlying idea like you're teaching it from scratch — what problem it solves, why it works the way it does — not just the keyword. Include a code snippet where one makes the mechanism concrete, not decorative.>

**Interview line:** *<the short, spoken version you'd actually say out loud in an interview — the compressed soundbite version of the explanation above>*

**Tests:** <concepts/reasoning being evaluated>

*Axis: <failure | concurrency | scale | consistency | performance | recovery | observability | normal> · Source: <real interview | challenge question>*
```

**Answer depth:** explain the concept in simple, plain language first — assume the reader is smart but new to this specific idea, so build it up (what breaks without it → what this does about it → how it works), rather than assuming the jargon is already understood. For a concept-heavy design scenario (e.g. an idempotency-key pattern, a caching strategy), keep the full teaching breakdown — tables, numbered steps, code snippets, bulleted use-cases/mistakes sections. Then close with a short **Interview line** — the compressed, spoken-out-loud version, for quick drilling once the concept is already understood. Don't skip straight to the interview line; the plain-language explanation is what makes the interview line actually stick instead of being memorized.

This is a **working interview bank**, not a textbook — but "not a textbook" means no padding or restating the obvious, not "always short."

---

# Follow-Up Chains

When a scenario naturally produces interviewer follow-ups, keep them together.

Example:

```md
### "MongoDB update succeeds but Redis invalidation fails. What happens?"

The database is the source of truth, but Redis can now contain stale data.
I'd invalidate the cache after the database update and treat invalidation as
a failure-prone operation. Retries and TTL provide recovery/safety; stronger
guarantees may require event-based invalidation or an outbox pattern.

**Tests:** cache invalidation, consistency, failure handling

*Axis: failure · Source: real interview*

#### Follow-ups

- What if Redis is completely unavailable?
- What if two updates happen concurrently?
- What if the process crashes after the DB update but before cache invalidation?
- What if 1,000 requests miss the same key simultaneously?
- How would you detect stale-cache problems in production?
```

Follow-ups should be included only when they meaningfully deepen the scenario.

---

# File Organization

The bank is organized as **numbered topic subfolders**, one per major interview category (Distributed Systems & Reliability, API Design, Databases, Caching, Messaging, Frontend Architecture, Node.js Runtime, Security, Docker/Infra, System Design, Observability, Concurrency, File/Storage Systems, Multi-Tenancy, Offline-First). The category list and numbering live in [`00-BACKLOG.md`](00-BACKLOG.md) — that file is the source of truth for which folders exist and what's left in each.

```text
scenario-bank/
├── 00-README.md
├── 00-BACKLOG.md
├── 01-distributed-systems-reliability/
│   └── resilience-patterns.md
├── 02-api-design/
│   └── api-design.md
├── 03-databases/
├── 04-caching/
├── 05-messaging-event-driven/
├── 06-frontend-architecture/
│   └── frontend-rendering.md
├── 07-nodejs-runtime/
├── 08-security/
├── 09-docker-infrastructure/
├── 10-system-design/
├── 11-observability/
├── 12-concurrency/
├── 13-file-storage-systems/
├── 14-multi-tenancy/
├── 15-offline-first/
└── 16-resume-deep-dive/    ← Vishal's own resume/projects, not the generic list
```

`16-resume-deep-dive/` is a different flavor of entry — questions grounded in Vishal's own project decisions ("why did you choose X") rather than generic best-practice scenarios. Since only Vishal knows his actual implementation choices, these entries are frameworks-with-fill-in-prompts rather than asserted answers — see that folder's own note for the format.

Within a folder, create files **on demand** — do not pre-populate every folder with placeholder files. A file is created only when its first worthwhile scenario is added, same as before; the only change is that it now lives inside its category folder instead of flat at the root.

Definition-style questions (e.g. "What are ACID properties?") still need to be **scenario-ified** before they're saved — see Quality Gate. Turn "what is X" into "you have X, something happens" before it earns an entry; don't save it as a bare definition just because it's now filed under a topic folder.

### Naming

Files inside a folder:

```text
<topic-slug>.md
```

Examples:

```text
03-databases/indexing.md
03-databases/transactions-and-locking.md
08-security/jwt-and-tokens.md
```

Use lowercase kebab-case. A folder can hold multiple files once one file gets unwieldy (e.g. `03-databases/` splitting into `indexing.md`, `transactions.md`, `sharding.md` as each grows) — same "create on demand, split when it earns it" principle as the old flat structure.

---

# Cross-Cutting Scenarios

Use `cross-cutting.md` when a scenario spans multiple technologies or the complete request path.

Examples:

```text
Node.js + MongoDB + Redis
Node.js + Socket.IO + Redis
React + Node.js + API
Angular + Node.js + WebSocket
AWS + Node.js + MongoDB
```

Do not duplicate the same scenario into multiple technology files merely because multiple technologies are involved.

Place it in `cross-cutting.md` when the interaction between systems is the important part.

---

# Relationship With Other Interview Notes

The Scenario Bank does **not** replace existing topic Q&A or curated interview sections.

Use the following distinction:

```text
Topic Q&A
    ↓
"What is X?"
"What does X do?"
"How do I use X?"

Scenario Bank
    ↓
"You have X. Something goes wrong. What happens?"
"What if two requests race?"
"What if traffic increases?"
"What if this dependency fails?"

System Design
    ↓
"Design this complete system at scale."
"What architecture would you choose?"
"What are the trade-offs?"
```

Existing curated sections such as:

```text
nodejs §28 — Scenario & Debugging
Angular §22 — Scenario & Debugging
```

remain the polished/reference material.

The Scenario Bank is the **raw, fast-growing working set**.

A scenario can later graduate into a curated section if it proves repeatedly valuable.

Do not maintain both versions in lockstep.

---

# Source Integrity

Every entry must identify where it came from:

```text
Source: real interview
```

or:

```text
Source: challenge question
```

Never represent an agent-generated scenario as a real interview question.

If the user reports:

> "The interviewer asked me this."

Treat it as a **real interview** source.

If the scenario was generated during learning or by the agent, mark it as:

```text
Source: challenge question
```

---

# Scenario Selection Priorities

When deciding whether to challenge the user, prefer:

1. Real interview questions already encountered.
2. Scenarios exposing a demonstrated knowledge gap.
3. Failure and consistency scenarios.
4. Concurrency/race-condition scenarios.
5. Performance and scalability scenarios.
6. Observability and recovery scenarios.
7. Architecture trade-offs.
8. Generic hypothetical scenarios.

The user's demonstrated weaknesses and actual interview experience should influence which scenarios are prioritized.

---

# Anti-Patterns

The agent must avoid:

### Scenario dumping

Do not generate 20 scenarios after teaching one concept.

### Forced coverage

Do not create scenarios simply because a technology file has few entries.

### Definition disguised as scenario

Avoid:

> "What is Redis?"

Prefer:

> "Your Redis cache is returning stale user data after an update. What could cause this?"

### Overly long answers

Avoid padding, restating the obvious, or narrating things a candidate wouldn't actually say out loud. This is about padding, not depth — a multi-step design pattern (e.g. idempotency keys, cache invalidation) can and should keep its full reasoning (tables, steps, code, use-cases) rather than being compressed into a single paragraph. See **Answer depth** under Entry Format.

### Premature system design

Do not turn every small concept into a distributed-systems discussion.

### Silent writes

Never modify this bank without explicit agreement from the user.

### Duplicate maintenance

Do not copy every scenario into multiple topic banks.

---

# Objective

The Scenario Bank should train the ability to move from:

```text
"I know this technology."
```

to:

```text
"I understand what happens when this technology
is used in a real system."
```

The desired outcome is **fast, structured engineering reasoning under interview pressure** — not memorization of a larger question list.
