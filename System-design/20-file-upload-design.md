# System Design Study Notes — Part 20

## File Upload Design (Object Storage, Pre-signed URLs, Chunked Upload, Resume/Retry)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Plain-English mechanics (no code). Kicks off the **Storage phase**.
>
> **Connects:** Part 13/14 (queues for async scan/processing), Part 2.7 (CDN for serving), Part 8 (DB metadata), Part 15 (authorization on download), Part 16 (signed = same idea as JWT).

---

## Table of Contents

1. [Why file upload needs real design](#why)
2. [The core flow + key principle](#flow)
3. [Pre-signed URLs (the key pattern)](#presigned)
4. [What goes into the DB](#db)
5. [Fetching the file back](#fetch)
6. [Chunked / Multipart upload](#chunk)
7. [Tracking, Retry & Resume (the mechanism)](#tracking)
8. [Virus scan & async processing](#scan)
9. [The full architecture](#arch)
10. [Interview Q&A](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="why"></a>
# 1. Why file upload needs real design

Naive approach: browser → your backend → backend forwards to storage.
```
NAIVE:  [Browser] ──5GB file──▶ [Backend] ──5GB file──▶ [Storage]
```
Breaks for anything large:
- Backend holds the whole file in memory/bandwidth → **overwhelmed**.
- Requests **time out** on big/slow uploads.
- One 5GB upload can **tie up a whole server**.
- No resume — a drop at 99% means **restart**. 😫

> Real design solves: *get big files into storage reliably without choking the backend.*

---

<a name="flow"></a>
# 2. The core flow + key principle

```
[Browser] ──▶ [Backend] ──▶ [Object Storage]   (the actual file bytes)
                  │
                  └──▶ [Database]               (metadata about the file)
```

**#1 principle: separate the file from its metadata.**
- **Object Storage** (S3, GCS, Azure Blob) holds the **actual bytes** — cheap, massively scalable, durable.
- **Database** holds **metadata** — filename, size, owner, storage location, status, timestamps. Small and queryable.

> **Never store large files in the database.** Store the file in object storage; keep a *pointer* (storage key) + metadata in the DB.
> Analogy: the DB is a **library catalog card** (title, owner, which shelf); the file is the **book on the shelf** (S3).

---

<a name="presigned"></a>
# 3. Pre-signed URLs (the key pattern)

**Don't route the file through your backend at all.** Let the browser upload **directly to object storage** using a **pre-signed URL**.

**How it's made:** the backend has the AWS credentials; the browser doesn't. The backend takes the request "upload to *this exact spot*," **signs it** with its credentials (a cryptographic seal), and turns it into a URL. Baked into that URL:
- which bucket + exact file location (the "key")
- what action is allowed (upload only)
- an expiry time (e.g. 15 min)
- a signature (the seal)

Because all of that is locked into the signature, nobody can change the file, action, or reuse it after expiry.

> Analogy: a **hotel keycard the backend programs** — opens *one door*, for a *limited time*, then stops working. Backend makes the card; browser just uses it.

**The upload sequence:**
```
1. Browser → Backend: "I want to upload cat.jpg"
2. Backend → S3: make a pre-signed URL (~15 min)
   Backend → DB: record { file: cat.jpg, status: "pending", owner: 42 }
   Backend → Browser: here's the URL
3. Browser → S3 DIRECTLY: uploads the file bytes (never touches the backend!)
4. Browser → Backend: "done!" → DB status: "uploaded"
```

**Why it's brilliant:** the backend only handles small messages (URLs, confirmations), **never the heavy file** → stays fast, scales to whatever S3 handles, and it's secure (URL is signed, scoped, expiring).

> **The #1 interview point:** "I'd use pre-signed URLs so the browser uploads directly to object storage, keeping the backend out of the data path."

---

<a name="db"></a>
# 4. What goes into the DB (on success)

The DB never holds the file — it holds a small record *describing* it:
```json
{
  "id": "file_abc123",
  "owner_id": 42,
  "filename": "cat.jpg",
  "storage_key": "uploads/42/1736800000-cat.jpg",  // ← the POINTER into S3
  "bucket": "my-app-bucket",
  "content_type": "image/jpeg",
  "size_bytes": 2048576,
  "status": "available",     // pending → uploaded → scanning → available
  "created_at": "2026-07-14T12:00:00Z"
}
```
- **`storage_key`** — the pointer that lets you find the bytes later (the "shelf location").
- **`status`** — matters because the moment bytes land in S3, the file may still need scanning; status tells the app whether it's safe to serve.

> Smart touch: on "complete," verify the file really exists in S3 and trust **S3's reported size**, not the client's claim.

---

<a name="fetch"></a>
# 5. Fetching the file back later

Look it up by DB record → get the **storage key** → serve **without** the file passing through your backend. Two cases:
- **Private file** (a document): backend **checks permission** ("is this the owner?" — Part 15), then makes another pre-signed URL — a *download* pass — that also expires. Browser downloads straight from S3.
- **Public file** (profile pic): serve via **CDN** (Part 2.7) so it loads fast near the user.

> One line: **find the DB record → check permission → hand back a temporary download link (private) or CDN link (public).**

---

<a name="chunk"></a>
# 6. Chunked / Multipart upload (for large files)

A 5GB file as one blob is fragile — one blip = restart 5GB. Solution: **cut it into small pieces** (e.g. 5MB each → 1000 pieces) and upload them separately. S3 calls this **multipart upload**, in three stages:

1. **Start** — tell S3 "big file coming in pieces." S3 returns one **Upload ID** — a single ticket that ties all pieces together. Save it.
2. **Upload the pieces** — each piece has a **part number** (1, 2, 3…). Upload each; for every piece it stores, **S3 returns a receipt called an ETag** (a fingerprint of that piece).
3. **Finish** — send S3 the full list of pieces + receipts; it **assembles them in order** into the final file.

**Benefits:** parallel uploads (faster) · independent retry (redo one piece, not 5GB) · enables resume.

---

<a name="tracking"></a>
# 7. Tracking, Retry & Resume (the mechanism)

## The right mental model: a checklist, NOT a progress bar
There's **no single "how far did we get" number.** Tracking is a **list of all pieces, each with its own tick box** — ✅ done (has a receipt) or ⬜ not done (no receipt).

For 1000 pieces where **200 and 999 failed**:
```
Part 1    ✅ receipt "aaa"
...
Part 199  ✅
Part 200  ⬜ (no receipt)   ← failed
Part 201  ✅
...
Part 998  ✅
Part 999  ⬜ (no receipt)   ← failed
Part 1000 ✅
```
Scattered failures don't matter — each piece stands on its own.

## How a box gets ticked
**A piece is marked done only when it uploads successfully AND S3 returns the receipt (ETag).**
- Success → receipt recorded → ✅.
- Failure → **no receipt comes back → nothing recorded → box stays ⬜.**
> So "failed" needs no active detection — a failed piece is simply one with **no receipt**. The *absence* of a receipt IS the "missing" flag.

## How you find what's missing
Compare **"all pieces (1–1000)"** against **"pieces that have a receipt."** The difference is what's missing:
```
Should exist:  { 1 ... 1000 }
Have receipts: { 1..199, 201..998, 1000 }
Missing = { 200, 999 }   → re-upload only these
```

## Where the ledger lives (two sources of truth)
- **Ask S3** — it remembers every part received for your Upload ID; missing parts simply aren't in its list.
- **Your own DB** — save each `{part number, receipt}` as it succeeds; check your list.
> S3 is the ultimate authority (it holds the bytes); the DB is a convenient local copy.

## Retry
Each piece is independent → a failed piece is just **re-uploaded on its own** (same part number, fresh URL, get its receipt). The other pieces are untouched. Never restart the whole file. (Often with exponential backoff — Part 13.)

## Resume
Interrupted at piece 400 (or scattered failures)? On reconnect, get the "done" list (from S3 or DB), compute the missing pieces, and **upload only those.** Then finish.

## Full scenario (200 & 999 failed)
```
1. Upload 1000 pieces (often several in parallel).
2. 200 & 999 fail → no receipt → not recorded. Other 998 → recorded.
3. Resume: all = 1..1000, done = all except 200 & 999 → missing = {200, 999}.
4. Re-upload ONLY 200 & 999 → they get receipts → recorded.
5. All 1000 have receipts → tell S3 "assemble" → final 5GB file. 🎉
```
> **Why robust:** scattered failures, any order, parallel uploads — all fine, because every piece is tracked independently. S3 won't assemble until *all* part numbers have receipts, so you can't finish with a missing piece.

---

<a name="scan"></a>
# 8. Virus scan & async processing

Once bytes land in storage, don't serve immediately — it could be malware. Process **asynchronously** (Part 13/14 queues):
```
Uploaded to S3 ──▶ message ──▶ [Queue] ──▶ [Scanner Worker]
   status: "scanning"                        clean ✅ → status "available"
                                             infected ❌ → delete + flag
```
- File sits in **quarantine** (not downloadable) until scanned.
- Same pattern for **thumbnails, transcoding, compression** — async workers pulling from a queue (like Part 14's image/video processing).

> Keep the upload fast; defer scanning/processing to background workers.

---

<a name="arch"></a>
# 9. The full architecture

```
INITIATE:  Browser → Backend: "5GB file, 1000 chunks"
           Backend → S3: start multipart → Upload ID
           Backend → DB: session { UploadId, total: 1000, done: [] }
           Backend → Browser: { UploadId, fileId }

UPLOAD:    per chunk:
             Browser → Backend: "URL for part N"
             Backend → Browser: pre-signed part URL
             Browser → S3: upload chunk → gets receipt (ETag)
             Browser → Backend: "part N done, receipt=..." → DB records it
           (fail → retry that part; disconnect → resume missing parts)

COMPLETE:  Browser → Backend: "all done"
           Backend → S3: assemble parts
           Backend → DB: status "uploaded" → queue virus scan → "available"

FETCH:     Browser → Backend: "download fileId"
           Backend → DB: look up storage_key, check permission
           Backend → Browser: pre-signed GET URL (private) or CDN URL (public)
```
Every piece you've learned shows up: object storage, DB metadata, queues, CDN, signed URLs.

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: "How would you design file upload?"
> *"The key principle is separating the file from its metadata. The file goes to object storage like S3; the database stores only metadata — filename, size, owner, storage key, status. Crucially, I'd use pre-signed URLs so the browser uploads directly to object storage instead of routing bytes through my backend — the backend just issues the signed URL and tracks metadata, so it stays fast. For large files I'd use chunked multipart upload with retry and resume, and run virus scanning and thumbnailing asynchronously via a queue before marking the file available."*

### Q: "How do you upload a 5GB file?"
> *"Chunked multipart upload. I split it into small pieces, maybe 5–10MB each, uploaded in parallel directly to S3 via pre-signed URLs. It's faster from parallelism and resilient — if a piece fails I retry just that piece instead of the whole 5GB. S3 reassembles the pieces once all arrive. I'd never route a 5GB file through the backend."*

### Q: "How do you handle a failed or interrupted upload and resume it?"
> *"Each piece is tracked independently — a piece is only marked done when it uploads and returns a receipt, an ETag. To resume, I compare all expected pieces against the ones that have receipts, either by asking S3 or checking my own DB, and upload only the missing pieces. Scattered failures don't matter because it's a checklist of independent pieces, not a single progress point. Individual failures are just retried on their own."*

### Q: "Why pre-signed URLs instead of uploading through your server?"
> *"To keep file bytes out of the backend. If every upload flows through the server, big files exhaust memory and bandwidth and cause timeouts, and one upload can tie up a server. A pre-signed URL lets the browser upload directly to object storage — the backend only generates a short-lived signed URL scoped to one file and records metadata. More scalable, still secure because it expires and is limited to that one upload."*

### Q: "Where do you store the file — database or object storage?"
> *"Object storage for the file — cheap, durable, scales to huge sizes; databases aren't built for large blobs. The DB stores only metadata and a pointer to the storage location. So the DB answers 'what files does this user have?' and object storage serves the bytes, usually via a CDN."*

### Q: "How do you prevent malicious uploads?"
> *"Layers: validate file type and size before issuing the URL; the URL is scoped and expiring. After upload, the file stays quarantined while an async virus scan runs via a queue — only if clean do I mark it available. And I serve files through a CDN rather than exposing storage directly."*

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

### Core principle
- **Separate file from metadata:** file → **object storage** (S3); metadata + pointer → **DB**.
- DB = catalog card (points to the shelf); file = the book (on the shelf).

### Pre-signed URL
- Backend signs a request → browser uploads/downloads **directly to S3**, bypassing the backend.
- Scoped to one file + action, time-limited, signed. Like a **programmed hotel keycard**.
- Keeps the backend out of the data path → fast, scalable, secure.

### DB record contains
owner · filename · **storage_key (pointer)** · content-type · size · **status** (pending→uploaded→scanning→available) · timestamps. *Never the bytes.*

### Fetch back
Look up record → check permission (Part 15) → pre-signed GET URL (private) or CDN URL (public).

### Chunked / multipart (large files)
1. **Start** → S3 gives one **Upload ID**. 2. **Upload pieces** → each returns a **receipt (ETag)**. 3. **Finish** → send full list → S3 assembles.

### Tracking / retry / resume
- Tracking = **checklist of independent pieces**, each ✅ (has receipt) or ⬜ (none). NOT a progress bar.
- Failed piece = **no receipt recorded** → box stays empty (absence = "missing").
- **Missing** = all pieces − pieces-with-receipts (works for any scattered failures).
- **Retry** = re-upload one piece. **Resume** = upload only missing pieces, then finish.
- Ledger lives in S3 (authority) and/or your DB.

### Async processing
Virus scan / thumbnails via a **queue** (Part 13/14); file quarantined until "available".

### Connects to
- Part 2.7: CDN (serving). · Part 8: DB metadata. · Part 13/14: queues (scan/process). · Part 15: download authorization. · Part 16: signing (same idea).

### Suggested next (storage phase)
- **Object vs block vs file storage**.
- **Design Google Drive / Dropbox** (builds on this).
- **Full system design walkthrough**.

*— End of Part 20 —*
