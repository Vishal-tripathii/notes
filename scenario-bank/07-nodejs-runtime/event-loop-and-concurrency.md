# Node.js Event Loop & Concurrency — Scenario Bank

---

### "How does the Node.js event loop work?"

Node runs your JavaScript on a **single thread** — but it handles many concurrent connections anyway because most of what a typical server does (reading a file, querying a database, making an HTTP call) is **I/O**, not CPU work, and Node hands I/O off to the operating system/`libuv` to do in the background, instead of blocking the one JS thread waiting for it.

The event loop is the mechanism that makes this work: it's a loop that repeatedly checks "is there a completed operation whose callback needs to run?" and runs those callbacks, one at a time, on the single JS thread — cycling through phases (timers, pending callbacks, poll — where most I/O callbacks fire, check — `setImmediate`, close callbacks) each iteration. While waiting for I/O to complete, the JS thread isn't blocked doing nothing — it's free to process other callbacks, accept new connections, run other code.

```js
console.log('1');
setTimeout(() => console.log('2'), 0); // deferred to a later event loop iteration
fs.readFile('file.txt', () => console.log('3')); // deferred until the OS finishes reading
console.log('4');
// output: 1, 4, 2/3 (order between 2 and 3 depends on timing)
```

**Interview line:** *"Node runs JS on a single thread, but I/O — file reads, database queries, network calls — is handed off to the OS or libuv's thread pool to run in the background, not blocking that one thread. The event loop is what picks up completed I/O callbacks and runs them on the JS thread when they're ready, cycling through phases like timers and poll — which is why Node can handle many concurrent connections despite being single-threaded for JS execution."*

**Tests:** event loop fundamentals, why Node handles concurrency

*Axis: normal · Source: challenge question*

---

### "What happens when you perform CPU-heavy work? Why does Node handle many concurrent requests despite being single-threaded?"

Node handles concurrency well specifically because most real server work is **I/O-bound**, and I/O doesn't occupy the JS thread while it's in progress — the thread is free to serve other requests during that wait. This is the entire reason the single-threaded model works for typical web servers.

CPU-heavy work breaks that assumption completely: a synchronous computation (parsing a huge JSON payload, image processing, a heavy loop, a slow regex) runs **on the same single JS thread** as everything else, and nothing else — no other request, no other callback, no I/O completion — can be processed until it finishes. One expensive synchronous operation stalls the entire server for every concurrent user, not just the request that triggered it.

**Interview line:** *"Node's concurrency model works because most server work is I/O-bound — waiting doesn't occupy the JS thread, so it's free to handle other requests meanwhile. CPU-heavy synchronous work breaks that assumption entirely, because it runs on that same single thread and blocks everything else — every other request, not just the one that triggered it — until it finishes."*

**Tests:** Node's concurrency model, CPU vs I/O bound work

*Axis: performance · Source: challenge question*

---

### "What happens when one request blocks the event loop?"

Every other request queued behind it has to wait — literally nothing else can run on the single JS thread, including accepting new incoming connections, until the blocking synchronous code finishes. From the outside, this looks like the *entire server* going unresponsive for the duration, not just the slow request — a health check can even start failing, because the health check handler itself can't run either.

This is the exact reason the fix isn't "make this endpoint's code faster" alone — it's recognizing that **any** synchronous CPU-bound work anywhere in the app is a shared-resource problem affecting every concurrent user, and needs to either be made asynchronous/non-blocking, moved off the main thread (worker threads, below), or offloaded to a separate service entirely.

**Interview line:** *"Blocking the event loop doesn't just slow down that one request — it stalls the entire server, because nothing else, including new connections and health checks, can run on that single thread until it's done. That's why I treat any CPU-heavy synchronous code as a shared-resource problem for every concurrent user, not a one-off performance issue for that endpoint."*

**Tests:** event loop blocking, impact assessment

*Axis: failure · Source: challenge question*

---

### "process.nextTick() vs setImmediate()? Microtasks vs macrotasks?"

**Microtasks** (`process.nextTick()`, resolved Promise callbacks/`.then()`) run **immediately after the current synchronous code finishes**, before the event loop proceeds to its next phase — and critically, the *entire* microtask queue drains before anything else runs, including before the next macrotask. `process.nextTick()` specifically jumps the queue ahead of even Promise microtasks in Node.

**Macrotasks** (`setTimeout`, `setImmediate`, I/O callbacks) are each tied to a specific event loop **phase**, and only one phase's queue is processed per loop iteration before moving to the next phase (timers, then pending callbacks, then poll, then check — where `setImmediate` lives — then close callbacks, then back to timers).

