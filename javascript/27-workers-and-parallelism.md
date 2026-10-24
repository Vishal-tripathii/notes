# JavaScript Study Notes — Part 27

## Workers & Parallelism — Web Worker, Service Worker, Worker Threads, Cluster, Child Process ⭐⭐⭐⭐☆

**Topics:** why each one exists · Web Worker (`postMessage`/`onmessage`, transferable objects) · Service Worker (install/activate/fetch lifecycle, caching strategies, offline) · where Node's `worker_threads`/`cluster`/`child_process` fit in the same picture.

> **Continues from:** [Part 10 — Event Loop & Concurrency Model](10-event-loop-and-concurrency-model.md) (why JS is single-threaded and what that costs) and [Part 20 — Browser APIs](20-browser-apis.md). Node's three escape hatches are covered in full depth in [nodejs/02-nodejs-internals.md §6-9](../nodejs/02-nodejs-internals.md#workers) — this file doesn't re-derive that, it places all five mechanisms side by side so it's clear which runtime each belongs to and when to reach for which.

---

## 1. The Big Picture ⭐

Five different tools solve five different versions of "one thread isn't enough" — and the first split that matters is **which runtime you're even in**:

```
BROWSER                              NODE.JS
────────                             ───────
Web Worker      → CPU work           worker_threads → CPU work
Service Worker  → network proxy      cluster         → scale across cores
                                      child_process   → run anything, any process
```

| | **Web Worker** | **Service Worker** | **`worker_threads`** | **`cluster`** | **`child_process`** |
|---|---|---|---|---|---|
| Runtime | Browser | Browser | Node | Node | Node (or any OS process) |
| What it is | A background JS thread | A network proxy + background thread | A background JS thread | N copies of your whole app | A separate OS process |
| Lives where | Same page/tab, own global scope | Between page and network, origin-wide | Same Node process | Separate Node process | Separate process, any program |
| Memory | Own heap, no DOM access | Own heap, no DOM access | Own heap (unless `SharedArrayBuffer`) | Own heap (separate process) | Own heap (separate process) |
| Talks via | `postMessage` / `onmessage` | `fetch` event interception + `postMessage` | `postMessage` / `parentPort` | IPC (shared listen port) | IPC / stdin-stdout |
| Solves | UI thread frozen by CPU work | Offline access, caching, push notifications | Event loop frozen by CPU work | Low throughput on multi-core boxes | Isolation, running non-JS programs |
| Typical cost | ~a few ms to spin up | Runs once, persists across page loads | ~2-10 MB, ~10-40ms startup | ~30-50 MB per copy | ~30-50 MB+ per process |
| Dies when | Tab closes / `.terminate()` | Independent of any open tab | `.terminate()` / process exits | Primary process exits | Explicitly killed / exits |

**The one-line version:** Web Worker and `worker_threads` solve the *identical* problem (CPU work freezing the one JS thread) in two different runtimes — same shape, different environment. Service Worker solves a completely different problem (the browser has no offline/caching story by default). Cluster and child_process are Node-only, solving "scale across cores" and "isolate/run something that isn't even JS" respectively.

---

## 2. Web Workers ⭐⭐⭐⭐

> **Definition:** a real OS thread the browser gives your page, running a **separate JS file** with its own global scope — no `window`, no `document`, no shared variables. It communicates with the main thread only by **passing messages**, which is what makes it safe: there's no shared mutable state to race on.

> **Analogy 👥** — same as Node's `worker_threads`: hiring a colleague at a desk in the next room. You hand them work by photocopying it and passing it through the door (`postMessage`), not by letting them dig through your filing cabinet.

### Why it exists
JavaScript in the browser runs on **one thread**, and that thread also does layout, paint, and responds to clicks. A heavy synchronous computation — parsing a huge JSON blob, image manipulation, a crypto hash, a big sort — **freezes the entire page**: no scrolling, no clicking, no repaint, until it finishes. A Web Worker moves that computation off the main thread so the UI stays responsive.

### Basic usage

