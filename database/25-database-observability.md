# Database Study Notes — Part 25

## Database Observability & Troubleshooting

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Why this part exists:** [Part 03](03-query-optimization-and-explain.md) explains how to fix *one* slow query once you have it. In production the harder part is **finding** it, and recognising the other failure shapes — lock pile-ups, connection exhaustion, replication lag, a full disk. This is the toolkit and the playbook behind "how do you debug a slow database?" ([Part 18](18-production-scenario-practice.md)).

---

## Table of Contents

1. [The metrics that matter](#metrics)
2. [Finding slow queries — Postgres](#postgres)
3. [Finding slow queries — MySQL](#mysql)
4. [Finding slow queries — MongoDB](#mongo)
5. [`EXPLAIN ANALYZE` — the actual numbers](#explain-analyze)
6. [Live troubleshooting: what's running, what's blocked](#live)
7. [Guardrails: timeouts](#timeouts)
8. [Playbook: common incidents](#playbook)
9. [Backups & recovery, briefly](#backups)
10. [Interview Questions & Answers](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="metrics"></a>
## 1. The metrics that matter

| Metric | Why | Bad sign |
|---|---|---|
| Query latency **p95 / p99** (not average) | users feel the tail | p99 climbing while average looks fine |
| Throughput (queries/sec, transactions/sec) | load context for everything else | sudden jump = new feature, retry storm, or bot |
| **Active connections** vs max | pool exhaustion ([Part 12](12-connection-pooling.md)) | near `max_connections`; many "idle in transaction" |
| CPU | inefficient queries (scans, sorts) | sustained > ~80% |
| **Cache hit ratio** (buffer pool / WiredTiger cache) | working set vs RAM ([Part 22 §1](22-storage-internals.md)) | dropping below ~99% for OLTP → disk-bound |
| Disk IOPS / latency, free space | I/O saturation; WAL/oplog growth | rising read IOPS with flat traffic = cache misses |
| **Replication lag** | stale reads, failover risk ([Part 13](13-replication.md)) | growing steadily |
| Lock waits, deadlocks/min | contention ([Part 04.6](04.6-locking-deadlocks-and-anomalies.md)) | any steady increase |
| Slow query count | regressions after a deploy | spike right after a release |

**Correlate with deploys.** Most database incidents are a new query or a changed query shipped that day.

---

<a name="postgres"></a>
## 2. Finding slow queries — Postgres

**`pg_stat_statements`** (an extension, enabled on most managed Postgres) aggregates stats per normalised query — the most useful tool there is:

```sql
SELECT query, calls, mean_exec_time, total_exec_time, rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC        -- what costs the most IN TOTAL
LIMIT 10;
```

Sort by **`total_exec_time`**, not just mean: a 5ms query called 2 million times an hour costs more than a 3s report run twice. The total view also exposes N+1 patterns ([Part 07](07-populate-and-n-plus-1.md)) — a tiny query with an enormous `calls` count.

Also:
- `log_min_duration_statement = 500ms` → logs every statement slower than that, with its parameters.
- `auto_explain` → logs the execution plan of slow queries automatically, so you see the plan that was used at the time.
- `pg_stat_user_tables` → `seq_scan` vs `idx_scan` counts per table (tables with huge seq scan counts need an index); `n_dead_tup` for bloat ([Part 22 §7](22-storage-internals.md)).
- `pg_stat_user_indexes` → `idx_scan = 0` finds unused indexes that only slow writes.

---

<a name="mysql"></a>
## 3. Finding slow queries — MySQL

- **Slow query log:** `slow_query_log = ON`, `long_query_time = 0.5`; optionally `log_queries_not_using_indexes`. Summarise with `pt-query-digest` (groups by normalised query, ranks by total time).
- **`performance_schema` / `sys` schema:** `sys.statement_analysis` gives a per-query summary similar to `pg_stat_statements`; `sys.schema_unused_indexes` lists unused indexes.
- `SHOW ENGINE INNODB STATUS` → latest deadlock, lock waits, buffer pool stats.

---

<a name="mongo"></a>
## 4. Finding slow queries — MongoDB

- **Slow operations are logged by default** when they exceed `slowms` (default **100ms**) — look for `"Slow query"` entries in the mongod log with `planSummary: COLLSCAN`.
- **Database profiler:** `db.setProfilingLevel(1, { slowms: 50 })` writes slow ops to `system.profile`, which you can query:
  ```js
  db.system.profile.find({ millis: { $gt: 100 } }).sort({ ts: -1 }).limit(10)
  ```
  Level 2 profiles *everything* — only briefly, it adds overhead.
- **`$indexStats`** → unused indexes ([Part 06.5 §7](06.5-mongodb-indexing-deep-dive.md)).
- **Atlas:** Query Profiler and **Performance Advisor** (suggests indexes from the slow-query log).
- **`mongostat` / `mongotop`** → ops/sec per type and time spent per collection, live.
- Read the problem query with `explain("executionStats")` — keys examined vs docs examined vs returned ([Part 06.5 §3](06.5-mongodb-indexing-deep-dive.md)).

---

<a name="explain-analyze"></a>
## 5. `EXPLAIN ANALYZE` — the actual numbers

Plain `EXPLAIN` shows the **estimated** plan. `EXPLAIN ANALYZE` **runs the query** and shows actual rows and timings per step:

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE customer_id = 42 AND status = 'paid';

-- Index Scan using idx_orders_customer on orders (cost=0.43..812.10 rows=12 width=96)
--                                          (actual time=0.05..41.2 rows=9840 loops=1)
--   Filter: (status = 'paid')
--   Rows Removed by Filter: 15210
--   Buffers: shared hit=310 read=2104
```

What to read:
- **estimated `rows=12` vs actual `rows=9840`** — a huge mis-estimate means stale or insufficient statistics → `ANALYZE orders;`. Bad estimates are behind most "the planner chose a crazy plan" stories.
- **`Rows Removed by Filter`** large → the index finds candidates, then most get thrown away — add `status` to the index.
- **`Buffers: read=`** high → data came from disk, not cache.
- **`loops=N`** on the inner side of a nested loop — multiply its time by N.
- `Sort Method: external merge Disk` → the sort spilled to disk; more `work_mem` or an index for the `ORDER BY`.

⚠️ `EXPLAIN ANALYZE` **executes** the statement — for an `UPDATE`/`DELETE`, wrap it: `BEGIN; EXPLAIN ANALYZE ...; ROLLBACK;`. MySQL 8.0.18+ has `EXPLAIN ANALYZE` too.

---

<a name="live"></a>
## 6. Live troubleshooting: what's running, what's blocked

**Postgres:**
```sql
-- what's running right now, longest first
SELECT pid, state, now() - xact_start AS xact_age, wait_event_type, query
FROM pg_stat_activity WHERE state <> 'idle' ORDER BY xact_age DESC;

-- who is blocking whom
SELECT pid, pg_blocking_pids(pid) AS blocked_by, query
FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0;

SELECT pg_cancel_backend(12345);      -- cancel the query
SELECT pg_terminate_backend(12345);   -- kill the connection
```
Watch for `state = 'idle in transaction'` with a large `xact_age` — an app that opened a transaction and never finished it, holding locks and blocking VACUUM.

**MySQL:** `SHOW PROCESSLIST` / `information_schema.innodb_trx`, `sys.innodb_lock_waits`, `KILL <id>`.

**MongoDB:**
```js
db.currentOp({ active: true, secs_running: { $gt: 5 } })
db.killOp(opid)
```

---

<a name="timeouts"></a>
## 7. Guardrails: timeouts

Every production database setup should cap how long things can run, so one bad query can't take everything down:

| Guard | Postgres | MySQL | MongoDB |
|---|---|---|---|
| Max query time | `statement_timeout` | `max_execution_time` (SELECT) | `maxTimeMS` per operation |
| Max lock wait | `lock_timeout` | `innodb_lock_wait_timeout` | `maxTransactionLockRequestTimeoutMillis` |
| Abandoned transactions | `idle_in_transaction_session_timeout` | `wait_timeout` | transactions auto-abort after 60s |
| Wait for a pool connection | pool `connectionTimeoutMillis` | same | `waitQueueTimeoutMS` |

Set them per role: a short `statement_timeout` (e.g. 5s) for the web app's user, a longer one for the reporting user and migrations.

---

<a name="playbook"></a>
## 8. Playbook: common incidents

| Symptom | Likely cause | First moves |
|---|---|---|
| CPU pinned, latency up for everything | a new/changed query doing scans or big sorts | `pg_stat_statements` / profiler sorted by total time; compare with the last deploy; `EXPLAIN ANALYZE`; add index or roll back |
| Timeouts, "too many connections" | pool exhaustion — slow queries hold connections, leaks, or too many app instances × pool size | look at `pg_stat_activity` states; long-running and idle-in-transaction sessions; check pool settings ([Part 12](12-connection-pooling.md)) |
| One table's queries all hang | lock pile-up — a migration waiting on `ACCESS EXCLUSIVE`, or a long transaction holding row locks | blocking-pids query → cancel the blocker; add `lock_timeout` to migrations ([Part 21 §3](21-schema-validation-and-migrations.md)) |
| Users see stale data after saving | replication lag + reads from replicas | lag metric; heavy write/backfill running?; route read-after-write to primary ([Part 13](13-replication.md), [Part 05.5 §6](05.5-mongodb-write-concern-read-concern-read-preference.md)) |
| Gradual slowdown over weeks | data growth past RAM, bloat, stale statistics, offset pagination getting deeper | cache hit ratio, `n_dead_tup`, `ANALYZE`, cursor pagination ([Part 10](10-pagination.md)) |
| Disk filling fast | WAL/binlog retention (an inactive replication slot is a classic), bloat, logs | check replication slots, archive settings, largest tables |
| Sudden spike in identical queries | cache stampede after a key expired or a cache flush | stampede protection ([Part 11 §5](11-redis-basics-and-caching.md)) |

Order of operations in an incident: **stop the bleeding first** (cancel the runaway query, roll back the deploy, fail over) — then find the root cause.

---

<a name="backups"></a>
## 9. Backups & recovery, briefly

- **Logical backups** (`pg_dump`, `mysqldump`, `mongodump`) — portable, slow to restore for big databases.
- **Physical backups / snapshots** + **WAL/binlog/oplog archiving** → **point-in-time recovery (PITR)**: restore the base backup, replay the log up to 10:41:59, just before someone ran `DELETE FROM orders` without a `WHERE`.
- **Replicas are not backups** — a bad `DELETE` replicates to them within milliseconds. (A deliberately *delayed* replica can help.)
- Two numbers to state: **RPO** (how much data you can lose) and **RTO** (how long recovery may take).
- **An untested backup is not a backup** — schedule restore drills.

---

<a name="interview"></a>
## 10. Interview Questions & Answers

**Q: How do you find the slowest queries in production?**
A: Postgres: `pg_stat_statements` sorted by total execution time, plus the slow-statement log and `auto_explain`. MySQL: slow query log summarised with `pt-query-digest`, or `sys.statement_analysis`. MongoDB: slow-op log entries (over 100ms by default), the profiler, Atlas Performance Advisor. Sort by total time, not only mean, because a fast query called millions of times often costs the most.

**Q: `EXPLAIN` vs `EXPLAIN ANALYZE`?**
A: `EXPLAIN` shows the estimated plan without running it; `EXPLAIN ANALYZE` executes the query and shows actual rows and times per node. The key thing to compare is estimated vs actual rows — a big gap means bad statistics. It really executes, so wrap writes in a transaction and roll back.

**Q: The database is at 100% CPU. What do you do?**
A: Check what changed — usually a deploy. Look at currently running queries and the top queries by total time, `EXPLAIN ANALYZE` the culprit, and fix it with an index or roll back the release. Stop the bleeding first by cancelling runaway queries if needed.

**Q: Requests time out with "too many connections." How do you investigate?**
A: Look at `pg_stat_activity` (or `currentOp`): are connections busy with slow queries, or sitting idle in transaction (a leak or unfinished transaction)? Check pool size × app instances against the database limit. Fix the slow query or leak, add timeouts, and consider a pooler like PgBouncer.

**Q: What timeouts would you configure?**
A: Statement timeout per role, lock timeout (especially for migrations), idle-in-transaction timeout, `maxTimeMS` on MongoDB operations, and a pool checkout timeout so requests fail fast instead of hanging.

**Q: Someone ran a DELETE without a WHERE. How do you recover?**
A: Point-in-time recovery: restore the latest base backup to a new instance, replay WAL/binlog/oplog up to just before the delete, then copy the lost rows back. Replicas don't help — the delete replicated to them too.

---

<a name="cheatsheet"></a>
## 11. Cheat Sheet

- Watch: p95/p99 latency, connections, CPU, cache hit ratio, IOPS, replication lag, lock waits/deadlocks, slow-query count — correlated with deploys.
- PG: **`pg_stat_statements` by total time**, `log_min_duration_statement`, `auto_explain`, `pg_stat_user_tables` (seq vs idx scans, dead tuples).
- MySQL: slow query log + `pt-query-digest`, `sys.statement_analysis`, `SHOW ENGINE INNODB STATUS`.
- Mongo: slow-op log (100ms), profiler → `system.profile`, `$indexStats`, Performance Advisor, `currentOp`/`killOp`.
- `EXPLAIN (ANALYZE, BUFFERS)`: estimated vs actual rows (→ `ANALYZE`), rows removed by filter, buffers read, loops, disk sorts. It executes — rollback writes.
- Live: `pg_stat_activity`, `pg_blocking_pids`, cancel/terminate; kill idle-in-transaction.
- Timeouts: statement, lock, idle-in-transaction, `maxTimeMS`, pool checkout.
- Backups: logical vs physical + log archiving = PITR. Replicas ≠ backups. Know RPO/RTO. Test restores.
