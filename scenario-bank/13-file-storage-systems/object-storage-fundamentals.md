# Object Storage & File Handling — Scenario Bank

---

### "Object storage vs filesystem? Why use S3 instead of storing files in the database?"

A **filesystem** (or storing a file blob directly in a database column) organizes data as a hierarchy of directories and files, with strong consistency and typically fast local access — but it's tied to **one machine's disk**, doesn't scale storage capacity independently of compute, and isn't built for durability across hardware failure without you engineering that yourself (RAID, backups, replication).

**Object storage** (S3, GCS, Azure Blob) stores each file as an **object** — a blob of data plus metadata, addressed by a key, in a **flat namespace** (no real directory hierarchy, just key prefixes that *look* like paths) — accessed over HTTP(S), not a local filesystem API. What it buys you: essentially unlimited storage capacity that scales independently of any application server, extremely high durability by design (S3's advertised 11 nines comes from automatically replicating every object across multiple facilities), and it's decoupled from your application servers entirely — they can scale, restart, or be replaced without any relationship to where the actual file data lives.

**Why not just store files in the database:** a database is optimized for structured, queryable, relatively small records — storing large binary blobs in it bloats the database's size and backup time, competes for the same resources (memory, I/O) that your actual query workload needs, and is a fundamentally more expensive way to store what's really just "a big file" compared to object storage, which is purpose-built and priced for exactly that. The right pattern is almost always: store the **file itself** in object storage, and store just a **reference** (the object's key/URL) plus metadata (filename, size, upload date) in the database.

**Interview line:** *"Object storage trades filesystem-style hierarchy and strong local consistency for massive independent scalability, extremely high durability through automatic replication, and full decoupling from application servers. I wouldn't store files directly in the database because it bloats the database's size and backup time and competes for resources the actual query workload needs — the right split is the file itself in object storage, and just a reference plus metadata in the database."*

**Tests:** storage architecture trade-offs, database vs object storage

*Axis: normal · Source: challenge question*

---

### "How do presigned URLs work?"

A presigned URL is a normal object-storage URL with a **cryptographic signature and expiry embedded in the query string**, generated server-side using the storage credentials, that grants **temporary, scoped access** to a specific operation (usually upload or download of one specific object) — **without** the client ever holding the actual storage credentials, and without every file transfer having to physically pass through your application server at all.

The typical upload flow: the client asks your API "I want to upload a file" → your server (which *does* hold real storage credentials) generates a presigned `PUT` URL for a specific key, valid for a short window (a few minutes) → the client uploads the file **directly to S3** using that URL, completely bypassing your application server for the actual (potentially large) data transfer → the client tells your API the upload finished, and your API records the reference in the database.

```js
// server-side: generate a temporary, scoped upload URL — no real credentials given to the client
const url = await s3.getSignedUrl('putObject', {
  Bucket: 'uploads', Key: `user-123/${fileId}`, Expires: 300, // valid 5 minutes
});
// client uploads directly to `url` via a PUT request — never touches your app server
```

Why this matters: it avoids routing potentially huge file transfers through your own application server (which would tie up its resources per upload, exactly the large-file-upload memory concern from category 07), while still keeping access controlled and time-boxed rather than making the bucket or specific objects permanently public.

**Interview line:** *"A presigned URL is a normal storage URL with a signature and expiry baked into it, generated server-side with real credentials, that grants temporary scoped access to one specific object operation without the client ever holding actual credentials. The upload flow is: client asks my API for a presigned URL, uploads directly to S3 with it — completely bypassing my application server for the actual data transfer — then tells my API it's done so I can record the reference. That keeps large file transfers off my app server's resources entirely, while still keeping access time-boxed and scoped rather than making anything permanently public."*

**Tests:** presigned URLs, direct-to-storage upload pattern

*Axis: normal · Source: challenge question*

---

### "How do you upload a 10 GB file? Multipart upload?"

A single HTTP `PUT` for a 10GB file is fragile — any network blip partway through means the *entire* transfer fails and has to restart from byte zero, and it holds one long-lived connection open the whole time. **Multipart upload** splits the file into smaller parts (commonly 5-100MB each), uploads each part as an **independent** HTTP request, and only "completes" the object once all parts are confirmed received — S3 then assembles them into the final object server-side.

What this buys you, beyond just handling large files at all:
- **Parallelism** — multiple parts can upload concurrently, which can dramatically speed up the overall transfer versus one serial stream.
- **Resilience** — if one part's upload fails (network blip), only *that part* needs to be retried, not the entire 10GB file.
- **Resumability** (next question) — an interrupted upload can pick up from wherever it left off, part-wise, rather than restarting from zero.

This composes directly with presigned URLs: the server can generate a separate presigned URL *per part*, so even the individual part uploads go directly client-to-S3, never touching the application server, keeping the earlier memory/streaming concern (category 07) fully avoided even at 10GB scale.

**Interview line:** *"For anything large, I'd use multipart upload — split the file into independent parts, each uploaded as its own request, assembled into the final object only once every part is confirmed. That gives parallelism for speed, and resilience, since a failed part only needs that one part retried, not the whole 10GB file. I'd generate a presigned URL per part too, so even the individual part uploads go straight from the client to S3 without ever passing through my application server."*

**Tests:** multipart upload mechanics, large file handling

*Axis: performance · Source: challenge question*

---

### "How do you resume failed uploads?"

Built directly on multipart upload: since the file is already split into independently-tracked parts, resuming means **querying which parts have already been successfully received** and only (re-)uploading the parts that are missing or failed — not restarting the whole transfer from the beginning.

The mechanics: the storage service (S3) tracks which part numbers have been received for a given in-progress multipart upload session; the client (or your API, coordinating it) can query that list, compare it against the full set of parts the file needs, and resume by uploading only the gap. This needs the client to persist enough state to resume across a real interruption — the multipart upload's ID and which parts it already confirmed — surviving a page refresh, an app restart, or a lost connection, not just an in-memory variable that dies with the tab.

**Interview line:** *"Because the file is already split into independently-tracked parts for a multipart upload, resuming just means asking the storage service which parts have already been received and only uploading what's missing — not restarting the whole file from zero. The piece that has to be deliberately handled is persisting enough state — the upload session ID and which parts succeeded — somewhere that survives an actual interruption, like local storage or a backend record, not just an in-memory variable that dies with a page refresh."*

**Tests:** resumable uploads, state persistence across interruption

*Axis: recovery · Source: challenge question*

---

### "How do you prevent unauthorized downloads?"

The naive failure mode is a publicly-readable bucket/object, or a predictable URL scheme (sequential or guessable object keys) that lets anyone who finds/guesses one URL access files they shouldn't. Layers of defense:

- **Keep the bucket/objects private by default** — not publicly readable at all; every access goes through an explicit authorization check.
- **Presigned URLs for time-boxed, scoped access** (same mechanism as upload) — generate a short-lived, signed download URL only after verifying, server-side, that *this specific user* is actually allowed to access *this specific object* — the URL itself expires shortly after, so even if it leaks (forwarded, cached, logged somewhere) it stops working soon.
- **Unpredictable object keys** — a UUID-based key (not a sequential ID, not the original filename) means there's nothing to guess even if someone tries enumerating URLs — this is defense-in-depth, not a substitute for actual authorization, but it closes off a cheap attack.
- **Authorization check on every access request**, not just at upload time — verify the requesting user actually has permission for this specific object each time a download URL is requested, the same resource-level authorization discipline as any other API (category 02).

**Interview line:** *"Objects are private by default, never publicly readable. Every download goes through my API first, which checks whether this specific user is actually authorized for this specific object, and only then generates a short-lived presigned URL — so even a leaked URL stops working soon. I'd also use unpredictable, UUID-based object keys rather than sequential IDs or original filenames, as defense in depth against someone just guessing URLs, though that's never a substitute for the actual authorization check."*

**Tests:** access control for object storage, defense in depth

*Axis: failure · Source: challenge question*

---

### "How do you version objects? How do you handle deleted objects?"

**Object versioning** (a built-in S3 feature, and the general pattern elsewhere) means that overwriting or deleting an object doesn't destroy the previous version — instead, each write creates a **new version**, and all versions are retained (until explicitly cleaned up), with the storage system tracking "current version" for normal reads while still letting you retrieve or restore any prior version by its version ID. This protects against accidental overwrites and accidental deletes being unrecoverable — a real, common need (someone overwrote a file with the wrong content, or deleted something that turns out to still be needed).

**Handling deletion, specifically:** with versioning enabled, a "delete" doesn't actually erase data immediately — it typically adds a **delete marker** as the new "current version," which makes the object appear gone from normal listing/access, while the actual prior version(s) are still recoverable by explicitly requesting them (undoing an accidental delete is then just removing the delete marker). True, permanent removal is usually a separate, deliberate step — either an explicit permanent-delete of specific old versions, or a **lifecycle policy** that automatically expires versions older than some retention period, balancing "protected against accidents" against "don't retain everything forever at growing storage cost."

**Interview line:** *"With versioning on, an overwrite or delete doesn't destroy the previous version — a delete specifically adds a delete marker as the new current version, which makes the object look gone from normal access while the actual data is still recoverable by explicitly requesting the prior version. That protects against accidental overwrites and deletes being unrecoverable. Permanent removal is a separate, deliberate step, usually a lifecycle policy that expires old versions after a retention period, so I'm not paying to retain everything forever by default."*

**Tests:** object versioning, soft-delete pattern for storage

*Axis: recovery · Source: challenge question*

---

### "How do you design image/video processing pipelines? What happens if processing fails halfway through?"

The design shape: **upload → queue a processing job → process asynchronously → store the result → notify/update status** — never process synchronously inline with the upload request itself, since transcoding a video or generating multiple image sizes is exactly the kind of slow, CPU-heavy work that shouldn't block a request-response cycle (category 07/02's `202 Accepted` pattern applies directly here).

1. Client uploads the raw file (via presigned URL, straight to storage, as above).
2. Upload completion triggers a job onto a queue (either the client notifies the API, or a storage event — S3 can natively trigger a notification on object creation — kicks off the pipeline automatically, which is more robust since it doesn't depend on the client's notification actually arriving).
3. A worker picks up the job, processes it (resize, transcode, generate thumbnails), and writes results to storage.
4. Status is tracked explicitly (e.g. a `status` field: `uploaded → processing → completed/failed`) so the client/API can know where a given file is in the pipeline.

**If processing fails halfway through** (a multi-step pipeline — e.g. generate a thumbnail, then transcode to three video resolutions, and step 2 fails after step 1 succeeded): this is the same partial-failure/idempotent-retry shape as category 01 — track **per-step** status rather than one blanket "processing" flag, so a retry can resume from the failed step instead of redoing (and potentially double-billing/double-processing) the steps that already succeeded. The job should be safe to retry (idempotent — re-running a step that already produced output should overwrite/replace cleanly, not create a duplicate), and after enough failed attempts, move to a dead-letter state (category 01/05) for manual investigation rather than retrying forever, with the status visibly reflecting `failed` rather than silently stuck at `processing`.

**Interview line:** *"Never process inline with the upload — upload triggers a queued job, processed asynchronously by a worker, with explicit status tracked so the client can see where it is in the pipeline. For a multi-step pipeline, I track status per step, not just one overall flag, so a failure partway through can resume from the failed step instead of redoing — and potentially double-processing — steps that already succeeded. Each step needs to be safe to retry, and after enough failures it moves to a clearly-failed state for investigation instead of retrying forever or getting silently stuck."*

**Tests:** async processing pipeline design, partial failure handling

*Axis: failure · Source: challenge question*

---