```js
// main.js
const worker = new Worker('worker.js');

worker.postMessage({ cmd: 'crunch', data: bigArray });   // send work
worker.onmessage = (e) => {
  console.log('result:', e.data);                          // receive result
};
worker.onerror = (e) => console.error('worker crashed:', e.message);

// later, when done with it
worker.terminate();
```

```js
// worker.js — runs in its own global scope, NOT the same as main.js's
self.onmessage = (e) => {
  const { cmd, data } = e.data;
  if (cmd === 'crunch') {
    const result = data.reduce((sum, n) => sum + heavyCompute(n), 0);
    self.postMessage(result);
  }
};
```

### What a worker can't do
No `document`, no `window`, no DOM access, no `localStorage` (it *can* use `indexedDB`, `fetch`, and `WebSocket` though). This is a deliberate restriction, not a limitation to work around — DOM objects aren't thread-safe, so letting a worker touch them would reintroduce the exact race conditions the isolation is meant to prevent.

### Data is copied, not shared — with an escape hatch
By default, every `postMessage` **structured-clones** the data — deep-copies it. Sending a 200MB array copies all 200MB.

```js
// SharedArrayBuffer — actual shared memory between main thread and worker
const sab = new SharedArrayBuffer(1024);
const view = new Int32Array(sab);
worker.postMessage(sab);   // no copy — both threads see the same underlying memory
// ⚠️ shared memory reintroduces race conditions — needs Atomics for safe coordination
```

```js
// Transferable objects — ownership moves, zero-copy, but the sender loses access
const buffer = new ArrayBuffer(1024 * 1024 * 50); // 50MB
worker.postMessage(buffer, [buffer]);   // second arg: transfer list
console.log(buffer.byteLength); // 0 — main thread no longer owns it
```

### Dedicated vs Shared Worker
- **Dedicated Worker** (`new Worker(...)`) — one-to-one with the page that created it. The version above.
- **SharedWorker** — one instance shared across **multiple tabs/windows of the same origin**, useful for coordinating state (e.g. a single WebSocket connection shared by 10 open tabs instead of 10 separate ones). Communicates via `.port.postMessage` instead of directly, since multiple callers are involved.

```js
// main.js (in any tab)
const worker = new SharedWorker('shared-worker.js');
worker.port.start();
worker.port.postMessage('hello');
worker.port.onmessage = (e) => console.log(e.data);
```

**Use for:** image/video processing, large data parsing/transforms, client-side encryption, heavy computation (physics, ML inference) — anything CPU-bound that would otherwise cause janky scrolling or an unresponsive UI.

**Interview line:** *"A Web Worker is the browser's version of Node's worker_threads — a real thread with its own global scope and no DOM access, communicating only via postMessage so there's no shared state to race on. Data is deep-copied by default; SharedArrayBuffer gives true shared memory when you need it, and transferable objects give zero-copy handoff for large binary data at the cost of the sender losing access to it."*

---

## 3. Service Workers ⭐⭐⭐⭐⭐

> **Definition:** a special worker that sits **between your page and the network**, registered once per origin (not per tab), that can intercept every `fetch` request the page makes and decide how to respond — from cache, from network, or a mix of both. It's the mechanism behind offline-capable web apps (PWAs) and push notifications.

> **Analogy 📮** — a mail sorting office between you and the postal service. Every letter (request) you send passes through it first; it can hand you a copy from its own archive (cache) instead of waiting for the real reply, or forward it and archive the reply for next time.

### Why it's a fundamentally different tool than a Web Worker
A Web Worker solves *"CPU work is freezing my page."* A Service Worker solves a problem Web Workers don't touch at all: **the browser has no built-in offline story** — lose network, and a normal page just fails. Service Worker fixes that by giving JavaScript control over the network layer itself.

### The lifecycle — this is the part that actually gets asked about
```
register → install → activate → idle/fetch (repeats) → (new SW waits) → activate (replaces old)
```

```js
// main.js — registration (page-side)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('SW registered', reg.scope))
    .catch(err => console.error('SW registration failed', err));
}
```

