# 🟢 Node.js Interview Question Bank — Answered

> **How to use:** cover the answer, say yours out loud, then compare — speaking still finds gaps that reading hides. But unlike its terse siblings, this bank is written to work as a **standalone crash course**: every answer opens with a plain definition, then the tradeoff/reasoning behind it, then a short code snippet wherever the concept has real shape in code. If someone has time for exactly one file before an interview and never opens the rest of the `nodejs/` notes folder, this is the one that gets them ready.
>
> **~255 questions · 28 sections**

---

## Sections

| | Topic | Note |
|---|---|---|
| 1 | [Node.js Fundamentals](#s1) | [Part 01](01-javascript-execution-model.md) |
| 2 | [V8 Engine](#s2) | [Part 02](02-nodejs-internals.md) |
| 3 | [Event Loop](#s3) ⭐ | [Part 01](01-javascript-execution-model.md), [01.2](01.2-event-loop-blocking-and-real-world-load.md) |
| 4 | [Asynchronous Programming](#s4) | [Part 03](03-asynchronous-programming.md) |
| 5 | [Microtasks & Macrotasks](#s5) ⭐ | [Part 01](01-javascript-execution-model.md) |
| 6 | [libuv](#s6) ⭐ | [Part 02](02-nodejs-internals.md) |
| 7 | [File System](#s7) | [Part 09.5](09.5-streams-deep-dive.md) |
| 8 | [Streams](#s8) ⭐ | [Part 09.5](09.5-streams-deep-dive.md) |
| 9 | [Buffers](#s9) | [Part 05](05-buffers.md) |
| 10 | [Modules](#s10) | [Part 04](04-modules.md) |
| 11 | [Express Internals](#s11) | [Part 06](06-http-and-express.md) |
| 12 | [HTTP](#s12) | [Part 06](06-http-and-express.md) |
| 13 | [EventEmitter](#s13) | [Part 02](02-nodejs-internals.md) |
| 14 | [Process](#s14) | [Part 02](02-nodejs-internals.md) |
| 15 | [Worker Threads](#s15) | [Part 09](09-performance.md) |
| 16 | [Child Processes](#s16) | [Part 09](09-performance.md) |
| 17 | [Memory Management](#s17) | [Part 02.8](02.8-memory-management.md) |
| 18 | [Performance](#s18) | [Part 09](09-performance.md) |
| 19 | [Security](#s19) | [Part 07](07-authentication-and-security.md) |
| 20 | [Node Architecture](#s20) | [Part 02](02-nodejs-internals.md) |
| 21 | [Build & Runtime](#s21) | — |
| 22 | [Scaling Node](#s22) | [Part 09](09-performance.md) |
| 23 | [Advanced Internals](#s23) ⭐ | [Part 02](02-nodejs-internals.md) |
| 24 | [Backend System Design](#s24) | [Part 11](11-api-design.md) |
| 25 | [Senior "Why" Questions](#s25) ⭐ | — |
| 26 | [Database & Mongoose](#s26) | [Part 08](08-mongodb-and-mongoose.md) |
| 27 | [Testing](#s27) | — |
| 28 | [Scenario & Debugging](#s28) ⭐ | — |

---

<a name="s1"></a>
# 1. Node.js Fundamentals

### What is Node.js?
Node.js is a JavaScript runtime that lets JavaScript run outside a browser, on a server or in a CLI. "Runtime" is the key word: Node isn't a language, it's V8 (Chrome's JavaScript engine) plus libuv (a C library for async I/O and the event loop) plus a standard library — `fs`, `http`, `crypto`, `stream` — that gives JavaScript access to files, sockets and processes, none of which the language itself has any concept of.

```js
// V8 executes this; libuv makes it non-blocking; the stdlib provides `fs`
fs.readFile('data.txt', (err, data) => console.log(data));
```

### Why was Node.js created?
Because the dominant server model of the time — one OS thread per connection — wasted enormous resources on waiting: a thread blocked on a database query does nothing but hold memory and a stack. Node's bet was that a single thread with non-blocking I/O could serve far more concurrent connections than a thread pool could, since the vast majority of what a typical web server does is *wait* on a network or a disk, not compute.

### Why is Node.js single-threaded?
Because it trades a hard problem for an easier one. A single call stack means only one thing ever executes at a time, so there's no shared-memory mutation to race on — no locks, no deadlocks, no interleaved reads and writes corrupting state. Concurrency comes from the event loop instead: many operations in flight, but never two pieces of your code running at literally the same instant.

```js
count = count + 1;   // always safe in JS — this can't be interrupted mid-operation
```

### Is Node.js actually single-threaded?
No — only **your JavaScript** is. Node the runtime uses several threads: libuv's thread pool (4 by default) handles file I/O, DNS lookups (`dns.lookup`), and CPU-heavy crypto/zlib work, and V8 itself uses background threads for garbage collection and JIT compilation. The accurate phrasing is **single-threaded execution, multi-threaded runtime** — your code runs on one thread; the waiting and some of the heavy lifting happen elsewhere.

### Why is Node.js fast?
For I/O-bound work specifically: it never blocks waiting on a result. While one request waits on a database, the same thread is already serving hundreds of others — the waiting overlaps perfectly and costs nothing. V8 is also a genuinely fast JIT-compiled engine on top of that. It is *not* fast at CPU-bound work, because computation can't be handed off the way I/O can — that's the one real trade Node makes.

### What problems is Node.js good at solving?
Anything I/O-heavy: REST APIs, real-time apps (chat, live notifications), streaming services, API gateways/BFFs, and microservices — work where the server mostly coordinates and waits on other systems rather than crunching numbers itself.

### When should you NOT use Node.js?
CPU-bound workloads — video encoding, image processing, large-scale data crunching, complex ML inference. A long computation occupies the single JavaScript thread completely, so the event loop can't interrupt it to serve anyone else — every other connected user stalls behind it. `worker_threads` can move that work off the main thread, but a language built for real parallelism (Go, Java) is usually a better fit for a workload that's fundamentally CPU-bound.

### How is Node.js different from a browser?
Same language, entirely different surroundings. No DOM, no `window`, no browser sandbox — instead Node gives you filesystem access, TCP/UDP servers, child processes and OS-level APIs. Node defaults to the CommonJS module system (`require`) where browsers use native ES modules, and `global` replaces `window` as the top-level object.

### Does Node.js contain the V8 engine?
Yes — V8 is Chrome's JavaScript engine, embedded directly in Node to parse, compile and execute your JavaScript. It's the same engine as the browser, but wired to Node's own globals (`process`, `Buffer`) and C++ bindings instead of the DOM.

### What else besides V8 does Node.js include?
Three more pieces, since V8 alone can only execute JavaScript and has no idea what a file or socket is:
- **libuv** — the event loop, the thread pool, and cross-platform async I/O.
- **Node bindings** — the C++ glue connecting JavaScript calls to libuv and the OS.
- **The standard library** — `fs`, `http`, `crypto`, `stream`, `path`, and the rest, all built on the two layers above.

---

<a name="s2"></a>
# 2. V8 Engine

### What is V8?
V8 is Google's open-source JavaScript engine, written in C++, embedded in both Chrome and Node. It parses, compiles and executes JavaScript, and it owns the memory JavaScript objects live in — the heap and its garbage collector.

### What does V8 actually do?
Parses your source into an AST, generates bytecode from it, starts executing that bytecode immediately, watches which functions run "hot," recompiles those into optimized machine code using the types it observed at runtime, and garbage-collects objects nothing references anymore.

### How does V8 compile JavaScript?
Source becomes an AST, which **Ignition** (V8's interpreter) turns into bytecode it starts running right away — no compile pause at startup. While it runs, Ignition also records what types actually flow through each function. Functions that get called often are handed to **TurboFan**, V8's optimizing compiler, which uses that recorded type information to emit specialized machine code. The strategy is: start running quickly, then get faster only where it actually matters.

### What is Just-In-Time (JIT) compilation?
Compiling at runtime instead of ahead of time. It can genuinely beat static ahead-of-time compilation here, because the engine sees the *actual* types flowing through a function while it runs and can specialize for them — information a compiler working from source alone never has.

### What is Ignition?
V8's bytecode interpreter. It converts the AST into compact bytecode and starts executing it immediately, so there's no upfront compile delay, and it collects the type-feedback data that TurboFan later uses to decide how to optimize.

### What is TurboFan?
V8's optimizing compiler. It takes functions Ignition has flagged as hot, combines them with the type feedback already gathered, and emits specialized machine code — for example assuming a parameter is always a number and skipping the runtime type check entirely.

### How does V8 optimize code?
By assuming the future looks like the recent past: if a function has always received numbers, TurboFan compiles a fast path specialized for numbers. If that assumption is later violated — a string shows up where only numbers ever had — V8 **deoptimizes**: it throws away the optimized machine code and falls back to slower bytecode. This is why type-stable code (a function that's always called with the same shapes of arguments) runs faster: it never triggers a deopt.

```js
function add(a, b) { return a + b; }
for (let i = 0; i < 1e6; i++) add(i, 1);   // always numbers → TurboFan specializes for numbers
add('x', 'y');                             // ⚠️ different shape → can trigger deopt
```

### What is hidden class optimization?
JavaScript objects are dynamic — properties can be added or removed at any time — so naive property lookup would mean a hash-table lookup on every access. V8 avoids that by assigning each object *shape* a hidden class internally; objects built with the same structure share a hidden class, and reading a property becomes a fixed memory offset instead of a lookup.

```js
function Point(x, y) { this.x = x; this.y = y; }   // same order every time → same hidden class
```

⚠️ Adding the same properties in different orders across instances produces *different* hidden classes for otherwise-identical objects, which defeats this optimization — that's why initializing every field in the constructor, in a consistent order, is measurably faster.

### What is inline caching?
Caching the result of a property lookup at the exact call site that performed it. The first time a line reads `obj.name`, V8 records "for this hidden class, `name` lives at offset 8"; every later execution of that same line skips the lookup and reads the offset directly. It's fastest when a call site always sees objects of the same hidden class (**monomorphic**) and gets progressively slower as it sees more shapes (**polymorphic**, then **megamorphic**).

### How does V8 perform garbage collection?
Generationally, based on the observation that most objects die almost immediately after being created. The **young generation** is a small space collected frequently by a fast copying collector (the scavenger); anything that survives a couple of collections gets promoted to the **old generation**, which is collected far less often using mark-sweep-compact, done incrementally and concurrently so pauses stay short. GC runs on the same main thread as your JavaScript, so a collection pause is CPU work like any other — it blocks the event loop.

### Why does memory leak happen even with GC?
Because garbage collection frees objects that are **unreachable**, not objects that are merely **unused**. If anything — a global cache, a live event listener, a running timer — still holds a reference to an object, the collector is obligated to keep it, even if your program will genuinely never touch it again. The usual culprits: values piling up in a module-level object or `Map` with no eviction, closures retaining more of their enclosing scope than they actually use, timers that are never cleared, and listeners that are added but never removed.

---

<a name="s3"></a>
# 3. ⭐ Event Loop

### What is the Event Loop?
The event loop is the mechanism that lets Node's single JavaScript thread handle many concurrent operations without ever sitting idle waiting for one to finish. When you start an I/O operation, Node registers a callback and immediately moves on to other work; the event loop is the cycle that repeatedly checks which operations have completed and runs their callbacks when the main thread is free.

### Why does Node need an Event Loop?
Because there is exactly one JavaScript thread, and it must never sit blocked waiting on a result. Something has to track the thousands of operations that might be in flight at once and hand each one's callback back to that single thread the moment it's ready and the thread is free. A waiter takes an order to the kitchen and serves other tables in the meantime, rather than standing at the pass until the food is cooked.

### How does the Event Loop work?
It runs in iterations, sometimes called "ticks." Each iteration moves through a fixed sequence of phases; each phase owns a queue of callbacks and runs everything in it until the queue is empty or an internal limit is reached, then moves to the next phase. When there's genuinely no work left anywhere, the loop exits and the process ends.

### What are the Event Loop phases?
```
1. timers            setTimeout / setInterval callbacks whose time has come
2. pending callbacks deferred system-level callbacks (some TCP errors)
3. idle, prepare     internal
4. poll              retrieve new I/O events, run I/O callbacks — may BLOCK here
5. check             setImmediate callbacks
6. close callbacks   'close' events, e.g. socket.on('close')
```
Only three matter in day-to-day debugging: **timers**, **poll**, and **check** — that's `setTimeout`, your actual I/O completions, and `setImmediate`.

### What happens in each phase?
Node runs every callback already queued for that phase, then advances to the next one. **Poll** is the phase that actually matters most — it's where completed I/O is collected and delivered, and it's the phase where the loop parks and waits when there's nothing else to do.

### What is the Poll phase?
The phase where Node collects completed I/O events and runs their callbacks. If there's nothing to do there and no `setImmediate` pending, Node **blocks** in poll waiting on the OS for the next event — which is exactly the behavior you want, since sleeping on the kernel's own readiness notification costs zero CPU. This is why an idle Node process shows 0% CPU rather than spinning in a loop.

### What is the Check phase?
The phase where `setImmediate` callbacks run — placed deliberately right after poll, so `setImmediate` effectively means "run right after the current batch of I/O has been handled." Inside an I/O callback, `setImmediate` is guaranteed to fire before a `setTimeout(fn, 0)` scheduled at the same moment, because check is the very next stop after poll while timers needs a full extra lap of the loop.

```js
fs.readFile(__filename, () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));   // ✅ guaranteed to run first here
});
```

### What is the Close phase?
The phase where cleanup callbacks run — `'close'` events on sockets and other handles. It's kept separate so teardown never interleaves with active I/O handling elsewhere in the same tick.

### What happens after every Event Loop iteration?
Between **every** phase transition — and in modern Node, after every individual callback — the microtask queues drain completely: `process.nextTick` first, then promise callbacks, in that order, both fully emptied before the loop continues. This is why a promise chain always finishes before the next timer or I/O callback gets a turn, no matter how it's interleaved in the source.

### What is starvation in the Event Loop?
When one queue never lets the loop move past it. A `process.nextTick` callback that schedules another `nextTick` recursively spins forever, because the `nextTick` queue is drained completely before the loop is allowed to advance — timers and I/O simply never get a turn. A long synchronous loop causes the same effect by a different mechanism: nothing else can run while the call stack isn't empty.

```js
function starve() { process.nextTick(starve); }
starve();   // nextTick queue never empties → no timer, no I/O, no request ever runs
```

### What blocks the Event Loop?
Any synchronous work that takes real time: `JSON.parse` on a huge payload, `fs.readFileSync`, `crypto.pbkdf2Sync`, a large `for` loop, a regex prone to catastrophic backtracking over a long string, and `.map`/`.filter`/`.sort` chains over very large arrays. While any of that runs, **every** connected user is waiting, because the event loop cannot interrupt code that's already executing to go serve someone else.

---

<a name="s4"></a>
# 4. Asynchronous Programming

### Why is Node asynchronous?
Because it has exactly one thread available for your JavaScript. If a database query blocked that thread, it would sit idle for however long the query takes while every other pending request queued up behind it. Async means "start the operation, register a callback for when it's done, and immediately move on to the next thing" — the thread is never left with nothing useful to do.

### Why not make everything synchronous?
Synchronous code reads more simply, but with one thread it means exactly one operation happens for the entire process at any moment. A 200ms query handled synchronously caps the whole server at five requests per second — total, across every connected user — because nothing else can run while that thread is occupied waiting.

### What is callback hell?
A structural problem that emerges when several async steps each depend on the previous one's result: every next call has to be nested *inside* the previous callback, because that's the only scope where its result is visible. The code grows rightward with each async step instead of downward, and error handling has no shared structure — every level needs its own `if (err)` check, and one missed check swallows a failure completely silently.

```js
getUser(id, (err, user) => {
  if (err) return done(err);
  getOrders(user.id, (err, orders) => {
    if (err) return done(err);          // repeated at every level
    // ...nested deeper for every dependent step
  });
});
```

### Why were Promises introduced?
To replace nesting with chaining and give errors a single path to travel. `.then()` returns a new promise, so each step stays at the same indentation instead of nesting one level deeper, and a rejection anywhere in the chain jumps straight to the nearest `.catch()` instead of needing a check at every level. A promise is also, crucially, **a value you can return** — which is the fix callbacks structurally couldn't offer, since a callback's result only ever exists inside the callback itself.

```js
getUser(id)
  .then(user => getOrders(user.id))
  .then(orders => getPayment(orders[0].id))
  .catch(err => handle(err));   // one catch covers every step above it
```

### Why was async/await introduced?
Because even a flat `.then()` chain still reads inside-out compared to the logic it expresses, and ordinary control flow — a loop, an `if`, a `try/catch` — is awkward to write around it. `async`/`await` lets asynchronous code read top-to-bottom like synchronous code, with real `try/catch` and normal loops working exactly as they would over synchronous calls.

### Are async functions still asynchronous?
Yes. `async` only changes the syntax you write — the function still returns a promise, and `await` suspends that function specifically while the rest of the program, including the event loop, keeps running. It is **not** blocking. The common misreading is thinking `await` pauses the server; it only pauses the one function that used it, and control returns to the event loop for the duration.

### How does async/await work internally?
It's sugar over promises, not a separate mechanism. `await` suspends the `async` function, registers the rest of it as a continuation on the awaited promise, and immediately hands control back to the event loop. When that promise settles, the continuation resumes as a **microtask** — the same queue promise `.then()` callbacks use. A `throw` inside an `async` function becomes a promise rejection instead of a synchronous exception.

### Promise vs callback
A callback is a function handed over with no language-level guarantee about it — it might be called zero times, once, or twice, and there's nothing enforcing "call it exactly once with the result." A promise is an object representing an eventual result: it settles exactly once, can be stored in a variable, passed around, handled later, and composed with `Promise.all`/`race`/`allSettled` — none of which callbacks give you for free.

### Promise vs async/await
Two ways of consuming the same underlying mechanism, not two different mechanisms. `async`/`await` reads more clearly for sequential steps; raw promises are more natural when you explicitly want concurrency — `Promise.all` runs independent work in parallel, where awaiting each one in turn would serialize it unnecessarily.

```js
for (const id of ids) await fetch(id);          // ❌ sequential — 100 × latency
await Promise.all(ids.map(id => fetch(id)));    // ✅ parallel — ~1 × latency
```

### Why does `Promise.resolve()` execute before `setTimeout()`?
Because they live in different queues with different priority. Promise callbacks are **microtasks**, and the microtask queue is drained completely before the event loop is allowed to move on to the next phase. `setTimeout` is a **macrotask**, handled in the timers phase of a later loop iteration. Microtasks always win the race, even against `setTimeout(fn, 0)`.

```js
setTimeout(() => console.log('timeout'), 0);
Promise.resolve().then(() => console.log('promise'));
// → 'promise' always logs first
```

### Why shouldn't `await` be used inside loops?
Because it serializes work that could otherwise run in parallel — each iteration waits for the previous one to fully resolve before starting the next. Firing 100 independent requests sequentially with `await` inside a `for` loop takes roughly 100 times as long as firing them all with `Promise.all`. The important nuance: this is a **latency** problem for that one request, not a blocking problem for the server — the event loop stays free the entire time, and every other user keeps being served normally. Sequential `await` is the right choice when each step genuinely depends on the previous result, when a rate limit must be respected, or when you deliberately need backpressure so you don't overwhelm a downstream system.

```js
for (const id of ids) users.push(await getUser(id));   // ❌ 100 × 200ms = 20s, serial
const users = await Promise.all(ids.map(getUser));      // ✅ ~200ms, parallel
```

### What are Promise combinators, and how do `Promise.all()` and `Promise.allSettled()` differ?
`Promise.all`, `allSettled`, `race`, and `any` are static methods that take an array of promises and describe one way they combine into a single outcome — picking the wrong one is a real bug, not just a style choice. **`all`** resolves only when every promise succeeds, and rejects immediately on the first failure, discarding the results of everything else that was still running. **`allSettled`** never rejects — it waits for every promise to settle and returns an array of `{status:'fulfilled', value}` or `{status:'rejected', reason}` objects, letting you separate successes from failures yourself.

```js
const [user, orders] = await Promise.all([getUser(id), getOrders(id)]);   // dashboard: need everything

const results = await Promise.allSettled(users.map(sendEmail));            // bulk: partial success is fine
const failed = results.filter(r => r.status === 'rejected');
```

⚠️ `Promise.all` rejecting does **not** cancel the promises still in flight — they keep running and their results (and any side effects, like a database write) still happen; you just never see the return value.

### What are the most common error-propagation traps with promises?
Four recurring bugs. **A missing `await`** lets a rejection happen after the surrounding `try/catch` has already exited, so the failure is silently lost — every promise needs exactly one of `await`, `.catch()`, or `return`. **`.catch()` resumes the chain rather than stopping it** — anything chained after a `.catch()` runs with whatever the handler returned, so `fetchUser().catch(() => null).then(u => u.name)` throws on the `null`. **`forEach` ignores returned promises entirely**, so `items.forEach(async item => await save(item))` doesn't wait for anything and errors become unhandled rejections — use `Promise.all(items.map(...))` instead. **Express 4 doesn't catch async errors thrown inside a route handler**; an `async (req, res) => { throw err }` becomes an unhandled rejection that never reaches your error middleware unless you wrap the handler or use `express-async-errors`.

```js
async function handler(req, res) {
  saveToDb(req.body);        // ❌ no await → rejects later, catch already gone
  res.json({ ok: true });    // lies to the caller
}
```

---

<a name="s5"></a>
# 5. ⭐ Microtasks & Macrotasks

### What is a microtask?
A callback that runs immediately after the currently executing operation finishes, before the event loop is allowed to continue to the next phase. Promise `.then()`/`.catch()`/`.finally()` callbacks, `queueMicrotask`, and Node's own `process.nextTick` (which sits in an even higher-priority queue than the standard microtask queue) are all microtasks.

### What is a macrotask?
Work scheduled into one of the event loop's actual phases — timers, I/O callbacks, `setImmediate`, close handlers. The loop runs one macrotask, then drains the microtask queues completely, then moves on to the next macrotask.

### What is the microtask queue?
The queue holding pending microtasks. It's drained **completely** before the loop is allowed to proceed — including any new microtasks that get added while it's still draining. That's exactly what lets an infinite chain of self-scheduling microtasks starve the entire process: the queue never reaches empty, so the loop never gets a turn to run anything else.

### Promise vs `setTimeout` — which runs first?
```js
setTimeout(() => console.log('timeout'), 0);
Promise.resolve().then(() => console.log('promise'));
// promise, then timeout — always
```
The promise callback is a microtask and runs before the loop even reaches the timers phase, regardless of the `0` delay.

### `process.nextTick()` vs Promise — which runs first?
Both are microtasks, but Node maintains **two separate queues** and drains `nextTick` **entirely** before touching the promise microtask queue at all.
```js
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));
// nextTick, then promise
```

### What does `queueMicrotask()` do?
The standard, non-Node-specific way to schedule a microtask, landing in the same queue as promise callbacks. Reach for it instead of `process.nextTick` when you just want "run after the current synchronous code" without jumping ahead of the promise queue — `nextTick`'s extra priority exists for Node's own internals, and overusing it in application code is how you accidentally starve the loop.

### What does `setImmediate()` do?
Schedules a callback for the **check** phase, which runs right after poll. The name is a bit misleading — it isn't "immediately," it's "after the current I/O phase completes." It's Node-specific; browsers have no equivalent.

### What is the full execution order of all the queues?
```
1. current synchronous code (runs to completion)
2. process.nextTick queue        ← drained fully
3. promise microtask queue       ← drained fully
4. timers        (setTimeout / setInterval)
5. I/O callbacks (poll)
6. setImmediate  (check)
7. close callbacks
   → microtasks drain again between every one of these
```

```js
console.log('1: sync start');
setTimeout(() => console.log('2: timeout'), 0);
Promise.resolve().then(() => console.log('3: promise'));
process.nextTick(() => console.log('4: nextTick'));
console.log('5: sync end');
// 1, 5, 4, 3, 2
```
Synchronous code always finishes first because nothing can interrupt it; then `nextTick`, fully drained; then promise microtasks, fully drained; then the macrotask.

### Why does `process.nextTick()` execute before Promises?
It was originally built so Node's own internals could run cleanup or surface an error immediately after the current operation, ahead of anything else — including application-level promise callbacks. Application code inherited that same top priority when it's exposed as a public API, which is exactly why an application-level `nextTick` loop can starve timers and I/O just as effectively as an internal one, and why `queueMicrotask` is usually the safer default for your own code.

---

<a name="s6"></a>
# 6. ⭐ libuv

### What is libuv?
libuv is the C library underneath Node that provides the event loop itself, a small thread pool, and one cross-platform API over each operating system's native async I/O mechanism — epoll on Linux, kqueue on macOS/BSD, IOCP on Windows.

### Why does Node need libuv?
Because V8 only knows how to execute JavaScript — it has no built-in concept of a file, a socket, or a timer. And every operating system exposes asynchronous I/O completely differently. libuv hides those platform differences behind one uniform interface, which is why identical Node code behaves the same on Linux, macOS and Windows.

### What is the thread pool?
A small, fixed pool of worker threads libuv reaches for only when an operation has **no genuinely non-blocking equivalent at the OS level**. Your JavaScript itself never touches these threads — libuv hands the blocking work to one of them, that thread does the actual waiting, and the completion callback is queued for the main thread once it's done.

### How many threads exist by default?
Four.

### Which operations use the thread pool?
File system operations (`fs.*`), `dns.lookup()`, CPU-heavy crypto (`pbkdf2`, `scrypt`, `randomBytes`, and by extension **bcrypt**), and zlib compression.

### Which operations don't use the thread pool?
**Network I/O** — TCP, UDP, HTTP, and by extension database queries over a network. Those use the operating system's own non-blocking socket API directly: Node registers interest with epoll/kqueue/IOCP and is woken only when a specific connection is actually ready, with **zero threads consumed** while waiting. This is the real reason Node scales to tens of thousands of concurrent connections — the concurrency comes from the OS's readiness notification, not from the thread pool.

### Can thread pool size be changed?
Yes — the `UV_THREADPOOL_SIZE` environment variable, set before the process starts (it can't be changed at runtime once I/O has begun). Worth raising for workloads that are genuinely file- or crypto-heavy.

```bash
UV_THREADPOOL_SIZE=16 node app.js
```

### What happens when the thread pool becomes full?
Further pool-bound operations **queue** silently — they don't fail, they just wait for a thread to free up. With the default of four, a fifth concurrent `bcrypt.hash()` or `fs.readFile()` call waits behind the first four, appearing slow for no visible reason: CPU looks idle, event loop lag looks fine, and only that one code path's latency climbs. It's a classic, hard-to-diagnose cause of mysterious latency in file- or crypto-heavy services — the textbook case is `bcrypt` on a login endpoint, where the fifth concurrent login waits a full hash cycle behind the first four.

```js
// four of these run together; the fifth waits for a free thread
for (let i = 1; i <= 5; i++) {
  crypto.pbkdf2('pw', 'salt', 100000, 64, 'sha512', () => console.log(`hash ${i} done`));
}
```

---

<a name="s7"></a>
# 7. File System

### Why are file operations asynchronous?
Because disk access is slow relative to CPU speed — milliseconds during which the single JavaScript thread could otherwise be serving hundreds of other requests. The async form hands the actual read or write to a libuv thread-pool worker and lets the main thread carry on immediately.

### How does `fs.readFile()` work internally?
Node passes the request across its C++ bindings into libuv, which assigns it to a thread-pool worker. That worker thread performs the blocking read; when it finishes, the completion callback is queued for the poll phase and eventually runs on the main thread. Your JavaScript never blocks during this — but a pool thread genuinely does, which is why file operations compete with crypto and zlib for the same four threads.

### Why shouldn't `fs.readFileSync()` be used in servers?
Because it blocks the one and only JavaScript thread for its entire duration. A 50ms synchronous read means every other concurrent request — every other user — waits that same 50ms with no exceptions, since the event loop cannot interrupt running code to serve anyone else. It's acceptable exactly once: at startup, loading configuration or certificates before the server begins accepting traffic, when nothing else is waiting on the thread yet.

```js
const config = fs.readFileSync('config.json');   // ✅ fine at boot, before .listen()
app.get('/x', (req, res) => {
  const data = fs.readFileSync('big.txt');        // ❌ freezes every connected user
});
```

### Streams vs `readFile()`
`readFile` loads the **entire file into memory** as one Buffer before your callback runs at all. A stream delivers the same file in small chunks — typically 64KB at a time — so you can start processing before the whole thing has even finished loading. For a 2GB file, `readFile` needs roughly 2GB of RAM and can actually exceed V8's Buffer size limit outright; a stream needs about 64KB regardless of the file's total size.

```js
const data = await fs.promises.readFile('2gb.csv');   // ❌ 2GB in memory, or fails outright
fs.createReadStream('2gb.csv').pipe(res);              // ✅ ~64KB at a time
```

### How should large files be handled?
Always stream, never `readFile`. Read with `fs.createReadStream`, transform in the middle if needed, write with `fs.createWriteStream`, and connect the whole chain with `pipeline()` so errors and cleanup on every stream in the chain are handled automatically rather than leaking file descriptors.

### What are the memory implications of choosing `readFile` for large or user-supplied files?
Ten concurrent users downloading the same 1GB file with `readFile` means 10GB of memory held simultaneously and a very likely crash. The identical scenario with streams costs a few hundred KB total, because only the chunks currently in flight ever exist in memory at once — the rest stays on disk or on the wire until it's actually needed.

---

<a name="s8"></a>
# 8. ⭐ Streams

### What is a stream?
A stream is an interface for working with data **piece by piece** as it arrives or departs, rather than requiring the whole thing to exist in memory at once. Concretely it's an `EventEmitter` with a defined protocol for chunks (`'data'`), completion (`'end'`/`'finish'`), and failure (`'error'`) — and that's exactly *why* streams use events instead of a single promise: a promise settles once, but a stream produces many chunks over time, which is the wrong shape for something that resolves exactly once.

### Why do streams exist?
Because processing data shouldn't require memory proportional to that data's size. A stream lets you handle 10GB with essentially the same memory footprint as 10KB — reading data through a straw instead of trying to swallow the entire pool at once. Beyond memory, a stream also lets the consumer start receiving the first byte immediately instead of waiting for the whole payload to load, and it removes any hard size ceiling — `readFile` tops out around the Buffer limit (~2GB); a stream has none.

### What are the four types of streams?
```
Readable   you read FROM it        fs.createReadStream, an incoming http request
Writable   you write TO it         fs.createWriteStream, an http response
Duplex     both, independently     a TCP socket
Transform  a Duplex that MODIFIES  zlib.createGzip, a CSV parser
```

### What is a Readable stream?
A stream that produces data. It has two modes: **flowing**, where data is pushed to you via the `'data'` event or `.pipe()`, and **paused**, where you pull it yourself with `.read()`. Modern code mostly avoids both raw modes in favor of `pipeline()` or `for await...of`.

### What is a Writable stream?
A stream that consumes data. Its `write()` method returns a boolean: `false` means its internal buffer has hit `highWaterMark` and you should stop sending more until it emits `'drain'`. Ignoring that return value and writing in an uncontrolled loop is exactly how "streaming" code still runs out of memory.

### What is a Duplex stream?
A stream that is both readable and writable, where the two sides are **independent** of each other — a TCP socket is the canonical example, since what you receive on it has nothing to do with what you send on it. They're comparatively rare to write yourself.

### What is a Transform stream?
A duplex stream where the output is **derived from** the input — gzip, an encryption cipher, a CSV parser. This is where the vast majority of custom stream code actually lives, in contrast to Duplex, which you'll write far less often.

```js
class Upper extends Transform {
  _transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());   // output made FROM the input
  }
}
```

### What is backpressure?
The mechanism that stops a fast producer from overwhelming a slow consumer. If you're reading from disk at 100MB/s while uploading at 5MB/s, and nothing coordinates the two, the 95MB/s difference piles up in memory every second until the process runs out — which is just `readFile`'s memory problem, recreated with more code. `write()` returning `false` is the writable side's signal to pause; the `'drain'` event is its signal that there's room again and reading may resume. This is why streams are memory-efficient at all — without backpressure, the "streaming" is only cosmetic.

```js
// ❌ ignores backpressure entirely — memory grows without limit
source.on('data', chunk => dest.write(chunk));

// ✅ what pipe()/pipeline() do for you automatically
source.on('data', chunk => {
  if (!dest.write(chunk)) {
    source.pause();
    dest.once('drain', () => source.resume());
  }
});
```

### What does `pipe()` do, and what's wrong with it?
`.pipe()` connects a readable to a writable and handles backpressure for you automatically — that part works fine. Its real weakness is failure handling: if a stream in the middle of a chain errors, the streams on either side of it are simply left open, leaking file descriptors silently until the process eventually runs out of them for a reason that looks completely unrelated. It also doesn't propagate errors between streams, so every stream in a `.pipe()` chain needs its own `.on('error')` handler or a failure becomes an unhandled crash.

### What does `pipeline()` do, and why is it preferred over `pipe()`?
The correct modern way to connect streams — same backpressure handling as `.pipe()`, plus **proper error propagation and cleanup** across every stream in the chain, surfaced through one callback (or an awaitable promise via `stream/promises`) for the whole pipeline.

```js
const { pipeline } = require('stream/promises');
try {
  await pipeline(fs.createReadStream('in.txt'), zlib.createGzip(), fs.createWriteStream('out.gz'));
} catch (err) {
  // any stream failing lands here, and everything is already closed
}
```

### Why are streams memory efficient?
Because only the current chunk plus a small internal buffer — the `highWaterMark`, 64KB by default for byte streams — exists in memory at any given moment. Everything else is still sitting on disk or in transit on the network, never loaded into your process's heap at all.

---

<a name="s9"></a>
# 9. Buffers

### What is a Buffer?
A `Buffer` is a fixed-length chunk of raw binary data, allocated **outside** V8's JavaScript heap. It's Node's way of representing bytes — file contents, network packets, images, cryptographic output — before they're interpreted as anything more specific like text.

### Why doesn't Node use strings everywhere?
Because a string is text in a specific encoding, and most of what Node's I/O actually deals with — a JPEG, a TCP packet, compressed data — isn't text at all. Reading binary data as a string finds byte sequences that aren't valid characters and silently replaces each one with the Unicode replacement character (`U+FFFD`), corrupting the data irreversibly with no error raised anywhere. Bytes are not text; a string is bytes *plus an interpretation*, and applying the wrong interpretation destroys information rather than throwing.

```js
fs.readFileSync('photo.jpg', 'utf8');   // ❌ corrupted — invalid sequences become U+FFFD
fs.readFileSync('photo.jpg');           // ✅ a Buffer — raw bytes, untouched
```

### What is binary data?
A sequence of bytes with no meaning inherent to the bytes themselves — the meaning comes entirely from how you choose to interpret them. The identical byte sequence is a JPEG, a 32-bit integer, or a UTF-8 string depending on what you decide it represents.

### What is encoding?
The agreed-upon mapping between bytes and the text they represent — the bytes themselves never change, only their interpretation does. Node supports `utf8` (the default), `ascii`, `base64`, `hex`, and `latin1`. Reading a file with the wrong encoding produces mojibake silently rather than an error, which is exactly why that class of bug tends to surface far from its actual cause.

```js
const buf = Buffer.from('Hi');
buf.toString('utf8');    // 'Hi'
buf.toString('hex');     // '4869'
buf.toString('base64');  // 'SGk='
```

### What is UTF-8, and why does `'😀'.length` equal 2?
UTF-8 is a variable-width text encoding — ASCII characters take one byte, accented characters two, most CJK characters three, and emoji four. Its design win is that the first 128 characters are byte-identical to plain ASCII, so every existing ASCII file is already valid UTF-8; that backwards compatibility is a large part of why it won. The gotcha: JavaScript's `.length` counts UTF-16 code *units*, not bytes and not visible characters — an emoji outside the Basic Multilingual Plane needs a surrogate pair, so it reports as length 2, while `Buffer.byteLength()` correctly reports 4 (its UTF-8 byte size) and spreading the string (`[...str].length`) reports 1 (the actual character count). Use `Buffer.byteLength()` for anything about storage or transmission — a `Content-Length` header, a database column limit — and never plain `.length`.

```js
'😀'.length;                 // 2  ⚠️ UTF-16 surrogate pair, not bytes and not "characters"
Buffer.byteLength('😀');     // 4  ✅ for storage / Content-Length / column limits
[...'😀'].length;            // 1  ✅ for what a user perceives as one character
```

A 64KB chunk boundary in a stream can also land mid-character, splitting a 3-byte character across two chunks — decoding each chunk independently then produces replacement characters. `StringDecoder` exists specifically to hold an incomplete byte sequence until the next chunk completes it.

### What is Base64, and why is it ~33% larger?
Base64 encodes arbitrary binary data as 64 safe ASCII characters (`A–Z a–z 0–9 + /`, padded with `=`), so it survives channels that are text-only or that mangle certain byte values — email bodies, JSON strings, URLs, data URLs, and JWT payloads. It packs 3 bytes (24 bits) into 4 output characters of 6 bits each, so every 3 input bytes become 4 output bytes — a fixed +33% overhead. Base64 is **encoding, not encryption** — anyone can decode it instantly, which is exactly why a JWT's payload is readable by anyone who has the token.

```js
Buffer.from('hello').toString('base64');        // 'aGVsbG8='
Buffer.from('aGVsbG8=', 'base64').toString();   // 'hello'
```

### `Buffer.alloc()` vs `Buffer.allocUnsafe()`
`Buffer.alloc(n)` zero-fills the new buffer — safe, slightly slower. `Buffer.allocUnsafe(n)` skips zero-filling entirely and hands back whatever bytes were previously sitting in that memory — potentially another request's data, a session token, or decrypted content from something completely unrelated. It's faster precisely because it skips that step, and it has been a real CVE class in practice. Only reach for it when you're about to immediately and completely overwrite every byte, such as a destination buffer for a `copy()`; default to `alloc`.

```js
Buffer.alloc(1024);          // ✅ zero-filled — safe
Buffer.allocUnsafe(1024);    // ⚠️ old memory until fully overwritten
Buffer.from('hi');           // from a string, array, or another buffer
```

### What is Buffer vs ArrayBuffer, and what's the pooling trap?
An `ArrayBuffer` is a raw block of memory with **no direct read/write access at all** — you need a *view* over it, like a `Uint8Array` or `DataView`, to actually touch the bytes. `Buffer` is Node's own subclass of `Uint8Array` — so a Buffer *is* such a view, plus binary-specific convenience methods like `toString('base64')`, `Buffer.concat`, and `readInt32BE` that plain typed arrays don't have. Buffer predates `ArrayBuffer`/`TypedArray` by six years (2009 vs 2015) and was rebased on top of them once they existed, rather than breaking every program already using it. One operational detail: Buffer memory lives **off** the V8 heap, so it doesn't count against `--max-old-space-size` and barely shows up in a heap snapshot — a process can get OOMKilled by its container while the JS heap looks perfectly healthy.

```js
const ab = new ArrayBuffer(8);
ab[0];                          // ❌ undefined — no direct access
const buf = Buffer.from(ab);    // ✅ Node's view, with toString/concat/etc.
```

⚠️ The pooling trap: small buffers under 4KB are carved from a shared 8KB internal pool, so `buf.buffer.byteLength` on a 2-byte buffer can report `8192` — handing that raw `buf.buffer` to something else exposes up to 8KB of unrelated data. Always pass `buf.byteOffset` and `buf.byteLength` alongside `buf.buffer` when you need the underlying `ArrayBuffer`. A related trap: `Buffer.prototype.subarray` (and the deprecated `.slice`) **share** memory with the original rather than copying it — the opposite of `Array.prototype.slice` — so mutating a subarray mutates the source buffer too; use `Buffer.from(buf.subarray(a, b))` for a genuine copy.

### What is buffer pooling?
Node keeps a small pre-allocated pool (8KB) and carves small `allocUnsafe` allocations out of it, since asking the OS for fresh memory on every allocation is comparatively expensive. Buffers larger than half the pool size bypass it and get their own dedicated allocation instead.

---

<a name="s10"></a>
# 10. Modules

### CommonJS vs ES Modules
**CommonJS** (`require`/`module.exports`) is Node's original module system: loading is **synchronous** and resolved **at runtime**, which is why a `require()` can sit inside an `if` or take a computed path. **ES Modules** (`import`/`export`) are the JavaScript standard: loading is asynchronous and resolved **statically, at parse time**, before any code in the file runs at all. That static structure is what enables tree-shaking — a bundler can prove at build time which exports are never imported and drop them — something that's fundamentally impossible with `require()`, since the path it's given could be a runtime variable.

### `require()` vs `import`
`require` is an ordinary function call, so it can be called conditionally, inside a loop, or with a path built at runtime. `import` is a static declaration — it's hoisted and fully resolved before any code in the module executes, so it can never be conditional. The dynamic escape hatch is the function form `import()`, which returns a promise and works from either module system.

### `module.exports` vs `exports`
`exports` is nothing more than a local variable that starts out pointing at the same object as `module.exports`. Because `require()` always returns `module.exports`, *mutating* `exports` works fine, but *reassigning* it only repoints the local variable — Node still hands back the original, untouched `module.exports`.

```js
exports.foo = 1;              // ✅ works — mutates the shared object
module.exports = { foo: 1 };  // ✅ works — reassigns the real thing
exports = { foo: 1 };         // ❌ exports nothing — only repoints the local variable
```

### How does `require()` cache modules?
The first `require()` of a given path resolves it to an absolute file path, executes that file exactly once, and stores the resulting `module.exports` in `require.cache`, keyed by that resolved path. Every subsequent `require()` of the same path — from anywhere in the app — returns the cached object directly, without re-executing the file at all.

### Why is module caching useful?
Two reasons: performance, since a file is parsed and run only once no matter how many places require it, and — more importantly — **identity**. Every file that requires your database connection pool gets back the exact same object, so shared state and singletons fall out of the caching for free rather than requiring any deliberate wiring.

```js
// db.js — created once, shared by everyone who requires it
module.exports = mysql.createPool({ connectionLimit: 10 });
```

### What are circular dependencies, and how does Node handle them?
`a.js` requires `b.js`, and `b.js` requires `a.js` — directly or through a longer chain. Node does **not** throw an error; instead it hands back whatever `module.exports` looks like **at the moment of the circular require**, which is very likely incomplete. Anything the first module hadn't assigned to its exports yet comes back as `undefined` — the classic symptom is `TypeError: X is not a constructor`, and worse, whether it triggers at all depends on **which file happened to load first**, so the exact same cycle can pass in one entry point and break in another. ES modules handle this somewhat more gracefully via hoisting and live bindings, but touching a `const` too early still throws a TDZ `ReferenceError`. The real fix is usually extracting whatever both modules need into a third, shared module; a quicker patch is moving the `require()` inside a function body so it resolves lazily, by which point both files have finished loading.

```js
// a.js                              // b.js
exports.done = false;                exports.done = false;
const b = require('./b');            const a = require('./a');   // ← a is still half-built here
exports.done = true;                 console.log(a.done);         // false, not true
```

### What are dynamic imports?
`import('./module.js')` returns a promise and loads a module at runtime rather than at parse time — used for conditionally loading a module, for code-splitting, and as the portable way to load an ES module from CommonJS code, since `require()` cannot load ESM synchronously (`require` is sync; ESM resolution is async).

```js
const { default: chalk } = await import('chalk');
```

---

<a name="s11"></a>
# 11. Express Internals

### How does Express work?
Express is a thin layer built directly on top of Node's `http` module. Internally it keeps an ordered array of middleware functions, and for every incoming request it walks that array from the top, calling each function whose registered path and method match the request, in the exact order they were registered.

### How does middleware work?
Each middleware function receives `(req, res, next)` and must do exactly one of three things: call `next()` to hand off to the next middleware in the stack, send a response and end the chain right there, or call `next(err)` to jump straight to the error-handling middleware. Middleware is an assembly line — each station either does its job and passes the item along, or takes it off the line entirely.

### What is `next()`?
The signal to continue to the next matching middleware in the stack. Forgetting to call it — or calling it on only some code paths — means the request **hangs forever**: no error, no log line, just a client sitting there until it eventually times out. This is the single most common Express bug, and it's usually a conditional missing its `else`.

```js
app.use((req, res, next) => {
  if (req.user) next();
  // ❌ no else — unauthenticated requests hang silently, forever
});
```

### How are routes matched?
In **registration order**, top to bottom, comparing both the HTTP method and the path pattern. The first matching route that actually ends the response wins the request. This is exactly why a catch-all handler registered *before* your real routes swallows every request meant for them.

### What is error middleware?
A middleware function distinguished purely by having **four** parameters — `(err, req, res, next)`. Express identifies it by that arity alone, which means dropping the unused `next` parameter silently demotes it back to ordinary middleware, a subtle and common bug. It must be registered **last**, since registration order is execution order and everything that could fail needs to sit before it.

```js
app.use((err, req, res, next) => {           // 4 args = Express treats this as the error handler
  res.status(err.status || 500).json({ error: err.message });
});
```

⚠️ In Express 4, errors thrown inside an `async` route handler are **not** caught automatically — the framework only catches synchronous `throw`s. You must call `next(err)` explicitly, wrap handlers in a helper, or use `express-async-errors` (Express 5 fixes this natively).

### Why does middleware order matter?
Because the whole thing is a strictly sequential pipeline. Body parsing has to run before anything reads `req.body`; authentication has to run before any protected route; error handling has to be registered last. Register the auth middleware *after* the routes it's meant to protect, and it protects nothing at all — those routes already ran.

### What is the difference between a Router and the app?
A `Router` is a self-contained mini-application — it has its own isolated middleware stack — that gets mounted onto the main app at a URL prefix with `app.use('/api/users', usersRouter)`. It exists so a feature can own its own routes and middleware without bloating one enormous file, and so mounting decides both the prefix and what middleware applies to it in one place.

### What is the HTTP request lifecycle through Express?
```
request arrives → http.Server 'request' event
    → Express app receives (req, res)
    → walks the middleware stack in registration order
    → the first matching route handler runs
    → res.send() / res.json() ends the response
    → (any error → next(err) → error middleware)
```

---

<a name="s12"></a>
# 12. HTTP

### How does HTTP work?
A text-based request/response protocol layered over TCP. The client opens a connection, sends a method, a path, headers, and optionally a body; the server replies with a status code, headers, and a body of its own. It's fundamentally **stateless** — every request stands entirely on its own with no memory of the last one — which is precisely why cookies, sessions and tokens exist at all: something has to carry identity across requests that the protocol itself doesn't.

### How does Node create an HTTP server?
`http.createServer((req, res) => { ... })` returns a server object that emits a `'request'` event for every incoming request; `server.listen(port)` binds it to a socket and starts accepting connections. Express is, underneath, just a request handler you hand to exactly this same API.

```js
const server = http.createServer((req, res) => res.end('hi'));
server.listen(3000);
```

### What is `IncomingMessage`?
The request object Node hands you — and critically, it's a **Readable stream**, not a plain object. Headers are available synchronously the instant the request arrives, but the body streams in over time in chunks, which is exactly why parsing `req.body` is inherently asynchronous and why `req.body` reads as `undefined` until a body-parsing middleware has actually consumed the stream.

### What is `ServerResponse`?
The response object — a **Writable stream**. `res.write()` sends a chunk immediately; `res.end()` finishes the response. Express's `res.json()` is simply a convenience wrapper that sets the right header and calls `end()` for you.

### What is HTTP keep-alive?
Reusing a single TCP (and, for HTTPS, TLS) connection across multiple sequential requests instead of tearing it down and reconnecting for every one. It eliminates the handshake cost per request, which is a substantial saving since the handshakes themselves can cost more round trips than the actual request. It's the default behavior in HTTP/1.1.

### What is chunked transfer encoding?
Sending a response in pieces without knowing the total content length up front, signaled by `Transfer-Encoding: chunked`. It's what makes streaming a response possible at all — the server can start sending bytes before it knows, or before it has even produced, the full body.

### How do you stream a response?
Pipe a readable stream directly into `res` instead of buffering the whole thing first: `fs.createReadStream(path).pipe(res)`. Memory stays constant regardless of file size, and the client starts receiving bytes immediately rather than waiting for the entire file to be read into memory first.

### What are HTTP headers, and what's the gotcha with setting them in Node?
Metadata attached to a request or response — content type, length, caching directives, authentication, cookies. In Node, `res.setHeader()` must be called **before** the first `res.write()` or `res.end()` — once any body bytes have gone out, the headers are already committed on the wire, and trying to set one afterward throws `Cannot set headers after they are sent`.

### What are cookies, and what are the security flags?
Small key-value strings the server asks the browser to store and automatically re-attach to every subsequent request to that domain — the standard mechanism for carrying a session id. `httpOnly` blocks JavaScript from reading the cookie at all, defeating theft via XSS; `secure` restricts it to HTTPS; `sameSite` controls whether it's sent on cross-site requests, which is the primary CSRF defense.

### What are sessions?
Server-side state keyed by an id that lives in a cookie — the server holds all the real data, the client holds only a meaningless-alone identifier. The trade against JWTs: sessions can be revoked instantly by deleting the server-side entry and stay tiny on the wire, but require a shared store (typically Redis) the moment you run more than one server process, since in-memory sessions on one process are invisible to the others.

---

<a name="s13"></a>
# 13. EventEmitter

### What is EventEmitter?
Node's built-in implementation of the observer pattern — an object that lets you register named listeners and later `emit()` that event to run every listener registered for it, synchronously, in the order they were registered.

### Why does Node use EventEmitter everywhere?
Because asynchronous I/O is naturally event-shaped: a socket has "data arrived," "connection closed," "error"; a stream has "data," "end," "drain." Streams, HTTP servers, TCP sockets, and even the global `process` object are all `EventEmitter`s under the hood — it's the common vocabulary Node's I/O layer speaks.

### How does `emit()` work?
It looks up every listener registered for that event name and calls each one **synchronously, in registration order**, passing along whatever arguments were given to `emit()`. Emitting is not asynchronous — a common misconception — and `emit()` returns `true` if there were any listeners to call, `false` otherwise.

```js
const bus = new EventEmitter();
bus.on('msg', text => console.log('got:', text));
bus.emit('msg', 'hi');   // runs the listener synchronously, right here
```

### `on()` vs `once()`
`on()` registers a listener that fires on every occurrence of the event. `once()` fires exactly one time and then automatically removes itself — the right choice for something that happens exactly once, like "connected" or "ready."

### How do memory leaks arise from listeners?
Every call to `on()` keeps a reference to the callback and everything its closure captured. Registering a new listener inside a request handler without ever removing it means listeners — and whatever they closed over — accumulate on a long-lived emitter for as long as the process runs. The fix is `once()` where it applies, or an explicit `removeListener()`/`off()` once you're done with a given listener.

### Why does the "max listeners" warning exist?
Node warns once an emitter accumulates more than 10 listeners for the same event. It is **not an error and not a hard limit** — it's a leak detector, built on the assumption that eleven listeners for one event usually means listeners are being added in a loop somewhere and never removed. If the count is genuinely intentional, raise it explicitly with `setMaxListeners()`.

---

<a name="s14"></a>
# 14. Process

### What is `process`?
A global object representing the currently running Node process — its environment variables, command-line arguments, standard streams, and lifecycle events. It's also, itself, an `EventEmitter`, which is how you hook signals (`SIGTERM`) and fatal conditions (`uncaughtException`, `unhandledRejection`).

### What is `process.env`?
The environment variables the process was launched with — the standard channel for passing configuration and secrets into an app, since it keeps them out of source control entirely and lets identical code run correctly across different environments.

```js
const port = Number(process.env.PORT) || 3000;   // ⚠️ always a string — coerce it
```
⚠️ Every value is always a **string**. `process.env.PORT` is `"3000"`, not the number `3000`, and `process.env.DEBUG` set to the string `"false"` is still truthy in a plain boolean check.

### What is `process.argv`?
The array of command-line arguments the process was started with. Index 0 is the path to the Node executable itself, index 1 is the path to the running script, and your actual arguments begin at index 2.

### What does `process.exit()` do?
Terminates the process immediately with the given status code. ⚠️ It does **not** wait for pending asynchronous work to finish — in-flight writes, unflushed logs, and open connections can all be lost mid-operation. For a clean shutdown, stop accepting new connections and let the event loop drain naturally instead of calling this directly.

### What is `process.cwd()`?
The directory the process was **launched from** on the command line — which is not necessarily the directory the running script actually lives in; that's `__dirname`. Confusing the two is the usual reason relative file paths break the moment someone runs the app from a different working directory.

### What is `process.pid`?
The operating system's process id for the running Node process — used for logging and for sending OS signals when managing or supervising processes externally.

### What does `process.nextTick()` do?
Schedules a callback to run after the current synchronous operation completes but before promise callbacks and before the event loop is allowed to continue — Node-specific, and the single highest-priority queue that exists, which is exactly why an application that leans on it too heavily can starve the entire loop.

---

<a name="s15"></a>
# 15. Worker Threads

### Why were Worker Threads introduced?
To give Node a way to do genuinely CPU-bound work without freezing the event loop. Before `worker_threads` existed, a heavy computation occupied the single JavaScript thread completely and froze the entire server for its duration; the only escape was spawning an entirely separate OS process.

### What's the difference between the Event Loop and Worker Threads?
The event loop delivers **concurrency** for I/O — many operations in flight on one thread, because nearly all of them spend most of their time waiting, and waiting overlaps for free. Worker threads deliver **parallelism** for CPU — genuinely simultaneous execution across multiple cores. The event loop cannot help with computation at all, because computation, unlike I/O, is never actually waiting on anything — it's occupying the thread the entire time.

### Child Process vs Worker Thread — what's the difference?
```
Worker Thread   same process, own V8 isolate + event loop
                lighter, faster to start, CAN share memory via SharedArrayBuffer
Child Process   separate OS process, full isolation
                heavier, but a crash can't take the parent down; can run any program
```
Reach for worker threads for CPU-bound work that lives inside your own app; reach for child processes when running an entirely separate program, or when process-level isolation matters more than the extra overhead.

### What is SharedArrayBuffer?
Memory two threads can access **without copying** it back and forth. The default `postMessage` mechanism serializes data via the structured clone algorithm, which for a large array can cost more CPU time than the actual computation being offloaded. `SharedArrayBuffer` avoids that copy entirely — at the cost of needing `Atomics` to coordinate reads and writes safely, since you've deliberately reintroduced shared mutable state and the race conditions that come with it.

### What is MessageChannel?
A two-ended communication channel between threads, letting two workers talk to each other directly instead of every message having to be relayed through the main/parent thread.

### What kind of work belongs in worker threads?
Image resizing, video transcoding, large in-memory data aggregation, password hashing at scale, and complex parsing — genuinely CPU-intensive work. The standard production pattern is a **pool** of workers sized to the CPU count, fed from a queue of tasks; spawning a brand-new worker per request costs more in startup overhead (roughly 10–40ms plus several MB) than it saves.

```js
const { Worker } = require('worker_threads');

app.get('/heavy', (req, res) => {
  const worker = new Worker('./heavy.js', { workerData: 45 });
  worker.on('message', result => res.json({ result }));   // registers and returns immediately
  worker.on('error', err => res.status(500).json({ error: err.message }));
});
// heavy.js runs on its OWN thread:
//   const { parentPort, workerData } = require('worker_threads');
//   parentPort.postMessage(fib(workerData));
```

The worker doesn't "return" a value the way a function call would — it **emits a message**, and the main thread's `worker.on('message', cb)` reacts to that message as an ordinary event through the same event loop everything else uses; the main thread never blocks waiting on it.

---

<a name="s16"></a>
# 16. Child Processes

### What does `exec()` do?
Runs a command **inside a shell** and buffers the entire output before handing it to a callback — convenient for short, trusted commands. ⚠️ Two real hazards: the shell means unsanitized user input can be used for command injection, and the output buffer has a fixed size limit that large output will simply exceed.

### What does `execFile()` do?
Runs an executable directly, **without a shell**. Safer than `exec` for exactly that reason — arguments are passed as an array rather than interpolated into a shell command string, so there's no shell syntax available for anything to inject into.

### What does `spawn()` do?
Launches a process and gives you its stdio as **streams** instead of a single buffered result. There's no output size limit, and you can process the output as it arrives rather than waiting for the whole thing — the right default for long-running commands or commands with large output.

```js
spawn('ffmpeg', ['-i', userFile, 'out.mp4']);   // ✅ safe with user input — no shell, streamed
exec(`convert ${req.body.filename} out.png`);   // ❌ shell injection if filename is user-controlled
```

### What does `fork()` do?
A specialized form of `spawn()` specifically for launching another **Node script**, with an IPC channel wired up automatically so the parent and child can exchange messages with `.send()` and `.on('message')`. It's the primitive `cluster` itself is built on.

### Which child-process method is most memory efficient?
`spawn` (and `fork`, which is built on it), because output streams through incrementally instead of accumulating in a single in-memory buffer the way `exec`'s output does before you ever see any of it.

### What is IPC in the context of child processes?
Inter-process communication — how two genuinely separate processes exchange data, since they don't share memory by default. `fork()` sets up a message channel automatically; every message sent across it is serialized, so there's a real, measurable cost to passing large payloads this way.

### How does process communication differ from thread communication?
Messages between processes are **copied**, never shared — each process has its own entirely separate memory space. That's the fundamental difference from worker threads, which *can* share memory via `SharedArrayBuffer`, and it's exactly why worker threads are preferable when you're moving large amounts of data rather than small control messages.

---

<a name="s17"></a>
# 17. Memory Management

### Stack vs Heap
The **stack** holds function call frames, local primitives, and references to heap objects — it's automatically freed the instant a function returns, and it's fast precisely because that cleanup requires no bookkeeping. The **heap** holds objects, arrays, closures, and Buffers — variable-sized, managed entirely by the garbage collector, and much larger (roughly 2–4GB by default). Deep, unbounded recursion overflows the stack (~1MB, a catchable `RangeError`); retaining too many objects exhausts the heap (a fatal, uncatchable process crash). JavaScript always copies what's on the **stack** when you assign a variable — for a primitive that's the value itself, for an object it's the *reference*, which is why two variables holding "the same object" both point at one shared heap allocation.

```js
function boom() { return boom(); }
// RangeError: Maximum call stack size exceeded   ← catchable, about call DEPTH

const arr = []; while (true) arr.push(new Array(1e6));
// FATAL ERROR: JavaScript heap out of memory     ← NOT catchable, about data VOLUME
```

### What are memory leaks?
Memory that is still **reachable** through some live reference but will never actually be used by the program again. Garbage collection is working exactly as designed here — you told it, through some lingering reference, to keep the object around.

### How do closures cause memory leaks?
A closure keeps its *entire* enclosing scope alive as one shared object, not just the specific variables it actually reads. A callback that closes over a scope which also happens to contain a large buffer keeps that buffer alive for as long as the callback itself is registered somewhere, even if the callback never touches the buffer directly — this is a genuinely common and surprising source of accidental retention.

```js
function outer() {
  const huge = new Array(1e7);   // ~80MB
  return () => 42;               // ⚠️ never touches `huge`, but V8 shares one context per scope
}
```

### How do global variables cause memory leaks?
Anything hanging off `global` or sitting in a module-level `const` lives for the entire lifetime of the process by construction — there's no scope for it to fall out of. A module-level cache or `Map` that's written to on every request and never pruned is, by a wide margin, the most common real-world leak.

### How do timers cause memory leaks?
`setInterval` never stops on its own, and for as long as it runs it keeps its callback — and everything that callback's closure captured — alive. Always retain the interval's id and call `clearInterval` on it during shutdown or when the resource it's polling goes away.

### How do event listeners cause memory leaks?
Every registered listener is itself a live reference. Adding a new listener per incoming request to a long-lived emitter, without ever removing it, accumulates both the callback functions and whatever they closed over, request after request, for the life of the process.

### What are heap snapshots, and how do you use them to find a leak?
A heap snapshot is a complete dump of every live object on the heap at one instant. The standard technique: take a baseline snapshot after warmup, exercise the suspect code path heavily (e.g. 1,000 times), take a second snapshot, force a garbage collection and take a third, then compare the **first and third** — anything still present after GC that grew between them is a genuine leak, not just garbage that hadn't been swept yet. That's also why you need three snapshots rather than two: the second one is full of objects that are already garbage but simply haven't been collected yet, and comparing against it would produce false positives. Available via `--inspect` plus Chrome DevTools' Memory tab, or programmatically via `v8.writeHeapSnapshot()`.

### What are GC generations?
Objects start out in the **young generation**, collected frequently by a fast copying collector, on the well-tested assumption that most objects die almost immediately after creation. Anything that survives gets promoted to the **old generation**, which is collected far less often using a slower mark-sweep-compact algorithm. This is exactly why short-lived allocations inside a request handler are cheap, while a long-lived cache that keeps growing is expensive — it lives in the region that's scanned less often but costs far more per scan.

---

<a name="s18"></a>
# 18. Performance

### What is event loop lag, and why does it matter?
Event loop lag is the delay between when a scheduled callback was *due* to fire and when it actually did — measured by asking Node to run something in 0ms and seeing how late it actually runs. A late 0ms timer means something occupied the thread for that entire gap, since the loop cannot interrupt running code to fire a due timer. It's the single most useful Node health metric precisely because **a blocked event loop looks completely healthy on every other dashboard** — memory looks normal, the process isn't crashing, and one core pegged at 100% is entirely normal for Node. Only lag actually reveals it.

```js
const { monitorEventLoopDelay } = require('perf_hooks');
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setInterval(() => console.log('p99 lag:', h.percentile(99) / 1e6, 'ms'), 5000);
// <10ms healthy · 10-100ms something hogs it sometimes · >100ms requests queue behind CPU work
```

### How should you measure performance?
Event loop lag, heap usage over time, and **p95/p99** response latency rather than the average — the average hides exactly the worst experiences, since a handful of five-second outliers among a thousand fast requests barely moves a mean but ruins those users' day. `perf_hooks` provides timing primitives directly inside the process for building these measurements yourself.

### How do you profile a slow Node process?
`node --prof` combined with `--prof-process`, or the Chrome DevTools inspector via `--inspect`, produces a CPU profile showing exactly where time is spent. A **flame graph** is usually the fastest way to spot the one function actually consuming the thread — width in the graph represents time spent, and depth just means "functions calling functions," not a problem on its own. Profile before optimizing; the actual bottleneck is very rarely where intuition points first.

### Why does synchronous code block everyone, not just one request?
Because there's exactly one JavaScript thread serving every connected user simultaneously. A 200ms synchronous operation doesn't slow down just the request that triggered it — it delays **every** other pending request by that same 200ms, because the event loop literally cannot interrupt running code to give anyone else a turn. That's why a single `readFileSync` sitting in a hot request path can quietly destroy throughput for the entire service, not just for the one caller.

### What is `cluster`?
Forking one Node process per CPU core, with every forked process sharing the same listening port — the OS or Node's own primary process distributes incoming connections across them. It's how a single machine's multiple cores actually get used, since one Node process only ever executes JavaScript on one of them.

```js
if (cluster.isPrimary) {
  for (let i = 0; i < os.cpus().length; i++) cluster.fork();
} else {
  require('./server');
}
```
⚠️ Cluster workers share **nothing** by default — separate memory, separate everything — so any in-memory state, sessions, or caches have to move to a shared store like Redis, or two-thirds of requests on a three-worker cluster fail to find data another worker created.

### What is PM2?
A process manager that keeps an app running, restarts it automatically on crash, can run it in cluster mode without you writing the fork logic yourself, handles zero-downtime reloads during a deploy, and aggregates logs across processes. Roughly "cluster plus supervision, without building it by hand."

### What is load balancing?
Distributing incoming requests across multiple server instances. `cluster` does this within a single machine; a reverse proxy or a cloud load balancer does it across several machines. It's needed for both raw throughput and availability, since a single instance is always a single point of failure.

### How does caching help performance, and what's the hard part?
Keeping a computed or fetched result around so the same work isn't repeated for identical requests. In-memory caching is the fastest option but is per-instance and vanishes on restart; Redis is shared across every instance and survives restarts, at the cost of a network round trip (~1ms). The genuinely hard part is always **invalidation** — deciding up front exactly how and when a cached value is allowed to go stale, not the caching mechanism itself.

### What does compression buy you, and what does it cost?
gzip or brotli on response bodies, typically cutting JSON payload size by roughly 70–90%. It costs real CPU time to compute, and that work runs on the libuv thread pool (zlib is one of the four things that uses it) — under load it competes with `fs` and `bcrypt` for the same four threads. For a high-traffic service it's usually better done at a reverse proxy or CDN in front of Node, keeping the work off the event loop entirely.

---

<a name="s19"></a>
# 19. Security

### What is CORS, and is it a security feature?
CORS is a **browser-only** restriction: JavaScript running on one origin cannot read a response from a different origin unless that server explicitly allows it via `Access-Control-Allow-*` headers. ⚠️ The point interviews probe hardest: CORS is enforced entirely by browsers — `curl`, Postman, and any server-to-server call ignore it completely, so it protects **nothing about your API itself**. What it actually protects is your users' browsers, by stopping a malicious page from making authenticated requests to your API using the victim's own cookies and reading back the response. Your API's real security boundary is authentication, not CORS.

```js
app.use(cors({ origin: ['https://myapp.com'], credentials: true }));   // never '*' with credentials
```
`origin: '*'` combined with `credentials: true` is invalid and browsers reject it outright — that combination would let any site make authenticated requests as your logged-in users.

### What does Helmet do?
Middleware that sets a batch of protective HTTP headers in one line — a Content Security Policy restricting where scripts may load from, HSTS forcing HTTPS on future visits, `X-Content-Type-Options: nosniff` stopping browsers from guessing a file is executable JS when it isn't, frame options blocking clickjacking, and removing the `X-Powered-By` header that otherwise advertises "Express" to attackers.

```js
app.use(helmet());
```

### What is XSS, and how do you defend against it?
Injecting attacker-controlled JavaScript into a page so that **other users'** browsers execute it, trusting it because it appears to come from your own domain — letting the attacker steal session data or act as that user. Defenses: escape output by context (React/Vue do this by default for interpolated values — don't defeat it with `dangerouslySetInnerHTML` on user input), set `httpOnly` on session cookies so a successful XSS still can't read the session token, use a Content Security Policy via Helmet, and sanitize any rich-text HTML with an allowlist tool like DOMPurify rather than trusting it. XSS defeats *every* client-side secret — if attacker JavaScript is running on your page, anything JavaScript can read is theirs, which is the core argument against storing tokens in `localStorage`.

```js
element.innerHTML = userInput;    // ❌ executes anything embedded in it
element.textContent = userInput;  // ✅ always rendered as plain text
```

### What is CSRF, and how do you defend against it?
The attacker doesn't steal your cookie — they trick your browser into *using* it. A hidden form on a malicious site submits to your bank while you're separately logged in, and the browser automatically attaches your real session cookie because that's simply what browsers do with cookies for any site. Defenses: `sameSite: 'lax'` (or `'strict'`) cookies, which blocks most cross-site automatic submissions and is the modern default; an explicit anti-CSRF token in a hidden field the attacker's page can't read; and checking the `Origin`/`Referer` header. CSRF only applies to credentials the browser attaches **automatically** — cookies. An `Authorization: Bearer` header has to be set deliberately by your own JavaScript, and an attacker's page has no way to make your JavaScript do that, so Bearer-token auth is simply not vulnerable to CSRF at all.

### What is SQL injection, and how do you defend against it?
Concatenating untrusted user input directly into a query string so it becomes part of the executable command rather than just data. The actual fix is **parameterized queries** — never string concatenation, ever. Input validation helps as defense in depth but is not itself the fix; parameterization is.

### What is NoSQL injection?
The same underlying class of bug, expressed in MongoDB's query object shape: injecting an **object where a string was expected**. If a query is built directly from unvalidated request body fields, sending `{"password": {"$gt": ""}}` turns the comparison into "any password greater than the empty string" — every password matches, and the attacker is logged in with no password at all. The fix is validating that fields are the expected primitive type (`zod`/`joi` kills this outright, since an object fails a `z.string()` check), plus a tool like `express-mongo-sanitize` that strips `$`-prefixed keys from user input as a second layer of defense.

### What is JWT, and what should never go in it?
A signed token carrying a set of claims, letting the server verify a request's authenticity without any database lookup at all — it's math (a signature check), not a lookup. ⚠️ The payload is base64-encoded, **not encrypted** — anyone holding the token can decode and read it, so nothing sensitive (passwords, PII, secrets) belongs in it. Tokens also **cannot be revoked** before their stated expiry without additional infrastructure, which is exactly why access tokens should be short-lived and paired with a server-side refresh token for anything that needs real revocation.

### Sessions vs JWT — how do you decide?
Sessions keep state on the server (typically Redis) and hand the client only a meaningless-alone id; they cost a lookup per request (~1ms) but can be revoked instantly by deleting the server-side row. JWTs are self-contained and verified with pure math — no lookup, no shared store — but can't be revoked before expiry and require every verifying service to hold (or fetch) the signing key. Default to **sessions** for a normal web app, where instant revocation matters and 1ms of Redis is not the bottleneck; reach for JWTs when statelessness buys something real — multiple services that shouldn't share a store, mobile clients, or third-party API consumers.

### How does password hashing work, and why not SHA-256?
Use **bcrypt, scrypt, or argon2id** — never a general-purpose fast hash like SHA-256 or MD5. Hashes built for speed are exactly wrong for passwords: a GPU computes billions of SHA-256 hashes per second, so a short password falls to brute force in minutes. bcrypt does roughly 10 thousand per second by design — being deliberately slow **is** the security property, turning the same attack into centuries. bcrypt also salts automatically and stores the salt inside the resulting hash string, so two users with identical passwords get different hashes and rainbow tables fail outright.

```js
const hash = await bcrypt.hash(password, 12);       // ~250ms — on purpose
const ok   = await bcrypt.compare(password, hash);  // never compare hashes yourself
```
⚠️ bcrypt runs on the libuv **thread pool**, so it's a classic pool-exhaustion case: four concurrent logins saturate all four default threads, and the fifth user waits a full hash cycle behind them — CPU looks idle and event loop lag looks fine while login latency alone climbs. Always use the async variant; `bcrypt.hashSync` blocks the event loop directly for every login.

### How do refresh tokens and rotation work, and what race condition does rotation create?
A short-lived access token (minutes, sent on every request) paired with a long-lived refresh token (days, sent only to a dedicated `/refresh` endpoint and stored server-side) — this pattern exists precisely *because* a JWT itself can't be revoked. The refresh token, being server-side, genuinely can be. Under **rotation**, every use of a refresh token invalidates it and issues a brand-new one — a single-use ticket. The payoff is automatic theft detection: if an already-used refresh token is presented again, two copies must exist, meaning it was stolen, so the server revokes the **entire token family** and forces a fresh login rather than trusting either copy.

```
Login    → access A1 + refresh R1
Refresh  → present R1 (marks it used) → issue A2 + R2
⚠️ R1 presented again (already used) → theft → revoke the WHOLE family (R2, R3, …)
```

⚠️ Rotation creates its own race condition: if a page fires several API calls at once with an expired access token, naive code triggers a separate refresh call per request — only the first succeeds, and every other one presents a refresh token already marked used, which looks identical to theft and can wrongly nuke a legitimate session. The fix is a single shared in-flight refresh promise: the first caller starts the refresh, and every concurrent caller just awaits that same promise instead of starting its own.

```js
let refreshPromise = null;
async function getValidToken() {
  if (isExpired(accessToken)) {
    refreshPromise ??= refreshAccessToken().finally(() => { refreshPromise = null; });
    accessToken = await refreshPromise;   // every concurrent caller shares ONE refresh call
  }
  return accessToken;
}
```

### How does rate limiting work, and what's the security angle?
Capping how many requests a client may make in a time window, to blunt brute-force login attempts, scraping, and accidental traffic floods. The login endpoint needs a far tighter limit than general API traffic, since that's specifically where password guessing happens — and because bcrypt is expensive by design, an unthrottled login endpoint is itself a CPU-exhaustion DoS vector, since every guess costs a full ~250ms of a pool thread. Limit both per-IP (catches one attacker hammering one account) and per-account (catches distributed guessing spread across many IPs) — and back it with Redis under `cluster` or multiple instances, or each of N processes independently allows the full limit, silently multiplying it by N.

```js
app.use('/login', rateLimit({ windowMs: 900_000, max: 5 }));   // tight — this is where guessing happens
```

### What is input validation, and why is it the highest-leverage defense?
Validating and coercing every request at the boundary — before any handler or service code touches it — using a schema library like Zod or Joi, and **whitelisting** known-good fields rather than blacklisting bad ones. It's the single highest-leverage defense available, because it kills NoSQL injection, mass-assignment bugs (`{ role: 'admin' }` slipping into an update payload), and a large fraction of XSS, all at one choke point before any of that data reaches the rest of the system.

---

<a name="s20"></a>
# 20. Node Architecture

### How does Node start?
It initializes a V8 isolate, creates libuv's event loop, sets up Node's global objects and C++ bindings (`process`, `console`, `Buffer`), resolves and loads your entry file as a module, executes it top to bottom synchronously, drains the `nextTick` and microtask queues, and only then enters the event loop proper — which keeps the process alive as long as any handle or pending operation remains.

### What happens when you execute `node app.js`?
```
node binary starts → initialise V8 isolate + context
    → initialise libuv event loop
    → set up globals (process, console, Buffer) and C++ bindings
    → resolve and load app.js as a CommonJS module
    → execute it top to bottom (synchronously)
    → drain nextTick + microtask queues
    → enter the event loop
    → loop until no handles or pending work remain → exit
```

### How is JavaScript actually executed?
V8 parses the source into an AST, Ignition compiles that to bytecode and starts running it immediately with no compile pause, and TurboFan later recompiles whichever functions run hot into specialized machine code using the types Ignition observed along the way.

### How is C++ involved in Node at all?
Everything below the JavaScript layer is C or C++. V8 itself is C++, libuv is C, and Node's own bindings are the C++ glue connecting the two — so calling `fs.readFile` crosses from your JavaScript into C++ bindings, into libuv, into an actual OS syscall, and the result travels all the way back through that same path.

### How does Node call OS APIs?
Through libuv, which wraps each platform's native async interface behind one uniform API — epoll on Linux, kqueue on macOS/BSD, IOCP on Windows — so identical JavaScript behaves the same across every platform Node supports.

### Why are file operations asynchronous specifically via a thread pool?
Because disk I/O is comparatively slow, and — unlike networking — most operating systems offer **no genuinely non-blocking file API** for libuv to hook into. So libuv fakes asynchrony for files by dispatching the blocking read or write to a **thread pool** worker instead, which is the entire reason that pool exists in the first place.

### Why is networking asynchronous without needing the thread pool?
Because operating systems *do* provide real non-blocking socket APIs. Node registers interest in a socket with the kernel's own event-notification mechanism and is notified only when that specific socket is actually readable or writable — **no thread sits waiting** — which is the direct reason Node can hold tens of thousands of concurrent connections.

### How does DNS resolution work — and why does it sometimes surprise people?
Two genuinely different paths. `dns.lookup()` calls the operating system's own resolver (`getaddrinfo`), which is a blocking C call with no async equivalent, so it runs on the **thread pool** — a burst of outbound HTTP requests by hostname can silently saturate the default four threads, since `http.request` calls `dns.lookup` implicitly under the hood. `dns.resolve()` instead talks to a DNS server directly over the network, which is ordinary async I/O and needs no thread at all.

### What happens end to end when an HTTP request arrives?
The OS notifies libuv that the listening socket has become readable; libuv wakes the event loop during the poll phase; Node accepts the connection and reads the incoming bytes; the built-in HTTP parser assembles them into a request object; the `'request'` event fires; your handler runs on the main thread. If that handler kicks off further async work, it returns immediately, and the actual response is written only once that work eventually completes.

---

<a name="s21"></a>
# 21. Build & Runtime

### npm vs npx
`npm` installs and manages a project's dependencies. `npx` **executes** a package's binary, downloading it temporarily on the spot if it isn't already installed locally or globally — which is why `npx create-react-app` works with no global install at all, and always runs whatever the current published version is rather than a stale cached one.

### What is `package.json`?
The project's manifest — name, version, dependencies, scripts, and entry points. `dependencies` are required at runtime in production; `devDependencies` are needed only for local development and the build itself, and shouldn't ship.

### What is `package-lock.json`, and why does it matter?
The **exact** resolved dependency tree — every package, its precise version, and an integrity hash, including every transitive dependency several levels deep. It's what makes installs reproducible across machines and over time: without it, a range like `^1.2.0` can resolve to a different actual version tomorrow and quietly break a build that worked yesterday on someone else's machine. Commit it.

### What is semantic versioning?
`MAJOR.MINOR.PATCH` — major means a breaking change, minor means a backwards-compatible new feature, patch means a bug fix with no API change. In a dependency range, `^1.2.3` allows minor and patch updates, `~1.2.3` allows only patch updates, and an exact version string pins the dependency entirely.

### How does Node's module resolution algorithm work?
For `require('x')`: first check whether `x` is a core module (`fs`, `path`) — those always win outright and can never be shadowed by a local file. If it starts with `./`, `../`, or `/`, resolve it as an explicit file path (trying the bare name, then `.js`, then `.json`, then `.node`; for a directory, its `package.json` `main`/`exports` field, or `index.js`). Otherwise it's a package name, and Node walks **up** the directory tree checking a `node_modules` folder at every level, all the way to the filesystem root — which is exactly why `node_modules` nests: two packages needing different versions of the same dependency each find their own on the way up.

### What are environment variables, and how should they be handled?
Configuration passed into the process from outside the code — connection strings, secrets, feature flags. They keep sensitive values out of source control and let one identical build run correctly across every environment. Every value arrives as a string, so validate and coerce them once at startup — a config-loading failure that surfaces immediately at boot is far better than a misconfigured value silently propagating as `undefined` and only failing three requests deep at 3am.

### What build tools does Node use, and why does the toolchain matter?
Plain Node usually runs your source directly with no build step at all. A build tool becomes necessary for TypeScript compilation, bundling a serverless function, or transpiling for an older runtime target. `tsc`, esbuild, and swc are the common choices — esbuild and swc are dramatically faster because, unlike `tsc`, neither is itself written in JavaScript. `tsc` both type-checks *and* emits JavaScript; esbuild/swc strip types **without checking them** at all, which is much faster but means real type safety only comes from running `tsc --noEmit` separately, typically in CI, alongside the fast build tool.

### What are source maps for?
A mapping from compiled/transpiled output back to the original source, so stack traces, breakpoints, and error reports show real file names and line numbers instead of minified or transpiled gibberish. Essential for debugging TypeScript from production error reports, where the deployed code is never the code you actually wrote.

---

<a name="s22"></a>
# 22. Scaling Node

### How does `cluster` help scaling, and what breaks?
Running one Node process per CPU core, with every worker sharing the same listening port — this is the direct answer to "one Node process only ever uses one core," so four cores means roughly four times the throughput. ⚠️ Workers share **no memory** with each other, so any in-process state, cache, or session store has to move somewhere shared, or requests randomly fail to find data another worker created.

### What does a reverse proxy do for a Node app?
A server sitting in front of your app — nginx or Caddy, typically — that terminates TLS, serves static files directly, compresses responses, buffers slow clients so Node isn't tied up waiting on a bad connection, and forwards everything else. It handles the things Node is comparatively bad at (raw C-speed I/O work) and shields the app from slow-client attacks that would otherwise tie up an event-loop-bound process.

### What does a load balancer add beyond a reverse proxy?
Distributing requests across multiple app instances, with health checks so a failed instance stops receiving traffic automatically. It provides both raw throughput and actual availability — without one, a single running instance is always a single point of failure regardless of how well it performs individually.

### What is horizontal scaling, and what does it require?
Adding more instances rather than a bigger machine. It fundamentally requires the app to be **stateless**: no in-memory sessions, no locally-stored file uploads, no in-process caches that must stay consistent — because any incoming request can land on any instance at any time, with no guarantee it's the same one as the last request from that client.

### What are sticky sessions, and when do you need them?
Pinning a given client to the same backend instance, usually by hashing their IP or a cookie. Necessary for genuinely stateful connections like WebSockets. Otherwise avoid them — they undermine even load distribution across instances, and losing that one instance takes every user pinned to it down with it.

### What role does Redis play in a scaled Node deployment?
The shared-state layer that actually makes horizontal scaling work in practice: session storage, a shared cache, atomic rate-limit counters (`INCR` plus `EXPIRE`, which can't race because Redis processes one command at a time), and pub/sub for broadcasting between instances — for example fanning a WebSocket message out to whichever specific instance happens to hold the recipient's live connection.

### What are message queues for, in a scaling context?
Decoupling producers from consumers so slow or non-critical work is taken entirely off the request path — the user's request returns immediately, while emails, thumbnails, and reports are processed separately by dedicated worker processes. A queue also absorbs sudden traffic spikes by buffering work rather than dropping it or forcing every request to pay the full processing latency.

### What are microservices, and what do they trade away?
Splitting one application into several independently deployable services. The payoff is independent scaling and independent deployment per service; the cost is network calls where function calls used to be, distributed transactions replacing local ones, and debugging that's genuinely much harder across service boundaries. Worth it once team autonomy at real scale demands it — usually premature before that point.

### What is the worker-queue pattern?
The concrete implementation of async processing: a queue (BullMQ over Redis, or a managed service like SQS) plus a pool of worker processes consuming jobs off it, with retries, exponential backoff, and a dead-letter queue for jobs that fail repeatedly. This is where genuinely CPU-heavy or slow work belongs in a scaled Node system — off the request-serving processes entirely.

---

<a name="s23"></a>
# 23. ⭐ Advanced Internals

### How does Node communicate with libuv?
Through a C++ binding layer. A call like `fs.readFile` in JavaScript calls into a C++ function, which builds a libuv request struct carrying a pointer back to your JavaScript callback and hands the whole thing to libuv. When the underlying operation completes, libuv invokes the corresponding C++ callback, which crosses back into V8 to actually run your JavaScript.

### How does libuv communicate with the operating system?
Two genuinely different mechanisms depending on the kind of operation. For sockets, it registers interest with the kernel's own event-notification API and waits, doing nothing, until the kernel says a specific one is ready. For files and other operations that block with no async equivalent, it dispatches the work to its own **thread pool**, since no non-blocking OS interface exists for those.

### Why is networking not handled by the thread pool at all?
Because it genuinely doesn't need to be. Operating systems provide real non-blocking socket APIs — you tell the kernel "wake me when any of these ten thousand sockets becomes readable" and exactly one thread waits for all of them at once. Using a dedicated thread per socket would defeat the entire point of that design. Files have no equivalent OS-level mechanism, which is precisely why they *do* need the pool.

### How are timers implemented internally?
libuv keeps every active timer in a **min-heap** ordered by expiry time, so finding the next one due to fire is an O(1) operation. During the timers phase the loop pops and runs everything already due. The nearest upcoming expiry also caps how long the loop is allowed to block while sleeping in the poll phase — so it can never oversleep past a timer that's actually pending.

### How does Node schedule callbacks overall?
By queue, then by phase. Every completed operation places its callback into the queue for whichever phase it belongs to; the loop visits phases in a fixed order and fully drains each one's queue before moving to the next. The `nextTick` and promise microtask queues sit entirely outside that phase cycle and are drained between every single phase transition and callback — which is exactly why they consistently win against anything scheduled through a phase.

### Why does DNS resolution sometimes use the thread pool and sometimes not?
`dns.lookup()` calls the operating system's own resolver, `getaddrinfo`, which is a blocking C call with no async form at all — so libuv is forced to run it on a pool thread. `dns.resolve()` instead talks directly to a DNS server over UDP, which is ordinary async network I/O and needs no thread whatsoever. ⚠️ This is a genuine surprise in practice: since `http.request` resolves hostnames via `dns.lookup` internally, a burst of outbound HTTP requests by hostname can quietly saturate the default four-thread pool and present as an unrelated performance mystery.

### How are sockets represented internally?
As libuv handles wrapping the underlying OS file descriptor, paired with associated read/write buffers and the JavaScript-facing stream object your code interacts with. An open socket handle also keeps the event loop itself alive — it's a valid reason for the process not to exit even with no other pending work.

### How does Node multiplex thousands of connections on one thread?
It registers every open socket with the kernel's event-notification mechanism and blocks inside a single syscall until any of them becomes ready. The kernel hands back only the sockets that are actually ready, so the cost scales with the number of **active** connections rather than the total number open — ten thousand idle sockets cost almost nothing at all, where ten thousand OS threads doing the same job would cost gigabytes of stack space alone.

### epoll vs kqueue vs IOCP — what's the difference?
Three different operating-system solutions to the same underlying problem, all wrapped behind one uniform libuv API. **epoll** (Linux) and **kqueue** (macOS/BSD) are *readiness*-based: the kernel tells you "this socket is ready to read," and you then perform the read yourself. **IOCP** (Windows) is *completion*-based: you start the operation up front, and the kernel tells you once it has already finished on your behalf. Normalizing both fundamentally different models into a single API is most of what libuv actually exists to do.

### What is non-blocking I/O?
A syscall that returns immediately rather than parking the calling thread until the operation completes. Asking a non-blocking socket to read either hands back whatever data is currently available or immediately reports "nothing yet" — it never parks the thread waiting. Combined with an OS-level event-notification mechanism telling you *when* to try again, that's the whole trick behind one thread managing thousands of connections at once.

---

<a name="s24"></a>
# 24. Backend System Design

### Why separate Controller, Service, and Repository layers?
Each layer has exactly one reason to change. The **controller** deals purely with HTTP — parsing the request, validating shape, choosing status codes. The **service** holds business rules and knows nothing at all about HTTP. The **repository** handles persistence and knows nothing about business rules. The concrete payoff: business logic can be unit tested with zero HTTP involved, the database can be swapped without touching any business rule, and the exact same service can be reused from a queue consumer or a CLI script, not just from an HTTP route.

### Why use dependency injection in a Node backend?
So a module declares what it needs rather than constructing its own dependencies internally. That makes testing genuinely trivial — pass a fake repository in place of a real database connection — and lets implementations be swapped without touching any of their consumers. In plain Node this is often just constructor parameters, with no framework required to get the benefit.

### How should configuration be managed?
Environment variables, read and **validated once at process startup** into a single typed config object. Validating at boot means a missing or malformed variable fails immediately with a clear message at deploy time, rather than surfacing three requests deep as `undefined` inside a database connection string at 3am. Never commit secrets, and never scatter raw `process.env` reads throughout the codebase — one config module, read once.

### What makes an API stateless, and why does it matter?
No individual request depends on anything held in server memory from a previous request. Session state lives in Redis, file uploads go to object storage, and any in-process cache is either shared or explicitly safe to be per-instance. Statelessness is the actual prerequisite for horizontal scaling — it's what allows the load balancer to send any request to any instance with no assumption about which instance handled the last one.

### Where should request validation happen?
At the boundary, before anything else touches the incoming data, using a schema library like Zod or Joi. It produces clear `400` responses for malformed input, blocks a wide range of injection attacks that rely on unexpected types slipping through, and means every layer downstream of it can simply trust its inputs without re-checking them.

### What is a sound error-handling strategy?
Distinguish **operational** errors — a 404, a failed external call, invalid input from a user — which are expected and should be handled gracefully, from **programmer** errors — a bug, a null dereference — which are genuinely unexpected and should crash the process and let a supervisor restart it cleanly rather than continuing in an unknown state. Use typed error classes, one central error-handling middleware that maps each error type to a status code, and never leak a raw stack trace or database error message to the client.

### How should logging work in a backend service?
Structured JSON via a library like pino or winston, not raw `console.log`, so log lines are actually searchable and filterable in aggregate. Log at clear boundaries — request in, response out, every external call, and any error with full context. Never log secrets, tokens, or complete request bodies, since logs frequently end up with looser access control than the primary database.

### What are correlation IDs, and why do they matter?
A unique id generated once per incoming request, attached to every log line that request produces, and forwarded in headers to any downstream service it calls. Without one, debugging a failure that spans three services means manually correlating log timestamps across all of them; with one, a single log search returns the request's entire journey end to end.

### What's the difference between liveness and readiness health checks?
An endpoint the load balancer or orchestrator polls to decide whether to route traffic to an instance. **Liveness** asks "is the process alive at all?" — a failure here should trigger a restart. **Readiness** asks "can it actually serve traffic right now?" — checking the database and other dependencies, and removing the instance from rotation (without killing it) if one is unreachable. Conflating the two causes restart loops the moment a downstream dependency has even a brief blip, since a readiness failure gets treated as a reason to kill a perfectly healthy process.

### How does graceful shutdown work, and why does it matter?
On receiving `SIGTERM`: stop accepting brand-new connections, let in-flight requests finish naturally, close database and queue connections cleanly, then exit — with a timeout as a hard backstop in case something never finishes. Without this, every single deploy silently drops whatever requests happened to be mid-flight at that instant, which is one of the most common causes of intermittent 502s users report right after a rollout.

```js
process.on('SIGTERM', () => {
  server.close(async () => { await db.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();   // force-quit backstop
});
```

### How do you make a `POST` endpoint idempotent?
Because the network can't distinguish "the request never arrived" from "it arrived and only the response was lost," a client retrying a failed request is correct behavior — which means the server has to make retries safe, since `POST` isn't naturally idempotent the way `GET`/`PUT`/`DELETE` are. The standard mechanism is a client-generated `Idempotency-Key` header: the server **atomically** claims the key with `SET NX` (a plain check-then-act races — two simultaneous retries can both see "not found" and both create a duplicate order), does the underlying work exactly once, and stores the resulting response so any retry replays the identical result — same order id, same status — instead of creating a second one. A request arriving while the original is still mid-flight gets a `409` rather than either a duplicate or a stale response.

```js
const claimed = await redis.set(`idem:${key}`, 'processing', 'NX', 'EX', 86400);
if (!claimed) {
  const prior = await redis.get(`idem:${key}`);
  return prior === 'processing'
    ? res.status(409).json({ error: 'in progress' })
    : res.status(200).json(JSON.parse(prior));         // replay the same result
}
const order = await Order.create(req.body);
await redis.setex(`idem:${key}`, 86400, JSON.stringify(order));
res.status(201).json(order);
```
This matters most anywhere an external side effect is involved — payments, order creation, sending money. Where a natural unique business key already exists (an order number, an email address), a plain unique database constraint achieves the same protection with far less machinery.

---

<a name="s25"></a>
# 25. ⭐ Senior "Why" Questions

### Why is Node single-threaded?
Because it trades one hard problem for an easier one. Threaded servers need locks around any shared mutable state, and concurrent access to shared state is where the worst, least reproducible production bugs live. One thread plus non-blocking I/O gives high concurrency with none of that risk — the program can only ever be doing one thing at a time, so data races simply cannot exist by construction, not merely by discipline.

### Why does Node still use multiple threads internally?
Because not every kind of work has a non-blocking interface at the OS level. File I/O, DNS lookups via `getaddrinfo`, crypto, and compression all fundamentally block, so libuv delegates those specifically to a thread pool. Your JavaScript itself stays single-threaded throughout — the actual waiting is what gets delegated, not your code.

### Why is libuv necessary at all?
Because V8 only knows how to execute JavaScript — it has no built-in notion of a file, a socket, or a timer. And every operating system exposes async I/O in a completely different, incompatible way. libuv supplies the event loop, the thread pool, and one uniform API layered over epoll, kqueue, and IOCP so the same JavaScript behaves identically everywhere.

### Why doesn't `setTimeout(0)` execute immediately?
Because it schedules the callback for the **timers phase of the next loop iteration**, not for the current instant. The currently running synchronous code has to finish first, then the `nextTick` and promise microtask queues drain completely, and only after all of that can the loop reach the timers phase at all. `setTimeout(0)` genuinely means "as soon as possible," never "right now."

### Why does `process.nextTick()` execute before Promises?
Because Node maintains two entirely separate microtask queues and deliberately drains the `nextTick` queue first, completely, before touching the promise queue at all. It was originally designed so Node's own internals could react immediately after an operation — surfacing an error before anything else observed inconsistent state — and application code simply inherited that same top priority once the API was exposed publicly.

### Why can synchronous code block thousands of users at once?
Because exactly one thread serves every connected user. A 200ms synchronous operation doesn't delay only the one user who triggered it — it delays **every** other pending request by that same 200ms, because the event loop has no way to interrupt code that's already running to give someone else a turn. Blocking code doesn't degrade proportionally to the caller; it degrades for everyone connected, all at once.

### Why are streams more memory-efficient than reading an entire file at once?
Because only the current chunk — roughly 64KB — exists in memory at any given moment, while the rest of the data stays on disk or in transit until it's actually needed. `readFile` on a 2GB file needs roughly 2GB of RAM; a stream handles the same file in a few kilobytes, and the identical code works unchanged regardless of whether the file is 2MB or 2TB.

### Why does `require()` cache modules?
Two reasons, and the second matters more than it first appears. Performance — a file is parsed and executed exactly once no matter how many places require it — and, more importantly, **identity**: every module that requires your database connection pool gets back the literal same object, so shared state and singletons work correctly without any deliberate wiring. Without caching, every `require()` of the same file would build a brand-new, independent connection pool.

### Why was async/await added when Promises already existed?
Because promises fixed the *structure* of asynchronous code but not really its *readability*. A chain of `.then()` calls still reads inside-out relative to the logic it expresses, and ordinary control flow — a loop, a conditional, a `try/catch` — is genuinely awkward to write correctly around one. `async`/`await` is syntactic sugar over that exact same promise machinery, letting asynchronous code read top-to-bottom like ordinary sequential code.

### Why does Express rely so heavily on middleware?
Because HTTP request handling is genuinely a pipeline of largely independent concerns — logging, body parsing, authentication, validation, and finally the actual business logic. Middleware turns each of those into a small, composable function that can be reordered, reused across routes, and tested entirely in isolation, instead of one enormous handler doing every one of those jobs inline.

### Why does Node perform better for I/O-bound workloads than CPU-bound ones?
Because the event loop's entire advantage is *not waiting* — I/O-bound work is mostly waiting, so a single thread can juggle thousands of such operations in flight simultaneously at essentially no cost. CPU-bound work, by contrast, never waits at all — it occupies the thread continuously — so the event loop's concurrency trick buys nothing there, and everything else on that thread genuinely stalls behind it for the full duration.

### Why are Worker Threads a separate mechanism from the Event Loop?
Because the event loop provides **concurrency**, not **parallelism** — it interleaves operations that are mostly idle, waiting on something else. It cannot make raw computation itself run any faster, because computation is never idle in the first place; it occupies the thread the entire time it runs. Genuine parallelism needs an actual second thread with its own V8 isolate and its own independent event loop — which is precisely what a worker thread is.

### Why is backpressure important in streams?
Because without it, a fast producer simply overwhelms a slow consumer, and the resulting gap between production and consumption piles up in memory until the process runs out entirely. Reading from disk at 100MB/s while uploading over the network at only 5MB/s buffers roughly 95MB of unconsumed data every single second it continues. Backpressure is the consumer's mechanism for signaling the producer to pause until it has caught up.

### Why can a memory leak still occur in a garbage-collected language?
Because garbage collection frees objects that are genuinely **unreachable**, not objects that are merely **unused**. If anything at all still holds a reference to an object — a module-level cache, an uncleared timer, a forgotten event listener — the collector is obligated to keep it alive, regardless of whether your code will ever actually touch it again. Reachability, not usefulness, is the only thing GC ever checks.

### Why do long-running synchronous loops freeze an entire server, not just the current request?
Because the event loop cannot make any progress at all while JavaScript is actively executing — no timer fires, no I/O callback runs, no new connection is even accepted. The loop only regains control the moment your currently running function actually returns. A ten-second synchronous loop is ten full seconds of total unresponsiveness for absolutely every connected user, not just the one whose request triggered it.

---

<a name="s26"></a>
# 26. Database & Mongoose

### What is Mongoose, and why use it over the native driver?
An ODM (object-document mapper) that adds a schema layer on top of MongoDB — validation, type casting, middleware hooks, `populate`, and higher-level query helpers. MongoDB itself is fundamentally schemaless, so without something like Mongoose, nothing at all stops two documents in the same collection from having completely different shapes.

### What are Mongoose middleware (hooks), and why use them?
Functions that run before or after a given operation — `pre('save')` to hash a password before it's persisted, `post('save')` to emit an event after a document is created, `pre('find')` to transparently filter out soft-deleted records from every query. They keep cross-cutting concerns like these out of every individual call site that would otherwise need to remember to apply them.

```js
schema.pre('save', async function () {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
});
```

### What does `populate()` actually do, and what does it cost?
`populate()` replaces a stored id reference with the referenced document — but critically, **it is not a database join**; MongoDB never sees the second collection at all. It's an **extra query per populated path**, executed and stitched together entirely by Mongoose in your Node process: query one fetches the parent documents, Mongoose reads the referenced ids out of them, and query two fetches those with an `$in`. Populating three fields on a list of 100 documents can therefore cost far more than it visually appears to — which is exactly why embedding is usually the better choice for data that's always read together. The limitation that actually bites in production: you **cannot filter, sort, or paginate by a populated field**, because when MongoDB runs the first query it has never seen the second collection at all — the names simply don't exist yet at the point where sorting and pagination already happened.

```js
const orders = await Order.find().populate('userId', 'name email');   // ✅ select only what you need
// "orders sorted by customer name" is IMPOSSIBLE with populate — use $lookup instead
```

### Embedding vs referencing — how do you choose?
Embed when there are genuinely few related items, they're always read together with the parent, and they change alongside it — a person's two or three addresses. Reference when the count can grow without any real bound, or the related data has its own independent lifecycle — a user's posts, a post's comments. The hard constraint that settles most arguments outright: MongoDB documents cap out at **16MB**, a genuine wall rather than a soft guideline, so any array that can grow forever will eventually hit it and start failing writes, however convenient embedding looks in the meantime. The deciding question in general is your read pattern, not the conceptual relationship between the two entities — design the schema around your most common query, not around the data's natural shape.

```js
// extended reference: store the id + the fields you always show, for cheap reads
{ _id: 9, total: 250, user: { _id: 1, name: 'Ada', email: 'ada@mail.com' } }
```

### Why do indexes matter, and what's the cost?
Without an index, satisfying a query means scanning every single document in the collection — a `COLLSCAN`, and a million documents means a million individual checks. With one, because the index is a separate, sorted structure, the database can seek directly to matching entries in roughly 20 steps instead of a million, using the same halving-the-search-space logic as a phone book. The cost: every index has to be updated on every single write, so ten indexes means ten extra updates per insert, plus real memory overhead, since MongoDB is fastest when the indexes it actively uses fit entirely in RAM. Index the fields you actually filter by, sort by, or join on — an index you never query against is pure cost with zero benefit.

```js
schema.index({ status: 1, createdAt: -1 });   // compound — field order matters (ESR, below)
```

For compound indexes specifically, the ordering that decides everything is **ESR — Equality, Sort, Range**: equality fields go first (they collapse matching rows into one contiguous block), the sort field goes second (rows are then already in order within that block, so nothing needs sorting), and any range field goes last (a range covers a span rather than a point, so anything placed after it loses its ordering). Putting a range field before the sort field is the single most common indexing mistake — it forces MongoDB to collect all matches and sort them in memory, which shows up as an extra `SORT` stage in `explain()` and outright **fails past a 32MB in-memory sort limit**.

### What is a transaction, and when do you actually need one?
An operation that groups several separate writes so they all succeed or all fail together. In MongoDB, transactions require a **replica set** — they don't work at all on a single standalone instance, which is exactly why they commonly "work in production and fail locally." They're also relatively expensive: locks are held for the transaction's full duration, contending with other writers to the same documents. Because a **single-document update in MongoDB is already atomic** on its own, needing transactions frequently is usually a signal that data which always changes together should have been modeled as one document in the first place — reserve them for genuine cross-entity operations, like a money transfer or an order plus its inventory adjustment, not as a patch over a schema design problem.

### What is connection pooling, and what happens when the pool is too small?
Reusing a fixed set of already-open database connections rather than opening a brand-new one per query, since establishing a connection has a real, non-trivial cost. The driver manages the pool itself; you only configure its size. A pool that's too small for the concurrent load becomes an invisible queue — the tell is that the database's own slow-query log shows fast individual queries while your application-measured latency is much higher, because most of that gap is time spent simply waiting for a free connection, not query execution time at all.

### How do you avoid the N+1 query problem?
Fetch all related data in a single query rather than looping over a result set and querying once per item. In Mongoose that means `populate()` applied to the whole result set at once, or a `$lookup` aggregation stage, rather than a `for` loop calling `findById` inside it. The telltale symptom is an endpoint whose latency scales directly with the number of rows it returns, even though each individual query in isolation looks perfectly fast — you find it by **counting queries per request**, not by timing any single one of them.

```js
// ❌ N+1 — 100 orders = 101 queries, each individually fast
for (const o of orders) o.user = await User.findById(o.userId);
// ✅ one round trip
const users = await User.find({ _id: { $in: orders.map(o => o.userId) } });
```

---

<a name="s27"></a>
# 27. Testing

### What should you unit test in a Node service?
Business logic living in services, pure functions, validators, and utilities — the code that actually contains decisions. Not framework wiring itself, and not the internals of a third-party library you didn't write.

### Unit vs integration vs end-to-end — what's the difference?
**Unit** tests exercise one function or class with its dependencies mocked out — fast, and a failure points precisely at the cause. **Integration** tests exercise several real pieces together, typically a route plus a service plus a genuine test database, catching wiring bugs a unit test structurally cannot see. **End-to-end** tests exercise the whole system through its actual public interface — the most valuable signal and also the most expensive to run, so keep relatively few of them.

### How do you test an Express route?
With `supertest`, which starts your Express app in-process and issues real HTTP requests against it without ever binding an actual network port. You assert on status codes, response bodies, and headers, with the service layer left real for an integration test or mocked out for a pure unit test of just the route.

```js
const res = await request(app).post('/orders').send({ total: 100 });
expect(res.status).toBe(201);
```

### How do you test code that hits a database?
Either a genuinely in-memory or containerized test database for real integration coverage, or a mocked repository layer when you just want speed and isolation. This is exactly where a clean layered architecture pays for itself: if business rules live in a service that only depends on an injected repository, you can test every rule with a fake repository and never touch a real database at all.

### How do you test async code and time-dependent logic?
Always `return` or `await` the promise under test so the test runner genuinely waits for it — a forgotten `await` produces a test that silently passes regardless of what the assertion inside it actually says. For timers and intervals, use fake timers so the test can advance a virtual clock instantly instead of the suite actually sitting and waiting on wall-clock time.

### What usually causes a flaky test?
Shared mutable state leaking between tests, a genuine dependency on real timing, or an implicit dependency on execution order. The fixes are the same in every case: isolate state per test, fake time rather than sleeping, and never write a test whose correctness depends on which order the suite happens to run in.

---

<a name="s28"></a>
# 28. ⭐ Scenario & Debugging

> These can't be memorised, which is why they're asked.

### "The API is fast under light load but latency explodes under traffic. Where do you look?"
Event loop lag first — if it's rising, something synchronous is occupying the thread and every request is queueing directly behind it. Common culprits: `JSON.parse` on a large payload, synchronous crypto, or a regex prone to catastrophic backtracking. If lag stays flat while latency still climbs, look downstream instead — connection pool exhaustion, or a query that lost its index as the data grew.

### "One endpoint is slow, but only sometimes."
Suspect the **thread pool**. Anything that uses it — file reads, `dns.lookup`, `bcrypt`, zlib — starts queueing the moment four operations are already in flight simultaneously. Under light load there's always a free thread; under load, requests wait for one, so latency appears intermittently with no obvious code path to blame, since event loop lag itself looks completely normal. Raise `UV_THREADPOOL_SIZE`, or move the work off the request path entirely.

### "Memory grows steadily and the process eventually restarts."
A leak — something still reachable that will genuinely never be used again. Take two heap snapshots separated by real load and compare the growth between them (three snapshots, comparing the first and third, if you want to rule out uncollected garbage rather than a real leak). The usual suspects, roughly in order of likelihood: a module-level cache or `Map` that's never pruned, event listeners added per request to a long-lived emitter, uncleared `setInterval`s, and closures that capture — and therefore retain — an entire scope containing a large buffer.

### "`console.log` shows the right data but the response body is empty."
Almost always a missing `return` or a missing `await`. The handler responded before its async work actually finished, or two separate code paths both tried to respond to the same request. Second suspect: `res.json()` called inside a callback that fires after the response has already ended.

### "The request hangs forever with no error."
A middleware that neither responded nor called `next()`. Express has no timeout mechanism of its own for this — the request simply sits open until the client eventually gives up on its own. Check every branch of the suspect middleware, especially an early conditional return with no matching `else`.

### "It works locally but breaks in production."
Environment differences, roughly in order of likelihood: a missing environment variable that becomes part of a URL as the literal string `"undefined"`, case-sensitive file paths on Linux versus a case-insensitive local Windows/macOS filesystem, a `devDependency` accidentally used by production code, a different Node version, and unstated time zone assumptions.

### "After deploying, some requests fail with connection reset."
No graceful shutdown — the old process was simply killed while requests were still in flight. Handle `SIGTERM`: stop accepting new connections, let in-flight requests finish naturally, close database and queue connections, then exit, with a timeout as a backstop.

### "A `for` loop with `await` inside is very slow."
It's running sequentially — each iteration waits for the previous one to fully settle before starting. If the operations are genuinely independent of each other, `Promise.all(items.map(...))` runs them concurrently instead. If they must be strictly ordered, or running them all at once would overwhelm a downstream system like a connection pool, keep it sequential but add a concurrency limit (`p-limit`) rather than swinging to the other extreme.

### "CPU sits at 100% on one core while the others idle."
Exactly what's expected by design — one process, one JavaScript thread, one core. Either there's real, sustained CPU work on the main thread, or a runaway microtask loop is spinning it. Use `cluster` or multiple containers to actually use the other cores, and rule out garbage collection too — a leaking heap makes GC run constantly, which itself looks like high CPU with no single obvious hot function.

### "`process.nextTick` in a recursive function froze the server."
The `nextTick` queue is drained **completely** before the loop is allowed to advance at all, so a callback that keeps re-scheduling another `nextTick` starves everything else indefinitely — no timers fire, no I/O completes, no new connection is even accepted. Use `setImmediate` instead, which explicitly yields back to the loop between iterations rather than jumping the queue.

### "Users report being logged out at random."
Multiple server instances combined with in-memory sessions and no sticky routing — each incoming request can land on a different instance that has simply never seen that particular session. Move sessions to Redis, which is the actual fix, rather than enabling sticky sessions, which only hides the symptom while leaving deploys and autoscaling fragile.

### "A colleague asks why we don't just retry every failed request automatically."
Because retrying is only safe for **idempotent** operations, and plenty of real endpoints aren't — retrying a `POST /orders` that actually succeeded but whose response was lost in transit creates a second, duplicate order and can double-charge a customer. The fix isn't "don't retry" (retrying genuinely is the correct client behavior, since the network can't tell "failed" from "response lost") — it's making the server-side operation idempotent first, typically via a client-generated `Idempotency-Key` claimed atomically with `SET NX`, so a safe retry and an unsafe one are indistinguishable to the client but the server guarantees the side effect happens exactly once.

---

## Before an interview

```
1. Cover the answers. Say yours ALOUD. Section 28 first — least memorisable.
2. Stumble → open the linked Part, reread that section only.
3. Highest yield: 3 (event loop), 5 (task queues), 6 (libuv), 8 (streams),
   19 (security), 25 (the whys), 28 (scenarios).
4. If you have one hour: the event loop, why networking skips the thread pool,
   backpressure, and why sync code blocks everyone. Those four carry most interviews.
```

*— End of question bank —*
