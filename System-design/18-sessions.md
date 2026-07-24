# System Design Study Notes — Part 18

## Sessions (Cookies, Server Session, Redis Session Store)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Kept smart & short with a clean analogy. Part of the **Authentication phase**.
>
> **Consolidates:** sessions from Part 2 (statelessness), Part 5.5 (Redis), Part 6 (cookies/JWT). Pairs with Part 16 (JWT).

---

## Table of Contents

1. [Analogy: the coat check](#analogy)
2. [Cookies (the ticket carrier)](#cookies)
3. [Server session (how it works)](#server)
4. [Redis session store (why + scaling)](#redis)
5. [Pros & Cons](#proscons)
6. [JWT vs Session](#vs)
7. [Interview Q&A](#interview)
8. [Cheat Sheet](#cheatsheet)

---

<a name="analogy"></a>
# 1. Analogy: the coat check 🧥

At a fancy restaurant you hand your coat to the coat check and get a **numbered ticket**. The coat (your data) stays at the desk; you carry the tiny ticket. Return → show the ticket → they fetch your coat.
- **Your coat** = session data (who you are), stored **on the server**.
- **The ticket** = the **session ID**, stored in a **cookie** in your browser.
- Each request → show the ticket → server looks up your data.

> A session keeps identity **on the server**; the cookie just carries a meaningless ID pointing to it.

---

<a name="cookies"></a>
# 2. Cookies (the ticket carrier)

A **cookie** is a small piece of data the browser stores and **auto-sends** on every request to that domain. In sessions it holds only the **session ID** — a random, opaque string that reveals nothing on its own (like a coat-check number: useless without the desk).
```
Login  → server: Set-Cookie: session_id=a3f9x7  (HttpOnly, Secure, SameSite)
Request → browser auto-sends: Cookie: session_id=a3f9x7
```

---

<a name="server"></a>
# 3. Server session (how it works)

```
1. Login → server creates a session record { userId: 42, role: "user" }
2. Stores it server-side, gives the client a session ID (in a cookie)
3. Each request → server looks up the ID → knows who you are
4. Logout → delete the session record → instant revocation
```
The **session ID carries no info**; the server must **look it up** to learn who you are. That lookup is the cost — and the power (full server control).

---

<a name="redis"></a>
# 4. Redis session store (why + scaling)

Naive storage = the server's **own memory**. Breaks with multiple servers: a session made on Server 1 is invisible to Server 2 (the statelessness problem, Part 2). Fix = a **shared store all servers reach** → **Redis**.

**Why Redis:** in-memory (microsecond lookups, done every request), key-value (perfect for `session_id → data`), built-in **TTL** (auto-expire idle sessions).
```
SET session:a3f9x7 '{"userId":42}' EX 1800   # 30-min auto-expiry
GET session:a3f9x7                            # validate on each request
DEL session:a3f9x7                            # logout
```
```
                ┌──▶ [Server 1] ──┐
[User] ─[LB]──▶ │──▶ [Server 2] ──┼──▶ [Redis]  (shared session store)
                └──▶ [Server 3] ──┘
```
Servers stay **stateless**; Redis holds the state → any server serves any request.

---

<a name="proscons"></a>
# 5. Pros & Cons

**Pros ✅**
- **Easy revocation** — delete the session → instant logout (JWT can't do this easily).
- **Server control** — update/invalidate sessions anytime.
- **Opaque ID** — the cookie leaks nothing.
- **Small cookie** — just an ID, not the whole payload.

**Cons ❌**
- **Lookup per request** — every request hits the session store (network hop).
- **Shared store to scale** — Redis becomes critical infra to keep highly available.
- **Statefulness** — the server holds state (less "pure" horizontal scaling than stateless JWT).

---

<a name="vs"></a>
# 6. JWT vs Session (the key interview question)

| | **Session** | **JWT** |
|---|---|---|
| State lives | **Server** (Redis) | **In the token** (client) |
| Per request | Lookup in store | Local signature check (no lookup) |
| Revocation | ✅ Instant (delete) | ❌ Hard (until expiry) |
| Scaling | Needs shared store | Fully stateless — scales easily |
| Cookie/token size | Tiny (just an ID) | Larger (carries claims) |
| Best for | Tight control (banking, admin) | Distributed systems, microservices, APIs |

> **Core trade-off:** **Session = server holds state → lookup cost, but easy revocation. JWT = client holds state → no lookup, scales great, but hard to revoke.** You can't have "zero server state" *and* "instant revocation" for free — pick what matters.

---

<a name="interview"></a>
# 7. Interview Q&A

### Q: "Session vs JWT — which would you use?"
> *"It depends on control vs scale. Sessions store identity on the server, usually in shared Redis, so every request does a lookup — but I can revoke instantly by deleting the session, which is great for banking or admin panels. JWTs are self-contained and verified locally with no lookup, so they scale beautifully across microservices, but they're hard to revoke before they expire. So sessions when I need tight control and easy logout, JWT when I need stateless scale — and I'd pair JWT with short expiry plus refresh tokens to soften revocation."*

### Q: "Where is session data stored, and why Redis?"
> *"Server-side, and the client only holds a session ID in a cookie. With multiple servers I can't store it in one server's memory, because another server wouldn't see it — so I use a shared store all servers reach. Redis is ideal: in-memory so lookups are microseconds, key-value which fits session-ID-to-data perfectly, and built-in TTL to auto-expire idle sessions."*

### Q: "How do you secure the session cookie?"
> *"Three flags: HttpOnly so JavaScript can't read it (blocks XSS), Secure so it's only sent over HTTPS, and SameSite to protect against CSRF. And the session ID itself is a long random opaque string, so it reveals nothing and can't be guessed."*

### Q: "How does logout work with sessions vs JWT?"
> *"With sessions, logout is trivial — delete the session record from Redis and the next request fails. With JWT there's nothing server-side to delete, so you can't truly revoke it until it expires; the workaround is short-lived access tokens plus a revocable refresh token, or a token blocklist — which ironically reintroduces a lookup."*

---

<a name="cheatsheet"></a>
# 8. Cheat Sheet

### Core (coat-check analogy)
- **Coat** = session data (server). **Ticket** = session ID (cookie). Show ticket → server looks up data.
- Session ID is **opaque** — meaningless without the server lookup.

### Cookies
- Small browser data, **auto-sent** each request. Holds only the session ID.
- Secure it: **HttpOnly** (XSS) + **Secure** (HTTPS) + **SameSite** (CSRF).

### Server session flow
Login → create record + give session ID → lookup each request → delete on logout.

### Redis session store
- Needed because one server's memory isn't shared → use a store all servers reach.
- Redis = in-memory (µs), key-value, TTL. `SET session:id data EX 1800` / `GET` / `DEL`.
- Keeps servers **stateless**.

### Pros / Cons
- ✅ Instant revocation · server control · opaque tiny cookie.
- ❌ Lookup per request · shared store to maintain · stateful.

### JWT vs Session
| | Session | JWT |
|---|---|---|
| State | Server (Redis) | In token (client) |
| Per request | Lookup | Local verify |
| Revoke | ✅ Instant | ❌ Hard |
| Scale | Needs shared store | Stateless, easy |
| Use | Tight control (banking) | Microservices/APIs |

### Connects to
- Part 2: statelessness. · Part 5.5: Redis. · Part 6: cookies/JWT. · Part 16: JWT deep dive.

### Suggested next (auth series)
- **Password hashing** (bcrypt, salting).
- **MFA / 2FA**.
- Then: **full system design walkthrough**.

*— End of Part 18 —*
