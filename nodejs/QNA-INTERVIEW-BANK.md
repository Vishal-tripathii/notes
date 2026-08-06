# 🟢 Node.js Interview Question Bank — Answered

> **How to use:** cover the answer, say yours out loud, then compare. Speaking finds gaps that reading hides.
>
> Answers are the *spoken* version, not the essay. Sections link to the note that explains them properly.
>
> **~250 questions · 28 sections**

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
A runtime that lets JavaScript run outside the browser. It bundles V8 to execute JavaScript, libuv for asynchronous I/O, and a standard library for files, networking, processes and crypto.

### Why was Node.js created?
Because the dominant server model — one thread per connection — wasted enormous resources on waiting. A thread blocked on a database query does nothing but consume memory. Node's bet was that a single thread with non-blocking I/O could handle far more concurrent connections, since most server work is waiting rather than computing.

### Why is Node.js single-threaded?
Because it removes the hardest part of concurrent programming. No locks, no race conditions on shared state, no deadlocks. You get concurrency through the event loop instead of threads — one thread juggling thousands of operations that are mostly idle.

### Is Node.js actually single-threaded?
No — **your JavaScript** is single-threaded. Node itself uses several threads: the libuv thread pool (4 by default) for file I/O, DNS lookups, crypto and zlib, plus internal V8 threads for garbage collection and compilation.
One cashier serving the queue, with a back room of staff doing the slow jobs.

### Why is Node.js fast?
For I/O-bound work: it never blocks waiting. While one request waits on a database, the thread serves hundreds of others. Plus V8 is a genuinely fast JIT-compiled engine. It's *not* fast at CPU-bound work — that's the trade.

### What problems is Node.js good at solving?
Anything I/O-heavy: REST APIs, real-time apps (chat, notifications), streaming, API gateways and BFFs, microservices. Work where the server mostly coordinates and waits.

### When should you NOT use Node.js?
CPU-bound workloads — video encoding, image processing, large-scale data crunching, complex ML. A long computation occupies the only JavaScript thread, so *every* other request stalls behind it. Worker threads help, but a language with real parallelism is a better fit.

### How is Node.js different from a browser?
Same language, different surroundings. No DOM, no `window`, no browser security sandbox. Instead you get filesystem access, network servers, child processes and OS APIs. Node uses CommonJS by default (browsers use ES modules), and has `global` rather than `window`.

### Does Node.js contain the V8 engine?
Yes. V8 is Chrome's JavaScript engine, embedded in Node to execute your code. It's the same engine, but with Node's own globals and bindings rather than the browser's.

### What else besides V8 does Node.js include?
**libuv** — the event loop, thread pool and cross-platform async I/O.
**Node bindings** — C++ glue connecting JavaScript to libuv and OS APIs.
**The standard library** — `fs`, `http`, `crypto`, `stream`, `path`, and the rest.
V8 alone can only run JavaScript; it has no idea what a file or a socket is.

---

<a name="s2"></a>
# 2. V8 Engine

### What is V8?
Google's JavaScript engine, written in C++. It compiles and executes JavaScript, and manages the memory that JavaScript uses.

### What does V8 actually do?
Parses your source into an AST, generates bytecode, executes it, watches which code runs hot, recompiles those parts into optimised machine code, and garbage-collects unreachable objects.

### How does V8 compile JavaScript?
Source → AST → **Ignition** produces bytecode and starts executing immediately → hot functions get sent to **TurboFan**, which compiles optimised machine code using observed type information.
Start running quickly, then get faster where it matters.

### What is Just-In-Time (JIT) compilation?
Compiling at runtime rather than ahead of time. It's possible to be *better* than ahead-of-time compilation here, because the engine can see the actual types flowing through a function and specialise for them — information a static compiler never has.

### What is Ignition?
V8's interpreter. It turns the AST into compact bytecode and executes it right away, so there's no compile pause at startup. It also collects type feedback for the optimiser.

### What is TurboFan?
V8's optimising compiler. It takes hot functions plus the type feedback Ignition gathered and emits specialised machine code — for example, assuming a parameter is always a number and skipping the type checks.

### How does V8 optimize code?
By making assumptions from observed behaviour and compiling for those. If the assumption is later violated — you pass a string to a function that always got numbers — it **deoptimises**, throwing away the optimised code and falling back to bytecode. That's why type-stable code is faster: it never triggers deopt.

### What is hidden class optimization?
JavaScript objects are dynamic, so property lookup would normally mean a hash lookup every time. V8 assigns each object shape a hidden class, so objects with the same structure share one, and property access becomes a fixed memory offset.
⚠️ Adding properties in different orders creates different hidden classes for otherwise-identical objects — which is why initialising all fields in the constructor, in a consistent order, is faster.

### What is inline caching?
Caching the result of a property lookup at each call site. The first time through, V8 records "for this hidden class, `name` lives at offset 8"; subsequent calls skip the lookup entirely. It's fastest when a call site always sees the same shape (monomorphic) and degrades as it sees more (polymorphic, then megamorphic).

### How does V8 perform garbage collection?
Generationally, on the observation that most objects die young.
**Young generation** — a small space collected frequently with a fast copying collector (scavenger); survivors are promoted.
**Old generation** — collected less often with mark-sweep-compact, done incrementally and concurrently so pauses stay short.

### Why does memory leak happen even with GC?
Because garbage collection frees *unreachable* objects, not *unused* ones. If something still references an object, the collector must keep it — even if your program will never touch it again. The usual culprits: values accumulating in a module-level object or `Map`, closures holding more scope than expected, timers never cleared, and event listeners never removed.

---

<a name="s3"></a>
# 3. ⭐ Event Loop

### What is the Event Loop?
The mechanism that lets one thread handle many operations. Node starts an I/O operation, registers a callback, and moves on. The event loop is the cycle that checks which operations have completed and runs their callbacks.

### Why does Node need an Event Loop?
Because there's only one JavaScript thread and it must never wait. Something has to keep track of the thousands of in-flight operations and run each callback when its result is ready.
A waiter takes an order to the kitchen and serves other tables — rather than standing there until the food is cooked.

### How does the Event Loop work?
It runs in iterations ("ticks"). Each iteration moves through a fixed sequence of phases; each phase has a queue of callbacks and runs them until the queue empties or a limit is hit. When there's no work left, the loop exits and the process ends.

### What are the Event Loop phases?
```
1. timers            setTimeout / setInterval callbacks whose time has come
2. pending callbacks deferred system-level callbacks (some TCP errors)
3. idle, prepare     internal
4. poll              retrieve new I/O events, run I/O callbacks — may BLOCK here
5. check             setImmediate callbacks
6. close callbacks   'close' events, e.g. socket.on('close')
```

### What happens in each phase?
Node runs every callback queued for that phase, then moves on. Poll is the important one — it's where I/O completions are collected and where the loop waits when there's nothing else to do.

### What is the Poll phase?
Where Node collects completed I/O events and executes their callbacks. If there's nothing to do here and no `setImmediate` pending, Node **blocks** in poll waiting for I/O — which is exactly what you want, since blocking on the OS's readiness notification uses no CPU.

### What is the Check phase?
Where `setImmediate` callbacks run — deliberately placed immediately after poll, so `setImmediate` means "run after the current I/O phase completes".