```js
// sw.js — the service worker itself
const CACHE_NAME = 'app-v3';                 // ⚠️ bump this on every deploy — see gotcha below
const PRECACHE_URLS = ['/', '/index.html', '/app.css', '/app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  // self.skipWaiting();  // uncomment to activate immediately instead of waiting for old tabs to close
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))) // evict stale caches
    )
  );
  // self.clients.claim(); // take control of already-open pages immediately
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))  // cache-first
  );
});
```

### Caching strategies — pick per resource type, not one for the whole app

| Strategy | How it works | Use for |
|---|---|---|
| **Cache-first** | Serve from cache; only hit network on a cache miss | Static assets (JS/CSS/fonts/images) — content that changes only on deploy |
| **Network-first** | Try network; fall back to cache on failure | API calls where freshness matters but offline should still show *something* |
| **Stale-while-revalidate** | Serve from cache immediately, fetch in background to update cache for *next* time | Content that should feel instant but shouldn't go stale forever (feeds, dashboards) |
| **Network-only / Cache-only** | No fallback either direction | Analytics pings (network-only) / app-shell files that never change (cache-only) |

```js
// stale-while-revalidate, concretely
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request).then(res => {
        cache.put(event.request, res.clone());   // update cache for next time
        return res;
      });
      return cached || networkFetch;               // instant if cached, otherwise wait once
    })
  );
});
```

### The gotcha everyone hits: stale deploys
Because a Service Worker can persist **indefinitely** and serve cached files even while the network is fine, forgetting to invalidate old caches on deploy means users keep seeing an old version of your app forever — the browser never re-fetches `index.html` because the Service Worker is answering from cache instead of asking the network. This is why `CACHE_NAME` gets versioned and old cache keys get deleted in `activate` above, and why `skipWaiting()`/`clients.claim()` exist — without them, a newly-installed Service Worker sits **waiting** until every open tab of the old version closes before it takes over.

### Also handles push notifications
```js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body })
  );
});
```
This works **even when no tab is open** — the Service Worker is registered at the origin level, independent of any page, which is exactly what makes background push possible.

