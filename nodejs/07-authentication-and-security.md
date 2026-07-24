# Node.js Study Notes — Part 7

## Authentication & Security — JWT, Sessions, OAuth, RBAC & the Attacks

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Continues from:** [Part 2](02-nodejs-internals.md) (bcrypt uses the thread pool; cluster breaks in-memory state) · [Part 6](06-http-and-express.md) (middleware order, validation).
>
> **Not a repeat of the system-design notes.** The concepts live in [15-authentication-vs-authorization](../15-authentication-vs-authorization.md), [16-jwt-deep-dive](../16-jwt-deep-dive.md), [17-oauth-sso-rbac](../17-oauth-sso-rbac.md), [18-sessions](../18-sessions.md), [19-password-hashing](../19-password-hashing.md). **This part is the Node implementation, the attacks, and — §9 — how credentials actually travel and what scaling does to them.**

---

## Table of Contents

**Authentication**
1. [bcrypt — password storage](#bcrypt)
2. [Cookies](#cookies)
3. [Sessions](#sessions)
4. [JWT](#jwt)
5. [Refresh tokens & rotation](#refresh)
6. [OAuth basics](#oauth)
7. [RBAC](#rbac)

**Security**

8. [XSS · CSRF · NoSQL injection · Rate limiting · Validation](#attacks)

**⭐ The part nobody explains**

9. [How auth actually travels, and what scaling does to it](#travel)

10. [Interview Questions & Answers](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="bcrypt"></a>
# 1. bcrypt — password storage

> **Analogy 🐌 — a deliberately slow vault.** A normal lock opens instantly — a feature for you *and* for a thief with a million keys. bcrypt takes a full second to turn. You barely notice once at login. An attacker trying 10 billion guesses now needs centuries.

```js
const hash = await bcrypt.hash(password, 12);       // ~250ms — on purpose
const ok   = await bcrypt.compare(password, hash);  // never compare strings yourself
```

**Why not SHA-256?** Because it's *fast* — a GPU does ~10 billion/sec, so an 8-character password falls in minutes. bcrypt does ~10 thousand/sec. **Being slow IS the security feature.** Hash functions built for speed are the wrong tool for passwords.

**Cost factor is a dial:** `12` ≈ 250 ms. Each +1 doubles the work. Raise it as hardware improves.

**Salt is built in** — bcrypt generates a random salt per password and stores it inside the hash string. Two users with password `hunter2` get different hashes, which kills rainbow tables. You never handle the salt yourself.

> ⚠️ **bcrypt runs on the libuv thread pool** ([Part 2 §3](02-nodejs-internals.md)). This is *the* classic pool-exhaustion case: 4 concurrent logins saturate all 4 threads and the 5th user waits a full hash cycle. **Symptom: login latency climbs while CPU looks idle and event loop lag looks fine.** Fix: raise `UV_THREADPOOL_SIZE`, or hash in a worker pool.

**Modern preference: `argon2id`** — memory-hard, so GPUs and ASICs help less. bcrypt remains perfectly acceptable and far more common.

---

<a name="cookies"></a>
# 2. Cookies

A small string the browser stores and **automatically attaches to every request** to that domain.

> **Analogy 🎟️ — a coat-check stub.** The venue keeps your coat; you carry a numbered ticket. The ticket is worthless to someone who can't reach the cloakroom — but anyone holding it can claim your coat.

```js
res.cookie('sid', id, {
  httpOnly: true,     // ⭐ JavaScript CANNOT read it → blocks XSS theft
  secure: true,       // HTTPS only
  sameSite: 'lax',    // ⭐ blocks CSRF
  maxAge: 86400000,
});
```

| Flag | Blocks |
|---|---|
| `httpOnly` | **XSS** stealing the cookie — JS can't see it at all |
| `secure` | interception over plain HTTP |
| `sameSite` | **CSRF** — controls whether it's sent cross-site |

**`sameSite`:**
- **`strict`** — never sent from another site. Safest, but a link from an email arrives logged out.
- **`lax`** *(default)* — sent on top-level navigation, not on background `POST`s. **Right for most apps.**
- **`none`** — always sent; requires `secure`. Only for genuinely cross-domain APIs.

---

<a name="sessions"></a>
# 3. Sessions

**Server holds the state; the client holds only an ID.**

```
LOGIN:   verify password → create session in Redis → send cookie {sid: abc123}
REQUEST: cookie arrives  → look up abc123 in Redis → you are user 42
LOGOUT:  DELETE abc123   → the cookie is instantly worthless ✅
```

The coat-check analogy is exact — the ticket is meaningless alone. **Everything real lives on the server.**

```js
app.use(session({
  store: new RedisStore({ client }),   // ⭐ NOT in memory
  secret: process.env.SECRET,
  cookie: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 86400000 },
}));
```

> ⚠️ **Redis, not memory.** In-memory sessions break the moment you run `cluster` or a second container — see §9, where this is worked through properly.

**Trade-off:** a lookup on every request (~1 ms) — in exchange for **instant revocation**.

---

<a name="jwt"></a>
# 4. JWT

A signed token the client carries. Three base64url parts: `header.payload.signature`.

> **Analogy 🪪 — a tamper-proof ID card.** The bouncer doesn't phone head office; he checks the hologram. Fast, and stateless.
>
> **Two consequences follow.** ① Anyone can *read* it — laminated, not sealed. ② **You cannot un-issue it.** Once someone holds the card it works until the printed expiry, even if you fire them the next morning.

```js
const token   = jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: '15m' });
const payload = jwt.verify(token, SECRET);   // throws if tampered or expired
```

> ⚠️ **JWTs are signed, not encrypted.** Base64 is encoding, not encryption — paste any JWT into jwt.io and read it. **Never put anything sensitive in the payload:** no passwords, no PII, no secrets.

### Sessions vs JWT

| | **Session** | **JWT** |
|---|---|---|
| State | on the server (Redis) | in the token |
| Revoke instantly | ✅ delete the row | ❌ valid until expiry |
| Per-request cost | lookup (~1 ms) | signature check (~0 ms) |
| Across services | needs shared Redis | self-contained ✅ |
| Best for | normal web apps ⭐ | microservices, mobile, third-party APIs |

> **The honest interview answer:** *"For a standard web app I'd default to sessions — revocation is instant and Redis isn't the bottleneck. JWTs earn their complexity when multiple services shouldn't share a session store, or for third-party API consumers."*

---

<a name="refresh"></a>
# 5. Refresh Tokens & Rotation

Short-lived access token + long-lived refresh token. This exists **precisely because you can't revoke a JWT.**

```
access token   15 minutes   sent with every request   (damage window if stolen)
refresh token  7 days       sent ONLY to /refresh     (stored server-side ✅)
```

The refresh token *is* stored server-side — so it **can** be revoked. You've reintroduced state, but only on one rarely-called endpoint instead of every request.

## Rotation + reuse detection ⭐

> **Analogy 🎫 — single-use tickets.** Each exchange gives you a fresh ticket and voids the old stub. **If a void stub shows up at the door, someone made a copy** — so you cancel the entire booking.

```
Login    → access A1 + refresh R1
Refresh  → present R1 → R1 marked used → issue A2 + R2
Refresh  → present R2 → R2 marked used → issue A3 + R3

⚠️ Someone presents R1 again (already used)
   → the token was STOLEN
   → revoke the ENTIRE family (R2, R3, …) → force re-login
```

**That's the point of rotation.** Without it, a stolen refresh token works silently for 7 days. With it, the *legitimate* user's next refresh triggers the collision and the theft is detected automatically.

```js
async function refresh(token) {
  const row = await db.refreshTokens.find({ tokenHash: sha256(token) });
  if (!row) throw new Error('invalid');
  if (row.usedAt) {
    await db.refreshTokens.revokeFamily(row.familyId);   // 🚨 theft detected
    throw new Error('reuse detected — all sessions revoked');
  }
  await db.refreshTokens.markUsed(row.id);
  return issueNewPair(row.userId, row.familyId);
}
```

Store a **hash** of the refresh token, never the token itself — it's a credential, treat it like a password.

---

<a name="oauth"></a>
# 6. OAuth Basics

**OAuth is delegation, not authentication.** *"Let this app read my Google contacts"* — without handing over your Google password.

> **Analogy 🚗 — the valet key.** It starts the car and opens the door, but not the trunk or the glovebox, and you can cancel it. Your master key never leaves your pocket.

```
1. App redirects you to Google
2. You log in AT GOOGLE (the app never sees your password) ⭐
3. Google asks "allow this app to read your contacts?"
4. Google redirects back with a short-lived CODE
5. App's SERVER exchanges code + client secret for an access token
6. App calls Google's API with that token
```

**Why the code step exists:** the code travels through the browser (visible in URLs and logs) but is useless alone — exchanging it requires the client secret, which only your server holds. Public clients (SPAs, mobile) use **PKCE** instead of a secret.

**Four roles:** resource owner (you) · client (the app) · authorization server (Google login) · resource server (Google's API).

**OAuth vs OIDC:** OAuth grants *access* ("may read contacts"). **OpenID Connect** layers *identity* on top with an `id_token` saying who you are — that's what "Sign in with Google" actually uses.

---

<a name="rbac"></a>
# 7. RBAC

```
user → role(s) → permissions → allowed actions

alice → admin  → [users:read, users:write, billing:*]
bob   → viewer → [users:read]
```

```js
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' });

router.delete('/users/:id', authenticate, requireRole('admin'), deleteUser);
```

**Three rules:**
1. **Always check on the server.** Hiding a button is UX; the endpoint is the security boundary.
2. **`401` = not logged in · `403` = logged in but not allowed.**
3. **Check ownership, not just role.** A `viewer` who can read *any* user's data is still a bug — most real checks are "admin **or** owner of this resource".

**RBAC vs ABAC:** RBAC is role-based ("admins can delete"). ABAC is attribute-based ("users can delete their own posts, within 24h, if unpublished"). Start with RBAC.

---

<a name="attacks"></a>
# 8. The Attacks

## XSS — Cross-Site Scripting
**The attacker gets their JavaScript running on your page**, in your users' browsers, with their session.

> **Analogy 📰 — a forged note in the company newsletter.** Someone submits `<script>steal()</script>` to your comment field; you print it verbatim; every reader's browser *executes* it — and trusts it, because it came from your domain.

| Defense | What it does |
|---|---|
| **Escape on output** | React/Vue do this by default — don't defeat it |
| **`httpOnly` cookies** ⭐ | even if XSS runs, it **cannot read your session** |
| **CSP** (via helmet) | the browser refuses to execute unknown/inline scripts |
| **Sanitize HTML** | for rich text — `DOMPurify`, allowlist only |

```js
element.innerHTML = userInput;        // ❌ executes anything
element.textContent = userInput;      // ✅ always text
dangerouslySetInnerHTML={{...}}       // ❌ the name is the warning
```

> ⭐ **XSS defeats every client-side secret.** If an attacker runs JS on your page, anything JavaScript can read is theirs — which is the whole argument against `localStorage` tokens.

## CSRF — Cross-Site Request Forgery
**They don't steal your cookie — they make your browser use it.**

> **Analogy ✉️ — a letter forged in your name, with your stamp.** They can't read your mail; they just get you to *send* something. The bank sees a properly stamped envelope and honors it.

```html
<!-- on evil.com, while you're logged into your bank in another tab -->
<form action="https://bank.com/transfer" method="POST">
  <input name="to" value="attacker"><input name="amount" value="10000">
</form>
<script>document.forms[0].submit()</script>
```

| Defense | Note |
|---|---|
| **`sameSite=lax` cookies** ⭐ | blocks the cross-site POST — modern default, mostly solves it |
| **CSRF token** | random per-session value in a hidden field; evil.com can't read it |
| **Check `Origin`/`Referer`** | reject unexpected origins |

> ⭐ **CSRF only applies to *automatic* credentials — cookies.** An `Authorization: Bearer` header must be set by your JS, and the attacker's page can't make your JS do that.
>
> **The real trade-off:** cookies → CSRF risk (but XSS-proof if `httpOnly`). Header tokens → no CSRF (but XSS can steal them). **Neither is free.**

## NoSQL Injection
Injecting **an object where a string was expected.**

```js
User.findOne({ email: req.body.email, password: req.body.password });
```
```json
{ "email": "admin@site.com", "password": { "$gt": "" } }
```
`{$gt: ""}` means *"any password greater than empty string"* — all of them. **Logged in as admin, no password.**

**Defenses:** validate types with `zod`/`joi` (kills it outright) · `express-mongo-sanitize` to strip `$` keys · Mongoose schema casting · and with bcrypt this query is impossible anyway, since you must `compare()` against a hash.

## Rate Limiting
> **Analogy 🚪 — a doorman with a tally.** Same face, twentieth time this minute? Something's wrong.

```js
app.use('/login', rateLimit({ windowMs: 900_000, max: 5 }));    // brute force
app.use('/api',   rateLimit({ windowMs: 60_000,  max: 100 }));
```
1. **Login needs a far tighter limit** — that's where password guessing happens.
2. **Limit per account *and* per IP** — per-IP misses distributed guessing at one account; per-account lets one IP spray many accounts.
3. **Redis-backed** under `cluster`, or each of 8 processes allows the full limit.
4. **Return `429`** with `Retry-After`.

> bcrypt is expensive by design, so an unthrottled login is a **CPU-exhaustion DoS** — each guess costs 250 ms of a pool thread.

## Input Validation
Mechanics in [Part 6 §5](06-http-and-express.md). The security framing: **validation is your highest-leverage defense**, because it kills NoSQL injection, mass assignment and much of XSS at the boundary, before any of your code touches the data.

```js
await User.update(req.body);                     // ❌ mass assignment → {role:'admin'}
const { name, email } = UpdateUser.parse(req.body);   // ✅ whitelist
```

---

<a name="travel"></a>
# 9. ⭐ How auth actually travels — and what scaling does to it

## 9.1 A JWT round trip

**Login — the only time credentials move:**
```
FRONTEND                                              BACKEND
   │  POST /auth/login                                   │
   │  { "email": "ada@mail.com", "password": "..." }     │
   │ ───────────────────────────────────────────────────▶│ 1. find user
   │                                                     │ 2. bcrypt.compare()
   │  200 OK                                             │ 3. jwt.sign()
   │  { "token": "eyJhbGciOi..." }   ← in the BODY       │
   │ ◀───────────────────────────────────────────────────│
```

**Then the frontend attaches it manually — this is the defining property.**

```js
localStorage.setItem('token', token);          // ⚠️ XSS-readable

// on EVERY request, by hand:
fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } });

// in practice, an interceptor so you can't forget:
axios.interceptors.request.use(cfg => {
  cfg.headers.Authorization = `Bearer ${localStorage.getItem('token')}`;
  return cfg;
});
```

**Every subsequent request:**
```
GET /api/orders HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjQyfQ.xK3n...
                      └── header ──┘ └─ payload ─┘ └ signature ┘
```
```js
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, SECRET);   // ⭐ signature + expiry. No DB. ~0ms
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired' }); }
}
```

> ⭐ **The server does zero lookups.** It recomputes the signature with its secret; a match means the token is genuine and unmodified. **The server has no idea who is logged in and doesn't care.**

## 9.2 A session round trip

```
FRONTEND                                     BACKEND              REDIS
   │  POST /auth/login                          │                   │
   │ ──────────────────────────────────────────▶│ verify password   │
   │                                            │ create session ──▶│ SET sess:abc123
   │  200 OK                                    │                   │ {userId:42} EX 86400
   │  Set-Cookie: sid=abc123; HttpOnly;         │                   │
   │              Secure; SameSite=Lax          │                   │
   │  { "user": {...} }    ⭐ no token in body  │                   │
   │ ◀──────────────────────────────────────────│                   │
```

**The `Set-Cookie` response header is the entire mechanism.** Then the frontend does **nothing** — there is no step 2:

```js
fetch('/api/orders');                                   // cookie rides along by itself
fetch('https://api.myapp.com/orders', { credentials: 'include' });   // cross-origin: opt in
```
```
GET /api/orders HTTP/1.1
Cookie: sid=abc123          ← the BROWSER added this. Your JS never touched it.
```

## 9.3 The difference, on the wire

```
JWT                                      SESSION
────────────────────────────────         ────────────────────────────────
Authorization: Bearer eyJhbGci...        Cookie: sid=abc123
   ↑ YOUR CODE attaches it                  ↑ THE BROWSER attaches it
   ↑ ~800 bytes, self-describing            ↑ ~30 bytes, meaningless alone
   ↑ server verifies math                   ↑ server looks it up in Redis
```

| | **JWT** | **Session** |
|---|---|---|
| Lives (client) | `localStorage` / memory / cookie | cookie (always) |
| Who attaches it | **your JavaScript** | **the browser, automatically** |
| Header | `Authorization: Bearer` | `Cookie` |
| Server work / request | verify (~0 ms) | lookup (~1 ms) |
| Knows who's online | ❌ | ✅ |
| Logout | client deletes; token still valid ⚠️ | `DEL sess:abc123` → dead ✅ |
| Mobile / server-to-server | ✅ natural | 🟡 cookies are awkward |
| Vulnerable to | **XSS** (if in localStorage) | **CSRF** (cookies are automatic) |

> **You can send a JWT in an `httpOnly` cookie** — and for browser apps you probably should. It then travels exactly like a session cookie, but the server still does no lookup. **Transport and validation are independent choices.**

## 9.4 What scaling breaks

```
                    LOAD BALANCER
                    ╱      │      ╲
            Server 1   Server 2   Server 3
```

### In-memory sessions — instant breakage 💥
```js
app.use(session({ secret: 'x' }));   // ⚠️ default = MemoryStore
```
```
POST /login  → LB → Server 1 → stores abc123 in ITS OWN memory ✅
GET /orders  → LB → Server 2 → looks up abc123 → NOT FOUND → 401 💥
```

**Users get logged out ~`(N-1)/N` of the time.** With 3 servers, two-thirds of requests fail. The #1 "worked in dev, broke in prod" bug — because with one server it works perfectly.

> ⚠️ **`cluster` on a single machine has exactly the same problem** ([Part 2 §7](02-nodejs-internals.md)). 8 workers = 8 memories. You don't need multiple machines to hit this.

### Fix ① Sticky sessions — the bad fix
The LB pins each user to one server. Discouraged because: **uneven load** · **a deploy or crash logs out everyone pinned there** · **autoscaling breaks** (scale-in kills those sessions) · **new servers get no traffic**. A stopgap, not a design.

### Fix ② Shared session store — the correct fix ⭐
```
            Server 1   Server 2   Server 3
                    ╲      │      ╱
                     ┌───────────┐
                     │   REDIS   │   ← single source of truth
                     └───────────┘
```
```js
app.use(session({ store: new RedisStore({ client: redis }), ... }));
```
**Now the servers are stateless** — any server serves any request, because the state isn't *in* the server. Add, remove, redeploy: nothing is lost.

> ⭐ **This is what "stateless servers" actually means** — the prerequisite for horizontal scaling ([02.5-load-balancer-deep-dive](../02.5-load-balancer-deep-dive.md)). Not "no state" — state lives somewhere **shared**.

**Cost:** ~1 ms per request, and Redis becomes critical infrastructure (replicas, failover).

### Fix ③ JWT — no shared store
Any server verifies any token, because verification is math. **The genuine scaling advantage** — no shared store, no network hop, works across services that share nothing else.

**But the problems just move:**
- **Secret distribution** — every service needs the key. At scale, switch to **asymmetric (RS256)**: the auth server holds the private key; everyone else fetches the public key from a **JWKS** endpoint and can verify but not *issue*.
- **Key rotation** — changing the secret invalidates every token at once. JWKS handles this with key IDs (`kid`) so old and new coexist during rollover.
- **Revocation, again** — a banned user stays valid on *every* server until expiry. Adding a Redis denylist reintroduces exactly the lookup you avoided.
- **Clock skew** — expiry is checked against each server's clock; badly synced clocks reject valid tokens. Hence `clockTolerance`.

### Multi-region
```
   🌍 Tokyo                            🌍 London
   AP servers                          EU servers
        │                                   │
   Redis (AP)  ←── replication ──→     Redis (EU)
```
Sessions get genuinely hard — cross-region replication adds latency and consistency problems. **JWTs shine**: every region verifies independently with the public key, no replication.

> **This is the honest case for JWTs.** Not "sessions don't scale" — Redis handles enormous load. It's **multi-region and multi-service**, where a shared store is a real architectural burden.

## 9.5 The decision, at each scale

| Scale | Recommendation |
|---|---|
| 1 server | Anything. Sessions are simplest. |
| N servers, one region | **Sessions + Redis** ⭐ — instant revocation, 1 ms is nothing |
| Microservices | **JWT** — verify independently, no shared store |
| Multi-region | **JWT + JWKS** — avoids cross-region replication |
| Mobile / third-party API | **JWT** — no cookie semantics to fight |

**The hybrid most large apps land on:** a short-lived JWT access token for per-request math, plus a **server-side refresh token** so revocation still exists where it matters. You pay the lookup once per 15 minutes instead of once per request.

---

<a name="interview"></a>
# 10. Interview Questions & Answers

### Q1. Why shouldn't JWTs be stored in localStorage?
> "Because **`localStorage` is readable by any JavaScript on the page** — a single XSS anywhere, including in a third-party dependency, hands over the token. And because a JWT is self-contained, that stolen token is valid until expiry; there's nothing to revoke.
>
> The alternative is an **`httpOnly` cookie** — JS can't read it, so XSS can't exfiltrate it. That reintroduces CSRF, handled with `sameSite=lax` plus a CSRF token.
>
> **The trade-off is the answer:** `localStorage` is CSRF-immune but XSS-vulnerable; `httpOnly` cookies are the reverse. XSS is the worse failure — it defeats *every* client-side secret — so I take the cookie and mitigate CSRF, which has clean, well-understood defenses."

### Q2. How would you revoke JWTs?
> "You can't natively — that's the trade-off for stateless verification. Four options:
>
> **① Short expiry + refresh tokens** ⭐ — 15-minute access tokens keep the damage window small, and the refresh token *is* server-side and revocable. The standard answer.
> **② A Redis denylist** — store revoked `jti`s with a TTL equal to remaining lifetime. Correct, but now you're doing a lookup per request, which is most of what made sessions 'expensive'.
> **③ A token version on the user record** — bump it on logout-everywhere or password change, reject stale versions. Cheap if you already load the user.
> **④ Rotate the signing key** — nuclear; logs out everyone. Fine for a breach, useless for one user.
>
> If the requirement is genuinely instant per-user revocation, **that's a strong signal to use sessions instead.**"

### Q3. Explain refresh token rotation.
> "Every use of a refresh token invalidates it and issues a new one — single-use tickets. The payoff is **reuse detection**: a token that's already been used showing up again means two copies exist, so it was stolen. You revoke the **entire family** and force re-login.
>
> Without rotation, a stolen refresh token works silently for its whole lifetime. With it, the theft surfaces the moment either party refreshes — the legitimate user's normal activity trips the alarm.
>
> Implementation: store a **hash** of each token with a `familyId` and `usedAt`; revoke by family on reuse. Keep it in an `httpOnly` cookie scoped to `/refresh` so it isn't sent with every request."

### Q4. Session or JWT — how do you choose?
> "Default to **sessions** for a normal web app: instant revocation, nothing sensitive on the client, and ~1 ms of Redis isn't the bottleneck. Reach for **JWTs** when statelessness buys something real — multiple services that shouldn't share a store, mobile or third-party clients, or verification at an edge that can't reach Redis. Choosing JWT for a monolith is usually cargo-culting the harder option."

### Q5. Why is bcrypt slow on purpose, and why not SHA-256?
> "SHA-256 is built for **speed** — billions per second on a GPU, so short passwords fall in minutes. bcrypt's tunable cost makes each hash ~250 ms, turning that attack into centuries. **Slowness is the security property.** It also salts automatically, so identical passwords hash differently and rainbow tables fail. `argon2id` is the modern preference — memory-hard, so GPUs help less."

### Q6. Does bcrypt affect Node's performance?
> "Yes — it runs on the **libuv thread pool**, 4 threads by default. Four concurrent logins saturate it; the fifth waits a full hash cycle. Symptom: login latency climbs while CPU looks idle and loop lag looks normal — hard to spot if you don't know where to look. Fix: raise `UV_THREADPOOL_SIZE` or hash in a worker pool, and rate-limit login so it can't be used as a CPU-exhaustion DoS."

### Q7. What should never go in a JWT payload?
> "Anything sensitive — it's **signed, not encrypted**, and trivially base64-decoded. No passwords, no PII, no secrets. Keep it to a user ID, a role, and expiry claims. Keep it small too: it's sent on every request, so a bloated payload is bandwidth forever."

### Q8. Do you need CSRF protection with a Bearer token?
> "No — CSRF exploits credentials the browser attaches **automatically**, i.e. cookies. An `Authorization` header must be set by your JavaScript, and an attacker's page can't make your JS do that. Cookies → CSRF protection required; header tokens → not required, but XSS can now steal the token. You're choosing which attack to defend against, not escaping both."

### Q9. Why do users get randomly logged out after you add a second server?
> "In-memory sessions. Each server has its own memory, so a session created on Server 1 doesn't exist on Server 2, and the load balancer round-robins. Users fail roughly `(N-1)/N` of requests. The fix is a **shared store** — Redis — which makes the servers stateless. Sticky sessions also 'work' but break deploys and autoscaling. Same bug appears with `cluster` on a single machine."

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

### How it travels ⭐
```
JWT      → Authorization: Bearer eyJ...   ← YOUR CODE attaches it
           server: jwt.verify() = math, NO lookup

SESSION  → Cookie: sid=abc123             ← THE BROWSER attaches it
           server: Redis lookup ~1ms

login response:  JWT → token in the BODY
                 SESSION → Set-Cookie header
cross-origin cookies → fetch(..., { credentials: 'include' })
```

### Scaling
```
in-memory sessions + N servers  → users logged out (N-1)/N of the time 💥
   (cluster on ONE machine has the SAME bug — 8 workers = 8 memories)

FIX ① sticky sessions   → breaks deploys + autoscaling. stopgap only.
FIX ② Redis store ⭐    → servers become STATELESS. the correct fix.
FIX ③ JWT               → no shared store; problems move to key
                          distribution (JWKS), rotation, revocation, clock skew

1 server → anything · N servers → sessions+Redis ⭐
microservices / multi-region / mobile → JWT
hybrid: short JWT access + server-side refresh token
```

### Passwords
```
bcrypt(pw, 12) ≈ 250ms  ·  salt is BUILT IN  ·  slowness IS the feature
never SHA-256 (too fast) · argon2id is the modern pick
⚠️ uses the 4-thread POOL → 5 concurrent logins queue
```

### Cookie flags
```
httpOnly → JS can't read it     → blocks XSS theft
secure   → HTTPS only
sameSite → lax (default, right) | strict (safest, email links log out) | none (+secure)
```

### Tokens
```
JWT = signed, NOT encrypted → anyone can read the payload
      cannot be revoked → short expiry + refresh token
access 15m (every request)  ·  refresh 7d (only /refresh, stored HASHED)
ROTATION → each use issues a new one; a reused token = THEFT → revoke the family
```

### Attacks
```
XSS   → attacker's JS runs on YOUR page → defeats every client-side secret
        fix: escape output · httpOnly cookies · CSP · DOMPurify
CSRF  → your browser sends your cookie for them (cookies are AUTOMATIC)
        fix: sameSite=lax · CSRF token · check Origin
        ⭐ doesn't apply to Bearer headers
NoSQL → { "password": { "$gt": "" } } → validate TYPES, mongo-sanitize
RATE  → login max 5/15min · per-IP AND per-account · Redis-backed · 429
VALID → whitelist fields (mass assignment!) · coerce types · at the boundary
```

### Status codes
```
401 not logged in  ·  403 logged in but not allowed  ·  429 rate limited
```

---

*— Part 7 of the Node.js notes. Concepts: [15-auth-vs-authz](../15-authentication-vs-authorization.md) · [16-jwt](../16-jwt-deep-dive.md) · [17-oauth-rbac](../17-oauth-sso-rbac.md) · [18-sessions](../18-sessions.md) · [19-password-hashing](../19-password-hashing.md) —*
