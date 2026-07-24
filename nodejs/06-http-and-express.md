# Node.js Study Notes — Part 6

## HTTP & Express — Lifecycle, Middleware, Routing, Errors & Hardening

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Continues from:** [Part 1.2](01.2-event-loop-blocking-and-real-world-load.md) (latency, streaming) · [Part 2](02-nodejs-internals.md) (thread pool — compression uses it) · [Part 3](03-asynchronous-programming.md) (async errors, which Express 4 does *not* catch).

---

## Table of Contents

1. [HTTP Lifecycle](#lifecycle)
2. [Middleware](#middleware)
3. [Routing](#routing)
4. [Error Middleware](#errors)
5. [Validation](#validation)
6. [CORS](#cors)
7. [Helmet](#helmet)
8. [Compression](#compression)
9. [⭐ The production middleware stack](#stack)
10. [Rate limiting & graceful shutdown](#extras)
11. [Interview Questions & Answers](#interview)
12. [Cheat Sheet](#cheatsheet)

---

<a name="lifecycle"></a>
# 1. HTTP Lifecycle

What happens between a click and your handler running:

```
 BROWSER                                          YOUR SERVER
    │
    │ 1. DNS lookup        api.site.com → 1.2.3.4   (~20-100ms, then cached)
    │ 2. TCP handshake     SYN → SYN-ACK → ACK      (1 round trip)
    │ 3. TLS handshake     certificate + keys       (1-2 round trips)
    │
    │ 4. REQUEST  ─────────────────────────────────▶
    │    GET /users/42                              ┌──────────────────┐
    │    headers, cookies, body                     │ Node http server │
    │                                               └────────┬─────────┘
    │                                          5. middleware chain
    │                                             (cors → parse → auth → …)
    │                                                        │
    │                                          6. route handler
    │                                             await db.query()  ← thread free
    │                                                        │
    │ 7. RESPONSE ◀─────────────────────────────────         │
    │    200 OK + JSON
    │
    │ 8. connection kept open (keep-alive) for reuse
```

**Two things to internalize:**

**① `req` and `res` are streams**, not plain objects. `req` is a **Readable** — the body arrives in chunks, which is why you need a body parser. `res` is a **Writable** — which is why you can `pipe` a file into it instead of loading it into memory.

**② Steps 1–3 cost ~100–300 ms before your code runs at all.** No Node optimization touches that. It's why keep-alive, CDNs and regional deploys matter more than shaving 5 ms off a handler ([Part 1.2 §5](01.2-event-loop-blocking-and-real-world-load.md)).

---

<a name="middleware"></a>
# 2. Middleware

**A function that sits between the request arriving and the response leaving.**

> **Analogy ✈️ — airport security checkpoints.** Check-in → passport control → baggage scan → gate. Each station either **waves you through** (`next()`) or **stops you right there** (sends a response). You pass them in the exact order they're laid out, and one closed checkpoint stops everyone behind it.

```js
app.use((req, res, next) => {
  console.log(req.method, req.url);
  next();                       // ⭐ hand off to the next one
});
```

## The contract — every middleware must do exactly ONE of three things

```
1. next()          → pass to the next middleware
2. send a response → res.json() / res.send() — the chain ends here
3. next(err)       → skip straight to the ERROR middleware
```

Do none of them and **the request hangs forever** — no error, no log, the browser spins until it times out. This is the single most common Express bug:

```js
app.use((req, res, next) => {
  if (req.user) next();
  // ❌ no else → unauthenticated requests hang silently
});
```

## Order is everything

Express walks middleware in **registration order**. Registration order *is* execution order.

```js
app.use(auth);                    // runs first  ✅
app.get('/users', getUsers);

app.get('/users', getUsers);      // ⚠️ runs FIRST — auth never applies
app.use(auth);
```

---

<a name="routing"></a>
# 3. Routing

Matching a method + path to a handler. Same rule: **first match wins, in registration order.**

| Piece | Comes from | Example |
|---|---|---|
| `req.params` | the URL path | `/users/42` → `{ id: '42' }` |
| `req.query` | after the `?` | `?page=2` → `{ page: '2' }` |
| `req.body` | the request body | needs `express.json()` first |

### The ordering trap
```js
app.get('/users/:id', ...);      // matches "/users/new" — id = "new" 💥
app.get('/users/new', ...);      // ❌ unreachable

// ✅ specific routes BEFORE dynamic ones
app.get('/users/new', ...);
app.get('/users/:id', ...);
```

### Routers are mini-apps
```js
// routes/users.js
const router = express.Router();
router.use(requireAuth);              // applies to every route in THIS router
router.get('/', listUsers);
module.exports = router;

// app.js
app.use('/api/users', router);        // mounted under a prefix
```

> ⚠️ **Everything in `req.params` and `req.query` is a string.** `req.params.id` is `'42'`, not `42`. And `?active=false` is the string `'false'` — which is **truthy**. A real source of bugs.

---

<a name="errors"></a>
# 4. Error Middleware

Express recognizes it by its **four parameters** — the arity is the signal, so you can't drop `next` even when unused:

```js
app.use((err, req, res, next) => {          // ⭐ 4 args = error handler
  console.error(err);
  res.status(err.status || 500).json({ error: err.message });
});
```

Anything passed to `next(err)` skips **every remaining normal middleware** and jumps here.

> **Analogy 🚨 — the emergency exit.** Normal middleware are rooms you walk through in order. `next(err)` is the fire door: you skip every remaining room and land in the one place equipped to handle it.

## Why it must be last
Because **registration order is execution order.** Registered early, it sits *before* everything that could fail — the fire door is behind you.

```js
app.use(errorHandler);      // ❌ nothing has run yet, so nothing can have failed
app.use(routes);

app.use(routes);            // ✅
app.use(errorHandler);      // last — everything above can reach it
```

## ⚠️ Express 4 does not catch async errors

```js
app.get('/x', async (req, res) => {
  throw new Error('boom');    // ❌ unhandled rejection — never reaches errorHandler
});
```

Express 4 only catches **synchronous** throws ([Part 3 §7](03-asynchronous-programming.md)). Three fixes:

```js
// 1. a wrapper
const asyncH = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.get('/x', asyncH(async (req, res) => { ... }));

// 2. one line at the top of the app
require('express-async-errors');

// 3. Express 5 — native support
```

## The standard production shape

```js
// 404 — no route matched. NOT an error handler; it's the last NORMAL middleware.
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// error handler — always dead last
app.use((err, req, res, next) => {
  logger.error({ err, url: req.url, id: req.id });
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,   // ⭐ never leak
  });
});
```

> **Never send `err.stack` or a raw DB error to the client.** Stack traces reveal your file structure; driver errors reveal your schema. Log the detail, return something generic.

---

<a name="validation"></a>
# 5. Validation

> **Analogy 🛂 — passport control.** You check documents at the **border**, once, before anyone enters the country — not at every shop they visit. Validate at the edge so everything downstream can trust its input.

```js
const { z } = require('zod');

const CreateUser = z.object({
  email: z.string().email(),
  age: z.number().int().min(18),
});

const validate = schema => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ errors: result.error.issues });
  req.body = result.data;      // ⭐ replaced with PARSED, TYPED data
  next();
};

app.post('/users', validate(CreateUser), createUser);
```

**Four rules:**
1. **Never trust the client** — not the body, not query params, not headers. Client-side validation is UX, not security; `curl` ignores it entirely.
2. **Validate at the boundary**, so handlers and services can assume clean input.
3. **Whitelist, don't blacklist** — accept known-good fields, strip the rest. Otherwise `{ role: 'admin' }` slips into a user-update payload (mass assignment).
4. **Coerce types** — everything from the URL is a string.

```
400 = malformed   ·  422 = well-formed but invalid
401 = not logged in  ·  403 = logged in but not allowed
```

---

<a name="cors"></a>
# 6. CORS

**The browser's rule:** JavaScript on `site-a.com` cannot read a response from `api-site-b.com` unless that server explicitly allows it.

> **Analogy 🎫 — the guest list.** Your API is a private party and **the browser is the bouncer** — it checks whether the visitor's origin is on the list before letting the page read the response. If not, the request may still have *happened*; the browser just refuses to hand the data back to the JavaScript.

```js
app.use(cors({
  origin: ['https://myapp.com'],     // ⚠️ never '*' with credentials
  credentials: true,                 // allow cookies
}));
```

**Preflight:** for anything non-simple (a `PUT`, a custom header, a JSON content-type), the browser first sends an **`OPTIONS`** request asking permission, then the real one. That's the mysterious extra request in your network tab — and it doubles latency, which is why `maxAge` caching matters.

**Three points that show you understand it:**

**① CORS is not security.** It's enforced by **browsers only**. `curl`, Postman and any server ignore it. It protects **your users' browsers** from other sites reading your API with their cookies — it does nothing to protect your API. That's authentication's job.

**② `origin: '*'` with `credentials: true` is invalid** and browsers reject it — wildcard plus cookies would let any site make authenticated requests as your logged-in users.

**③ Put it near the top** of the stack — a rejected preflight shouldn't run through auth and body parsing first.

---

<a name="helmet"></a>
# 7. Helmet

Sets security-related HTTP headers. One line, real defense.

> **Analogy 🔒 — locking the windows.** Your locked front door is authentication. Helmet is the set of small latches on every window you forgot existed.

```js
app.use(helmet());
```

| Header | Stops |
|---|---|
| `Content-Security-Policy` | XSS — restricts where scripts may load from |
| `Strict-Transport-Security` | forces HTTPS on future visits |
| `X-Content-Type-Options: nosniff` | browsers guessing a file is JS when it isn't |
| `X-Frame-Options` | clickjacking via hidden iframes |
| *(removes)* `X-Powered-By` | advertising "Express" to attackers |

**CSP is the valuable one and the only one needing configuration** — the rest are safe defaults. For a JSON API, bare `helmet()` is fine.

---

<a name="compression"></a>
# 8. Compression

Gzip/Brotli the response body — often **70–80% smaller** for JSON and HTML.

```js
app.use(compression());
```

**Three caveats:**

**① It uses the libuv thread pool.** `zlib` is one of the four things that does ([Part 2 §3](02-nodejs-internals.md)) — under load, compression competes with `fs` and `bcrypt` for the same 4 threads.

**② Don't compress what's already compressed.** JPEG, PNG, MP4, ZIP — you burn CPU and can make the file *larger*. `compression()` skips these by content-type automatically.

**③ Not worth it below ~1 KB** — CPU cost plus the extra header outweighs the saving. The default threshold handles this.

> **In production, terminate compression (and TLS) at nginx or your CDN** — it's C, it's faster, and it keeps the work off your event loop entirely.

---

<a name="stack"></a>
# 9. ⭐ The production middleware stack

```js
app.use(helmet());                        // 1. security headers — cheap, first
app.use(cors(corsOptions));               // 2. before anything expensive (preflight)
app.use(compression());                   // 3. wrap responses
app.use(express.json({ limit: '1mb' }));  // 4. parse body ⚠️ ALWAYS set a limit
app.use(rateLimit({ max: 100 }));         // 5. before auth — cheap check first
app.use(requestId);                       // 6. correlation id for logs
app.use(logger);                          // 7. now every log line carries the id
app.use(authenticate);                    // 8. expensive (DB/JWT) — after cheap rejects

app.get('/health', (_, res) => res.send('ok'));   // ⚠️ must be BEFORE auth
app.use('/api/users', userRoutes);        // 9. routes

app.use(notFound);                        // 10. no route matched → 404
app.use(errorHandler);                    // 11. ALWAYS LAST
```

**The reasoning: cheap rejections before expensive ones.** Rate limiting before auth means a flood costs you a counter increment, not a database lookup. And the **health check must sit before auth**, or the load balancer gets 401s and kills every instance.

> ⚠️ **`express.json({ limit })` is not optional.** The 100 kb default saves you, but be explicit — an unbounded body parser lets someone POST a 2 GB payload and OOM your process.

---

<a name="extras"></a>
# 10. Rate limiting & graceful shutdown

### Rate limiting
```js
app.use(rateLimit({ windowMs: 60_000, max: 100 }));
```
Back it with Redis in production ([05.5-redis-deep-dive.md](../05.5-redis-deep-dive.md)). With `cluster` or multiple containers, in-memory counters mean each of your 8 processes allows 100/min — so your "100" is really 800.

### Graceful shutdown
```js
process.on('SIGTERM', () => {
  server.close(async () => {         // stop accepting NEW connections
    await db.end();                  // finish in-flight ones, then clean up
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();   // force-quit backstop
});
```
Without this, every deploy kills in-flight requests — users see random 502s during rollouts.

---

<a name="interview"></a>
# 11. Interview Questions & Answers

### Q1. Explain middleware execution order.
> "Express keeps a **stack** of middleware and walks it top to bottom in **registration order** — the order you call `app.use()` *is* the execution order. Each one either calls `next()` to continue, sends a response to end the chain, or calls `next(err)` to jump to the error handler.
>
> Two consequences: **anything registered after a route won't run for that route**, and if a middleware does none of those three things the **request hangs forever** with no error. Path-mounted middleware only runs for matching paths, but relative order still applies within that."

### Q2. Global vs route middleware?
> "**Global** (`app.use(fn)`) runs for every request — helmet, cors, body parsing, logging. **Route-level** (`app.get('/x', mw, handler)`) runs only for that route, and `router.use()` scopes to a mounted router.
>
> My rule is **cost and blast radius**: cheap and universal goes global; expensive or specific goes route-level. Auth is the example — putting `authenticate` globally breaks `/health` and `/login`, so it belongs on the routers that need it. Per-router mounting also means a new public endpoint can't accidentally inherit auth you didn't intend, or skip it."

### Q3. Why should error middleware be last?
> "Because registration order is execution order — an error handler registered first sits *before* everything that could fail, so nothing can reach it. It must come after all routes so any `next(err)` above lands in it.
>
> Express identifies it by **arity** — four params `(err, req, res, next)`. Three params and it's treated as normal middleware, a classic silent bug. And in Express 4 it won't catch **async** errors unless you wrap handlers or use `express-async-errors`, because a rejected promise isn't a synchronous throw."

### Q4. What happens if a middleware forgets `next()`?
> "The request **hangs** — no response, no error, no log; the client waits until it times out. It's the most common Express bug because nothing tells you it happened. Usually it's a conditional path: `if (ok) next()` with no `else`."

### Q5. What causes `ERR_HTTP_HEADERS_SENT`?
> "Sending a response twice — usually calling `res.json()` and then `next()`, or forgetting to `return` after an early `res.status(400).json(...)`. Once headers are flushed the response is committed. Fix: `return res.json(...)` everywhere and treat sending as terminal."

### Q6. Is CORS a security feature?
> "Not for your server. It's enforced **only by browsers** — `curl` and Postman ignore it, so it stops no determined attacker. What it protects is **your users**: it stops a malicious site making authenticated requests with their cookies and reading the response. Your API's security is authentication and authorization; CORS is a browser policy alongside it."

### Q7. How do you handle a 404 vs an error?
> "The 404 is a **normal** middleware placed after all routes — if execution reaches it, nothing matched. The error handler is a separate **4-arg** middleware after that. Keeping them distinct matters because a 404 is an expected outcome to log quietly, while a 500 is a bug that should page someone."

### Q8. `app.use` vs `app.get`?
> "`app.use` matches **any method** and treats the path as a **prefix** — `app.use('/api')` matches `/api/users/1`. `app.get` matches **only GET** and requires a **full match**. So `app.use` is for middleware and mounting routers, `app.get` for actual endpoints."

### Q9. Why not `res.send(hugeFile)`?
> "It buffers the whole thing into memory first — a 2 GB file OOMs the process, and 10 concurrent requests for a 200 MB file is 2 GB of heap. Stream it: `fs.createReadStream(path).pipe(res)` holds constant memory and starts sending immediately ([Part 1.2 §6](01.2-event-loop-blocking-and-real-world-load.md))."

---

<a name="cheatsheet"></a>
# 12. Cheat Sheet

### The middleware contract
```
EVERY middleware must do exactly ONE of:
   next()            → continue
   send a response   → end the chain
   next(err)         → jump to the error handler

None of them → THE REQUEST HANGS FOREVER (no error, no log)  ⚠️
```

### Order rules
```
• registration order IS execution order
• anything registered AFTER a route never runs for that route
• error middleware = 4 ARGS (err, req, res, next) → ALWAYS LAST
• 3 args = treated as normal middleware (silent bug)
• specific routes BEFORE dynamic ones  (/users/new before /users/:id)
```

### Production stack (top → bottom)
```
helmet → cors → compression → json({limit}) → rateLimit
      → requestId → logger → auth → /health(before auth!) → routes
      → 404 → errorHandler(LAST)

⭐ cheap rejections before expensive ones (rateLimit before auth)
```

### Express 4 + async
```js
app.get('/x', async (req,res) => { throw e });   // ❌ NEVER reaches errorHandler
→ wrap: fn => (q,s,n) => Promise.resolve(fn(q,s,n)).catch(n)
→ or `require('express-async-errors')`  ·  or Express 5
```

### The gotchas
```
• req.params / req.query are ALWAYS strings ('false' is truthy!)
• always return after res.json() → else ERR_HTTP_HEADERS_SENT
• never leak err.stack or raw DB errors to the client
• express.json({ limit }) — unbounded body = OOM
• health check BEFORE auth, or the LB kills every instance
• res.send(bigFile) buffers → stream with .pipe(res)
```

### Security add-ons
```
helmet      → CSP, HSTS, nosniff, frame-options, drops X-Powered-By
cors        → BROWSER-ONLY policy, not server security
              '*' + credentials = invalid
compression → uses the 4-thread POOL · skip already-compressed · >1KB only
validation  → at the boundary · whitelist · coerce types · never trust client
rateLimit   → Redis-backed, else N processes = N × the limit
```

### Status codes
```
400 malformed  ·  401 not logged in  ·  403 not allowed
404 not found  ·  422 valid shape, invalid data  ·  429 rate limited
500 our bug    ·  502/503 upstream or shutting down
```

---

*— Part 6 of the Node.js notes. Related: [Part 1.2 — Blocking & Load](01.2-event-loop-blocking-and-real-world-load.md) · [Part 2 — Internals](02-nodejs-internals.md) · [Part 3 — Async](03-asynchronous-programming.md) —*