### What is the Close phase?
Where cleanup callbacks run — `'close'` events on sockets and handles. Separated so teardown never interleaves with active I/O handling.

### What happens after every Event Loop iteration?
Between **every** phase transition — and in modern Node, after every individual callback — the microtask queues drain completely: `process.nextTick` first, then promise callbacks. This is why a promise chain always finishes before the next timer fires.

### What is starvation in the Event Loop?
When one queue never lets the loop progress. A `process.nextTick` callback that schedules another `nextTick` recursively will spin forever, because the tick queue drains fully before the loop advances — timers and I/O never get a turn. The same happens with a long synchronous loop.

### What blocks the Event Loop?
Any synchronous work that takes time: `JSON.parse` on a huge payload, `fs.readFileSync`, `crypto.pbkdf2Sync`, a big `for` loop, complex regex on long strings (catastrophic backtracking), and `.map`/`.filter` chains over very large arrays. While that runs, **every** connected user waits.

---

<a name="s4"></a>
# 4. Asynchronous Programming

### Why is Node asynchronous?
Because it has one thread. If a database query blocked, that thread would be idle for milliseconds while thousands of other requests waited. Async means "start it, register a callback, do something else".

### Why not make everything synchronous?
Synchronous code is easier to read, but with one thread it means one operation at a time for the whole process. A 200ms query would cap you at five requests per second — total, for every user.

### What is callback hell?
Deeply nested callbacks from sequential async operations. It's not only ugly: error handling has no structure, since every callback must check its own `err` argument, and one missed check swallows a failure silently.

### Why were Promises introduced?
To replace nesting with chaining and to give errors a single path. `.then()` returns a new promise, so steps stay flat, and an error anywhere jumps to the nearest `.catch()` instead of being checked at every level.

### Why was async/await introduced?
Because even flat promise chains read backwards compared to the logic. `async/await` lets asynchronous code read top-to-bottom, with ordinary `try/catch` and normal control flow — loops and conditions around await work as you'd expect, which is awkward with `.then()`.

### Are async functions still asynchronous?
Yes. `async` only changes syntax — the function returns a promise and `await` suspends it while the rest of the program keeps running. It is **not** blocking. A common misreading is thinking `await` pauses the server; it pauses only that function.

### How does async/await work internally?
It's built on generators and promises. `await` suspends the function, registers a continuation on the promise, and returns control to the event loop; when the promise settles, the continuation resumes the function from where it stopped. Rejections are turned back into thrown exceptions.

### Promise vs callback
A callback is a function you hand over and hope gets called once — there's no guarantee it isn't called twice, or never. A promise is an object representing the eventual result: it settles exactly once, can be passed around, handled later, and composed with `all`/`race`/`allSettled`.

### Promise vs async/await
The same mechanism with different ergonomics. `async/await` is clearer for sequential steps; explicit promises are better when you want concurrency — `Promise.all` for parallel work rather than awaiting one at a time.
⚠️ The common bug: `for (const id of ids) await fetch(id)` runs them one after another. Use `Promise.all(ids.map(fetch))` when they're independent.

### Why does `Promise.resolve()` execute before `setTimeout()`?
Different queues. Promise callbacks are **microtasks**, which drain completely before the event loop moves on. `setTimeout` is a **macrotask** handled in the timers phase of the next iteration. Microtasks always win, even with `setTimeout(fn, 0)`.

---

<a name="s5"></a>
# 5. ⭐ Microtasks & Macrotasks

