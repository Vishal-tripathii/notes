# Database Study Notes — Part 18

## Production Scenario Practice

> **Format:** the "what happens when..." rehearsal set — this is the practice log, not the permanent record. Anything that comes up in a real interview belongs in [scenario-bank/03-databases](../scenario-bank/03-databases/) or [scenario-bank/cross-cutting.md](../scenario-bank/) per that folder's workflow (teach → challenge → explicit agreement → write) — this file is where you rehearse the answer first.

---

### "Why did your API become slow, and how do you diagnose it?"

Walk the full chain, in order, rather than guessing at one cause: is it the query itself (run `EXPLAIN`/`.explain()` — Part 03), a missing index (Part 02/06), an N+1 pattern hidden in a loop (Part 07), no caching on a hot read path (Part 11), or connection pool exhaustion under load (Part 12)? The process matters more than any single answer — naming the diagnostic order is what shows real debugging judgment, not jumping straight to "probably needs an index."

### "How would you prevent duplicate orders from a double-submitted request?"

An **idempotency key**: the client generates a unique key per logical submission attempt (not per HTTP retry — the same key on a network-retried request), sends it with the request, and the server enforces a **unique index** on that key. The first request with a given key processes normally; any retry with the same key either returns the original result or is rejected as a duplicate at the database level — the uniqueness constraint is the actual enforcement mechanism, not just an application-level check (which would itself be racy under concurrent retries).

### "How would you handle concurrent inventory updates safely?"

Covered in depth in Part 15 §4 — push the check into the same atomic operation as the write (`updateOne({stock: {$gt: 0}}, {$inc: {stock: -1}})`), never check-then-write as two separate steps. Optimistic locking with a version field is the alternative when the update logic is too complex for a single atomic operator expression.

### "How would you design a multi-tenant database?"

Three real options, each with a genuine trade-off:
- **Shared collection + tenant ID field** — simplest operationally (one schema, one set of indexes to maintain), but every single query must be scoped by `tenantId` and a missing filter is a real cross-tenant data leak risk.
- **Collection-per-tenant** — stronger isolation at the query level (a bug can't leak across collections as easily), but doesn't scale to a large number of tenants (metadata overhead, harder cross-tenant admin queries).
- **Database-per-tenant** — strongest isolation, but the most operationally expensive (connection management, migrations, backups all multiply per tenant) — really only justified for a small number of high-value/high-compliance tenants.

Most SaaS platforms default to shared-collection-plus-tenant-ID for the common case, escalating to more isolation only for tenants with specific compliance/scale requirements.

### "Why use a transaction here, specifically — what breaks without one?"

Answer this concretely per scenario, not generically — name the specific multi-write operation and the exact bad state possible without atomicity (see Part 04 §5's money-transfer example as the template: two writes that must both land or neither should, with a real in-between failure state to point to).

### "Why use Redis here, specifically — what's actually slow without it?"

Same rule — name the specific read path and the specific cost being avoided (a slow aggregate query recomputed on every request, an expensive external API call, a hot key read by a disproportionate share of traffic) rather than "caching is generally good." Being able to say *what specifically* would be slow without it is what separates a real answer from a buzzword.

### "How would you scale this database as traffic grows 10x? 100x?"

A staged answer, not one fix: at 10x, start with read replicas (Part 13) and caching (Part 11) for read-heavy load, and check whether existing indexes still fit the query patterns at the new data volume. At 100x, that's likely no longer enough — sharding (Part 14) becomes a real conversation, alongside reconsidering the shard key, connection pool sizing (Part 12) across a much larger fleet of app instances, and whether the schema's embed/reference decisions (Part 09) still hold at the new document sizes. The credible answer shows the *staging* — what breaks first, what you'd reach for first — not a single silver-bullet fix for both scales at once.

---

*Anything above (or discovered while drilling these) that came from a real interview, or exposed a genuine gap, is a candidate for [scenario-bank](../scenario-bank/00-README.md) — but only gets written there after explicit agreement, per that folder's workflow.*
