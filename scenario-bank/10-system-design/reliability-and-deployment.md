# System Design — Reliability & Deployment Scenarios

> Cross-linked rather than repeated: "Redis goes down" → [`04-caching/cache-failure-modes.md`](../04-caching/cache-failure-modes.md). "An external API is unavailable for 30 minutes" and "one microservice becomes extremely slow" → [`01-distributed-systems-reliability/cascading-failures-and-degradation.md`](../01-distributed-systems-reliability/cascading-failures-and-degradation.md). "Two services disagree about the same data" → [`01-distributed-systems-reliability/consistency-and-transactions.md`](../01-distributed-systems-reliability/consistency-and-transactions.md). "How do you deploy without downtime / blue-green vs rolling vs canary" → [`09-docker-infrastructure/container-operations.md`](../09-docker-infrastructure/container-operations.md). "Zero-downtime migrations" → [`03-databases/scaling-and-sharding.md`](../03-databases/scaling-and-sharding.md).

---

### "Your database goes down. What happens?"

Every read and write that touches it fails, immediately — for most applications this is close to a full outage, since almost everything ends up needing the database somewhere in the request path. Whether it's *survivable* depends entirely on what was set up in advance:

- **With a failover-ready replica** (see [`03-databases/scaling-and-sharding.md`](../03-databases/scaling-and-sharding.md)) — automated failover promotes it, and the outage is bounded to the detection + promotion window, not indefinite.
- **Without one** — the outage lasts until a human intervenes, which is a strong argument for why failover isn't optional for anything actually depending on uptime.
- **Non-database-dependent functionality can sometimes keep working** — if the application was built with graceful degradation (category 01) and some paths only need a cache, they might keep serving stale-but-available data even while the database is down; most real apps have far less of this than they'd like to admit.

The actual interview answer is less about the mechanics (covered in the failover entry) and more about recognizing that **this is exactly why failover, health checks, and graceful degradation aren't independent nice-to-haves — they're the specific things standing between "database blip" and "full outage."**

**Interview line:** *"Without a failover plan in place beforehand, a database going down is close to a full outage, since nearly everything touches it — and the outage lasts until a human steps in. This is exactly the argument for having automated failover ready before it happens, not scrambling to set it up during the incident."*

**Tests:** database outage impact, why failover matters

*Axis: recovery · Source: challenge question*

---

### "Kafka goes down. What happens?"

The impact depends on which role Kafka was playing and whether producers/consumers were built to tolerate its unavailability:

- **Producers can't publish** — depending on how the producer is implemented, this either blocks/errors the caller (bad, if the caller is a synchronous request path that shouldn't depend on Kafka's availability) or the producer buffers messages locally to retry once Kafka's back (better, if the client library and the surrounding code support it) — this is exactly why publishing to Kafka from a synchronous request path is often paired with the outbox pattern (category 01), so a Kafka outage doesn't block or corrupt the actual business transaction, only delays the event being published.
- **Consumers stop receiving new messages** — they simply have nothing to consume until Kafka recovers; whatever was relying on those events (order processing, notifications) pauses, and depending on how critical that is, this might be invisible to users (async, eventually-consistent work) or a real problem (a payment confirmation flow waiting on an event that isn't arriving).
- **No data loss for anything already durably written to the log before the outage** — Kafka's durability guarantees mean messages that were already committed survive; the actual risk is specifically for messages that were being produced *during* the outage and weren't buffered/retried by the producer.

The design takeaway: services that depend on Kafka should be built assuming it *can* be temporarily unavailable — buffering/retrying on the producer side, and consumers that simply catch up once it's back rather than assuming continuous availability.

**Interview line:** *"It splits into two failure modes — producers can't publish, and consumers stop receiving. For producers, the outbox pattern is exactly what prevents a Kafka outage from blocking or corrupting the actual business transaction; the event just gets published late once Kafka recovers. For consumers, whatever depended on those events pauses until it's back — no data loss for anything already committed to the log, the real risk is only for what was mid-publish during the outage without a buffering/retry mechanism underneath it."*

**Tests:** message broker outage impact, producer/consumer resilience

*Axis: recovery · Source: challenge question*

---

### "Your deployment introduces a bug. How do you recover? How do you rollback a bad deployment?"

Speed of detection and speed of rollback are both what determine actual impact — the response has two parts, and both need to be ready *before* the bad deploy happens, not improvised during it:

**Detecting it fast:**
- **Automated health checks and error-rate monitoring** immediately after a deploy — comparing error rate/latency right before vs right after the deploy is a strong, fast signal, faster than waiting for user reports.
- **Canary/gradual rollout** (category 09) — if the deploy is rolled out to a small percentage first, a bug is caught while affecting a fraction of users, not everyone.

**Rolling back fast:**
- **Keep the previous version's artifact/image readily deployable** — rollback should mean "redeploy the last known-good version," a fast, well-rehearsed action, not a scramble to figure out what the previous state even was.
- **Feature flags for risky changes** — if the risky part of the change is behind a flag, "rollback" can be as fast as flipping the flag off, without a full redeploy at all.
- **Database migrations need to be rollback-compatible** (next question) — a code rollback that leaves the database in a state the old code can't handle just trades one bug for another, worse one.

The actual discipline that matters most: **treat rollback as a first-class, tested capability**, not something assembled for the first time during an actual incident — knowing the rollback path works, and how long it takes, before you need it under pressure.

**Interview line:** *"The two things that actually determine the damage are how fast I detect it and how fast I can roll back — both need to already be ready, not improvised. Detection means automated error-rate monitoring right after a deploy, ideally combined with a canary rollout so a bug only affects a small percentage before it's caught. Rollback means the previous version is always readily redeployable, and for risky changes specifically, a feature flag can make rollback instant instead of requiring a full redeploy — the one thing I make sure of ahead of time is that the rollback path is actually tested, not something I'm discovering works during the incident itself."*

**Tests:** deployment safety, rollback readiness

*Axis: recovery · Source: challenge question*

---

### "What happens if database schema changes aren't backward compatible?"

During a rolling deployment (category 09), **old and new code run simultaneously** for the duration of the rollout — some instances are still the old version while others have already updated. If a schema change isn't backward compatible, the **old code**, still running against the now-changed schema, breaks — e.g. the old code expects a column that a migration just dropped, or expects a column to be nullable that a migration just made `NOT NULL` without a default.

The fix is **expand-contract** (a.k.a. parallel change): never make a single migration that both adds the new shape and removes the old shape in one step. Instead:
1. **Expand** — add the new column/table *without* removing the old one; both the old code (using the old column) and new code (using the new column, once deployed) can coexist against this schema.
2. **Deploy the new code**, which writes to (and/or reads from) the new column — during the rollout, some instances still use the old column, which the schema still supports.
3. **Backfill** existing data into the new column for rows that predate the change.
4. Once **all instances are confirmed on the new code** (the rollout is fully complete), **contract** — a separate, later migration removes the old column, which is now safe since nothing reads it anymore.

```sql
-- expand: add the new column, don't touch the old one yet
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false;
-- (deploy new code that uses email_verified, backfill existing rows)
-- contract: only after the rollout is fully complete and nothing reads the old column
ALTER TABLE users DROP COLUMN legacy_verified_flag;
```

**Interview line:** *"During a rolling deploy, old and new code run at the same time, so a schema change that isn't backward compatible breaks whichever old instances are still running against the changed schema. I use expand-contract — add the new column without touching the old one, deploy the new code so both versions can coexist against that schema during the rollout, backfill existing data, and only remove the old column in a separate, later migration once every instance is confirmed on the new code."*

**Tests:** schema migration compatibility, expand-contract pattern

*Axis: failure · Source: challenge question*

---