### What is a microtask?
A callback that runs immediately after the current operation finishes, before the event loop continues. Promise callbacks, `queueMicrotask`, and `process.nextTick` (Node's own, even higher priority).

### What is a macrotask?
Work scheduled into one of the event loop's phases: timers, I/O callbacks, `setImmediate`, close handlers. One macrotask runs, then all microtasks drain, then the next macrotask.

### What is the microtask queue?
The queue of pending microtasks. It's drained **completely** — including microtasks added while draining — before the loop proceeds. That's what makes an infinite microtask chain able to starve everything else.

### Promise vs `setTimeout`
```js
setTimeout(() => console.log('timeout'), 0);
Promise.resolve().then(() => console.log('promise'));
// promise, then timeout — always
```
The promise callback is a microtask that runs before the loop reaches the timers phase.

### `process.nextTick()` vs Promise
Both are microtasks, but Node keeps **two separate queues** and drains `nextTick` first — entirely — before touching promise callbacks.
```js
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));
// nextTick, then promise
```

### `queueMicrotask()`
The standard way to schedule a microtask, in the same queue as promise callbacks. Use it instead of `process.nextTick` when you just want "after the current operation" without jumping the promise queue.

### `setImmediate()`
Schedules a callback for the **check** phase, right after poll. The name is misleading: it isn't immediate, it's "after the current I/O phase". Node-specific.

### Execution order of all queues
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

### Why does `process.nextTick()` execute first?
It was designed to let Node's internals run cleanup or emit errors immediately after the current operation, before anything else. That priority is why it can starve the loop — and why `queueMicrotask` is usually the better choice in application code.

---

<a name="s6"></a>
# 6. ⭐ libuv

### What is libuv?
The C library underneath Node that provides the event loop, the thread pool, and a single cross-platform API over each OS's async I/O mechanism.

### Why does Node need libuv?
Because V8 only executes JavaScript — it knows nothing about files, sockets or timers. And every operating system exposes async I/O differently: epoll on Linux, kqueue on macOS/BSD, IOCP on Windows. libuv hides those differences behind one interface.

### What is the thread pool?
A small pool of worker threads libuv uses for operations that have **no non-blocking OS equivalent**. Your JavaScript stays on one thread; these threads do the blocking work off to the side and queue the callback when done.

### How many threads exist by default?
Four.

### Which operations use the thread pool?
File system operations, `dns.lookup()`, CPU-heavy crypto (`pbkdf2`, `scrypt`, `randomBytes`), and zlib compression.

### Which operations don't?
**Network I/O** — TCP, UDP, HTTP. Those use the OS's event notification directly (epoll/kqueue/IOCP), which is genuinely non-blocking at the kernel level, so no thread needs to wait. This is the key insight: Node's famous concurrency comes from the OS, not from the thread pool.

### Can thread pool size be changed?
Yes — the `UV_THREADPOOL_SIZE` environment variable, set before the process starts. Worth raising if your workload is file- or crypto-heavy.

### What happens when the thread pool becomes full?
Further operations **queue**. With the default of four, five simultaneous `pbkdf2` calls mean the fifth waits for a thread to free up — so it appears slow for no visible reason. It's a classic cause of mysterious latency in file- or crypto-heavy services.

---

<a name="s7"></a>
# 7. File System

### Why are file operations asynchronous?
Because disk access is slow — milliseconds, during which the single JavaScript thread could serve hundreds of other requests. Async lets Node hand the work to the thread pool and carry on.

### How does `fs.readFile()` work internally?
Node passes the request to libuv, which assigns it to a **thread pool** worker. That thread performs the blocking read; when it finishes, the callback is queued for the poll phase and runs on the main thread. Your JavaScript never blocks — but a pool thread does.

### Why shouldn't `fs.readFileSync()` be used in servers?
Because it blocks the only JavaScript thread. A 50ms synchronous read means every other request — every user — waits 50ms. It's acceptable exactly once: at startup, loading config before the server accepts traffic.

### Streams vs `readFile()`
`readFile` loads the **entire file into memory** before you see a byte. A stream delivers it in chunks. For a 2GB file, `readFile` needs 2GB of RAM (and exceeds V8's buffer limits); a stream needs about 64KB at a time.

### Large file handling
Always stream. Read with `fs.createReadStream`, transform in the middle, write with `fs.createWriteStream`, and connect them with `pipeline()` so errors and cleanup are handled.

### Memory implications
Ten concurrent users downloading a 1GB file with `readFile` is 10GB of RAM and a dead process. The same with streams is a few hundred KB, because only the in-flight chunks exist at once.

---

<a name="s8"></a>
# 8. ⭐ Streams

### What is a stream?
An interface for data that arrives or departs **piece by piece** rather than all at once. It's an `EventEmitter` with a defined protocol for chunks, completion and errors.

### Why do streams exist?
Because you shouldn't need memory proportional to your data. A stream lets you process 10GB with the same footprint as 10KB.
Drinking through a straw instead of trying to swallow the pool.

### Types of streams
```
Readable   you read FROM it        fs.createReadStream, http request
Writable   you write TO it         fs.createWriteStream, http response
Duplex     both, independently     TCP socket
Transform  a Duplex that MODIFIES  zlib.createGzip, a CSV parser
```

### Readable
Produces data. Two modes: flowing (data pushed via the `'data'` event or `pipe`) and paused (you call `read()`). Modern code uses `pipeline` or `for await…of`.

### Writable
Consumes data. `write()` returns a boolean — `false` means its internal buffer is full and you should stop until `'drain'` fires. Ignoring that return value is how memory blows up.

### Duplex
Readable and writable with **independent** channels — a TCP socket, where what you send and what you receive are unrelated streams.

### Transform
A duplex stream where output is a function of input — gzip, encryption, a parser. This is where most custom stream code lives.

### Backpressure
The mechanism preventing a fast producer from overwhelming a slow consumer. If you read from disk at 100MB/s and upload at 5MB/s, without backpressure the difference accumulates in memory until the process dies. `write()` returning `false` is the signal to pause; `'drain'` is the signal to resume.
A funnel: pour faster than it drains and it overflows.

### `pipe()`
Connects a readable to a writable and handles backpressure automatically. Its weakness is error handling — an error in one stream doesn't destroy the others, so you leak file descriptors.

### `pipeline()`
The correct modern choice. Same connection plus **proper error propagation and cleanup** of every stream in the chain, with one callback (or a promise) for the whole pipeline.

### Why are streams memory efficient?
Because only the current chunk plus a small buffer (the `highWaterMark`, 64KB by default for files) exists at any moment. The rest is still on disk or on the wire, not in your heap.

---

<a name="s9"></a>
# 9. Buffers

### What is a Buffer?
A fixed-length chunk of raw binary data, allocated **outside** V8's heap. It's Node's way of handling bytes — files, network packets, images — before they're anything else.

### Why doesn't Node use strings everywhere?
Because a string is text in a specific encoding, and most I/O isn't text. A JPEG or a TCP packet is bytes; forcing them through a string corrupts them. Strings are also immutable and encoding-dependent, which makes byte manipulation impossible.

### Binary data
Sequences of bytes with no inherent meaning — meaning comes from how you interpret them. The same bytes are an image, a number, or text depending on what you decide.

### Encoding
The mapping between text and bytes. Node supports `utf8` (default), `ascii`, `base64`, `hex`, `latin1`. Reading a file with the wrong encoding gives you mojibake, not an error — which is why the bug appears far from its cause.

### UTF-8
A variable-width encoding: ASCII characters take one byte, accented characters two, most others three, emoji four.
⚠️ This is why `buffer.length` is bytes, not characters, and why slicing a buffer mid-character corrupts text — the reason `StringDecoder` exists for streams.

### Buffer allocation
```js
Buffer.alloc(size)         // zero-filled — SAFE, slightly slower
Buffer.allocUnsafe(size)   // NOT zeroed — faster, may contain old memory
Buffer.from(data)          // from a string, array, or another buffer
```
⚠️ `allocUnsafe` can expose whatever was previously in that memory — old request data, credentials. Only use it when you immediately overwrite the whole buffer.

### Buffer pooling
Node keeps a pre-allocated pool (8KB) and carves small `allocUnsafe` buffers out of it, because asking the OS for memory each time is expensive. Buffers larger than half the pool get their own allocation.

---

<a name="s10"></a>
# 10. Modules

### CommonJS vs ES Modules
**CommonJS** — `require`/`module.exports`, **synchronous**, resolved at runtime, Node's original system. **ES Modules** — `import`/`export`, **asynchronous**, statically analysable, the JavaScript standard. Static analysis is what enables tree shaking and named-import checking at build time; it's also why `import` must be at the top level.

### `require()` vs `import`
`require` is a function call — you can call it conditionally, inside an `if`, with a computed path. `import` is a declaration, hoisted and resolved before any code runs, so it can't be conditional. `import()` (the function form) is the dynamic escape hatch.

### `module.exports` vs `exports`
`exports` is just a **reference** to `module.exports`. Adding properties to either works. But **reassigning** `exports` breaks the link and exports nothing, because `require` returns `module.exports`:
```js
exports.foo = 1;              // ✅ works
module.exports = { foo: 1 };  // ✅ works
exports = { foo: 1 };         // ❌ exports nothing
```

### How does `require()` cache modules?
The first `require` of a path resolves it, executes the file, and stores the resulting `module.exports` in `require.cache`, keyed by the resolved filename. Every later `require` of the same path returns that stored object without re-executing anything.

### Why is module caching useful?
Performance — a file is parsed and run once. And more importantly, it gives you **singletons for free**: every module requiring your database connection gets the same instance, because they get the same cached object.

### Circular dependencies
A requires B, and B requires A. CommonJS handles it by returning A's **partially filled** exports to B — so anything A hadn't assigned yet is `undefined`. It doesn't crash, it silently misbehaves. ES modules handle it better via hoisting and live bindings, but can still throw on access before initialisation. The real fix is usually extracting the shared piece into a third module.

### Dynamic imports
`import('./module.js')` returns a promise, loading a module at runtime. Used for conditional loading, code splitting, and for loading ES modules from CommonJS code.

---

<a name="s11"></a>
# 11. Express Internals

### How does Express work?
It's a thin layer over Node's `http` module. It keeps an ordered array of middleware functions, and for each request it walks that array, calling each function that matches the path and method.

### How does middleware work?
Each middleware receives `(req, res, next)`. It can inspect or modify the request, end the response, or call `next()` to hand off to the next one in the stack.
Middleware is an assembly line: each station either does its job and passes the item along, or takes it off the line.

### What is `next()`?
The signal to continue to the next matching middleware. Forget it and the request **hangs forever** — no response, no error, just a client waiting until timeout. `next(err)` skips ahead to error-handling middleware.

### How are routes matched?
In **registration order**, top to bottom, comparing method and path pattern. The first match that ends the response wins. This is why a catch-all registered before your routes swallows everything.

### Error middleware
A middleware with **four** parameters — `(err, req, res, next)`. Express identifies it by arity alone, which is why omitting the unused `next` silently turns it back into ordinary middleware. It must be registered **last**.
⚠️ In Express 4, errors thrown in async handlers aren't caught automatically — you must call `next(err)` or wrap handlers.

### Why middleware order matters
Because it's a sequential pipeline. Body parsing must come before anything reading `req.body`; authentication before protected routes; error handling last. Register the auth middleware after your routes and it protects nothing.

### Router vs app
A `Router` is a mini-application — its own isolated middleware stack — which you mount onto the app with `app.use('/api/users', usersRouter)`. It exists so features can own their routes without one enormous file.

### Request lifecycle
```
request arrives → http.Server 'request' event
    → Express app receives (req, res)
    → walks the middleware stack in order
    → matching route handler runs
    → res.send() / res.json() ends the response
    → (any error → next(err) → error middleware)
```

---

<a name="s12"></a>
# 12. HTTP

### How does HTTP work?
A text-based request/response protocol over TCP. The client opens a connection, sends a method, path and headers (optionally a body), and the server replies with a status code, headers and body. It's stateless — every request stands alone, which is why cookies and tokens exist.

### How does Node create an HTTP server?
`http.createServer((req, res) => …)` returns a server that emits a `'request'` event per incoming request; `server.listen(port)` binds the socket. Express is a request handler you hand to exactly this.

### What is `IncomingMessage`?
The request object — and it's a **Readable stream**. Headers are available immediately, but the body arrives in chunks, which is why body parsing is asynchronous and why `req.body` is undefined without middleware.

### What is `ServerResponse`?
The response object — a **Writable stream**. `res.write()` sends chunks, `res.end()` finishes. `res.json()` in Express is a convenience over setting a header and calling `end`.

### Keep-alive
Reusing one TCP connection for multiple requests instead of reconnecting each time. It removes the TCP handshake (and TLS handshake) per request, which is a large saving. Default in HTTP/1.1.

### Chunked transfer
Sending a response in pieces without knowing the total length upfront, using `Transfer-Encoding: chunked`. It's what makes streaming a response possible — you start sending before you know how much there is.

### Streaming responses
Piping a readable straight to the response instead of buffering: `fs.createReadStream(path).pipe(res)`. Constant memory regardless of file size, and the client starts receiving immediately.

### Headers
Metadata about the request or response — content type, length, caching, auth, cookies. In Node, `res.setHeader()` must be called **before** the first write; afterwards the headers are already on the wire and you get "Cannot set headers after they are sent".

### Cookies
Small values the server asks the browser to store and send back with every subsequent request to that domain — the standard way to carry a session id. Flags that matter: `httpOnly` (JavaScript can't read it, defeating XSS theft), `secure` (HTTPS only), `sameSite` (CSRF protection).

### Sessions
Server-side state keyed by a session id in a cookie. The server holds the data; the client holds only the id. The trade against JWTs: sessions can be revoked instantly and stay small, but need shared storage (Redis) once you run more than one server instance.

---

<a name="s13"></a>
# 13. EventEmitter

### What is EventEmitter?
Node's implementation of the observer pattern — an object that lets you register listeners for named events and emit those events later.

### Why does Node use EventEmitter everywhere?
Because async I/O is naturally event-shaped: a socket has "data arrived", "connection closed", "error"; a stream has "data", "end", "drain". Streams, HTTP servers, sockets and the process object are all EventEmitters.

### How does `emit()` work?
It looks up the listeners registered for that event name and calls them **synchronously, in registration order**, passing along the arguments. `emit` is not asynchronous — a common misconception. It returns `true` if there were listeners.

### `on()` vs `once()`
`on` registers a listener that fires every time. `once` fires one time and then removes itself — right for "connected", "ready", or anything that happens exactly once.

### Memory leaks from listeners
Every `on()` keeps a reference to your callback and its closure. Register in a request handler without removing, and listeners accumulate on a long-lived emitter — each one pinning whatever it closed over. Use `once`, or `removeListener` when you're done.

### Why max listeners exist
Node warns when one emitter has more than 10 listeners for the same event. It's **not an error and not a limit** — it's a leak detector, on the assumption that eleven listeners for one event usually means you're adding them in a loop and never removing them. Raise it with `setMaxListeners` if the count is genuinely intentional.

---

<a name="s14"></a>
# 14. Process

### What is `process`?
A global object representing the running Node process — its environment, arguments, streams, and lifecycle. It's also an EventEmitter, which is how you handle signals and uncaught exceptions.

### What is `process.env`?
The environment variables the process was started with. The standard way to pass configuration and secrets, because it keeps them out of source control and lets the same build run in different environments.
⚠️ Values are always **strings** — `process.env.PORT` is `"3000"`, not `3000`, and `process.env.DEBUG` of `"false"` is truthy.

### `process.argv`
The command-line arguments as an array. Index 0 is the Node executable, index 1 is your script, and your actual arguments start at index 2.

### `process.exit()`
Terminates the process immediately with a status code. ⚠️ It doesn't wait for pending async work — in-flight writes and log flushes can be lost. For a clean shutdown, stop accepting connections and let the event loop drain naturally.

### `process.cwd()`
The directory the process was **launched from**, which is not necessarily where your file lives. That's `__dirname`. Confusing the two is why file paths break when someone runs your app from a different folder.

### `process.pid`
The OS process id — used for logging, and for sending signals when managing processes.

### `process.nextTick()`
Schedules a callback to run after the current operation, before promises and before the event loop continues. Node-specific and the highest-priority queue there is — which is exactly why overusing it can starve the loop.

---

<a name="s15"></a>
# 15. Worker Threads

### Why were Worker Threads introduced?
To give Node a way to do CPU-bound work without blocking the event loop. Before them, a heavy computation froze the entire server, and the only escape was spawning a whole separate process.

### Difference from the Event Loop
The event loop gives **concurrency** for I/O — many operations in flight on one thread, because they're mostly waiting. Worker threads give **parallelism** for CPU — genuinely simultaneous execution on multiple cores. The event loop can't help with computation, because computation never waits.

### Child Process vs Worker Thread
```
Worker Thread   same process, own V8 isolate + event loop
                lighter, faster to start, CAN share memory (SharedArrayBuffer)
Child Process   separate OS process, full isolation
                heavier, but a crash can't take the parent down; can run any program
```
Worker threads for CPU work inside your app. Child processes for running other programs, or when isolation matters more than cost.

### SharedArrayBuffer
Memory that two threads can access **without copying**. Normal `postMessage` serialises data (structured clone), which for a large array can cost more than the work itself. `SharedArrayBuffer` avoids the copy — at the price of needing `Atomics` to coordinate safely.

### MessageChannel
A two-ended communication channel between threads, so workers can talk to each other directly rather than routing everything through the parent.

### CPU-intensive work
Image resizing, video transcoding, large data aggregation, password hashing at scale, complex parsing. The pattern is a **pool** of workers sized to your CPU count, fed from a queue — creating a worker per task costs more than it saves.

---

<a name="s16"></a>
# 16. Child Processes

### `exec()`
Runs a command **in a shell** and buffers the entire output, handing it to a callback. Convenient for short commands.
⚠️ Two hazards: the shell means user input can inject commands, and the buffer has a size limit that large output will exceed.

### `execFile()`
Runs an executable **without a shell**. Safer than `exec` for exactly that reason — arguments are passed as an array, so there's nothing to inject into.

### `spawn()`
Launches a process and gives you its stdio as **streams** rather than a buffer. No output size limit, and you can process results as they arrive. The right choice for long-running commands or large output.

### `fork()`
A specialised `spawn` for running another **Node script**, with an IPC channel set up automatically so parent and child exchange messages with `send()` and `'message'`. It's what `cluster` uses.

### Which is more memory efficient?
`spawn` (and `fork`), because output streams through instead of accumulating in a buffer. `exec` holds the entire output in memory before you see any of it.

### IPC
Inter-process communication — how separate processes exchange data. `fork` gives you a message channel; messages are serialised, so there's a real cost to sending large payloads.

### Process communication
Messages are **copied**, not shared — each process has its own memory. That's the fundamental difference from worker threads, and the reason to prefer threads when you're moving a lot of data.

---

<a name="s17"></a>
# 17. Memory Management

### Stack vs Heap
The **stack** holds function frames, local primitives and references — automatically freed when a function returns, and fast. The **heap** holds objects, arrays, closures and buffers — variable size, managed by the garbage collector. Deep recursion overflows the stack; retained objects exhaust the heap.

### Memory leaks
Memory that's still **reachable** but will never be used again. The collector can't free it because something still points at it — so the heap grows until the process dies.

### Closures
A closure keeps its entire enclosing scope alive, not just the variables it uses. A callback that closes over a scope containing a large buffer keeps that buffer alive for as long as the callback is registered — a very common accidental leak.

### Global variables
Anything on `global` or in a module-level `const` lives for the whole process lifetime. A module-level cache or `Map` that's written to and never pruned is the most common leak in real services.

### Timers
`setInterval` never stops on its own, and it keeps its callback — and everything that callback closed over — alive forever. Always keep the id and `clearInterval` it.

### Event listeners
Every registered listener is a reference. Adding listeners per request to a long-lived emitter accumulates both the callbacks and their closures.

### Heap snapshots
A dump of everything on the heap at a point in time. The technique: take one, exercise the app, take another, and compare — the objects that grew between them are your leak. Available through `--inspect` and Chrome DevTools, or `v8.writeHeapSnapshot()`.

### GC generations
Objects are allocated in the **young generation** and collected frequently by a fast copying collector, on the assumption most objects die immediately. Survivors are promoted to the **old generation**, collected less often with mark-sweep-compact. This is why short-lived allocations are cheap and long-lived caches are expensive.

---

<a name="s18"></a>
# 18. Performance

### Event Loop lag
The delay between when a callback was due and when it actually ran. It's the single most useful health metric for a Node service — rising lag means something is occupying the thread. Measure it by scheduling a timer and recording how late it fires.

### Measuring performance
Event loop lag, heap usage over time, p95/p99 response latency (not the average — the average hides the tail), and the throughput at which latency starts climbing. `perf_hooks` gives you timing primitives inside the process.

### Profiling
`node --prof` plus `--prof-process`, or the Chrome DevTools inspector via `--inspect`, gives a CPU profile showing where time is spent. A flame graph is usually the fastest way to spot the one function eating the thread. Profile before optimising — the bottleneck is rarely where you'd guess.

### Why synchronous code blocks everyone
Because there's one JavaScript thread serving every connected user. A 200ms synchronous operation doesn't slow one request by 200ms — it delays **every** pending request by 200ms. That's why a single `readFileSync` in a hot path can destroy throughput.

### Cluster
Forking one Node process per CPU core, all sharing the same listening port, with the OS or the master distributing connections. It's how you use a multi-core machine, since one Node process only ever uses one core for JavaScript.
⚠️ Workers share nothing, so in-memory state and sessions must move to Redis.

### PM2
A process manager: keeps your app running, restarts it on crash, runs it in cluster mode, handles zero-downtime reloads, and aggregates logs. Roughly "cluster plus supervision, without writing it yourself".

### Load balancing
Distributing requests across instances. Cluster does it within one machine; a reverse proxy or cloud load balancer does it across machines. Needed for both throughput and availability — one instance is a single point of failure.

### Caching
Keeping computed or fetched results so you don't repeat the work. In-memory is fastest but per-instance and lost on restart; Redis is shared across instances and survives restarts. The hard part is always invalidation — decide up front how a cached value becomes stale.

### Compression
gzip or brotli on responses, cutting JSON payloads by roughly 70–90%. It costs CPU, so for a high-traffic service it's usually better done at the reverse proxy than in Node.

---

<a name="s19"></a>
# 19. Security

### CORS
A **browser** restriction: a page on one origin can't read a response from another unless that server says it may, via `Access-Control-Allow-*` headers.
⚠️ The crucial point interviews probe: CORS is enforced by the browser, not the server. It is not a security mechanism protecting your API — curl and Postman ignore it entirely. Authentication protects your API; CORS controls which web pages may read the response.

### Helmet
Middleware that sets a batch of protective HTTP headers — CSP, HSTS, `X-Content-Type-Options`, frame options. One line for a large fraction of the header-based hardening you'd otherwise do by hand.

### XSS
Injecting script into a page that another user's browser then executes, letting the attacker steal cookies or act as that user. Defences: escape output by context, use a Content Security Policy, avoid `innerHTML` with user data, and set `httpOnly` on session cookies so a successful XSS still can't read them.

### CSRF
Tricking a logged-in user's browser into making a request they didn't intend — the browser attaches their cookies automatically, so the server sees a legitimate request. Defences: `SameSite` cookies, anti-CSRF tokens, and checking the origin. Note that token-in-header auth isn't vulnerable, because the browser doesn't attach headers automatically.

### SQL Injection
Concatenating user input into a query so it becomes part of the command. The fix is **parameterised queries** — never string concatenation. Input validation helps but is not the fix; parameterisation is.

### NoSQL Injection
The same class of bug in MongoDB. If a query object is built from unvalidated body fields, sending `{"password": {"$gt": ""}}` makes the comparison match anything. The fix is validating types — ensure the value is a string, not an object — plus schema validation.

### JWT
A signed token carrying claims, so the server can verify a request without a session lookup.
⚠️ The payload is base64, **not encrypted** — anyone can read it, so nothing secret goes in. Tokens can't be revoked before expiry without extra infrastructure, which is why access tokens should be short-lived with a refresh token behind them.

### Sessions
Server-side state keyed by a cookie id. Revocable instantly and the client holds nothing sensitive, but requires shared storage once you have more than one instance. The real trade against JWTs: sessions cost a lookup and need Redis; JWTs are stateless but can't be revoked.

### Password hashing
Use **bcrypt, scrypt or argon2** — never SHA-256 or MD5. General-purpose hashes are designed to be fast, which is exactly what an attacker wants. Password hashes are deliberately slow and salted, so each guess costs real time and rainbow tables don't work.
⚠️ Use the async variants — `bcrypt.hashSync` blocks the event loop for every login.

### Rate limiting
Capping requests per client per window, to blunt brute-force, scraping and accidental floods. In-memory limiting breaks across multiple instances, so production means Redis with an atomic counter and TTL.

---

<a name="s20"></a>
# 20. Node Architecture

### How does Node start?
It initialises V8, creates the libuv event loop, sets up the global objects and bindings, loads your entry file as a module, runs it to completion, then enters the event loop — which keeps running while any handle or pending operation remains.

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

### How is JavaScript executed?
V8 parses it, Ignition compiles it to bytecode and starts executing immediately, and TurboFan later recompiles hot functions into optimised machine code using the observed types.

### How is C++ involved?
Everything below JavaScript. V8 is C++, libuv is C, and Node's bindings are the C++ layer connecting them — so calling `fs.readFile` crosses from JavaScript into C++ into libuv into an OS syscall, and the result travels back the same way.

### How does Node call OS APIs?
Through libuv, which wraps each platform's native interface behind one API — epoll on Linux, kqueue on macOS/BSD, IOCP on Windows — so your JavaScript is identical everywhere.

### Why are file operations asynchronous?
Because disk I/O is slow relative to CPU. Since most operating systems offer no genuinely non-blocking file API, libuv gets asynchrony by handing the blocking call to a **thread pool** worker.

### Why is networking asynchronous?
Because the OS provides real non-blocking sockets. Node registers interest in a socket with epoll/kqueue/IOCP and is notified when it's readable or writable — **no thread waits**, which is why Node handles tens of thousands of concurrent connections.

### How does DNS resolution work?
Two different paths, and the distinction matters.
`dns.lookup()` calls the system resolver (`getaddrinfo`), which is blocking — so it uses the **thread pool**. Four concurrent lookups can saturate the default pool.
`dns.resolve()` queries a DNS server directly over the network, so it uses async I/O and **no thread pool**.

### What happens when an HTTP request arrives?
The OS notifies libuv that the listening socket is readable; libuv wakes the event loop in the poll phase; Node accepts the connection and reads the bytes; the HTTP parser assembles them into a request; the `'request'` event fires; your handler runs on the main thread. If your handler starts async work, it returns immediately and the response is written when that work completes.

---

<a name="s21"></a>
# 21. Build & Runtime

### npm vs npx
`npm` installs and manages packages. `npx` **executes** a package binary, downloading it temporarily if it isn't installed — which is why `npx create-react-app` works without a global install and always uses the current version.

### `package.json`
The project manifest: name, version, dependencies, scripts, and entry points. `dependencies` are needed at runtime; `devDependencies` only for development and build.

### `package-lock.json`
The exact resolved dependency tree — every package, version and integrity hash, including transitive ones. It's what makes installs reproducible: without it, `^1.2.0` can resolve to a different version tomorrow and break a build that worked yesterday. Commit it.

### Semantic versioning
`MAJOR.MINOR.PATCH` — major means breaking changes, minor means new features that are backwards-compatible, patch means bug fixes. In ranges, `^1.2.3` allows minor and patch updates, `~1.2.3` allows only patch, and an exact version pins it.

### Node resolution algorithm
For `require('x')`: if it's a core module, use that. If it starts with `./` or `/`, resolve as a file, then as a directory (using its `package.json` `main`/`exports`, or `index.js`). Otherwise walk up through every parent `node_modules` folder until found — which is why a dependency can be resolved from a directory far above your file.

### Environment variables
Configuration passed in from outside the code — connection strings, secrets, feature flags. Keeps configuration out of source control and lets one build run in every environment. Always strings; validate and coerce at startup so a misconfiguration fails immediately rather than at 3am.

### Build tools
For plain Node, often none — it runs your source directly. You need one for TypeScript compilation, bundling a serverless function, or transpiling for an older runtime. `tsc`, esbuild and swc are the common choices, with esbuild and swc far faster because they aren't written in JavaScript.

### TypeScript compilation
`tsc` type-checks and emits JavaScript. Tools like esbuild and swc strip types **without checking them**, which is much faster — so the usual setup runs the fast tool for builds and `tsc --noEmit` separately in CI for the actual type checking.

### Source maps
A mapping from compiled output back to your original source, so stack traces and the debugger show real file names and line numbers instead of transpiled output. Essential for debugging TypeScript in production error reports.

---

<a name="s22"></a>
# 22. Scaling Node

### Cluster
Running one Node process per CPU core, all sharing a listening port. It's the answer to "one Node process uses one core" — four cores means roughly four times the throughput.
⚠️ Workers share no memory, so any in-process state, cache or session store must move out.

### Reverse proxy
A server in front of your app (nginx, Caddy) that terminates TLS, serves static files, compresses responses, buffers slow clients, and forwards the rest. It does the things Node is comparatively bad at, and shields your app from slow-client attacks.

### Load balancer
Distributes requests across multiple instances, with health checks so a failed instance stops receiving traffic. Provides both throughput and availability — without one, a single instance is a single point of failure.

### Horizontal scaling
Adding more instances rather than a bigger machine. It requires your app to be **stateless**: no in-memory sessions, no local file uploads, no in-process caches that must be consistent — because any request can land on any instance.

### Sticky sessions
Pinning a client to the same instance, usually by hashing their IP or a cookie. Necessary for stateful connections like WebSockets. Otherwise avoid it — it undermines even load distribution, and a lost instance takes its users' state with it.

### Redis
The shared-state layer that makes horizontal scaling work: session storage, cache, rate-limit counters (atomic `INCR` with TTL), and pub/sub for broadcasting between instances — such as fanning a WebSocket message out to whichever instance holds the recipient's connection.

### Message queues
Decoupling producers from consumers so slow or non-critical work leaves the request path. The user's request returns immediately; emails, thumbnails and reports are processed by workers. It also absorbs traffic spikes, since the queue buffers rather than dropping.

### Microservices
Splitting an application into independently deployable services. It buys independent scaling and deployment, at the cost of network calls, distributed transactions, and much harder debugging. Worth it for team autonomy at scale; usually premature before that.

### Worker queues
The concrete pattern behind async processing: a queue (BullMQ over Redis, or SQS) plus worker processes consuming jobs, with retries, backoff and a dead-letter queue for failures. This is where CPU-heavy work belongs in a Node system.

---

<a name="s23"></a>
# 23. ⭐ Advanced Internals

### How does Node communicate with libuv?
Through a C++ binding layer. `fs.readFile` in JavaScript calls into a C++ function, which builds a libuv request struct with a pointer back to your JavaScript callback and hands it to libuv. When the operation completes, libuv invokes the C++ callback, which crosses back into V8 to run your JavaScript.

### How does libuv communicate with the OS?
Two different ways depending on the operation. For sockets it registers interest with the kernel's event notification API and waits for readiness. For files and other blocking operations it dispatches to its own thread pool, since no non-blocking OS interface exists.

### Why is networking not handled by the thread pool?
Because it doesn't need to be. Operating systems provide genuinely non-blocking socket APIs — you ask the kernel "tell me when any of these 10,000 sockets is readable" and one thread waits for all of them. Using a thread per socket would defeat the entire point. Files have no such API, which is exactly why they *do* need the pool.

### How are timers implemented?
libuv keeps timers in a **min-heap** ordered by expiry, so finding the next one to fire is O(1). In the timers phase it pops everything already due and runs those callbacks. The nearest expiry also determines how long the loop is allowed to block in the poll phase — so it never oversleeps past a pending timer.

### How does Node schedule callbacks?
By queue and phase. Each completed operation places its callback in the queue for the relevant phase; the loop visits phases in fixed order, draining each. The `nextTick` and microtask queues sit outside that cycle and drain between every callback, which is why they always win.

### Why does DNS sometimes use the thread pool?
Because `dns.lookup()` calls the system resolver `getaddrinfo`, which is a blocking C call with no async equivalent — so libuv runs it on a pool thread. `dns.resolve()` talks to a DNS server directly over UDP, which is ordinary async network I/O and needs no thread.
⚠️ This surprises people: HTTP requests by hostname trigger `dns.lookup`, so a burst of outbound requests can saturate the four-thread pool and appear to be a network problem.

### How are sockets represented internally?
As libuv handles wrapping the OS file descriptor, with associated read and write buffers plus the JavaScript-side stream object. The handle also keeps the event loop alive — an open socket is a reason for the process not to exit.

### How does Node multiplex thousands of connections?
It registers every socket with the kernel's event notification mechanism and blocks in one syscall until any of them is ready. The kernel returns only the ready ones, so cost scales with **active** connections rather than total connections. Ten thousand idle sockets cost almost nothing; ten thousand threads would cost gigabytes.

### epoll vs kqueue vs IOCP
Three OS solutions to the same problem, wrapped by libuv.
**epoll** (Linux) and **kqueue** (macOS/BSD) are *readiness* based: the kernel says "this socket is ready to read", and you then read it.
**IOCP** (Windows) is *completion* based: you start an operation and the kernel tells you when it has already finished.
libuv normalises both models into one API, which is most of what libuv exists to do.

### What is non-blocking I/O?
A syscall that returns immediately rather than waiting. Ask a non-blocking socket to read and it either gives you available data or says "nothing yet" — it never parks the thread. Combined with an event notification mechanism, that's what lets one thread manage thousands of connections.

---

<a name="s24"></a>
# 24. Backend System Design

### Why separate Controller, Service, Repository?
Each has one reason to change. The **controller** deals with HTTP — parsing, validation, status codes. The **service** holds business rules and knows nothing about HTTP. The **repository** handles persistence and knows nothing about business rules.
The payoff is concrete: business logic can be unit tested with no HTTP, you can swap the database without touching the rules, and the same service can be reused from a queue consumer or a CLI.

### Why use dependency injection?
So a module declares what it needs rather than constructing it. That makes tests trivial — pass a fake repository instead of a real database — and lets you swap implementations without editing consumers. In Node it's often just constructor parameters rather than a framework.

### How should configuration be managed?
Environment variables, read and **validated once at startup** into a typed config object. Validating at boot means a missing variable fails immediately with a clear message, rather than as `undefined` in a database URL at 3am. Never commit secrets; never scatter `process.env` reads through your codebase.

### Stateless APIs
No request depends on server memory from a previous request. Session state goes to Redis, uploads go to object storage, caches are shared or per-instance-safe. That's what allows any request to hit any instance — the prerequisite for horizontal scaling.

### Request validation
Validate at the boundary, before anything else touches the data, with a schema library (Zod, Joi). It gives you clear 400 responses, blocks injection attacks that rely on unexpected types, and means everything downstream can trust its inputs.

### Error handling strategy
Distinguish **operational** errors (a 404, a failed external call, invalid input — expected, handled) from **programmer** errors (a bug, a null dereference — unexpected, should crash and restart). Use typed error classes, one central error middleware that maps them to status codes, and never leak stack traces to clients.

### Logging
Structured JSON (pino, winston), not `console.log` — so logs are searchable and filterable. Log at boundaries: request in, response out, external calls, errors with context. Never log secrets, tokens or full request bodies.

### Correlation IDs
A unique id generated per request, attached to every log line and forwarded in headers to downstream services. Without it, debugging a failure across three services means correlating timestamps by hand; with it, one search returns the entire journey.

### Health checks
An endpoint the load balancer or orchestrator polls. Distinguish **liveness** ("is the process alive?" — restart if not) from **readiness** ("can it serve traffic?" — checks database and dependencies; remove from the pool if not). Conflating them causes restart loops when a database blips.

### Graceful shutdown
On `SIGTERM`: stop accepting new connections, finish in-flight requests, close database and queue connections, then exit — with a timeout as a backstop. Without it, every deploy drops the requests that were mid-flight. This is the one most services get wrong.

---

<a name="s25"></a>
# 25. ⭐ Senior "Why" Questions

### Why is Node single-threaded?
Because it trades one hard problem for an easier one. Threaded servers need locks, and concurrent shared state is where the worst bugs live. One thread plus non-blocking I/O gives high concurrency with none of that — you can only ever be in one place at a time, so there are no data races by construction.

### Why does Node still use multiple threads internally?
Because not everything has a non-blocking OS interface. File I/O, DNS lookups via `getaddrinfo`, crypto and compression all block, so libuv runs them on a thread pool. Your JavaScript stays single-threaded; the waiting is delegated.

### Why is libuv necessary?
Because V8 only runs JavaScript — it has no concept of a file, a socket or a timer. And every OS exposes async I/O differently. libuv provides the event loop, the thread pool, and one cross-platform API over epoll, kqueue and IOCP.

### Why does `setTimeout(0)` not execute immediately?
Because it schedules for the **timers phase of the next loop iteration**, not for right now. The current synchronous code must finish, then `nextTick` and promise queues drain, and only then can the loop reach timers. `setTimeout(0)` means "as soon as possible", not "now".

### Why does `process.nextTick()` execute before Promises?
Because Node maintains two separate microtask queues and deliberately drains the `nextTick` one first, completely. It was designed so Node's internals could act immediately after an operation — emitting an error before anything else observes an inconsistent state — and application code inherited that priority.

### Why can synchronous code block thousands of users?
Because one thread serves every connection. A 200ms synchronous operation doesn't delay one user by 200ms — it delays *every* pending request by 200ms, and requests arriving during it queue behind. Blocking code doesn't degrade proportionally; it degrades for everyone at once.

### Why are streams more memory-efficient than reading an entire file?
Because only a chunk exists in memory at a time — roughly 64KB — while the rest stays on disk. `readFile` on a 2GB file needs 2GB of RAM; a stream needs kilobytes and the same code handles any size.

### Why does `require()` cache modules?
For performance — parse and execute once — and for **identity**. Every module requiring your database connection gets the same object, so shared state and singletons work naturally. Without caching, each require would create a new connection pool.

### Why was async/await added when Promises already existed?
Because promises fixed the *structure* of async code but not its *readability*. Chained `.then()` calls still read inside-out, and ordinary control flow — loops, conditionals, try/catch — is awkward around them. `async/await` is sugar over the same promises that lets asynchronous code read like sequential code.

### Why does Express use middleware?
Because HTTP request handling is genuinely a pipeline of independent concerns — logging, parsing, authentication, validation, then the handler. Middleware makes each a small composable function you can reorder, reuse and test in isolation, instead of one large handler doing everything.

### Why does Node perform better for I/O-bound workloads than CPU-bound?
Because the event loop's advantage is *not waiting*. I/O-bound work is mostly waiting, so one thread can juggle thousands of operations. CPU-bound work never waits — it occupies the thread — so concurrency gives you nothing and everything else stalls behind it.

### Why are Worker Threads separate from the Event Loop?
Because the event loop provides **concurrency**, not **parallelism**. It interleaves operations that are idle; it cannot make computation faster, since computation is never idle. Real parallelism needs another thread with its own V8 isolate and its own loop — which is exactly what a worker is.

### Why is backpressure important in streams?
Because without it a fast producer overwhelms a slow consumer, and the difference accumulates in memory until the process dies. Reading from disk at 100MB/s while uploading at 5MB/s buffers 95MB every second. Backpressure is the consumer's signal to pause.

### Why can a memory leak still occur in a garbage-collected language?
Because GC frees **unreachable** objects, not **unused** ones. If anything still references an object, the collector must keep it — even if your code will never look at it again. Module-level caches, uncleaned timers and forgotten listeners are all still reachable.

### Why do long-running synchronous loops freeze an entire server?
Because the event loop cannot advance while JavaScript is executing. No timer fires, no I/O callback runs, no new connection is accepted — the loop only regains control when your function returns. A ten-second loop is ten seconds of total unresponsiveness for every user.

---

<a name="s26"></a>
# 26. Database & Mongoose

### What is Mongoose and why use it over the native driver?
An ODM adding a schema layer over MongoDB — validation, type casting, middleware hooks, population and query helpers. MongoDB itself is schemaless, so without something like Mongoose nothing stops two documents in a collection having entirely different shapes.

### What are Mongoose middleware / hooks?
Functions running before or after an operation — `pre('save')` to hash a password, `post('save')` to emit an event, `pre('find')` to filter out soft-deleted records. It keeps cross-cutting concerns out of every call site.

### What is `populate()` and what does it cost?
It replaces a stored reference with the referenced document. The cost is that it's an **extra query per populated path**, executed by Mongoose, not a database join. Populating three fields on a list of 100 documents can be far more expensive than it looks — which is why embedding is often better for data always read together.

### Embedding vs referencing — how do you choose?
Embed when the data is read together, is bounded in size, and belongs to the parent — an address on a user. Reference when the data is large, shared between parents, or grows without limit — a user's orders. The deciding question is your read pattern, not the conceptual relationship.

### Why do indexes matter, and what's the cost?
Without an index, a query scans every document. With one, the database seeks directly. The cost is slower writes (every index updates on insert) and disk space, so index what you actually query, filter, sort or join on — not everything.

### What is a transaction, and when do you need one?
Multiple operations that must all succeed or all fail. In MongoDB they require a replica set and are relatively expensive, so the usual approach is to design documents so related data updates atomically within one document — falling back to transactions only for genuinely cross-collection invariants like transferring money.

### What is connection pooling?
Reusing a set of open database connections rather than opening one per query, since establishing a connection is expensive. The driver manages the pool; you configure its size. A pool that's too small becomes a queue and shows up as latency with no obvious cause.

### How do you avoid the N+1 query problem?
Fetch related data in one query rather than looping and querying per item. In Mongoose that means `populate` on the whole result set, or an aggregation with `$lookup` — not a `for` loop calling `findById`. The symptom is an endpoint whose latency scales with the number of returned rows.

---

<a name="s27"></a>
# 27. Testing

### What should you unit test in a Node service?
Business logic in services, pure functions, validators and utilities — the parts with real decisions in them. Not framework wiring, and not third-party libraries.

### Unit vs integration vs end-to-end?
**Unit** — one function or class with dependencies mocked. Fast, precise failures. **Integration** — several real pieces together, typically route plus service plus a real test database. Catches wiring bugs unit tests can't. **E2E** — the whole system through its public interface. Most valuable and most expensive; keep few.

### How do you test an Express route?
With `supertest`, which starts your app in-process and issues real HTTP requests without binding a port. You assert on status codes, bodies and headers, with the service layer either real (integration) or mocked (unit).

### How do you test code that hits a database?
Either an in-memory or containerised database for real integration coverage, or a mocked repository layer for speed. The separated architecture pays off here: if business rules live in a service that takes a repository, you test the rules with a fake and never touch a database.

### How do you test async code and time-dependent logic?
Return or await promises so the test framework waits — a forgotten `await` produces a test that passes regardless of the assertion. For timers and intervals, use fake timers so you can advance the clock instead of actually waiting.

### What is a flaky test usually caused by?
Shared state between tests, real timing dependencies, or reliance on ordering. The fixes are isolating state per test, faking time, and never depending on execution order.

---

<a name="s28"></a>
# 28. ⭐ Scenario & Debugging

> These can't be memorised, which is why they're asked.

### "The API is fast under light load but latency explodes under traffic. Where do you look?"
Event loop lag first — if it's rising, something synchronous is occupying the thread and every request is queueing behind it. Common culprits: `JSON.parse` on large payloads, synchronous crypto, a regex with catastrophic backtracking. If lag is flat, look at the database (connection pool exhaustion, a missing index) instead.

### "One endpoint is slow, but only sometimes."
Suspect the **thread pool**. Anything using it — file reads, `dns.lookup`, `bcrypt`, zlib — queues once four are in flight. Under light load there's a free thread; under load requests wait for one, so latency appears intermittently with no code path to blame. Raise `UV_THREADPOOL_SIZE` or move the work off the request path.

### "Memory grows steadily and the process eventually restarts."
A leak: something reachable that's never released. Take two heap snapshots separated by load and compare growth. The usual suspects, in order: a module-level cache or `Map` never pruned, event listeners added per request to a long-lived emitter, uncleaned `setInterval`s, and closures holding large buffers.

### "`console.log` shows the right data but the response body is empty."
Almost always a missing `return` or `await`. The handler responded before the async work finished, or two paths both tried to respond. Second suspect: `res.json()` called inside a callback that runs after the response already ended.

### "The request hangs forever with no error."
Middleware that neither responded nor called `next()`. Express has no timeout of its own — the request simply sits there until the client gives up. Check every branch of your middleware, especially early returns in validation.

### "It works locally but breaks in production."
Environment differences, in likely order: a missing environment variable (undefined silently becoming part of a URL), case-sensitive file paths on Linux versus Windows, a `devDependency` used in production code, a different Node version, and time zone assumptions.

### "After deploying, some requests fail with connection reset."
No graceful shutdown. The old process was killed while requests were in flight. Handle `SIGTERM`: stop accepting connections, let in-flight requests finish, close database connections, then exit.

### "A `for` loop with `await` inside is very slow."
It's sequential — each iteration waits for the previous. If the operations are independent, `Promise.all(items.map(...))` runs them concurrently. If they must be ordered, or you'd overwhelm the database, keep it sequential but batch with a concurrency limit.

### "CPU sits at 100% on one core while the others idle."
That's Node using a single thread by design. Use `cluster` or PM2 to run one process per core, and move genuinely CPU-heavy work into worker threads or a queue.

### "`process.nextTick` in a recursive function froze the server."
The `nextTick` queue drains completely before the loop advances, so a callback that schedules another `nextTick` starves everything — no timers, no I/O, no new connections. Use `setImmediate` instead, which yields to the loop between iterations.

### "Users report being logged out at random."
Multiple instances with in-memory sessions and no sticky routing — each request lands on a different instance that has never seen that session. Move sessions to Redis, which is the correct fix, rather than enabling sticky sessions, which merely hides it.

---

## Before an interview

```
1. Cover the answers. Say yours ALOUD. Section 28 first — least memorisable.
2. Stumble → open the linked Part, reread that section only.
3. Highest yield: 3 (event loop), 5 (task queues), 6 (libuv), 8 (streams),
   25 (the whys), 28 (scenarios).
4. If you have one hour: the event loop, why networking skips the thread pool,
   backpressure, and why sync code blocks everyone. Those four carry most interviews.
```

*— End of question bank —*

