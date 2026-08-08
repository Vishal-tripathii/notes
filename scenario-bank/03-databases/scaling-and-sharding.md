# Database Scaling & Sharding — Scenario Bank

---

### "Vertical vs horizontal scaling?"

**Vertical scaling** — make the one machine bigger (more CPU, more RAM, faster disk). Simple: no application changes, no distributed-systems complexity. But it has a hard ceiling (there's a biggest machine you can buy) and doesn't help availability — it's still one machine, one point of failure.

**Horizontal scaling** — add more machines and split the load across them. No hard ceiling in principle, and naturally improves availability (one machine dying doesn't take everything down). But it's genuinely harder: for a database specifically, splitting data across machines means the data itself has to be partitioned somehow (sharding, below), and now cross-shard queries/transactions become a real design problem that didn't exist on one machine.

**Rule of thumb:** stateless app servers scale horizontally easily and by default — there's no shared state to split. Databases are the hard case, which is why "how do you scale the database" is its own deep topic rather than "just add more servers."

**Interview line:** *"Vertical scaling is simpler — just a bigger machine — but it has a ceiling and doesn't help availability. Horizontal scaling has no real ceiling and improves availability, but for a database it means the data itself has to be partitioned somehow, which is genuinely hard. Stateless app servers scale horizontally for free; the database is where the real complexity lives."*

**Tests:** scaling fundamentals

*Axis: scale · Source: challenge question*

---

### "Read replicas — when do you use them?"

A read replica is a copy of the primary database that stays in sync (usually via replication of the write log) and serves **read-only** traffic. You point read-heavy queries at replicas and keep writes going only to the primary — this works well because most applications are read-heavy (many more reads than writes), so replicas let you scale the expensive part (reads) horizontally without touching how writes work at all.

The catch: replication is typically **asynchronous**, so a replica can lag behind the primary by anywhere from milliseconds to (under heavy load) much longer — meaning a read from a replica can be **stale**. This is fine for most reads (a product listing page doesn't need to be millisecond-fresh) but wrong for "read your own write" cases — e.g. a user updates their profile and the next page load reads from a lagging replica and shows the old value. For those specific reads, route to the primary instead.

```
writes  → always the primary
reads   → replicas, except immediately-after-a-write reads that need the primary
```

**Interview line:** *"Read replicas let me scale reads horizontally by serving read-heavy traffic off copies of the primary, which works well because most apps are read-heavy. The trade-off is replication lag — a replica can be milliseconds to seconds behind — so I route reads that need to see a write immediately, like right after the user just made that write, to the primary instead."*

**Tests:** read scaling, replication lag

*Axis: scale · Source: challenge question*

---

### "What happens when the primary database goes down? How do you design database failover?"

Without a plan: every write fails, and depending on setup, every read might too (if reads also default to the primary). This is a hard outage for anything that touches the database, which is almost everything.

Failover design:
- **Have a standby replica ready to be promoted** — a replica kept in close sync with the primary (often synchronous or near-synchronous specifically for the failover candidate, so promoting it doesn't lose recent writes) that can be turned into the new primary if the original goes down.
- **Detect the failure** — a health check monitoring the primary, so failover can happen automatically rather than waiting for a human to notice at 3am.
- **Promote the replica and redirect traffic** — either automatically (managed database services like RDS Multi-AZ do this) or via a runbook for manual failover.
- **Accept the trade-off honestly**: even a well-designed automated failover has some downtime (the detection + promotion + redirect isn't instant) and some risk of losing the very last few writes that hadn't replicated yet, unless replication to the failover candidate is fully synchronous (which itself costs write latency on the healthy path, so it's a trade-off made in advance, not something you can have for free).

**Interview line:** *"Failover means having a standby replica kept in close sync that's ready to be promoted, a health check that detects the primary is actually down rather than just slow, and an automatic promotion so it doesn't depend on someone noticing at 3am. The honest trade-off is that even good automated failover has some downtime during detection and promotion, and some risk of losing the very last unreplicated writes unless you pay for fully synchronous replication."*

**Tests:** high availability, failover design

*Axis: recovery · Source: challenge question*

---

### "When would you shard a database? How do you choose a shard key?"

**Sharding** means splitting a single logical table across multiple physically separate databases, each holding a subset of the rows — because at some point, a single machine (even vertically scaled to its max, even with read replicas for reads) can't handle the **write** volume or the **total data size** alone. Read replicas don't help with this because every replica still has to apply every write — sharding is what you reach for when writes themselves are the bottleneck, not just reads.

Choosing a shard key is the highest-stakes decision in the design, because it's genuinely hard to change later without a major migration:
- **High cardinality** — enough distinct values to actually spread data evenly (e.g. `user_id`, not `country`, if you have far more users than countries).
- **Matches your actual query pattern** — most queries should be answerable from a *single* shard (e.g. "get all orders for this user" is single-shard if sharded by `user_id`); if most real queries need to hit *every* shard and merge results, you've gained write scale but paid for it with much more expensive reads.
- **Avoids hot partitions** (next question) — a key that clusters a disproportionate amount of data or traffic onto one shard defeats the whole point.

**Interview line:** *"I'd shard when write volume or total data size outgrows what a single machine can handle — read replicas don't help there, since every replica still applies every write. The shard key is the highest-stakes decision: it needs high cardinality to spread evenly, and it needs to match the actual query pattern, so most real queries hit one shard instead of fanning out to all of them and merging."*

**Tests:** sharding fundamentals, shard key selection

*Axis: scale · Source: challenge question*

---

### "What happens when your shard key creates a hot partition?"

A hot partition (or hot shard) is when the shard key you chose doesn't distribute data/traffic evenly — one shard ends up handling a disproportionate share of the load while the others sit comparatively idle. Common cause: sharding by something that correlates with real-world skew — e.g. sharding a multi-tenant system by `tenant_id` when one tenant is 100× larger than everyone else, or sharding by a sequentially-increasing ID/timestamp, which concentrates *all new writes* onto whichever shard currently owns the latest range.

The symptom in production: one shard is CPU/IO-saturated and slow while the rest of the cluster reports fine — sharding didn't actually fix the scaling problem for that one hot slice.

Fixes:
- **Choose a better key up front** — hash-based sharding (hash the key, then assign by hash) spreads load evenly regardless of real-world skew, at the cost of losing the ability to do efficient range queries across the key.
- **Split the hot shard further** — for an already-live system, isolate the disproportionately large entity (e.g. give that one huge tenant dedicated infrastructure, as in the "noisy neighbor" scenario in [`02-api-design/`](../02-api-design/)).
- **Add a second dimension to the key** — e.g. `tenant_id + random_suffix` for write-heavy hot keys, spreading a single logical entity's writes across multiple physical shards, at the cost of more complex reads that now need to query all the suffixes and merge.

**Interview line:** *"A hot partition means the shard key didn't distribute load evenly — often because it correlates with real-world skew, like a sequential ID concentrating all new writes on one shard, or one tenant being far bigger than the rest. I'd prefer hash-based sharding up front to avoid this, and for an already-hot shard, either give the disproportionate entity dedicated infrastructure or add a second dimension to the key to spread its writes across multiple shards."*

**Tests:** hot partition diagnosis, sharding strategy

*Axis: scale · Source: challenge question*

---

### "How do you migrate a huge database without downtime?"

The core technique across almost every zero-downtime migration — schema change, engine change, or moving to sharding — is the same shape: **dual-write, backfill, verify, cut over, clean up.**

1. **Make the new destination able to receive writes** (new column, new table, new sharded cluster) without yet removing the old path.
2. **Dual-write** — every new write goes to both the old and new location, so the new one starts staying current from this point forward.
3. **Backfill** — copy the *existing* historical data across in the background, in batches, without locking the live table (throttled, so it doesn't compete with production traffic for resources).
4. **Verify** — compare old vs new to confirm they actually agree before trusting the new path exclusively.
5. **Cut over reads** — start reading from the new location (often behind a feature flag, so it can be reverted instantly if something's wrong).
6. **Stop writing to the old location and clean it up** — only once the new path has been trusted in production for a real amount of time.

The discipline that makes this safe is that **every step is independently reversible** — nothing is a single big irreversible flip, unlike a naive "take the site down, migrate, bring it back up."

**Interview line:** *"I don't do a big-bang cutover. It's dual-write to both old and new, backfill historical data in the background without locking the live table, verify the two agree, then cut reads over behind a flag so it's instantly revertible, and only remove the old path once the new one's been trusted in production for a while. Every step is independently reversible instead of one irreversible flip."*

**Tests:** zero-downtime migration strategy

*Axis: recovery · Source: challenge question*

---
