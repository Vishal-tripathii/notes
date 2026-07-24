# Node.js Study Notes — Part 2

## Node Internals — V8, libuv, Thread Pool, Workers, Cluster & Child Processes

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Continues from:** [Part 1 — Execution Model](01-javascript-execution-model.md) (event loop, queues, single-thread model) and [Part 1.2 — Blocking & Real-World Load](01.2-event-loop-blocking-and-real-world-load.md). This part covers **what Node is built out of**, and the three ways to escape the single thread.
>
> **Level:** practical, not machine-level. What changes a decision or answers an interview question — not compiler internals.

---

## Table of Contents

1. [V8 Engine](#v8)
2. [libuv](#libuv)
3. [Thread Pool](#pool)
4. [Event Loop Phases](#phases)
5. [Non-blocking I/O](#nonblocking)
6. [Worker Threads](#workers)
7. [Cluster](#cluster)
8. [Child Processes](#child)
9. [Workers vs Cluster vs Child Process — the decision](#decision) ⭐
10. [Interview Questions & Answers](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="v8"></a>
# 1. V8 Engine

**What it is:** the part of Node that runs your JavaScript and manages your memory. That's all. It knows nothing about files, networks, or timers — those are libuv's job.

```
   NODE  =  V8 (runs your JavaScript)  +  libuv (does the waiting and the I/O)
```

Two things about V8 actually affect you:

### ① Node's memory ceiling is V8's, not your machine's
The default heap is **~2 GB**, even on a 64 GB server. Load a 3 GB file into an array and you crash with `JavaScript heap out of memory` while `free -h` shows plenty of RAM free.

```bash
node --max-old-space-size=4096 app.js    # raise the ceiling to 4GB
```

### ② Garbage collection runs on your main thread ⭐
This is the one that matters operationally: **GC pauses block the event loop, exactly like any other CPU work.**

So a memory leak's first symptom isn't running out of RAM — it's **latency getting spiky**. The heap grows → GC has more to scan → pauses get longer and more frequent → p99 climbs. The crash comes much later.

> **Signature to recognize:** spiky p99 latency + a steadily climbing heap = a leak, well before any OOM.

---

<a name="libuv"></a>
# 2. libuv

**What it is:** the C library that does everything V8 doesn't — the event loop, file I/O, networking, timers, and the thread pool. It's also why Node behaves the same on Linux, macOS, and Windows.

> **Analogy 📦 — V8 is the chef, libuv is the entire restaurant operation.** The chef only cooks. Someone else takes orders, tracks which tables are waiting, and rings the bell when food is ready. The chef never leaves the kitchen to go shopping — that would stop all cooking.

**The one thing to remember:** libuv handles slow work in **two completely different ways**. Confusing them is the most common Node misconception.

```
  NETWORK  (http, sockets, DB queries)  ──▶  handed to the OS      ──▶ 0 threads  ⭐
  FILES / CRYPTO / ZLIB                 ──▶  handed to the THREAD POOL (4 threads)
```

---

<a name="pool"></a>
# 3. Thread Pool

**4 threads by default**, shared by the entire process.

> **Analogy 🏢 — four back-office clerks.** The receptionist (event loop) never leaves the desk. Paperwork goes into a tray for four clerks in the back room. Four jobs run at once; the fifth waits for a clerk to free up. If all four are stuck on hour-long jobs, even a 2-second task sits in the tray.

| Uses the pool ✅ | Doesn't — goes to the OS ❌ |
|---|---|
| `fs.*` — all file operations | HTTP / HTTPS requests |
| `crypto.pbkdf2`, `scrypt`, **bcrypt** | TCP sockets, **DB queries** |
| `zlib` — gzip / compression | `setTimeout`, `setImmediate` |
| `dns.lookup()` ⚠️ | `dns.resolve()` |

> ⚠️ **The `dns.lookup` trap:** `http.request` calls it implicitly to resolve hostnames, and it uses the pool. Under heavy outbound traffic, DNS resolution alone can eat all four threads.

```bash
UV_THREADPOOL_SIZE=16 node app.js    # must be set BEFORE any I/O happens
```

**Sizing:** roughly your core count if the pool work is CPU-ish (crypto, zlib); 16–32 is reasonable if it's file-heavy, since those threads mostly sit waiting.

---

<a name="phases"></a>
# 4. Event Loop Phases

Each phase has its own queue. The loop enters a phase, drains that queue, moves to the next, and repeats forever.

```
┌─▶  1. timers       → setTimeout / setInterval that are DUE
│    2. pending      → some deferred system errors
│    3. idle/prepare → internal, ignore it
│    4. poll   ⭐    → I/O callbacks (file read done, request arrived)
│    5. check        → setImmediate
└──  6. close        → 'close' events
```

**Only three matter to you: timers, poll, check** — that's `setTimeout`, your actual I/O work, and `setImmediate`.

### The poll phase is where Node sleeps
If there's no I/O to handle and no `setImmediate` waiting, Node **parks here and waits**. That's why an idle Node server sits at **0% CPU** instead of spinning — it's asleep in the OS, not looping.

### Two practical takeaways

**① `setImmediate` beats `setTimeout(fn, 0)` inside an I/O callback — guaranteed.** You're already in *poll*, and *check* is the very next stop, while *timers* needs a full lap. (At the top level of a script, the order is unpredictable.)

**② `nextTick` and promises drain between every phase and after every callback** — which is why microtasks feel immediate, and why a runaway one starves everything else ([Part 1 §11](01-javascript-execution-model.md)).

---

<a name="nonblocking"></a>
# 5. Non-blocking I/O

> **Analogy 🔔 — the hotel receptionist.** 500 guests are waiting on things.
> - **Blocking:** walk to room 101, knock, wait for an answer, then go to 102. You'd manage 20 rooms a day.
> - **Node's way:** sit at the desk. Every room has a **bell**. When a bell rings, handle that guest. **500 guests, one receptionist, nothing wasted.**

The OS *is* the bell system. Node says *"tell me when any of these 10,000 connections has data"* and then sleeps. The OS wakes it for the specific connection that's ready.

**Why this is the whole ballgame:** holding 10,000 idle connections costs Node essentially nothing — no threads, no per-connection memory, no CPU. A thread-per-request server would need 10,000 threads and gigabytes of stack space to do the same.

**And why files are the exception:** the OS offers no equivalent *"ring me when this file is ready"* mechanism. So libuv fakes it with a blocking read on a pool thread. **That is the entire reason the thread pool exists.**

---

<a name="workers"></a>
# 6. Worker Threads

Real threads for CPU work. Each one gets its **own memory and its own event loop** — nothing is shared unless you go out of your way.

> **Analogy 👥 — hiring a colleague in the same office.** Same building, but their own desk and their own filing cabinet. To give them something, you photocopy it and hand it over. That isolation is the point: **you get threads without getting race conditions.**

```js
const { Worker } = require('worker_threads');

app.get('/report', (req, res) => {
  const w = new Worker('./heavy.js', { workerData: { id: req.user.id } });
  w.on('message', result => res.json(result));       // main loop stays free ✅
  w.on('error', e => res.status(500).json({ error: e.message }));
});

// heavy.js
const { parentPort, workerData } = require('worker_threads');
parentPort.postMessage(crunchNumbers(workerData));   // blocks THIS thread only
```

**Two things to know:**
- **Don't create one per request** — ~10–40 ms startup and a few MB each. Use a **worker pool** (`piscina` is the standard).
- **Data is copied, not shared.** Sending a huge object to a worker has a real cost.

⚠️ Workers **share the process's 4-thread pool**, so several workers doing `fs` work still compete for the same four threads.

**Use for:** PDF generation, image/video processing, big data transforms, ML inference.

---

<a name="cluster"></a>
# 7. Cluster

Runs **N copies of your whole app** — one per CPU core — all serving the same port.

> **Analogy 🏪 — identical branch stores.** Instead of one shop with a long queue, open 8 identical shops on the same street with a doorman sending each customer to the shortest line. Each shop has its own staff and its own stock — **they don't share a cash register.**

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

The primary accepts connections and hands them to workers round-robin. Workers are **completely separate processes** — separate memory, separate everything.

```
        :3000
          │
    ┌─────▼─────┐
    │  PRIMARY  │  accepts + distributes round-robin
    └──┬──┬──┬──┘
       │  │  │
      W1 W2 W3 ...    each = full Node process, own memory, own event loop
```

### The two consequences of "nothing is shared"
1. **Your app must be stateless.** In-memory sessions or caches break — a user hits W1, their next request lands on W3, session gone. Put it in Redis.
2. **WebSockets need sticky sessions**, or a Redis adapter to broadcast across workers.

> In practice you use **PM2** (`pm2 start app.js -i max`) rather than writing this, or run N containers in Kubernetes and skip `cluster` entirely.

⚠️ **Cluster does not fix a blocking loop — it divides the damage.** A 200 ms block still freezes the worker it lands on ([Part 1.2 §5](01.2-event-loop-blocking-and-real-world-load.md)).

---

<a name="child"></a>
# 8. Child Processes

Run **any program**, not just Node — ffmpeg, git, a Python script, ImageMagick.

> **Analogy 🤝 — outsourcing to a different company.** Workers are colleagues, cluster is branch offices, a child process is another firm entirely. You send documents back and forth and have no access to their internals.

| Method | Output | Use for |
|---|---|---|
| **`spawn()`** | **streamed** | long-running / big output — ffmpeg, tail |
| `exec()` | buffered, **runs a shell** | quick commands ⚠️ injection risk |
| `execFile()` | buffered, no shell | running a binary safely |
| `fork()` | IPC messaging | a **Node** child you talk to via `.send()` |

```js
// ✅ safe with user input — no shell, streams output
spawn('ffmpeg', ['-i', userFile, 'out.mp4']);

// ❌ NEVER — shell injection
exec(`convert ${req.body.filename} out.png`);   // filename = "x.png; rm -rf /"
```

> **Default to `spawn`.** `exec` buffers to 1 MB and dies past that, and its shell is a security hole the moment user input touches it.

---

<a name="decision"></a>
# 9. ⭐ Workers vs Cluster vs Child Process

```
worker_threads          cluster                 child_process
──────────────          ───────                 ─────────────
thread, same process    separate Node process   any program
own memory              own memory              own memory
~2-10 MB                ~30-50 MB               ~30-50 MB+

CPU work off            more requests/sec       ffmpeg, Python,
the main loop           across cores            git, CLI tools
```

- **One slow endpoint freezing everyone** → **worker_threads**
- **Need more throughput on a multi-core box** → **cluster**
- **It's not JavaScript** → **child_process**

They compose: cluster across cores, with a worker pool inside each for CPU spikes.

---

<a name="interview"></a>
# 10. Interview Questions & Answers

### Q1. Why is Node called single-threaded when libuv has multiple threads?
> "Because **your JavaScript** runs on a single thread — one call stack, so no locks and no race conditions. libuv's threads never run JS; they do blocking I/O in C and queue a callback, which then runs on the main thread like everything else. The accurate phrasing is **single-threaded execution, multi-threaded runtime.**"

### Q2. Which operations use the thread pool?
> "`fs`, `crypto` (bcrypt, pbkdf2, scrypt), `zlib`, and `dns.lookup`. Notably **not** network I/O — HTTP, sockets and DB queries go to the OS and use zero threads. The gotcha is `dns.lookup`, which `http.request` calls implicitly, so hostname resolution can quietly eat pool threads under load."

### Q3. What happens when the thread pool is exhausted?
> "Work **queues** — it doesn't fail, it just gets slower, invisibly. With 4 threads, a 5th file or crypto call waits. The classic case is **bcrypt on a login endpoint**: four concurrent logins saturate the pool and the fifth user waits a full hash cycle. It's nasty to diagnose because CPU looks idle and event loop lag looks fine — only that one endpoint's latency climbs. Fix: raise `UV_THREADPOOL_SIZE` or move hashing to a worker pool."

### Q4. When would you choose Worker Threads over Cluster?
> "Different problems. **Cluster** scales throughput — N processes for N cores when I need more requests per second. **Worker threads** stop one heavy task from blocking the loop, when the problem is a single slow endpoint rather than volume. If 2-second PDF generation is freezing the server, cluster just means 1/8th of users get frozen instead of all of them — the real fix is a worker."

### Q5. Node is at 100% CPU on one core while 7 cores sit idle. What's happening?
> "That's expected — one process, one JS thread, one core. Either there's real CPU work on the main thread or it's a runaway microtask loop. To use the other cores I'd run `cluster` or more containers. Worth ruling out GC too — a leaking heap makes GC run constantly, which looks like high CPU with no obvious hot function."

### Q6. Why does a memory leak cause latency spikes before it causes a crash?
> "Because **GC runs on the main thread.** As the heap grows, collections take longer and happen more often, and each one pauses the event loop like any other blocking work. So p99 degrades well before you hit the heap limit. Spiky p99 plus a steadily climbing heap is the signature."

### Q7. What happens when you `require()` a module twice?
> "The second call returns the **cached** copy — modules execute once and are cached forever. So modules are effectively singletons: top-level code runs a single time, which is why a DB connection pool at module scope is shared across the whole app rather than recreated per import."

### Q8. Is `fs.readFileSync` ever acceptable?
> "At startup, yes — loading config or certs once before the server takes traffic costs nothing and keeps the code simpler. Inside a request handler, never: it blocks the one thread for every concurrent user. Same for CLI scripts, where there's no concurrency to protect."

### Q9. What's the difference between `cluster.fork()` and `child_process.fork()`?
> "`cluster.fork()` is built on top of `child_process.fork()` and adds the port-sharing machinery so every worker can serve the same port. `child_process.fork()` just spawns a Node child you can message — no port sharing. Cluster for scaling a server, child_process.fork for a background Node task."

### Q10. You have 8 cores. How many Node processes should you run?
> "Start at one per core — beyond that they just fight over CPU. In containers I'd usually run **one process per container** and let the orchestrator scale replicas, since that gives per-instance health checks, rolling deploys and isolation that `cluster` doesn't. `cluster`/PM2 makes more sense on a plain VM."

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

### What Node is made of
```
NODE = V8 (runs your JS, owns the heap)  +  libuv (event loop, I/O, thread pool)
```

### V8 — the two operational facts
```
• ~2GB default heap, regardless of machine RAM  → --max-old-space-size=4096
• GC runs ON the main thread → leaks show up as SPIKY LATENCY before OOM
```

### libuv's two strategies ⭐
```
NETWORK (http, sockets, DB)  → the OS handles it   → 0 threads, scales to 10k+
FILES / CRYPTO / ZLIB        → thread pool (4)     → because the OS offers no
                                                      async file mechanism
```

### Thread pool
```
Pool (4):  fs · bcrypt/pbkdf2/scrypt · zlib · dns.lookup ⚠️
Not pool:  http · sockets · DB · setTimeout · dns.resolve

Exhausted → work QUEUES silently. CPU idle, loop lag fine, one endpoint slow.
Classic:   bcrypt on login. Fix: UV_THREADPOOL_SIZE or a worker pool.
```

### Phases (only 3 matter)
```
timers → pending → idle → POLL → check → close
  ↑                        ↑       ↑
setTimeout            your I/O   setImmediate
   ⚡ nextTick + microtasks drain between EVERY phase and callback
   ⭐ inside an I/O callback, setImmediate ALWAYS beats setTimeout(0)
   💤 idle Node = parked in poll = 0% CPU
```

### The three escape hatches
```
worker_threads  → CPU work off the loop     ~2-10MB   (pool them, don't per-request)
cluster         → throughput across cores   ~30-50MB  (needs STATELESS app)
child_process   → run non-JS programs       ~30-50MB  (default to spawn, never exec
                                                        with user input)
```

### Rules that follow
```
• Cluster DIVIDES blocking damage, it doesn't fix it
• Cluster needs stateless servers → sessions in Redis, sticky for WebSockets
• Workers share the SAME 4-thread pool as the main process
• require() caches → modules are singletons
```

---

*— Part 2 of the Node.js notes. Related: [Part 1 — Execution Model](01-javascript-execution-model.md) · [Part 1.2 — Blocking & Load](01.2-event-loop-blocking-and-real-world-load.md) —*