```js
console.log('1');
setTimeout(() => console.log('2'), 0);   // macrotask — next loop iteration's timer phase
Promise.resolve().then(() => console.log('3')); // microtask — drains before the next phase
process.nextTick(() => console.log('4'));       // nextTick queue — drains before Promise microtasks
console.log('5');
// output: 1, 5, 4, 3, 2
```

Why it matters practically: recursively calling `process.nextTick()` can **starve the event loop entirely** — since the nextTick queue must fully drain before the loop can proceed to any I/O phase, an unbounded chain of `nextTick` calls means I/O callbacks (including timers) never get a chance to run at all. `setImmediate` doesn't have this danger, because it's tied to a specific phase that only runs once per full loop iteration.

**Interview line:** *"Microtasks — nextTick and resolved promises — drain completely before the event loop moves to its next phase, with nextTick jumping ahead of even promise microtasks. Macrotasks like setTimeout and setImmediate are each tied to a specific loop phase and only processed once per iteration. The practical danger is that a recursive chain of process.nextTick calls can starve the event loop entirely, since I/O can't run until the nextTick queue fully empties — setImmediate doesn't have that risk."*

**Tests:** event loop internals, microtask/macrotask ordering

*Axis: failure · Source: challenge question*

---

### "Worker threads vs child processes? Cluster vs worker threads?"

Three different tools for using more than one thread/process, each solving a different version of "single-threaded JS isn't enough":

**Worker threads** (`worker_threads` module) — actual OS threads within the *same process*, each running its own independent JS engine instance (own event loop, own memory), but able to share memory efficiently via `SharedArrayBuffer` if needed, and communicate via message passing otherwise. Use for **CPU-bound work** you want to move off the main thread without the overhead of spawning a whole separate process — image processing, heavy computation, parsing a huge file.

**Child processes** (`child_process.fork`/`spawn`) — a genuinely separate OS process, with its own memory space entirely (no shared memory), communicating only via message passing/IPC or stdout/stdin. Heavier to spawn than a worker thread, but fully isolated — a crash in a child process can't take down the parent's memory space, and it can run a completely different program, not just more Node/JS.

**Cluster** (`cluster` module) — a specific pattern built on child processes: forks multiple copies of your **entire server process**, all listening on the same port, with the OS/Node load-balancing incoming connections across them. This is about scaling *throughput* by using multiple CPU cores for what is otherwise a single-threaded server — not about offloading one CPU-heavy task, but about running N independent copies of the whole app.

**Rule of thumb:** worker threads for offloading a specific CPU-heavy computation from within a running server. Cluster for scaling a whole server across CPU cores. Child processes for running something that needs true isolation or isn't even JS.

**Interview line:** *"Worker threads offload CPU-heavy work to another thread within the same process, sharing memory efficiently if needed — good for a specific heavy computation. Child processes are fully separate processes with their own memory, heavier but fully isolated. Cluster is the pattern of forking multiple copies of the entire server process to use multiple CPU cores — that's about scaling overall throughput, not offloading one task."*

**Tests:** Node concurrency primitives, when to use each

*Axis: scale · Source: challenge question*

---

### "How do you handle CPU-intensive operations?"

The core move: get the heavy computation **off the main event loop thread**, so it doesn't block every other concurrent request while it runs.

- **Worker threads** — the direct fix for CPU-bound work inside the Node process itself (image resizing, complex data transformation, heavy parsing).
- **Offload to a separate service/queue** — push the work onto a background job queue (processed by separate worker processes, possibly not even Node) instead of doing it inline in the request path at all; the API returns quickly (`202 Accepted`, see category 02) and the client is notified when it's done.
- **Break the work into chunks** and yield back to the event loop between chunks (e.g. via `setImmediate` between batches) if it genuinely has to run on the main thread for some reason — lets other callbacks get a turn between chunks instead of one long unbroken block.
- **Scale horizontally with cluster** if the bottleneck is aggregate CPU capacity across many requests, rather than one single expensive operation.

**Interview line:** *"The goal is always getting the heavy work off the single event loop thread. For CPU-bound work inside the process, that's worker threads. For work that doesn't need to happen synchronously in the request at all, I'd push it to a background job queue and return 202 immediately. If it genuinely has to run inline, I'd chunk it and yield back to the event loop between chunks rather than blocking in one long unbroken pass."*

**Tests:** offloading CPU work, practical solutions

*Axis: performance · Source: challenge question*

---
