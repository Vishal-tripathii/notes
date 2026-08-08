# Resume Deep-Dive — Multi-Tenant Workforce Management SaaS — Scenario Bank

> Grounded in your Multi-Tenant Workforce Management SaaS project (Flutter Web · Express.js · MongoDB · Python · Google OR-Tools · Azure Blob Storage). As with the RAG platform file, these are frameworks for you to fill in with your actual decisions — not assertions about what you built.

---

### "Why Flutter Web for this product specifically?"

The reasoning framework, both directions: Flutter Web's real strength is **one codebase across web, and — if this product ever needed a native mobile app too — iOS/Android from the same code**, which matters a lot for a small team building a product likely to eventually need a tablet/mobile presence for on-site workforce management. The real, honest trade-off: Flutter Web has historically weaker **SEO** (it renders via canvas/DOM tricks that don't produce naturally crawlable semantic HTML the way React/Angular do) and can ship a **larger initial bundle/slower first paint** than a framework built HTML-first — both of which matter far less for an internal enterprise dashboard (not competing for search ranking, used by logged-in staff who load it once and stay) than they would for a public-facing marketing site.

**Fill in:** Was there an actual mobile/tablet version planned or shipped from the same Flutter codebase? Was SEO ever a real constraint for this product (probably not, since it's an internal workforce tool, not public-facing) — that's actually the honest reason the trade-off was acceptable here.

**Interview line (template):** *"[Your actual reason — likely: 'this is an internal, logged-in-only enterprise tool, so Flutter Web's SEO weakness didn't matter, and it let us share code with a mobile/tablet version for on-site use' — fill in whether a mobile version actually existed/was planned.]"*

**Tests:** framework selection trade-offs, honest technology justification

*Axis: normal · Source: challenge question*

---

### "Why a constraint solver (OR-Tools) instead of a simpler greedy allocation algorithm?"

The reasoning framework: a **greedy algorithm** (assign each worker to the first/best available slot, one at a time, in some order) is simple and fast but can produce a **globally suboptimal** result — an early greedy assignment can "use up" a slot that would have been the *only* valid option for a later, more constrained worker, forcing a worse outcome overall even though each individual decision looked locally reasonable at the time. A **constraint solver** (OR-Tools) considers the whole problem — all workers, all slots, all configured business rules — together, and can find an assignment that's actually optimal (or provably close to it) across the whole set, or correctly determine that no valid assignment exists at all given the current constraints, which a greedy approach can't reliably do.

**Fill in:** What specifically made greedy insufficient for your case — was it that business rules (compatibility, capacity, site-specific policies) interact in ways that make "locally good" choices produce bad global outcomes? Did you ever compare against a simpler approach and observe the difference?

**Interview line (template):** *"A greedy approach makes locally good decisions that can box out a later, more constrained worker from any valid slot at all — OR-Tools considers the whole problem together and finds a genuinely optimal (or feasibility-provable) assignment across every worker and every configured business rule at once, which greedy can't guarantee. [Your specifics on which constraints made this matter in practice.]"*

**Tests:** algorithm selection, constraint satisfaction reasoning

*Axis: normal · Source: challenge question*

---

### "What happens when configured business rules conflict and no valid allocation exists?"

The reasoning framework: a constraint solver, when given an infeasible problem (no assignment satisfies every hard constraint), doesn't just silently produce a wrong answer — it can report **infeasibility** explicitly. But that's only useful if the *application* surfaces it usefully — "no solution" alone doesn't tell an admin *which* rule or worker is the blocker, which matters a lot for someone trying to actually fix the situation (relax a rule, add capacity, manually override). Options: distinguish hard constraints (must never be violated — e.g. capacity) from soft constraints (preferences that can be relaxed under pressure, with a penalty, rather than blocking entirely), and/or report which specific constraint(s) are causing infeasibility rather than just "failed."

**Fill in:** Does your engine distinguish hard vs soft constraints? What does an admin actually see when an allocation can't be found — a generic failure, or something actionable?

**Interview line (template):** *"[Your actual behavior — e.g. 'the engine treats capacity as a hard constraint and preference-style rules as soft, so it degrades gracefully by relaxing soft constraints under pressure rather than failing outright' — or an honest description of what currently happens on infeasibility and what you'd improve.]"*

**Tests:** constraint solver failure modes, actionable error reporting

*Axis: failure · Source: challenge question*

---

### "At 200–1,000 workers per site, how long does an allocation run take — and what if it's too slow for the dashboard to feel real-time?"

The reasoning framework: constraint solving is computationally expensive and doesn't scale linearly — as the number of workers/constraints grows, solve time can grow much faster than the input size. If a full re-optimization is too slow to run synchronously inside a user-facing request, the same async-processing pattern from category 05/02 applies: kick off the optimization as a background job (`202 Accepted`), let the dashboard show "optimizing…" and poll or get pushed the result when it's ready, rather than blocking the UI. Another lever: **incremental re-optimization** — if only one worker's assignment changed, does the engine have to resolve the entire site from scratch, or can it reuse most of the previous solution and only re-solve the affected portion?

**Fill in:** What's the actual solve time at your real scale? Is optimization synchronous (blocking a request) or async (background job + polling/push)? Did you ever need incremental re-optimization, or is a full re-solve fast enough at your scale?

**Interview line (template):** *"[Your actual numbers and architecture — e.g. 'a full site re-optimization takes X seconds at Y workers, so it runs as a background job rather than blocking the request, and the dashboard polls/gets notified when it's done' — or if it's synchronous and fast enough, explain why that held at your actual scale.]"*

**Tests:** optimization performance at scale, async UX for slow operations

*Axis: performance · Source: challenge question*

---

### "Reallocating a worker — what if two admins reallocate the same worker or bed concurrently?"

This is the exact "100 concurrent requests, last seat" concurrency scenario (category 12), in your own domain: two admins, on two different sessions, both attempt to reallocate the same worker (or move different workers into the same now-available bed) at the same moment. A check-then-act reallocation (read current state, decide it's valid, write the new assignment) racing against another identical operation can result in double-booking the same bed, or one reallocation silently overwriting another admin's concurrent change.

**Fill in:** Does your reallocation write use an atomic conditional update (only succeeds if the bed/worker's state still matches what was read), or optimistic/pessimistic locking? Has this actually caused a real bug in production, or was it designed for from the start?

**Interview line (template):** *"[Your actual mechanism — e.g. 'reallocation is an atomic conditional update against the bed's current occupancy status, so a losing concurrent request gets a clear conflict instead of silently double-booking' — or, if this wasn't explicitly handled, an honest 'this is the same class of race condition as the seat-booking problem — I'd want to verify the actual write is atomic rather than check-then-act.']"*

**Tests:** the flagship concurrency pattern, applied to your own resume

*Axis: concurrency · Source: challenge question*

---

### "What happens to a worker's data when they're deboarded?"

The reasoning framework: "delete" is rarely actually correct for something with historical/reporting value — a deboarded worker's past allocation history, documents, and activity likely still need to exist for compliance, reporting, or re-onboarding later, even though they should no longer show up as an *active* occupant. This is the same soft-delete pattern as object versioning (category 13) — mark as inactive/deboarded rather than hard-deleting, retain the historical record, and make sure "active worker" queries correctly exclude deboarded ones (so a deboarded worker doesn't erroneously still count toward site occupancy).

**Fill in:** Is deboarding a soft delete (status flag) or does data actually get removed? What compliance/reporting requirements shaped that decision, if any?

**Interview line (template):** *"[Your actual behavior — e.g. 'deboarding is a status change, not a delete — historical allocation and document records are retained for reporting, but active-occupancy queries filter out deboarded workers so they don't count toward current capacity.']"*

**Tests:** soft delete, data retention design

*Axis: normal · Source: challenge question*

---

### "Bulk Excel import — row 3,742 of 5,000 has bad data. What happens?"

Same partial-failure/bulk-operation pattern as category 02's bulk API entry, applied to Excel specifically: Excel data is far messier than a structured API payload — inconsistent formatting, merged cells, wrong data types in a column, blank rows — so validation has to be genuinely robust, and the response needs to tell a **non-technical** user exactly what's wrong in a way they can act on (not a stack trace, not a generic "import failed") — ideally "row 3,742, column 'Start Date': expected a date, got text" rather than failing the entire import over one bad row.

**Fill in:** Does a bad row fail the whole import, or does the system import the 4,999 good rows and report the one bad one? How are Excel-specific issues (wrong date formats, merged cells) surfaced to the user?

**Interview line (template):** *"[Your actual behavior — e.g. 'the import validates every row first and reports all errors with row/column detail before committing anything, so the user can fix and re-upload' or 'valid rows import, invalid ones are reported individually, same per-item pattern as any bulk API.']"*

**Tests:** bulk import UX, non-technical error reporting

*Axis: failure · Source: challenge question*

---

### "Azure Blob Storage — how's this different from S3?"

The reasoning framework, for a clean comparison: Azure Blob Storage's direct equivalent of an S3 presigned URL is a **SAS (Shared Access Signature) token** — same underlying idea (a signed, time-boxed, scoped URL/token granting temporary access to a specific blob without sharing real credentials), different vendor-specific mechanism and terminology. Being able to name that parallel directly, rather than only knowing one cloud vendor's terms, is exactly what signals real understanding of the *pattern* (temporary scoped access via a signed URL) rather than memorized API calls for one specific vendor.

**Fill in:** Did you implement SAS-token-based direct-to-Azure uploads for the document verification workflow (mirroring the presigned-URL pattern from category 13), or did uploads route through your application server?

**Interview line (template):** *"Azure's equivalent of an S3 presigned URL is a SAS token — same pattern, temporary and scoped access without sharing real credentials, different vendor mechanism. [Your actual implementation — did document uploads go direct-to-Azure via SAS tokens, or through the app server?]"*

**Tests:** cross-cloud pattern recognition, presigned URL equivalents

*Axis: normal · Source: challenge question*

---
