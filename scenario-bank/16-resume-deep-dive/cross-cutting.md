# Resume Deep-Dive — Cross-Cutting Questions — Scenario Bank

> These span multiple projects on your resume rather than belonging to one — the kind of question an interviewer asks after reading the whole resume, not just one bullet.

---

### "You've built multi-tenant AND offline-first systems — what actually changes when a system needs both at once?"

The reasoning framework: each is hard alone; together, they compound in a specific way. Multi-tenancy demands that data never crosses a tenant boundary. Offline-first demands that a local copy of data exists on the device and reconciles with the server later, including handling conflicts. Combined: **conflict resolution now has to happen within tenant boundaries too** — merging two offline edits to the same record has to first confirm both edits actually belong to the same tenant's data (not usually a real risk on the server, since the server enforces tenant scoping directly, but a genuine design question for the *local* store if a shared device could ever hold more than one tenant's data, as in the AMDHA healthcare scenario). And the sync engine's queue/retry/idempotency logic now needs tenant context attached to every queued mutation, not just record IDs — a generic sync engine built without tenancy in mind would need real rework to add it after the fact, not just a filter bolted on top.

**Fill in:** Concretely, in AMDHA (which is both multi-tenant and offline-first) — did the local sync queue carry explicit tenant context on every queued mutation? Was there ever a scenario where a shared device held more than one tenant's local data, and how was that scoped?

**Interview line (template):** *"[Your actual answer, grounded in AMDHA specifically] — the two problems compound because [your reasoning], and I handled it by [your actual mechanism, e.g. per-tenant local Realm files, or tenant-scoped queue entries]."*

**Tests:** combining two hard problems, honest architectural synthesis

*Axis: consistency · Source: challenge question*

---

### "MongoDB (workforce SaaS, healthcare) vs PostgreSQL+Qdrant (RAG) — how did you actually decide, per product?"

The reasoning framework: this is a genuine "why this database" comparison you can answer with three real, different decisions rather than textbook SQL-vs-NoSQL trivia. MongoDB likely fit the workforce/healthcare platforms because the data (worker records, resident lifecycle events, patient records with varying structure across facilities/tenants) is naturally more document-shaped and schema-flexible — different tenants or facility types might need different fields without a rigid shared schema, and offline-first mobile sync (RealmDB, which is itself document-oriented, mirroring MongoDB's model) pairs naturally with a document database on the server side too. PostgreSQL fit the RAG platform because document/user/ingestion metadata is genuinely relational (documents belong to users, chunks belong to documents, clear structured relationships) and benefits from real transactional guarantees — paired with Qdrant specifically because neither MongoDB nor PostgreSQL alone does vector similarity search well.

**Fill in:** Is this reasoning actually right for your real decisions, or was it more pragmatic (team familiarity, existing infrastructure, client/project constraints)? Being honest about "it was partly what the team already knew" is a legitimate and often more credible answer than an idealized textbook justification.

**Interview line (template):** *"[Your actual reasoning per product] — MongoDB fit the workforce and healthcare platforms because [your reasoning, e.g. schema flexibility across tenants/facilities, natural pairing with RealmDB's document model for offline sync]. Postgres fit the RAG platform because the metadata is genuinely relational, paired with Qdrant specifically for vector search that neither general-purpose database does natively."*

**Tests:** cross-project database selection reasoning, honesty about pragmatic constraints

*Axis: normal · Source: challenge question*

---

### "How do you actually use AI coding tools (Claude Code, Cursor) day to day — and where do you not trust them?"

An increasingly common real interview question, and it's literally on your resume as a listed tool, so it's a near-guaranteed follow-up. The honest, credible answer isn't "it writes all my code" or "I don't really use it" — it's specific: what kind of tasks you actually delegate (boilerplate, test scaffolding, exploring an unfamiliar part of a codebase, generating a first draft you then review) versus what you deliberately keep tight control over (business logic with real correctness/compliance stakes — like anything in the healthcare platform — security-sensitive code, architecture decisions). Being able to describe a specific instance where an AI tool's suggestion was *wrong* and you caught it is far more convincing than a generic endorsement.

**Fill in:** A real, specific example: a task you comfortably delegate, and a task/domain (probably something in the healthcare or multi-tenant isolation code, given the stakes) where you review AI-suggested code especially carefully or don't use it for the first draft at all. Any actual instance of catching a wrong AI suggestion.

**Interview line (template):** *"[Your actual workflow] — I use it for [specific delegated tasks], but for [specific higher-stakes category, e.g. tenant-isolation logic or clinical data handling] I write that myself or review AI suggestions much more carefully, because [your reasoning]. [A specific instance where you caught something wrong, if you have one.]"*

**Tests:** honest, specific AI-tool usage — not a generic answer

*Axis: normal · Source: challenge question*

---

### "Walk me through a production issue you diagnosed and fixed."

Your own resume bullet says "systematic debugging to diagnose and resolve production issues" — this is a near-guaranteed follow-up with no prepared answer currently written down anywhere. Unlike the other entries in this file, there's no generic framework to fill in here — this needs an actual, specific incident from one of your four products, told with enough concrete detail to be credible (what the symptom was, how you actually narrowed it down — not "I checked the logs and found it," but the actual reasoning steps, what red herrings you ruled out, what the root cause turned out to be, and what you changed to prevent recurrence).

A useful structure to prepare it in (not to recite mechanically, just to make sure the substance is there): **Symptom** (what was actually observed — an error rate, a slow endpoint, a data inconsistency reported by a user) → **Investigation** (the actual steps — which logs, which metric, what hypothesis you tested and ruled out first) → **Root cause** (the specific bug/misconfiguration/race condition) → **Fix** → **Prevention** (a test added, a monitor/alert added, a pattern fixed elsewhere too if it could recur).

**Fill in:** Pick one real incident — the multi-tenant, offline-first, and RAG-ingestion-pipeline projects are all rich ground for a genuinely interesting one (a sync conflict that caused wrong data, a tenant-isolation near-miss, a slow allocation-engine run, an ingestion pipeline silently failing). Write the actual story down once, in the Symptom → Investigation → Root cause → Fix → Prevention shape, so it's ready rather than being reconstructed live in the interview.

**Tests:** real incident storytelling, structured debugging narrative

*Axis: recovery · Source: challenge question*

---
