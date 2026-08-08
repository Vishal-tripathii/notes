# Node.js Memory & Streams — Scenario Bank

---

### "What causes Node.js memory leaks? How do you investigate increasing heap usage?"

A memory leak in a garbage-collected language like JS means something is holding a **reference** to memory that should have been freed — the garbage collector only reclaims memory nothing points to anymore, so a leak is really "an accidental, forgotten reference," not memory being lost in the low-level sense.

Common culprits in a Node server:
- **Global variables/caches that grow unbounded** — a plain object or array used as an ad-hoc cache with no eviction (no TTL, no max size) just keeps growing forever.
- **Event listeners never removed** — attaching a listener repeatedly (e.g. on every request) without ever removing it accumulates listeners, each holding references to whatever they closed over.
- **Closures holding onto large objects longer than needed** — a callback stored somewhere long-lived (a timer, an event handler) that closes over a large object keeps that object alive for as long as the callback exists, even if nothing else needs it.
- **Un-cleared `setInterval`/timers** — a timer that's never `clearInterval`'d keeps running (and keeps its closure alive) for the life of the process.

Investigating: take a **heap snapshot** (Node's `--inspect` flag + Chrome DevTools, or a tool like `clinic.js`/`heapdump`) at two points in time under load, and compare — look for object types whose *count* keeps growing between snapshots without ever being collected; that's the leaking type, and tracing its retainers (what's holding a reference to it) usually points straight at the cause.

**Interview line:** *"A leak means something's still holding a reference the garbage collector can't clear — usually an unbounded cache, event listeners that are never removed, or a timer that's never cleared. To investigate I'd take heap snapshots at two points under load and compare object counts — whatever type keeps growing without being collected is the leak, and tracing what's retaining it usually points straight to the cause."*

**Tests:** memory leak causes, heap debugging methodology

*Axis: failure · Source: challenge question*

---

### "What is backpressure in Node streams? How do streams improve memory usage?"

**Streams** process data in **chunks**, as it arrives/is produced, instead of requiring the entire dataset to be loaded into memory at once — reading a 2GB file with `fs.createReadStream()` uses roughly a constant, small amount of memory (one chunk at a time) regardless of the file's actual size, versus `fs.readFile()` which loads the whole thing into memory before you can do anything with it.

**Backpressure** is the problem that shows up when a stream's **producer is faster than its consumer** — e.g. reading a file from fast local disk and writing it to a slow network connection. If the readable side just kept reading as fast as it could regardless of whether the writable side was keeping up, unconsumed chunks would pile up in memory waiting to be written — which defeats the entire memory benefit of using a stream in the first place, and can crash the process under a large enough mismatch.

Node's streams handle this automatically via `.pipe()`: the writable side signals when its internal buffer is full (`write()` returns `false`), and `.pipe()` responds by **pausing** the readable side until the writable side drains and signals it's ready for more — so the pace is naturally governed by the *slower* side, keeping memory usage bounded no matter the size mismatch between producer and consumer speed.

```js
fs.createReadStream('huge-file.txt')
  .pipe(zlib.createGzip())
  .pipe(fs.createWriteStream('huge-file.txt.gz'));
// .pipe() handles backpressure automatically across the whole chain
```

**Interview line:** *"Streams process data in chunks instead of loading everything into memory at once, which keeps memory roughly constant regardless of file size. Backpressure is what happens when the producer is faster than the consumer — without handling it, unconsumed chunks would just pile up in memory, defeating the point of streaming at all. pipe() handles this automatically by pausing the readable side whenever the writable side's buffer is full, so the pace is governed by whichever side is slower."*

**Tests:** streaming, backpressure mechanics

*Axis: performance · Source: challenge question*

---

### "How do you handle large file uploads? Why shouldn't you load a 10 GB file into memory?"

Loading an entire file into memory (buffering the whole request body before processing it) means memory usage scales directly with file size — a 10GB file means (at minimum) 10GB of memory just to hold it, and that's *per concurrent upload*; a handful of large uploads happening at once can exhaust the server's memory and crash the process for every user, not just the ones uploading.

The fix is the same principle as the streams question: **process the upload as a stream of chunks**, never holding the whole file in memory at once —
- Stream the incoming request body directly to its destination (disk, or straight to object storage like S3) chunk by chunk, rather than buffering it fully first.
- For genuinely large files, use **multipart upload** (see [`13-file-storage-systems/`](../13-file-storage-systems/)) — split the file into parts uploaded independently (and potentially in parallel, and resumably if one part fails) directly to storage like S3, so the app server may not even need to see the full file body pass through it at all if using presigned URLs for direct-to-storage upload.
- Enforce a **maximum request size** at the web server/proxy layer regardless, so an unexpectedly huge or malicious upload can't even reach the point of streaming.

**Interview line:** *"Buffering the whole file into memory means memory usage scales directly with file size, and that's per concurrent upload — a few large uploads at once can exhaust server memory for everyone, not just the uploaders. I'd stream the upload in chunks straight to its destination instead of buffering it fully, and for genuinely large files use multipart upload straight to object storage so the app server doesn't even need to hold the full file at all."*

**Tests:** upload handling, streaming vs buffering

*Axis: performance · Source: challenge question*

---

### "How do you gracefully shut down a Node service?"

An ungraceful shutdown (the process just dies immediately on `SIGTERM`) can drop **in-flight requests** mid-response, leave a database transaction half-done, or lose a message that was in the middle of being processed — all real, avoidable failures during something as routine as a deploy.

A graceful shutdown sequence:
1. **Stop accepting new connections** — close the HTTP server's listener (`server.close()`), which lets it finish serving requests it already has but refuses new ones.
2. **Let in-flight requests finish** — wait for currently-active requests/jobs to complete naturally, up to a reasonable timeout.
3. **Close other resources cleanly** — database connection pools, message queue consumers (finish or safely abandon the current message), any open file handles.
4. **Force-exit after a timeout** — if something hasn't finished within a reasonable grace period, exit anyway rather than hanging forever (a deploy/orchestrator like Kubernetes will kill the process forcibly after its own timeout regardless, so it's better to control that yourself first).

```js
process.on('SIGTERM', async () => {
  server.close(() => console.log('HTTP server closed'));  // stop new connections, finish in-flight
  await db.pool.end();                                     // close DB connections
  process.exit(0);
});
```

This connects directly to zero-downtime deployment (category 10/09) — a rolling deploy sends `SIGTERM` to old instances while new ones spin up, and graceful shutdown on the old instance is exactly what prevents that deploy from dropping active requests.

**Interview line:** *"On SIGTERM I stop accepting new connections but let in-flight requests finish, close database and queue connections cleanly, and force-exit after a timeout so it doesn't hang forever if something's stuck. This is what actually makes a rolling deploy safe — without it, a deploy sending SIGTERM to old instances would drop whatever requests happened to be in flight at that moment."*

**Tests:** graceful shutdown, zero-downtime deploys

*Axis: recovery · Source: challenge question*

---
