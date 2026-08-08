# Multi-Tenancy — Scenario Bank

---

### "Your API accidentally returned another tenant's data. How would you investigate and prevent it from happening again?"

This is the flagship scenario for the category — the concrete failure that everything else here exists to prevent, so it's worth reasoning through end-to-end rather than just defining multi-tenancy in the abstract.

**Investigating:** trace the exact request — which endpoint, which query, which tenant made the request, and whose data came back. The near-universal root cause is a query that filtered by resource ID but **forgot to also filter by tenant** — `SELECT * FROM orders WHERE id = ?` instead of `WHERE id = ? AND tenant_id = ?` — so a valid, well-formed request for "order 456" returns order 456 regardless of which tenant it actually belongs to, as long as the requester can produce *any* valid ID (which might be guessable, sequential, or just leaked from another part of the same app). Check: does this specific query/handler include the tenant filter? Was the tenant ID derived from the authenticated token, or could it have been taken from a client-supplied parameter that was wrong or missing?

**Preventing recurrence** — the fix has to be structural, not "remember to add the filter everywhere," because "remember to do it every time in every handler" is exactly the discipline that already failed once:
- **Enforce tenant scoping at the data-access layer**, not in individual route handlers — a query-building wrapper/base repository that **automatically** injects the tenant filter on every query against tenant-scoped tables, so it's not possible to write a query that skips it, rather than trusting every future developer to remember.
- **Derive the tenant from the authenticated session/token**, never from a client-supplied field — a client-supplied `tenantId` in a request body/query param can simply be edited to someone else's.
- **Add a regression test specifically for cross-tenant access** — a test that logs in as Tenant A and asserts every relevant endpoint returns 404 (not the data, not even a 403) when requesting Tenant B's resource IDs; run this as a standard part of the test suite, not a one-off manual check.
- **Audit every other tenant-scoped query in the codebase** for the same missing-filter pattern once one instance is found — if it happened once from copy-pasted or hand-written query code, it's likely present in more than one place.

**Interview line:** *"I'd trace the exact query behind that response — the near-universal cause is a query that filtered by resource ID but forgot to also filter by tenant, so any valid ID returns data regardless of who it actually belongs to. The fix has to be structural: enforce the tenant filter at the data-access layer so it's automatically applied to every query rather than trusting every handler to remember it, derive the tenant from the authenticated token rather than a client-supplied field, and add a standing regression test that specifically asserts cross-tenant access returns 404 — because if the bug happened once from a hand-written query, it's worth auditing for the same pattern elsewhere in the codebase too."*

**Tests:** multi-tenant data isolation, root-cause investigation, structural prevention

*Axis: failure · Source: challenge question*

---

### "What is multi-tenancy? Shared database vs database-per-tenant?"

**Multi-tenancy** means a single deployed instance of an application serves **multiple separate customers ("tenants")**, each with their own data, that must never be visible to any other tenant — as opposed to giving each customer their own fully separate deployment. It's the standard architecture for B2B SaaS, because deploying and operating a fully separate stack per customer doesn't scale operationally past a small number of customers.

The core architectural decision is **how tenant data is separated**, and it's a spectrum, not a binary:

- **Shared database, shared tables (row-level isolation)** — every tenant's data lives in the same tables, distinguished by a `tenant_id` column on every row, filtered on every query (the exact mechanism behind the flagship scenario above). Cheapest to operate, easiest to manage migrations/scaling for (one schema, one set of infrastructure), but isolation is entirely enforced by application-level discipline — a missing filter is a real, catastrophic failure mode, not just a performance issue.
- **Shared database, separate schemas per tenant** — a middle ground: the database engine itself provides a stronger isolation boundary (a query genuinely can't accidentally see another schema without explicitly being told to), while still sharing infrastructure. More operational overhead (migrations have to run per-schema), and doesn't scale cleanly to a very large number of tenants (thousands of schemas is unwieldy).
- **Database-per-tenant** — full physical separation, the strongest isolation (a bug simply *cannot* leak across tenants at the query level, because there's no shared table for a missing filter to fail on), and the natural choice when tenants have strict compliance/data-residency requirements or wildly different scale. Most expensive and operationally heaviest — provisioning, migrating, monitoring, and backing up N separate databases instead of one.

**Interview line:** *"Multi-tenancy means one deployed instance serves many separate customers whose data must never cross. The core choice is how isolated that data is: shared tables with a tenant_id column is cheapest to operate but isolation depends entirely on application discipline — a missing filter is catastrophic, not just slow. Database-per-tenant gives the strongest isolation, since there's no shared table for a missing filter to even fail on, at the cost of operating N separate databases instead of one. I'd default to shared tables with strict enforcement at the data-access layer, and only go to database-per-tenant for compliance requirements or tenants at wildly different scale."*

**Tests:** multi-tenancy architecture spectrum, isolation vs operational cost

*Axis: normal · Source: challenge question*

---

### "How do you guarantee tenant isolation? How do you prevent cross-tenant data leaks?"

Beyond the query-filtering discipline covered in the flagship scenario, isolation has to be enforced at **every layer data could leak through**, not just the primary database query:

- **Data-access layer enforcement** (the main mechanism, covered above) — structural, automatic tenant scoping, not per-handler discipline.
- **Cache keys scoped by tenant** — the same cross-user-leakage risk from category 04's caching entries, one level up: a cache key like `orders:list` shared across tenants would serve Tenant A's cached list to Tenant B; every cache key touching tenant data needs the tenant ID baked in.
- **Background jobs/async processing scoped correctly** — a job pulled off a shared queue needs to carry and respect its tenant context throughout processing, not just at the point it was enqueued.
- **File/object storage scoped by tenant** — object keys/paths should include the tenant ID (`tenant-123/uploads/...`), and presigned URLs (category 13) must be generated only after verifying the requester belongs to that tenant.
- **Logs and error messages** shouldn't leak one tenant's data into contexts (a shared error-tracking dashboard, a support ticket) another tenant or an engineer without appropriate access might see unfiltered.

The unifying principle: **any place tenant-scoped data is stored, cached, queued, or logged is a place the tenant filter has to be re-applied** — it's not a single check at the API boundary, it's a property that has to hold at every layer data actually flows through.

**Interview line:** *"It's not one check at the API boundary — every layer data actually touches needs the same discipline. Cache keys need the tenant ID baked in, the same cross-user leakage risk as general caching but per-tenant. Background jobs need to carry and respect tenant context through async processing, not just at the point they were enqueued. Object storage keys need to be tenant-scoped too. The unifying principle is that anywhere tenant data is stored, cached, queued, or logged is a place the tenant filter has to be re-applied — it's a property of the whole system, not a single gate."*

**Tests:** defense in depth for multi-tenancy, isolation across layers

*Axis: failure · Source: challenge question*

---

### "How do you implement tenant-aware authorization?"

This is a **second, orthogonal layer on top of** tenant data isolation — isolation ensures Tenant A can never see Tenant B's data at all; authorization then governs what a specific *user within* Tenant A is allowed to do with Tenant A's own data (an admin within the tenant vs a read-only viewer within that same tenant). Both checks are needed, and they answer different questions — mixing them up (checking only role, forgetting tenant, or vice versa) is exactly how the flagship leak scenario or a within-tenant privilege escalation happens.

The practical shape: every authorization check needs **two** conditions to pass, not one — `user.tenantId === resource.tenantId` (isolation) **and** `user.role` (or a more granular ABAC-style rule, category 02) permits this specific action on this resource type. A common, clean implementation pattern is to make the tenant check structurally unavoidable (baked into the data-access layer, as above) so authorization logic only ever has to reason about *within-tenant* permissions — it never has the opportunity to accidentally operate across a tenant boundary at all, because the data layer already guaranteed it can't see across it.

**Interview line:** *"Tenant isolation and authorization are two separate questions — isolation is whether you can see this tenant's data at all, authorization is what you're allowed to do with it once you're already scoped to the right tenant. I keep the tenant check structural, in the data-access layer, so authorization logic only ever operates within an already-correctly-scoped tenant and never has the chance to accidentally reach across the boundary — mixing the two checks together in application logic is exactly how both the cross-tenant leak and within-tenant privilege escalation bugs happen."*

**Tests:** authorization vs isolation, layered access control

*Axis: failure · Source: challenge question*

---

### "How do you handle tenant-specific configuration?"

Different tenants often need different settings — feature flags enabled per-tenant, custom branding, different integrations enabled, different limits/quotas. The design question is where that configuration lives and how it's resolved at request time:

- **A tenant configuration table/record**, keyed by tenant ID, read (and typically cached — see below) at the start of request handling, rather than scattered `if (tenantId === 'x')` conditionals sprinkled through business logic — the latter becomes unmaintainable fast and is exactly the kind of special-casing that's easy to get wrong per-tenant.
- **Sensible defaults with tenant-specific overrides** — most configuration should inherit a sane default, with only the specific values a tenant has actually customized stored explicitly, rather than every tenant needing a complete config record from day one.
- **Cache tenant config** (it's read on nearly every request, changes rarely) but invalidate it explicitly when an admin changes a setting — the same cache-invalidation-on-write discipline as category 04, applied to config specifically.

**Interview line:** *"I'd keep tenant-specific configuration in a dedicated table keyed by tenant ID, loaded once at the start of request handling, rather than conditionals scattered through business logic — that becomes unmaintainable and error-prone per-tenant fast. Most values inherit a sensible default with only actual customizations stored explicitly, and since config is read on nearly every request but changes rarely, I'd cache it and invalidate explicitly on write, the same discipline as any other cache."*

**Tests:** tenant configuration design, avoiding special-case sprawl

*Axis: normal · Source: challenge question*

---

### "How do you handle a tenant with massive traffic? How do you implement tenant-level rate limiting and tenant-specific caching?"

This is the noisy-neighbor problem again (category 02/10), with the specific tenant-level mechanisms:

- **Tenant-level rate limiting** — the same token bucket/leaky bucket mechanics as general API rate limiting (category 02), just keyed by tenant ID instead of (or in addition to) IP/user — each tenant gets their own quota, so one tenant's traffic can't consume capacity that should be available to others.
- **Tenant-specific caching** — cache keys scoped by tenant (as in the isolation discussion above) mean a hot tenant's cache usage doesn't evict or crowd out other tenants' cached data if the cache has reasonable per-tenant limits or fair eviction; without that, a shared cache with no tenant awareness lets one very active tenant's working set dominate the cache, degrading cache hit rates for everyone else.
- **For the extreme case** — dedicated infrastructure for that one tenant (its own database, its own compute pool) rather than continuing to scale shared infrastructure just to accommodate a single outlier, as covered in [`10-system-design/scaling-scenarios.md`](../10-system-design/scaling-scenarios.md).

**Interview line:** *"Tenant-level rate limiting uses the same token-bucket mechanics as general API rate limiting, just keyed by tenant so one tenant's traffic can't consume capacity meant for others. For caching, tenant-scoped keys prevent one very active tenant's working set from crowding out everyone else's cached data in a shared cache. At the extreme, rather than keep scaling shared infrastructure to accommodate one outlier, I'd give that tenant dedicated infrastructure instead."*

**Tests:** tenant-level resource isolation, noisy neighbor mitigation

*Axis: scale · Source: challenge question*

---

### "How do you migrate one tenant independently?"

This comes up specifically when a tenant needs to move — to dedicated infrastructure (the extreme case above), to a different region (data residency/compliance), or between architecture generations during a broader system migration — without disrupting any other tenant sharing the current infrastructure.

The shape is the same **dual-write, backfill, verify, cut over** pattern as any zero-downtime migration (category 03), applied at tenant granularity: provision the new destination for this specific tenant, dual-write this tenant's new data to both old and new locations, backfill this tenant's existing historical data in the background, verify the two agree, cut this tenant's reads over to the new location (often via a per-tenant routing/config flag — "which database does tenant X's traffic go to" — rather than a global switch), and only then decommission this tenant's data in the old location. Because it's scoped to one tenant, the blast radius of anything going wrong is contained to that tenant, and other tenants on the shared infrastructure are entirely unaffected throughout.

**Interview line:** *"Same dual-write, backfill, verify, cut-over pattern as any zero-downtime migration, just scoped to one tenant instead of the whole system — dual-write that tenant's new data to both locations, backfill their history in the background, verify, then flip a per-tenant routing flag to cut their reads over. Because it's scoped to just that tenant, anything going wrong is contained to them, and every other tenant on the shared infrastructure is completely unaffected the whole time."*

**Tests:** tenant-scoped migration, blast radius containment

*Axis: recovery · Source: challenge question*

---