**Use for:** offline-first PWAs, instant repeat-load performance via caching, background sync, push notifications. (Angular ships `@angular/service-worker` as a config-driven wrapper around most of this — see [Angular's PWA notes] if that's covered elsewhere in this repo.)

**Interview line:** *"A Service Worker isn't about CPU work at all — it's a network proxy registered per-origin that can intercept fetch and answer from cache, giving the app offline support and instant repeat loads. The lifecycle is install → activate → fetch, and the classic bug is forgetting to version the cache name on deploy, which leaves users stuck on a stale cached version since the Service Worker answers from cache before the browser ever asks the network."*

---

## 4. Node's Side — `worker_threads`, `cluster`, `child_process`

The deepest dive on these three — with an analogy for each, a full decision table, and 10 interview Q&As — lives in **[nodejs/02-nodejs-internals.md §6-9](../nodejs/02-nodejs-internals.md#workers)**. What follows is the same three mechanisms with working snippets, kept here so this file is self-contained for comparing all five side by side.

### 4.1 `worker_threads` — Web Worker's exact counterpart inside Node

> **Definition:** a real OS thread **inside the same Node process**, each with its own JS engine instance (own event loop, own memory) — isolated by default, communicating via `postMessage`, with `SharedArrayBuffer` available if you deliberately want shared memory. Same shape as a Web Worker; different API names.

```js
// server.js
const { Worker } = require('worker_threads');

app.get('/report', (req, res) => {
  const w = new Worker('./heavy.js', { workerData: { id: req.user.id } });
  w.on('message', result => res.json(result));       // main event loop stays free ✅
  w.on('error', e => res.status(500).json({ error: e.message }));
});
```

```js
// heavy.js
const { parentPort, workerData } = require('worker_threads');
parentPort.postMessage(crunchNumbers(workerData));    // blocks THIS thread only, not the server
```

**Threads/CPU:** one extra OS thread per worker, ~2-10 MB each, ~10-40ms to spin up — don't create one per request, use a worker pool (`piscina` is the standard). Workers still share the process's 4-thread `libuv` pool for `fs`/`crypto` work, so several workers doing file I/O still compete for the same four threads.

**Use for:** PDF generation, image/video processing, big data transforms, ML inference — anything CPU-bound you want off the main thread without spawning a whole separate process.

### 4.2 `cluster` — scale throughput across CPU cores

> **Definition:** forks **N full copies of your entire app** — one per CPU core — all listening on the same port, with the OS/Node load-balancing incoming connections round-robin across them. Not about one heavy task; about using every core for a single-threaded server.

```js
const cluster = require('cluster');
const os = require('os');

if (cluster.isPrimary) {
  for (let i = 0; i < os.cpus().length; i++) cluster.fork();
  cluster.on('exit', () => cluster.fork());    // auto-restart a dead worker ✅
} else {
  require('./server');                          // each worker runs the full app
}
```

**Threads/CPU:** each worker is a **separate OS process** (~30-50 MB), not a thread — full core utilization, but zero shared memory. That means in-memory sessions/caches break (a user's requests can land on different workers), so state has to live in Redis, and WebSockets need sticky sessions or a Redis adapter.

**Use for:** a multi-core box where the bottleneck is aggregate throughput, not one slow task. In practice most teams reach for PM2 (`pm2 start app.js -i max`) or N containers under an orchestrator instead of hand-rolling `cluster`.

### 4.3 `child_process` — run anything, any program, full isolation

> **Definition:** spawns a genuinely **separate OS process** with its own memory space entirely — no shared memory, communication only via IPC/stdout/stdin. Can run **any executable**, not just Node/JS. Heavier to start than a worker thread, but a crash in the child can't take down the parent.

```js
const { fork, spawn, exec } = require('child_process');

// fork — spawns a Node child, IPC channel built in, use for a background Node task
const child = fork('./task.js');
child.send({ cmd: 'start' });
child.on('message', msg => console.log('from child:', msg));

// spawn — stream-based, good for large output (build tools, video/image processing)
const ffmpeg = spawn('ffmpeg', ['-i', 'input.mp4', 'output.avi']);
ffmpeg.stdout.on('data', chunk => console.log(chunk.toString()));

// exec — buffers all output in memory, convenient for short commands with small output
exec('git rev-parse HEAD', (err, stdout) => console.log(stdout.trim()));
```

**Threads/CPU:** a full separate process (~30-50 MB+), the heaviest of the three to spawn — but the only one that can run a non-Node program (ffmpeg, a Python script, ImageMagick, a shell command).

**Use for:** running any external program, or a background Node task that needs true crash isolation from the parent. Note `cluster.fork()` is actually built on top of `child_process.fork()`, adding the port-sharing machinery on top.

---

## 5. Decision Guide ⭐

```
Browser, page frozen by CPU work           → Web Worker
Browser, need offline / caching / push     → Service Worker
Node, one CPU-heavy task blocking the loop → worker_threads
Node, need more throughput across cores    → cluster
Node, need to run a non-JS program         → child_process
```

They compose: a Service Worker can itself spin up nothing extra (it *is* the background thread), but a Node server behind it can run `cluster` across cores with a `worker_threads` pool inside each for CPU spikes — the same layered pattern as [nodejs/02-nodejs-internals.md §9](../nodejs/02-nodejs-internals.md#decision).

### The question that actually decides it: **does the work need a program that isn't JS?**

That single question splits `worker_threads` from `child_process` more reliably than "is this CPU-heavy" alone — CPU-heavy is true of both.

```
CPU-heavy, pure JS, stays inside Node   → worker_threads
CPU-heavy, needs an external binary     → child_process
```

### Worked examples

| Scenario | Tool | Why |
|---|---|---|
| Parsing/validating a large Excel or CSV upload (`xlsx`/`csv-parse`, row-by-row schema checks) | **`worker_threads`** | Reading the file is I/O (fine on the main thread already); the parsing loop + validation logic is synchronous CPU work in pure JS with no external program — exactly what freezes the event loop if left on the main thread. |
| Transcoding/compressing a video (`mp4` → `webm`, resizing resolution) | **`child_process`** | The actual work happens in **ffmpeg**, a separate binary — not because it's "video," but because it's not JS. Node just spawns it and streams the result back. |
| Resizing/optimizing images with `sharp` | **Neither, usually** | `sharp` wraps a native library (`libvips`) and runs its heavy work on its own internal thread pool already — calling it from the main thread is fine; wrapping it in `worker_threads` yourself is often redundant. Check whether a "heavy" npm package already threads itself before reaching for `worker_threads`. |
| Generating a PDF report from JSON using a pure-JS library (e.g. `pdfkit`) | **`worker_threads`** | CPU-bound, but the whole computation stays inside Node/JS — same shape as the Excel case. |
| Running a Python ML inference script, or any non-Node tool | **`child_process`** | Not JS at all — `worker_threads` can only run JS. |
| Serving more requests/sec on an 8-core box because the app is I/O-light but volume is high | **`cluster`** | Not one heavy task — the bottleneck is using all 8 cores for a single-threaded server. |
| `bcrypt` password hashing on login | **Neither** | Already offloaded to Node's own libuv thread pool internally (see [nodejs/02-nodejs-internals.md §3](../nodejs/02-nodejs-internals.md#pool)) — the risk here is pool *exhaustion* under concurrent logins, not the main thread blocking. |

---

## 6. Interview Questions & Answers

### Q1. What's the actual difference between a Web Worker and a Service Worker?
> "They solve unrelated problems that just happen to both be called 'worker.' A Web Worker is about **compute** — moving CPU-heavy JS off the main thread so the UI doesn't freeze. A Service Worker is about **network** — sitting between the page and the network to enable caching, offline support, and push notifications. A Web Worker dies with the tab; a Service Worker persists at the origin level independent of any open tab."

### Q2. Why can't a Web Worker touch the DOM?
> "DOM objects aren't thread-safe. If a worker could mutate the DOM directly, you'd get the exact race conditions threading in JS is designed to avoid — two threads racing to update the same node. Instead everything goes through `postMessage`, which forces communication through a safe, serialized channel."

### Q3. Your PWA users report seeing an old version of the app after you deployed a fix. What's happening?
> "Classic stale Service Worker cache. The old Service Worker is still active and answering `fetch` from its cached `index.html`/JS bundle instead of ever asking the network, because the cache name wasn't versioned on deploy so the browser has no reason to treat it as stale. Fix is bumping the cache name each deploy, deleting old cache keys in `activate`, and using `skipWaiting()`/`clients.claim()` if you want the new version to take over immediately instead of waiting for every open tab to close."

### Q4. When would you choose `SharedArrayBuffer` over plain `postMessage` with a Web Worker?
> "Only when the copy cost of `postMessage`'s structured clone is actually the bottleneck — large buffers being sent back and forth repeatedly, like audio/video processing or a physics simulation. It trades that copy cost for real shared memory, which means you're back to needing explicit synchronization (`Atomics`) to avoid races — so I wouldn't reach for it by default, only when profiling shows the copying itself is the problem."

### Q5. Is a Web Worker the same underlying mechanism as Node's `worker_threads`?
> "Same *idea* — an OS thread with its own isolated JS engine instance, communicating by message passing instead of shared memory — but different runtimes and different APIs (`self.postMessage` vs `parentPort.postMessage`). They exist because the same problem — one JS thread freezing under CPU work — shows up in both the browser and Node, and both platforms solved it the same way: give JS a thread that starts with nothing shared."

---

## Cheat Sheet

```
BROWSER                                   NODE
────────                                  ─────
Web Worker      = compute, per-tab        worker_threads = compute, per-process
Service Worker  = network proxy,          cluster         = scale across cores
                  origin-wide, persists   child_process   = any program, full isolation

Both Web Worker & worker_threads: own memory, postMessage only, no shared state by default
SharedArrayBuffer / transferable objects: the escape hatches when copying is the bottleneck
Service Worker lifecycle: install → activate → fetch (repeats)
⚠️ Service Worker + no cache versioning → users stuck on stale deploys forever
```
