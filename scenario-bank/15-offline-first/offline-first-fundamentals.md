# Offline-First & Distributed Client Systems — Scenario Bank

> Queueing/retrying offline mutations and preventing duplicated mutations use the same mechanisms as [`01-distributed-systems-reliability/resilience-patterns.md`](../01-distributed-systems-reliability/resilience-patterns.md) (retries/backoff) and [`message-delivery-guarantees.md`](../01-distributed-systems-reliability/message-delivery-guarantees.md) (idempotent consumers) — cross-linked below rather than re-derived.

---

### "What does offline-first mean? How do you synchronize local and server state?"

**Offline-first** means the app is designed so it's **fully usable without a network connection at all** — not just tolerant of a connection drop, but built around the assumption that "connected" is a temporary, sometimes-true state rather than the default. The app reads and writes to a **local database** on the device first (so every interaction is instant, regardless of connectivity), and synchronization with the server happens **separately**, in the background, whenever a connection is actually available — the user's interaction with the app is never blocked waiting on a network round trip.

This is a fundamentally different architecture from "normal" online apps, not just an added retry layer: the local database is the thing the UI actually reads and writes; the server is a sync target the local database reconciles with, not the primary source the UI talks to directly on every action.

**Synchronization**, at a high level, is a two-way process: **push** (send local changes made while offline up to the server, once connected) and **pull** (fetch changes other devices/users made on the server down to the local database). A sync engine typically tracks, per record, whether it has unsynced local changes, and a timestamp/version marking the last successfully synced state, so it knows exactly what needs to go in each direction on the next sync — rather than re-syncing everything from scratch every time.

**Interview line:** *"Offline-first means the app is fully usable with no network at all, not just tolerant of a drop — every interaction reads and writes to a local database first, so nothing is ever blocked on a network round trip, and synchronization with the server happens separately in the background whenever connectivity is actually available. Sync itself is two-way: pushing local changes made while offline, and pulling changes made elsewhere, tracked per record so each sync only moves what's actually changed rather than reconciling everything from scratch."*

**Tests:** offline-first architecture, local-first design

*Axis: normal · Source: challenge question*

---

### "What happens when the same record is modified offline by two users? How do you resolve conflicts? Last-write-wins vs conflict-free approaches?"

Two users, both offline (or on different devices), both modify the **same record** independently — neither knows about the other's change at the time they make it. When both eventually sync, the server has to decide what "the record" actually is now, since it received two different, both-locally-valid versions.

**Last-write-wins (LWW)** — the simplest resolution: whichever change has the later timestamp becomes the accepted version; the other is discarded. Simple to implement, but it **silently loses data** — the losing user's change just vanishes, with no indication anything was overwritten, and (as covered in category 01) it's also vulnerable to clock skew between devices making "later timestamp" not actually mean "happened later in real time."

