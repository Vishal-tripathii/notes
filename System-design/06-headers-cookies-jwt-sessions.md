# System Design Study Notes — Part 6

## Headers, Cookies, JWT & Sessions (How Identity Survives Stateless HTTP)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams, decision guides, and interview Q&A included.
>
> **Continues from:** Part 2 (which covered JWT & Sessions deeply). This part adds **Headers** and **Cookies** underneath them and shows how all four form one layered stack.

---

## Table of Contents

1. [The framing: HTTP is stateless](#framing)
2. [Headers — the envelope](#headers)
3. [Cookies — browser storage that auto-sends](#cookies)
4. [Sessions — server-side identity (focused recap)](#sessions)
5. [JWT — self-contained identity (focused recap)](#jwt)
6. [How they all fit together](#together)
7. [What to use when](#when)
8. [Trade-offs](#tradeoffs)
9. [Interview questions & answers](#interview)
10. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="framing"></a>
# 1. The framing: HTTP is stateless

HTTP forgets you between requests — each request is a blank slate (Part 2). These four mechanisms fix that, and they **stack on top of each other**:

```
HEADERS   ── the envelope: how ALL metadata (including the others) travels
   └─ COOKIES  ── data the browser stores & auto-sends (via headers)
        └─ SESSIONS  ── server-side identity, keyed by an ID (usually in a cookie)
        └─ JWT       ── self-contained identity (usually sent in a header)
```

> **Big realization:** cookies travel inside headers, session IDs travel inside cookies, and JWTs travel inside headers. They're **not four competing things** — they're a layered stack.

---

<a name="headers"></a>
# 2. Headers — the envelope

**HTTP headers are key–value pairs of metadata attached to every request and response.** They describe the message (sender, body format, caching, auth) — *not* the content itself (that's the body). Labels on the envelope.

```
GET /profile HTTP/1.1
Host: instagram.com
Authorization: Bearer eyJhbGci...        ◀── auth (often a JWT)
Cookie: session_id=a3f9x7k2               ◀── cookies ride here
Content-Type: application/json
User-Agent: Chrome/120
Accept: application/json
Cache-Control: no-cache
```

**Common headers:**
| Header | Direction | Purpose |
|---|---|---|
| `Authorization` | Request | Credentials/tokens (e.g. `Bearer <JWT>`) |
| `Cookie` | Request | Sends stored cookies back to the server |
| `Set-Cookie` | Response | Server tells browser to store a cookie |
| `Content-Type` | Both | Body format (`application/json`, etc.) |
| `Cache-Control` | Both | Caching rules *(ties to Part 5 browser/CDN caching)* |
| `User-Agent` | Request | Identifies the client (browser/app) |
| `Accept` | Request | Formats the client can handle |

> **Interview key:** headers are the **transport layer** for everything else. Cookies, JWTs, and session IDs all *travel as headers*. "How does the token reach the server?" → "In a header."

---

<a name="cookies"></a>
# 3. Cookies — browser storage that auto-sends

**A cookie is a small piece of data the server asks the browser to store, which the browser then automatically attaches to every future request to that domain.**

### The round trip
```
1. Server response:   Set-Cookie: session_id=a3f9x7k2; HttpOnly; Secure
                              │
2. Browser stores it  ────────┘
3. Every later request, browser AUTO-sends:   Cookie: session_id=a3f9x7k2
```
The magic word is **automatic** — the browser attaches cookies on every request to that domain with no code. This is why cookies are natural for sessions (the session ID rides along automatically).

### Cookie attributes (critical for security interviews)
| Attribute | What it does | Why it matters |
|---|---|---|
| **`HttpOnly`** | JavaScript **can't** read it | Protects against **XSS** (script can't steal it) |
| **`Secure`** | Only sent over **HTTPS** | Prevents interception over plain HTTP |
| **`SameSite`** | Controls cross-site sending (`Strict`/`Lax`/`None`) | Protects against **CSRF** |
| **`Expires`/`Max-Age`** | When the cookie dies | Session cookie (dies on close) vs persistent |
| **`Domain`/`Path`** | Which URLs it's sent to | Scopes the cookie |

> **`HttpOnly` + `Secure` + `SameSite`** = the standard secure-cookie trio. The answer to "how do you secure a cookie?"

### Two threats to know
- **XSS (Cross-Site Scripting)** — attacker injects malicious JS; it reads whatever JS can access. `HttpOnly` cookies are invisible to JS → protected. `localStorage` is **not** → vulnerable.
- **CSRF (Cross-Site Request Forgery)** — a malicious site tricks your browser into sending a request *using your cookies* (cookies auto-send). `SameSite` mitigates this.

> This XSS-vs-CSRF distinction is the crux of the "where do I store a JWT?" debate.

---

<a name="sessions"></a>
# 4. Sessions — server-side identity (focused recap)

*(Full lifecycle in Part 2 — here's how it connects to cookies/headers.)*

- Server stores identity server-side (in **Redis** when scaled), gives you a random **session ID**.
- **The session ID is stored in a cookie** → auto-travels in the `Cookie` header every request.
- Each request: server reads the ID from the cookie → looks it up → knows who you are.

```
Login  ──▶ server stores session in Redis, sends Set-Cookie: session_id=...
Request ──▶ browser auto-sends Cookie: session_id=... ──▶ server looks up Redis ──▶ "It's Alice"
Logout ──▶ delete from Redis (instant revocation)
```
- ✅ Easy to revoke; server controls state; ID is opaque (leaks nothing).
- ❌ Lookup per request; shared session store must be scaled/HA.

---

<a name="jwt"></a>
# 5. JWT — self-contained identity (focused recap)

*(Full mechanics in Part 2 — here's how it travels.)*

- A signed, self-contained token (`header.payload.signature`) carrying your identity.
- **Usually sent in the `Authorization` header:** `Authorization: Bearer eyJhbGci...`
- Any server verifies the signature locally — no lookup.

```
Login  ──▶ server signs JWT, returns it to client
Request ──▶ client sends Authorization: Bearer eyJ... ──▶ any server verifies signature ──▶ "It's Alice"
```
- ✅ Stateless, no lookup, scales across services.
- ❌ Hard to revoke before expiry (fix: short expiry + refresh token, or a blocklist).

---

<a name="together"></a>
# 6. How they all fit together

```
              ┌─────────────────────────────────────────────────────┐
              │  HEADERS = the transport for everything (the envelope) │
              └─────────────────────────────────────────────────────┘
                    │                                    │
        Cookie / Set-Cookie header              Authorization header
                    │                                    │
                    ▼                                    ▼
             ┌────────────┐                       ┌────────────┐
             │  COOKIES   │ (browser auto-sends)  │    JWT     │ (usually here)
             └────────────┘                       └────────────┘
                    │                                    │
          usually stores a...                    self-contained,
                    ▼                             needs no server store
             ┌────────────┐
             │ SESSION ID │──▶ looked up in server-side store (Redis)
             └────────────┘
```

- **Headers** carry everything.
- **Cookies** = browser storage that rides in headers.
- **Sessions** = server-side state, using a **cookie** to carry the ID.
- **JWT** = state in the token itself, usually carried in a **header**.

> **Trap to remember:** JWT and Sessions can *both* use cookies OR headers to travel. **Transport (cookie vs header) is a separate choice from strategy (session vs JWT).**

---

<a name="when"></a>
# 7. What to use when

### Headers — always (not a choice)
They're the transport. The real question is *which* header and *what* you put in it.

### Cookies — when:
- Browser-based web app wanting automatic credential sending.
- You want **`HttpOnly`** security (protect the token from XSS).
- Frontend and backend share a domain.

### Sessions — when:
- You need **instant revocation** / tight control (banking, admin panels).
- Traditional server-rendered web app.
- You're okay running a shared session store (Redis).

### JWT — when:
- **Multiple services / microservices** verifying identity without a shared store.
- **Mobile apps or third-party APIs** (no browser cookie jar — header token is natural).
- You want **stateless** scaling (Part 2's big win).

### The storage sub-decision (JWT) — the classic interview trap
Where does the browser keep a JWT?
- **In an `HttpOnly` cookie** → safe from XSS, but vulnerable to CSRF (mitigate with `SameSite`).
- **In `localStorage`** → easy for SPAs, but vulnerable to XSS (any script can read it).

> **Best practice:** store the JWT in an `HttpOnly`, `Secure`, `SameSite` cookie → JWT's statelessness *and* cookie security. Saying this shows you understand transport ≠ storage.

---

<a name="tradeoffs"></a>
# 8. Trade-offs

| | **Cookies** | **Sessions** | **JWT** |
|---|---|---|---|
| Where state lives | Browser (small data) | Server (Redis) | In the token (client) |
| Auto-sent by browser? | ✅ Yes | ✅ (via cookie) | ⚠️ Only if stored in a cookie |
| Server lookup per request? | — | ✅ Yes (a cost) | ❌ No (verify signature) |
| Revocation | Delete cookie | ✅ Instant (delete server-side) | ❌ Hard until expiry |
| Scales statelessly? | N/A | ⚠️ Needs shared store | ✅✅ Yes |
| Main security risk | XSS/CSRF (mitigated by flags) | Session hijacking | Token theft; hard revoke |
| Best for | Web apps | Tight control (banking) | Microservices, mobile, APIs |

> **Core tension (same as Part 2):** Sessions = server holds state → lookup cost but easy revocation. JWT = client holds state → no lookup, scales great, hard to revoke. Cookies & headers are just *how* these travel.

---

<a name="interview"></a>
# 9. Interview questions & answers

### Q: "Difference between cookies, sessions, and tokens (JWT)?"
> *"They operate at different layers. A cookie is a small piece of data the browser stores and automatically sends back with every request to that domain. A session is server-side state — the server stores who you are and gives you a session ID, usually kept in a cookie. A JWT is a self-contained, signed token that carries the identity itself, so the server doesn't need to store anything — usually sent in the Authorization header. So cookies are a transport/storage mechanism, while sessions and JWT are two strategies for tracking identity — one stateful, one stateless."*

### Q: "Where do headers fit in?"
> *"Headers are the transport layer for all of it. Cookies travel in the Cookie header, the server sets them with Set-Cookie, and JWTs are usually sent in the Authorization header as a Bearer token. Whenever a token or cookie moves between client and server, it's moving as a header."*

### Q: "How do you secure a cookie?"
> *"Three flags. HttpOnly stops JavaScript reading it, protecting against XSS. Secure ensures it's only sent over HTTPS. SameSite controls whether it's sent on cross-site requests, protecting against CSRF. HttpOnly, Secure, and SameSite together are the standard secure-cookie setup."*

### Q: "Store a JWT in localStorage or a cookie?"
> *"Depends on the threat. localStorage is easy but vulnerable to XSS — any injected script can read the token. An HttpOnly cookie can't be read by JavaScript, so it's safe from XSS, but then vulnerable to CSRF, which you mitigate with SameSite. Best practice is usually an HttpOnly, Secure, SameSite cookie — JWT's statelessness with cookie XSS protection."*

### Q: "XSS vs CSRF?"
> *"XSS is when an attacker injects malicious JavaScript into your page and it runs with your privileges — it can read anything JS can access, like localStorage. CSRF is when a malicious site tricks your browser into sending a request using your existing cookies, since the browser sends them automatically. HttpOnly defends against XSS stealing the cookie; SameSite defends against CSRF."*

### Q: "Microservices — sessions or JWT?"
> *"JWT, generally. With sessions, every service would need to reach a shared session store to validate each request — a bottleneck and coupling point. A JWT is self-contained and any service verifies it locally with the shared secret or public key — no lookup, no shared store. The trade-off is harder revocation, so I'd pair it with short-lived access tokens and refresh tokens."*

### Q: "How do you handle logout with JWT?"
> *"That's JWT's weak spot — you can't un-issue a token already out there. The standard approach is short-lived access tokens, say 15 minutes, plus a long-lived refresh token stored server-side. On logout I invalidate the refresh token, so the user is out within the access token's short window. For instant logout, I'd add a token blocklist in Redis — but that reintroduces a per-request lookup."*

### Q: "Why not use HTTP without any of this?"
> *"Because HTTP is stateless — the server doesn't remember anything between requests. Without cookies, sessions, or tokens, the user would re-authenticate on every request. These mechanisms let identity and state persist across the stateless protocol."*

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet — everything on one page

### The stack (all answer: "how does identity survive stateless HTTP?")
```
HEADERS (transport/envelope)
  ├─ Cookie / Set-Cookie header ──▶ COOKIES ──▶ often store a SESSION ID ──▶ Redis lookup
  └─ Authorization header ────────▶ JWT (self-contained, no lookup)
```

### Headers
- Key–value metadata on every request/response.
- Auth via `Authorization: Bearer <JWT>`; cookies via `Cookie` / `Set-Cookie`.
- **Transport layer for everything** — cookies & tokens travel as headers.

### Cookies
- Browser-stored data, **auto-sent** on every request to the domain.
- Secure trio: **`HttpOnly`** (XSS), **`Secure`** (HTTPS), **`SameSite`** (CSRF).
- `Expires`/`Max-Age` = persistent vs session cookie.

### Sessions
- State on server (Redis); **session ID in a cookie**.
- ✅ Instant revocation, opaque ID. ❌ Lookup per request; store must be HA.

### JWT
- Signed self-contained token (`header.payload.signature`), usually in `Authorization` header.
- ✅ Stateless, no lookup, scales. ❌ Hard to revoke (short expiry + refresh, or blocklist).

### Security threats
- **XSS** — malicious JS reads what JS can (localStorage vulnerable; `HttpOnly` cookie safe).
- **CSRF** — malicious site abuses auto-sent cookies (`SameSite` mitigates).

### What to use when
| Need | Use |
|---|---|
| Any transport | Headers (always) |
| Browser web app, auto-send, XSS-safe | Cookies (`HttpOnly`) |
| Tight control / instant revoke (banking) | Sessions |
| Microservices / mobile / APIs / stateless scale | JWT |
| JWT storage (best practice) | `HttpOnly` + `Secure` + `SameSite` cookie |

### Key traps
- **Transport (cookie vs header) ≠ strategy (session vs JWT).** Both strategies can use either transport.
- localStorage = XSS risk; HttpOnly cookie = CSRF risk (use SameSite).
- Sessions = stateful + revocable; JWT = stateless + hard to revoke.

### Connects to
- Part 2: JWT & session deep dive, Redis, statelessness. · Part 5: `Cache-Control` header, browser/CDN caching.

### Suggested next topics
- **Message queues** (async, decoupling, absorbing spikes).
- **Capacity estimation** (users → RPS → storage).
- **SQL vs NoSQL** (choosing a database, indexing).
- **API design** (REST vs GraphQL, rate limiting).

*— End of Part 6 —*
