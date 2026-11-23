# Database Study Notes — Part 22

## Storage Internals — Pages, WAL, B+Trees vs LSM-Trees, MVCC Implementations

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Why this part exists:** the "how does it work underneath" layer that turns several earlier answers from memorised into explained: why commits are durable (Part 04's **D**), why random primary keys hurt ([Part 23](23-primary-keys-and-id-generation.md)), why Postgres tables bloat, why "indexes must fit in RAM," and why Cassandra writes faster than Postgres. Intermediate level — know the mechanisms, not the source code.

---

## Table of Contents

1. [Pages and the buffer pool](#pages)
2. [Write-ahead log (WAL) — how durability actually works](#wal)
3. [B+Trees — what "B-Tree index" really means](#bplus)
4. [LSM-Trees — the write-optimized alternative](#lsm)
5. [How rows are stored: heap vs clustered](#heap)
6. [MVCC implementations — Postgres vs InnoDB vs WiredTiger](#mvcc)
7. [VACUUM, bloat, and long transactions](#vacuum)
8. [Interview Questions & Answers](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="pages"></a>
## 1. Pages and the buffer pool

Databases read and write disk in fixed-size **pages** (Postgres 8KB, InnoDB 16KB; WiredTiger uses variable-size pages) — never single rows. A page holds many rows or index entries.

Recently used pages are kept in an in-memory cache:

| Engine | Cache | Typical sizing |
|---|---|---|
| Postgres | `shared_buffers` (+ the OS page cache) | ~25% of RAM |
| MySQL InnoDB | buffer pool (`innodb_buffer_pool_size`) | 50–75% of RAM on a dedicated server |
| MongoDB WiredTiger | WiredTiger cache | default ~50% of (RAM − 1GB) |

The **working set** is the data and index pages your queries touch regularly. While it fits in the cache, reads are memory-speed; once it doesn't, queries start waiting on disk and latency jumps non-linearly. That's the real meaning of "indexes should fit in RAM" ([Part 06 §2](06-mongodb-indexes.md)) and of the **cache hit ratio** metric ([Part 25](25-database-observability.md)).

---

<a name="wal"></a>
## 2. Write-ahead log (WAL) — how durability actually works

The problem: a commit changes data pages scattered across the disk. Writing all of them synchronously on every commit would be slow (random I/O), and a crash halfway through would leave pages half-updated.

The solution, used by essentially every serious database:

```
On COMMIT:
  1. Append a record of the change to the WAL (sequential write — fast).
  2. fsync the WAL to disk.                 ← the commit is now durable
  3. Reply "committed" to the client.
  4. Modified data pages stay dirty in memory...

Later (checkpoint):
  5. Dirty pages are flushed to their real locations in the background.

After a crash:
  6. Start from the last checkpoint, replay the WAL → every committed change is restored;
     uncommitted ones are discarded.
```

Names per engine: Postgres **WAL**; InnoDB **redo log** (plus a separate **binlog** used for replication and point-in-time recovery); MongoDB WiredTiger **journal** (plus the **oplog** used for replication).

Consequences worth knowing:
- **The WAL is also the replication stream.** Postgres streaming replication ships WAL to replicas; MongoDB secondaries replay the oplog ([Part 13](13-replication.md), [Part 05.5](05.5-mongodb-write-concern-read-concern-read-preference.md)). Point-in-time recovery = base backup + replay WAL up to a timestamp.
- **Group commit:** many concurrent commits share one fsync — that's how databases do thousands of commits/sec on disks that can only fsync a few thousand times per second.
- **Trading durability for speed:** Postgres `synchronous_commit = off`, MySQL `innodb_flush_log_at_trx_commit = 2`, Mongo `j: false` → the commit returns before the fsync; a crash can lose the last fraction of a second of commits (but doesn't corrupt data). Fine for logs/analytics, not for payments.
- **Big batch updates = big WAL** → disk usage spikes and replicas lag ([Part 21 §6](21-schema-validation-and-migrations.md)).

---

<a name="bplus"></a>
## 3. B+Trees — what "B-Tree index" really means

What Postgres, InnoDB and WiredTiger call a "B-Tree" is, in practice, a **B+Tree**:

```
                 [ 40 | 80 ]                 ← internal nodes: only keys + child pointers
               /      |      \
     [10|20|30]   [40|50|60|70]   [80|90]     ← leaves: keys + row pointers (or the row itself)
         ⇄              ⇄              ⇄       ← leaves linked to neighbours
```

- **Internal nodes hold only keys**, so each 8–16KB page fits hundreds of child pointers → a tree over **hundreds of millions of rows is only 3–4 levels deep**. A lookup = 3–4 page reads, and the top levels are almost always cached.
- **All data lives in the leaves, and leaves are linked** → a range scan (`BETWEEN`, `ORDER BY ... LIMIT`) seeks to the start once and then walks sideways through leaves. This is why B+Trees are so good at ranges and sorted output, and why cursor pagination is fast ([Part 10](10-pagination.md)).
- **Inserts go to a specific leaf, determined by the key.** Sequential keys always append to the rightmost leaf (hot in cache, pages fill up neatly). **Random keys** (UUIDv4) land on random leaves → random pages must be read into memory, pages **split** when full and end up ~half empty → bigger index, more I/O ([Part 23](23-primary-keys-and-id-generation.md)).
- Updates are **in place** (read page, modify, write page) — reads are cheap, writes do random I/O.

---

<a name="lsm"></a>
## 4. LSM-Trees — the write-optimized alternative

**Log-Structured Merge trees** (Cassandra, ScyllaDB, RocksDB, LevelDB, HBase; MongoDB and MySQL can use RocksDB-based engines) never update data in place:

```
write → WAL (durability) + in-memory sorted table (memtable)
memtable full → flushed to disk as an immutable sorted file (SSTable)
background compaction → merges SSTables, drops overwritten/deleted values
read → check memtable, then SSTables newest → oldest (Bloom filters skip files that can't contain the key)
```

| | B+Tree | LSM-Tree |
|---|---|---|
| Writes | random in-place page updates | sequential appends — **very fast** |
| Reads | one tree walk — **predictable** | may check several files — slower, helped by Bloom filters ([System-design Part 27](../System-design/27-bloom-filter.md)) |
| Range scans | excellent (linked leaves) | good, but merges across files |
| Space | page splits leave free space | compaction reclaims space, needs temporary headroom |
| Background cost | VACUUM (Postgres) / purge | compaction — can cause latency spikes |
| Fits | OLTP, read-heavy, mixed | write-heavy: event logs, metrics, messaging, time-series |

One-line answer: **B+Trees optimise reads, LSM-Trees optimise writes**; the trade-off is read amplification vs write amplification.

---

<a name="heap"></a>
## 5. How rows are stored: heap vs clustered

- **InnoDB — clustered on the primary key.** The table *is* the PK B+Tree: leaves contain the full rows, in PK order. Secondary indexes store the **PK value**, so a secondary-index lookup is two tree walks (secondary → PK → row). Consequences: a wide PK (e.g. a 36-char UUID string) bloats **every** secondary index; random PKs fragment the table itself.
- **Postgres — heap tables.** Rows are stored in no particular order in heap pages; **every** index (including the PK) points to a physical location (`ctid`). Index lookups are one tree walk + a heap fetch. Postgres can "index-only scan" when the visibility map shows a page is all-visible.
- **MongoDB WiredTiger** — documents stored in a B-Tree keyed by an internal `RecordId`; the `_id` index is a separate index. **Clustered collections** (5.3+) store documents in `_id` order instead.

Ties back to [Part 02 §5](02-sql-indexes.md) (clustered vs non-clustered).

---

<a name="mvcc"></a>
## 6. MVCC implementations — Postgres vs InnoDB vs WiredTiger

All three keep multiple versions so readers don't block writers ([Part 15 §3](15-mongodb-transactions-and-concurrency.md)), but they store old versions very differently:

| | Postgres | InnoDB | WiredTiger (MongoDB) |
|---|---|---|---|
| On UPDATE | writes a **new row version** into the heap; the old one stays, marked dead after commit (`xmin`/`xmax` transaction ids decide visibility) | updates the row **in place**; the old version goes to the **undo log** | keeps update chains in memory; old versions kept while some snapshot still needs them |
| Old versions cleaned by | **VACUUM** (autovacuum) | **purge** thread | cache eviction / checkpoints |
| Cost of long transactions | dead rows can't be cleaned → **table and index bloat** | undo log ("history list") grows, reads of old snapshots slow down | cache pressure; MongoDB limits transactions to **60s** by default (`transactionLifetimeLimitSeconds`) |
| UPDATE touches indexes? | yes, all indexes, unless it's a **HOT** update (no indexed column changed + room on the same page) | only indexes whose columns changed | — |

---

<a name="vacuum"></a>
## 7. VACUUM, bloat, and long transactions

Because Postgres never overwrites rows, a heavily updated table accumulates **dead tuples**. **VACUUM** marks their space reusable (it doesn't usually shrink the file); **autovacuum** runs it automatically based on how many rows changed.

Things that go wrong:
- **Bloat:** autovacuum can't keep up with update-heavy tables (default thresholds are tuned for small tables) → table and indexes grow far beyond their live data, scans slow down. Fix: tune per-table autovacuum settings; to actually shrink, `VACUUM FULL` (locks the table) or `pg_repack` (online).
- **Long-running transactions block cleanup.** A transaction left open for hours — very often a connection stuck **"idle in transaction"** because the app began a transaction and never committed — holds back the oldest visible snapshot, so VACUUM can't remove *any* dead rows newer than it, database-wide. Guard with `idle_in_transaction_session_timeout`.
- **Transaction ID wraparound:** Postgres transaction IDs are 32-bit; VACUUM must periodically "freeze" old rows. If it can't (blocked, disabled), Postgres eventually refuses writes to protect data — a famous class of outages. Monitor `age(datfrozenxid)`.

The interview-level summary: **Postgres pays for MVCC with VACUUM; InnoDB pays with undo logs; either way, long transactions are expensive.**

---

<a name="interview"></a>
## 8. Interview Questions & Answers

**Q: How does a database guarantee a committed transaction survives a crash?**
A: Write-ahead logging. On commit, the change is appended to a sequential log and fsynced before the client gets "committed"; data pages are written later at checkpoints. After a crash, the database replays the log from the last checkpoint. Sequential log writes are fast, and group commit lets many commits share one fsync.

**Q: Why B+Trees for database indexes?**
A: High fan-out — internal nodes hold only keys, so hundreds of millions of rows fit in 3–4 levels, and the top levels stay cached. Data lives in linked leaves, so range scans and sorted reads walk sideways after one seek.

**Q: B-Tree vs LSM-Tree?**
A: B+Trees update pages in place — predictable fast reads, random-I/O writes. LSM-Trees buffer writes in memory and flush immutable sorted files, compacting in the background — very fast sequential writes, but reads may check several files (Bloom filters help) and compaction costs I/O. B+Tree for read-heavy OLTP, LSM for write-heavy workloads like logs, metrics and messaging.

**Q: Why do random UUID primary keys hurt performance, especially in MySQL?**
A: Inserts land on random B+Tree leaves, so random pages must be loaded into memory and pages split and stay half-full — a bigger index and more I/O. In InnoDB the table is clustered on the PK, so the table itself fragments, and every secondary index stores the PK, so a 16- or 36-byte key bloats all of them.

**Q: What is VACUUM and why does Postgres need it?**
A: Postgres MVCC writes a new row version on every update and leaves the old one as a dead tuple. VACUUM reclaims dead tuples so the space can be reused, and freezes old transaction IDs to prevent wraparound. Without it, tables bloat and eventually the database stops accepting writes.

**Q: Why is a transaction left open for hours a problem?**
A: It holds the oldest snapshot, so the database must keep every row version newer than it — VACUUM can't clean dead rows (Postgres bloat) and the undo log keeps growing (InnoDB). It may also hold locks. Common cause: "idle in transaction" connections; fix with timeouts and making sure every code path commits or rolls back.

**Q: What does "the working set must fit in RAM" mean?**
A: The pages your queries touch regularly — hot data plus index pages — should fit in the buffer pool / WiredTiger cache. Then reads come from memory; when they don't, every query waits on disk and latency jumps sharply.

---

<a name="cheatsheet"></a>
## 9. Cheat Sheet

- Disk I/O is in **pages** (PG 8KB, InnoDB 16KB). Buffer pool / shared_buffers / WiredTiger cache hold hot pages. Working set > cache ⇒ disk-bound.
- **WAL**: append + fsync log on commit, flush pages later, replay after crash. Also the replication stream and PITR source. Group commit. `synchronous_commit=off` trades last-second durability for speed.
- "B-Tree" index = **B+Tree**: 3–4 levels, data in linked leaves → great ranges. Sequential keys append neatly; random keys → page splits + cache misses.
- **LSM**: memtable → SSTables → compaction; fast writes, slower reads (Bloom filters). Cassandra/RocksDB.
- InnoDB = clustered on PK, secondary indexes store the PK. Postgres = heap, indexes point to `ctid`.
- MVCC: PG new tuple + **VACUUM**; InnoDB in place + **undo log**; WiredTiger in-memory versions, 60s txn limit.
- Long / idle-in-transaction sessions ⇒ bloat, undo growth, blocked cleanup. Watch transaction ID wraparound.