**Field-level merge** — instead of picking one version wholesale, merge at the level of individual fields: if User A changed the `title` and User B changed the `status`, both changes can coexist in the merged result, since they didn't actually touch the same field. Only a **true** conflict — both users changed the *same* field to different values — needs further resolution. This recovers far more of both users' work than LWW, at the cost of real implementation complexity (the merge logic has to understand the data's structure, not just treat it as an opaque blob).

**CRDTs (Conflict-free Replicated Data Types)** — data structures specifically designed so that merging two independently-modified versions is **mathematically guaranteed** to produce a consistent result without needing custom merge logic per data type — the classic example is a counter that supports "increment by N" as an operation (rather than storing a raw value), so two offline increments from two different devices merge by just summing, with no possible conflict at all. Powerful, but only fits data shapes that map to an existing CRDT type (counters, sets, certain text-editing structures) — not a universal solution for arbitrary application data.

**When conflicts genuinely can't be auto-resolved** — surface it to the user explicitly ("this record was also edited by someone else — keep yours, keep theirs, or merge?") rather than silently picking one, especially for anything where losing data unnoticed would be a real problem.

**Interview line:** *"Last-write-wins is the simplest resolution but it silently discards the losing change, and it's also sensitive to clock skew between devices. I'd prefer field-level merge where possible — if two users changed different fields, both changes survive, and only an actual same-field conflict needs further resolution. For data shapes that fit — counters, sets — CRDTs give a mathematically conflict-free merge with no custom logic needed at all. And for anything that genuinely can't be auto-resolved safely, I'd surface it to the user explicitly rather than silently picking a winner and losing their work without telling them."*

**Tests:** conflict resolution strategies, CRDTs, data loss prevention

*Axis: consistency · Source: challenge question*

---

### "How do you queue offline mutations? How do you retry synchronization? How do you guarantee offline mutations aren't duplicated?"

**Queueing** — every mutation made while offline (or while a sync attempt is in flight) gets appended to a **persistent local queue** (stored in the local database itself, not just in memory — it has to survive the app being closed and reopened before the next successful sync) rather than being attempted immediately and lost if it fails. Each queued mutation typically carries enough information to be applied later: what changed, on which record, and when.

**Retrying** — once connectivity returns, the queue is drained in order, sending each mutation to the server — this is the exact same retry-with-backoff discipline as [`01-distributed-systems-reliability/resilience-patterns.md`](../01-distributed-systems-reliability/resilience-patterns.md): a failed sync attempt (network drops again mid-sync) should back off and retry rather than immediately hammering the server, and a mutation that keeps failing after reasonable retries needs a path to surface that to the user rather than silently stalling the whole queue behind it forever (the same poison-message concern as category 01/05).

**Preventing duplication** — this is the exact idempotency problem from category 01, applied to offline sync specifically: if a sync request succeeds server-side but the response is lost (the connection drops right after), the client doesn't know it succeeded and will retry — without protection, that retry creates a duplicate. Each queued mutation should carry a **unique, client-generated ID** (assigned when the mutation was created, while offline — not regenerated on retry), sent to the server as the effective idempotency key, so the server can recognize "I've already applied this exact mutation" and skip reapplying it on a retried sync.

**Interview line:** *"Offline mutations go into a persistent local queue — stored in the local database, not memory, so it survives the app closing before the next sync — and get drained with the same retry-with-backoff discipline as any other retried operation once connectivity returns. Duplication is the same idempotency problem as any retried write: each mutation gets a unique ID generated at creation time, offline, which travels with it through every retry as the idempotency key, so if a sync succeeded server-side but the confirmation was lost, the retry is recognized and skipped rather than reapplied."*

**Tests:** offline mutation queueing, idempotent sync

*Axis: failure · Source: challenge question*

---

### "What happens if the app crashes during synchronization?"

Depends entirely on **what state the sync process was in** and whether that state was durable at the moment of the crash — the design question is making sure a crash can't leave things in a state worse than "hadn't started syncing yet":

- **If the local queue itself is only updated *after* a mutation is confirmed synced** (not before, not during) — a crash mid-sync just means that mutation is still sitting in the queue as "not yet synced," exactly as it was before the sync attempt started; on next launch, sync simply resumes from there. This is the safe design.
- **The dangerous version**: if the app optimistically marks a mutation as "synced" *before* actually receiving server confirmation, and crashes in that gap — the mutation is now incorrectly believed to be synced and will never be retried, silently losing that change. The fix is ordering: only mark something as synced **after** the server has actually confirmed it, never before or during.
- **Idempotency (above) covers the adjacent case** — if the crash happens *after* the server actually received and applied the mutation, but *before* the client recorded that success locally, the client will (correctly) retry it on next launch, and the server-side idempotency key ensures that retry doesn't duplicate the effect.

The overarching principle: treat sync progress itself with the same durability/ordering discipline as any other crash-safety problem (category 01/07) — the local "have I synced this yet" state has to be updated in a way that a crash at *any* point leaves you either "definitely not synced yet, will retry" or "definitely synced," never a state that's ambiguous or incorrectly optimistic.

**Interview line:** *"The key design rule is that a mutation should only be marked synced after the server actually confirms it, never before or during — that way a crash at any point in the process leaves it in one of two safe states: still queued and will retry, or genuinely already synced. The dangerous version is marking something synced optimistically before confirmation and then crashing in that gap, which silently loses the change since it'll never be retried. And if the crash happens right after the server actually received it but before the client recorded that locally, that's exactly what the idempotency key on retry protects against."*

**Tests:** crash safety during sync, ordering discipline

*Axis: recovery · Source: challenge question*

---

### "How do you handle schema migrations for local databases?"

This is genuinely harder than a server-side migration (category 03/10) in one specific way: a server-side migration runs **once**, against one database, at a time you control. A local database migration has to run on **every individual user's device**, at whatever version their app happens to be, whenever they next open it — potentially skipping several versions if they haven't updated in a while, and there's no way to coordinate or force it to happen at a convenient time.

- **Versioned, sequential migrations** — each local schema version has an explicit migration script to get from the *previous* version to it; on app launch, the app checks the local database's current schema version and runs every migration script needed to bring it up to the current version, in order — so a user jumping from version 3 to version 8 runs migrations 4→5→6→7→8 in sequence, not one big jump.
- **Migrations must be robust to partial/interrupted execution** — the app could be killed mid-migration (a phone running out of battery, the OS killing the app); migrations should be structured (often within a local transaction, if the local database supports it) so an interrupted migration doesn't leave the local database in a broken, half-migrated state — either the whole migration applies, or none of it does, and it's safely retryable on next launch.
- **Never assume the server and every client are on the same schema version at the same time** — because clients update at different rates, the sync protocol between client and server has to tolerate talking to clients on a range of schema versions simultaneously, similar in spirit to the backward-compatibility discipline in category 10, but now across potentially very old client versions that haven't updated in months.

**Interview line:** *"Unlike a server migration that runs once under my control, a local migration has to run on every individual device, at whatever version it happens to be, whenever the user next opens the app — potentially skipping several versions. So I use versioned, sequential migration scripts that run in order to catch a device up from wherever it is, structured so an interrupted migration — the app getting killed mid-migration — doesn't leave the local database half-migrated, and is safely retryable. And since clients update at different rates, the sync protocol itself has to tolerate talking to clients on a range of schema versions at once, not assume everyone's current."*

**Tests:** client-side migration challenges, version skew

*Axis: failure · Source: challenge question*

---

### "How do you detect connectivity changes?"

Most platforms expose a native signal for this — the browser's `navigator.onLine` and `online`/`offline` events, or the equivalent native APIs on mobile (`NetInfo` in React Native, `Connectivity` APIs natively) — which the app listens to in order to trigger behavior: pause active sync attempts when connectivity drops, and **immediately** kick off a sync attempt (rather than waiting for the next scheduled/periodic check) the moment connectivity is detected as restored, so queued mutations don't sit around longer than necessary once a connection is actually available again.

The important caveat: `navigator.onLine`/equivalent generally reports whether the device has a **network connection**, not whether it can actually **reach your specific server** — a device can be "online" (connected to Wi-Fi) while the Wi-Fi's internet uplink is down, or your specific server is unreachable while everything else works fine. For that reason, a real production implementation usually treats the OS-level signal as a **hint** to attempt a sync, not proof that sync will succeed — the actual sync attempt itself still needs its own timeout/retry/backoff handling (category 01) for the case where the device *thinks* it's online but the actual sync request still fails.

**Interview line:** *"I use the platform's native connectivity signal — online/offline events in the browser, the equivalent native API on mobile — to trigger pausing sync when connectivity drops and immediately attempting sync the moment it's restored, rather than waiting for a periodic check. But I treat that signal as a hint to try, not a guarantee it'll succeed — a device can report 'online' while it genuinely can't reach my specific server, so the actual sync attempt still needs its own timeout and retry handling regardless of what the connectivity API reported."*

**Tests:** connectivity detection, its limitations

*Axis: normal · Source: challenge question*

---

### "How do you prevent stale local data from overwriting newer server data?"

The dangerous direction of the sync conflict problem: a device was offline for a while, comes back online, and tries to **push** its local version of a record — but the server's version has since been updated (by another device, another user, a server-side process) more recently than the local device's last known state. Pushing the local version wholesale would silently regress the record back to older data, undoing whatever changed on the server in the meantime.

The fix requires the client to know **what it last synced**, not just what it currently has locally — each record's local copy should carry the version/timestamp it was last synced *from* (not just when it was locally modified). On push, the client sends both its new local value **and** the version it was based on; the server compares that against its own current version for the record:

- If the server's current version **matches** what the client last synced from — the client's change is based on the latest known state, so it's safe to apply directly.
- If the server's version has **moved on** since the client last synced — the client's change was made against stale data, and this is now a genuine conflict (same shape as the earlier conflict-resolution question) that needs merging or explicit resolution, not a blind overwrite.

This is exactly optimistic-locking's version-check mechanism (category 01/03), applied across the client-server sync boundary instead of within a single database.

**Interview line:** *"The client needs to know what version it last synced from, not just what it currently has locally. On push, it sends its new value along with the version it was based on, and the server compares that against its own current version for the record — if they match, the client was working from the latest state and the push is safe; if the server has moved on since, that's a genuine conflict that needs resolution, not a blind overwrite. It's the same optimistic-locking version-check as within a single database, just applied across the sync boundary instead."*

**Tests:** stale write prevention, optimistic concurrency across sync

*Axis: consistency · Source: challenge question*

---
