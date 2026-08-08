# Design Problem 12 — Dropbox / Google Drive

> Worked end-to-end using the Master Framework (../00-DESIGN-PROBLEM-FRAMEWORK.md). Applies Parts 20, 21, 10. Signature challenge: chunking + deduplication + multi-device sync with conflict resolution.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: chunking + dedup](#core)
5. [Sync protocol](#sync)
6. [Conflict resolution](#conflict)
7. [Database](#db)
8. [Storage](#storage)
9. [Scaling](#scaling)
10. [Full architecture](#arch)
11. [Interview Q&A](#interview)
12. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. Upload / download files.
2. Sync a file's latest state across **all of a user's devices** automatically.
3. Share a file/folder with other users (read or edit access).
4. Handle **offline edits** — a device edits a file with no connection, then reconciles once it's back online.

**Non-functional:**
- **Consistency-leaning, not pure availability** — a user should never silently lose data; conflicting edits must be surfaced, not dropped.
- **Low bandwidth** — never re-upload a whole file for a 1-line edit.
- **Storage-efficient at scale** — millions of users, many uploading identical files (same PDF, same install package).
- **Durable** — files must survive server/disk failure (replication).
- Sync should feel near-real-time on the active devices, but doesn't need sub-100ms (unlike a chat message).

> Not read-heavy like a URL shortener — it's **write-heavy on metadata, bandwidth-heavy on bytes.** The interesting problems are *storage efficiency* and *staying consistent across N devices*, not raw QPS.

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume 50M users, avg 10 GB stored/user, avg file 1MB (many much smaller, chunked).
- **Total raw storage:** 50M × 10GB = **500 PB** ← before dedup.
- **Dedup savings:** studies suggest 30–50% of stored bytes across a big user base are duplicate chunks (shared installers, common docs, stock media) → **realistic effective storage: ~300 PB.**
- **Chunk size:** ~4MB average chunk → a 10GB library ≈ **2,500 chunks/user**.
- **Sync writes/sec:** 50M users, ~5% active concurrently editing → 2.5M active × 1 sync event/min ≈ **~40K sync events/sec** hitting metadata service (bursty, not evenly spread).
- **Bandwidth:** average active user syncs ~50MB/day → 2.5M active × 50MB ÷ 86400s ≈ **~1.4 GB/s** aggregate upload+download.

> Two very different problems live here: a **huge but cheap** object-storage problem (bytes), and a **smaller but latency-sensitive** metadata problem (which chunks changed, for which file, for which device).

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
POST /files/{fileId}/chunks
Body: { "chunkHash": "sha256:...", "data": <bytes> }
→ 201 (or 409 "already exists, skip" — dedup short-circuit)

GET /files/{fileId}?version=latest
→ 200 { "fileId", "version", "chunkManifest": ["hash1","hash2",...], "modifiedAt" }

GET /sync/changes?since={syncToken}&deviceId={id}
→ 200 { "changes": [ {fileId, version, chunkManifest, action: "modified"|"deleted"} ], "newSyncToken": "..." }
```
- Chunk upload is content-addressed (Part 20-style pre-signed direct-to-storage pattern) — the metadata service never touches raw bytes, just hashes.
- `since=syncToken` is the **delta sync** contract — no client ever asks "give me everything," only "give me what changed."

---

<a name="core"></a>
# 4. Core: chunking + dedup 🎯

## Why not just upload the whole file on every edit?
A 500MB video with one metadata tweak, or a 50-page doc with one typo fixed, shouldn't cost a 500MB re-upload. **Split every file into chunks, hash each chunk, and only transfer/store chunks the server doesn't already have.**

## Fixed-size chunking (naive)
Cut the file every N bytes (e.g. every 4MB).
- ❌ **The shifting problem:** insert **one byte** at the start of a file → every chunk boundary downstream shifts by one byte → every single chunk hash changes → the whole file looks 100% different even though 99.9% of the bytes are unchanged. Terrible for edits.

## Content-defined chunking (CDC) ✅
Instead of cutting at fixed byte offsets, slide a **rolling hash** (e.g. a Rabin fingerprint) over the byte stream and cut a chunk boundary whenever the rolling hash matches a pattern (e.g. "last 13 bits are all zero" → average chunk size ~4MB, but the *exact* boundary is decided by local content, not a global offset counter).
- The rolling hash lets you compute "does this window's fingerprint match the cut pattern" in O(1) as you slide byte-by-byte, without re-hashing the whole window each step.
- **Why it survives edits:** insert a byte near the start → the rolling hash naturally finds the *next* matching boundary shortly after the insertion point, and **every chunk after that point is byte-identical to before** → same hashes → most of the file dedupes against what's already stored. Only the chunk(s) actually touched by the edit need re-upload.
```
Fixed-size:  [4MB][4MB][4MB][4MB]  → insert 1 byte → [4MB][4MB][4MB][4MB][4MB]  (ALL shifted, all new hashes)
CDC:         [3.8MB][4.2MB][4MB]  → insert 1 byte → [3.8MB+1B][4.2MB][4MB]     (only the touched chunk changes)
```

## Global (cross-user) deduplication
Chunks are stored **content-addressed** — the chunk's storage key *is* its hash (e.g. SHA-256). So:
- User A uploads `report.pdf` → chunks hash to `[h1, h2, h3]` → server has none of them → stores all 3, 12MB written.
- User B uploads the **exact same** `report.pdf` (forwarded email attachment, shared template, etc.) → chunks hash to the same `[h1, h2, h3]` → server already has all 3 → **stores 0 new bytes**, just adds a manifest entry pointing B's file at the existing chunks.
- This works **across the entire user base**, not just within one user's own history — a popular installer or stock video gets stored **once**, referenced by millions.
- Each chunk keeps a **reference count**; a chunk is only physically deleted from storage once its ref count hits zero (last file referencing it is deleted).

> **Interview one-liner:** *"Content-defined chunking with a rolling hash finds edit-independent boundaries so a small edit only re-chunks the touched region; content-addressed storage means identical chunks — even across different users — are hashed to the same key and physically stored once."*

---

<a name="sync"></a>
# 5. Sync protocol

Each **device** (not user) tracks a **sync cursor / version token** — an opaque marker for "the last state I've seen."

```
Device A edits file.txt locally
   → uploads changed chunks + new manifest
   → server bumps file's global version, appends a change-log entry
   → server's change log: [..., {fileId, version: 42, changedChunks: [h9], ts}]

Device B (idle) → polls or gets pushed: "since your last syncToken=41, here's what changed"
   → sees version 42 entry for file.txt
   → downloads only chunk h9 (the ones it doesn't already have)
   → reassembles file.txt locally, updates its own syncToken to 42
```

- **Long-poll or push (websocket/notification)** for "something changed, go fetch the delta" — avoids naive constant polling, but the *delta fetch itself* is still a simple cursor-based `GET /sync/changes?since=token` call (Part 11 cursor pagination pattern, applied to change events instead of a list).
- Each device stores its **own** cursor — that's what makes "3 devices, 2 online, 1 offline for a week" work: each catches up independently from wherever it left off.
- The **change log is append-only** per file/account, which is what makes "give me everything since token X" a cheap indexed range query instead of a full diff.

---

<a name="conflict"></a>
# 6. Conflict resolution

**The hard case:** Device A and Device B both go offline, both edit the **same file**, both come back online.

### Option A: Last-Write-Wins (LWW)
Whichever device's write reaches the server last simply overwrites the other.
- ✅ Simple, no user-facing complexity.
- ❌ **Silent data loss** — the loser's edits vanish with no trace. Unacceptable for a product whose entire value proposition is "your files are safe."

### Option B: Versioning / branching
Keep both edits, let the user reconcile — this is what Dropbox (and Drive, OneDrive) actually do:
```
1. Server already has file.txt @ version 40 (uploaded by A while B was offline).
2. B reconnects, tries to push its edit based on version 39 (stale — server has moved to 40).
3. Server detects the version mismatch (B's base version ≠ current version) → REJECTS the blind overwrite.
4. Server keeps A's version as file.txt (the "winner" by arrival order),
   and saves B's version as a sibling: "file (Bob's conflicted copy 2026-08-09).txt"
5. Both versions exist on disk. The user sees both and manually merges/deletes.
```
- This is essentially **optimistic concurrency control**: every write carries "the version I based this edit on"; the server accepts only if that still matches current state, otherwise it's a conflict, not a blind merge.
- **Trade-off being made:** favors **never losing data** over a clean single-file result — the cost is a slightly messier "why do I have two files" moment for the user, which is far better than silently eating an edit.
- Full version history (not just the latest + one conflict copy) is kept per file for a retention window, so a user can also roll back to any prior version — this reuses the same manifest-per-version model, just append instead of overwrite.

> **Interview one-liner:** *"I'd avoid last-write-wins because it silently discards data. Instead, every client write includes the version it was based on; if the server's current version has moved on, it's a conflict — I keep the server's version as canonical and save the incoming one as a conflicted copy, so nothing is ever lost and the user resolves it."*

---

<a name="db"></a>
# 7. Database *(Part 10)*

Two related entities: **file version** and **chunk manifest** — a classic **one-to-many** (Part 10): one file version has many chunks, each chunk row points back to one file version.

```
FILES
┌────────┬─────────┬────────┬──────────────┬───────────┐
│ fileId │ ownerId │ name   │ currentVer   │ deletedAt │
└────────┴─────────┴────────┴──────────────┴───────────┘

FILE_VERSIONS                                  (one file → many versions)
┌───────────┬────────┬─────────┬────────────┬────────────┐
│ versionId │ fileId │ version │ createdBy   │ createdAt  │
└───────────┴────────┴─────────┴────────────┴────────────┘

VERSION_CHUNKS  (manifest — the ordered chunk list per version)  (one version → many chunks)
┌───────────┬────────────┬───────────┬─────────────┐
│ versionId │ chunkHash  │ sequence  │ ...         │
└───────────┴────────────┴───────────┴─────────────┘

CHUNKS  (global, content-addressed — this is where dedup lives)
┌───────────┬────────────┬──────────┬───────────┐
│ chunkHash(PK) │ sizeBytes │ storageKey │ refCount │
└───────────┴────────────┴──────────┴───────────┘
```
- `FILES → FILE_VERSIONS` and `FILE_VERSIONS → VERSION_CHUNKS` are both **1:N** (Part 10) — foreign key on the "many" side each time.
- `CHUNKS` is the **shared, deduplicated pool** — many different `VERSION_CHUNKS` rows (across many files, many users) can point at the same `chunkHash`. This is exactly the "reference, don't embed" call from Part 10: chunks are large, shared across unrelated parents, and change independently of any one file → **reference**, never duplicate the chunk itself.
- **Devices/sync cursors table:** `deviceId, userId, lastSyncToken` — small, hot, indexed on `userId`.
- SQL (Postgres) fits fine here — this is relational, transactional (version bump + manifest insert must be atomic), and not pure key-value like the URL shortener.

---

<a name="storage"></a>
# 8. Storage *(Part 20)*

- **Chunks live in object storage** (S3/GCS), **never in the database** — same "separate bytes from metadata" principle as Part 20's file-upload design.
- **Content-addressed:** the storage key *is* the chunk's hash (`chunks/ab/cd/abcd1234...`) — this is what makes global dedup free: uploading a chunk is really "does this key already exist? if yes, skip." No separate dedup index needed; the hash *is* the lookup.
- Clients get **pre-signed URLs** (Part 20) to upload/download chunks directly, bypassing the app servers for the heavy bytes — the metadata/sync service only ever handles small JSON (manifests, hashes, tokens).
- **Garbage collection:** when a chunk's `refCount` drops to 0 (last file/version referencing it is deleted and out of the retention window), a background job reclaims the storage.

---

<a name="scaling"></a>
# 9. Scaling *(Part 21)*

- **Metadata DB:** shard by `userId` (or `fileId`) — a user's files/versions/manifests are naturally co-located, keeping most queries single-shard. Read replicas absorb "list my files" traffic.
- **Chunk storage:** object storage scales horizontally by design (S3-style) — shard key is effectively the hash itself, so load spreads evenly (hash prefixes distribute uniformly, unlike sequential IDs).
- **Sync/change-log service:** the append-only per-account change log is the hot path for "what changed since token X" — index on `(accountId, version)` so delta queries are a cheap range scan, not a full table scan.
- **Fan-out to devices:** a user with 5 devices means 1 write → up to 5 devices need notifying. Push via a lightweight notification (Part 13/14 style — "something changed, go pull") rather than pushing the actual bytes, so fan-out stays cheap regardless of file size.
- **CDN (Part 2.7):** for public/shared-link downloads of popular files, front object storage with a CDN.

---

<a name="arch"></a>
# 10. Full architecture

```
[Client Devices ×N]
   │  small JSON: manifests, hashes, sync tokens
[Load Balancer] → [Stateless App/Sync Servers]
   │                         │
   │                  [Metadata DB: Files / Versions / Manifests / Chunks(refCount)]
   │                  sharded by userId, replicated (Part 21)
   │
   └── pre-signed URLs ──▶ [Object Storage: content-addressed chunks]  ← global dedup lives here
                                   │
                            [CDN]  (shared-link downloads)

Sync: each device polls/subscribes to /sync/changes?since=token
      → server computes delta from append-only change log
      → device fetches only missing chunks, reassembles file

Conflict path: write includes base version → mismatch → keep server's version,
               store incoming as "conflicted copy", both preserved.
```

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: "How would you avoid re-uploading a whole file on every small edit?"
> *"Split files into chunks and only transfer chunks the server doesn't already have. I'd use content-defined chunking with a rolling hash rather than fixed-size chunks — fixed-size chunking means a single inserted byte shifts every downstream boundary and changes every chunk's hash, so a tiny edit looks like a whole new file. A rolling hash picks boundaries based on local content, so an edit only disturbs the chunk(s) actually touched, and everything after the next natural boundary stays byte-identical and dedupes against what's already stored."*

### Q: "How does deduplication save storage across different users?"
> *"Chunks are stored content-addressed — the chunk's storage key is its hash. If two different users upload the same file, or even just a shared chunk within different files, both hash to the same key, so the second upload is a no-op: I just add a manifest entry pointing at the existing chunk and bump its reference count. That dedup happens globally, not just per-user, which is where the real storage savings come from at scale — one copy of a popular file, referenced by millions."*

### Q: "How does sync work across a user's multiple devices?"
> *"Each device tracks its own sync cursor — an opaque version token for the last state it's seen. Changes are recorded in an append-only change log per account. A device asks 'give me everything since token X,' gets a delta of changed files and chunk manifests, fetches only the missing chunks, and updates its cursor. Because each device has its own cursor, a device that's been offline for a week just catches up from wherever it left off — no special-casing needed."*

### Q: "Two devices edit the same file offline, then both reconnect — what happens?"
> *"I don't do last-write-wins, because that silently discards one user's edits. Every write carries the version it was based on. The server only accepts it if that still matches the current version; if the server has moved on, it's a conflict. I keep the server's current version as the file, and save the incoming edit as a conflicted copy — same pattern Dropbox actually uses. Nothing is lost, and the user resolves the conflict manually, which is a much safer trade-off than a clean-looking merge that quietly threw away data."*

### Q: "Why not put file bytes in the database?"
> *"Same reasoning as any file-upload design — the database should hold metadata and pointers, not large blobs. Chunks go in object storage, content-addressed by hash, and the metadata service only ever deals with small JSON: manifests, hashes, and sync tokens. Clients get pre-signed URLs to upload/download chunks directly from storage, so the heavy bytes never pass through my app servers."*

---

<a name="cheatsheet"></a>
# 12. Cheat Sheet

- **Shape:** write/bandwidth-heavy on bytes, moderate-write on metadata; consistency over blind availability (never silently lose edits).
- **Estimate:** ~500PB raw / ~300PB after dedup for 50M users × 10GB; ~40K sync events/s; ~1.4GB/s aggregate bandwidth.
- **Core:** content-defined chunking (rolling hash, edit-independent boundaries) beats fixed-size (one insert shifts every boundary). Content-addressed storage → free global dedup across all users.
- **Sync:** per-device cursor/version token + append-only change log → cheap delta fetch (`since=token`), each device catches up independently.
- **Conflict:** never LWW. Optimistic concurrency (write includes base version) → mismatch = conflict → keep server version, save incoming as conflicted copy, both preserved.
- **DB:** Files → Versions → VersionChunks (all 1:N, Part 10) referencing a global, deduped Chunks table (refCount for GC).
- **Storage:** chunks in object storage, content-addressed by hash, pre-signed URLs, CDN for shared links (Part 20).
- **Scale:** shard metadata by userId; object storage scales by hash naturally; fan-out to devices via lightweight "go pull" notifications, not pushing bytes.

*— Design Problem 12 complete —*
