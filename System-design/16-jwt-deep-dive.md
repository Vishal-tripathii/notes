# System Design Study Notes — Part 16

## JWT Deep Dive (Structure, Access & Refresh Tokens, Expiration)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Focused on JWT mechanics.
>
> **Continues:** Part 6 (JWT/sessions overview) and Part 15 (AuthN). Part of the **Authentication phase**.

---

## Table of Contents

1. [What a JWT is (recap)](#recap)
2. [Structure: header.payload.signature](#structure)
3. [Access Token vs Refresh Token](#tokens)
4. [Expiration](#expiration)
5. [The full JWT flow (with refresh)](#flow)
6. [Where to put the JWT (storage)](#storage)
7. [Interview Q&A](#interview)
8. [Cheat Sheet](#cheatsheet)

---

<a name="recap"></a>
# 1. What a JWT is (recap)

A **JWT (JSON Web Token)** is a **signed, self-contained token that carries a user's identity**. The server verifies the signature locally on each request — no DB lookup (the stateless win from Part 6).

---

<a name="structure"></a>
# 2. Structure: `header.payload.signature`

Three Base64-encoded parts joined by dots:
```
eyJhbGciOiJIUzI1NiJ9  .  eyJzdWIiOiI0MiIsInJvbGUiOiJ1c2VyIn0  .  SflKxwRJSMeKKF2QT4fwpMeJf36
      HEADER                         PAYLOAD                              SIGNATURE
```

## 1. Header — metadata (which signing algorithm)
```json
{ "alg": "HS256", "typ": "JWT" }
```

## 2. Payload — the claims (the data)
```json
{
  "sub": "42",           // subject — the user ID
  "role": "user",        // custom claim — feeds authorization (Part 15)
  "iat": 1736800000,     // issued-at timestamp
  "exp": 1736800900      // expiry timestamp (15 min later)
}
```
- **Registered claims** (standard): `sub` (subject/user), `iat` (issued at), `exp` (expiry), `iss` (issuer).
- **Custom claims:** anything you add, e.g. `role`.
> ⚠️ Payload is only **Base64-encoded, NOT encrypted** — anyone can decode & read it. **Never put secrets** in it. Readable, but (via the signature) **can't be forged**.

## 3. Signature — the security seal
```
signature = HMAC-SHA256(
    base64(header) + "." + base64(payload),
    SECRET_KEY          ← only the server has this
)
```
**Why it can't be faked:** change the payload (`"role":"user"` → `"role":"admin"`) → signature no longer matches. Forging a valid signature needs the secret → attacker can't. Server detects tampering instantly.
```
On each request: server re-computes the signature with its SECRET and compares.
   matches   → genuine + untampered ✅ (trust payload, read the user)
   no match  → forged/altered ❌ (reject)
```

---

<a name="tokens"></a>
# 3. Access Token vs Refresh Token

One long-lived JWT is risky (stolen = access until expiry, hard to revoke — Part 6's weakness). Fix = **two tokens**:

| | **Access Token** | **Refresh Token** |
|---|---|---|
| Purpose | Prove identity on each request | Get a new access token when it expires |
| Lifespan | **Short** (~15 min) | **Long** (days/weeks) |
| Sent | On **every** API request | Only to the auth server to refresh |
| Stored | In memory / cookie | Securely (httpOnly cookie / DB) |
| If stolen | Limited damage (expires fast) | More dangerous → kept extra safe, revocable |

> Access token does everyday work but expires fast (small damage window). Refresh token is used *occasionally* to mint fresh access tokens without re-login.

---

<a name="expiration"></a>
# 4. Expiration (the `exp` claim)

Every access token carries an **`exp`** timestamp; the server rejects tokens past expiry.

**Why short expiry?** Limits damage of a stolen token (a leaked 15-min token is useless in 15 min). Short expiry alone would force constant re-login → which the **refresh token solves**.

---

<a name="flow"></a>
# 5. The full JWT flow (with refresh)

```
1. LOGIN:   user sends credentials
            → server verifies, returns ACCESS token (15 min) + REFRESH token (7 days)

2. REQUESTS: client sends the ACCESS token each request
            Authorization: Bearer <access_token>
            → server verifies signature locally → grants access ✅

3. ACCESS TOKEN EXPIRES (after 15 min):
            → API returns 401
            → client sends REFRESH token to /refresh
            → server validates it, issues a NEW access token
            → client retries — user never noticed 🎉

4. LOGOUT / REVOKE:
            → invalidate the refresh token (tracked server-side)
            → worst case, access valid only until the short access token expires
```
> JWT's stateless speed **plus** a revocation story: can't un-issue an access token, but you *can* kill the refresh token → access dies within ~15 min.

---

<a name="storage"></a>
# 6. Where to put the JWT (storage)

**Sending it** → **`Authorization: Bearer <token>`** header (standard).

**Storing in the browser** (trade-off from Part 6):
| Storage | Risk | Notes |
|---|---|---|
| **`localStorage`** | ❌ **XSS** — any injected JS can read it | Easy for SPAs, but vulnerable |
| **`httpOnly` cookie** | ❌ **CSRF** — but JS *can't* read it | Safe from XSS; mitigate CSRF with `SameSite` |

> **Best practice:** store tokens (esp. the refresh token) in an **`httpOnly`, `Secure`, `SameSite` cookie** — safe from XSS, `SameSite` handles CSRF. Access token can live in memory for a SPA. **Never** put a refresh token in `localStorage`.

---

<a name="interview"></a>
# 7. Interview Q&A

### Q: "Walk me through the JWT auth flow."
> *"On login, the server verifies credentials and returns two tokens — a short-lived access token, say 15 minutes, and a long-lived refresh token. The client sends the access token in the Authorization header on every request, and the server verifies its signature locally with the secret key — no database lookup. When the access token expires, the server returns 401, and the client uses the refresh token to get a new access token without re-logging in. On logout, you invalidate the refresh token."*

### Q: "Why use a refresh token? Why not one long-lived token?"
> *"A single long-lived token is dangerous — if stolen, the attacker has access for its whole lifetime, and JWTs are hard to revoke. Splitting into two fixes that: the access token is short-lived, so a stolen one is useless in minutes, and the refresh token is used only occasionally and can be revoked server-side. You get the convenience of staying logged in without the risk of a long-lived access token."*

### Q: "Where do you store a JWT?"
> *"I send it in the Authorization Bearer header. For browser storage, I avoid localStorage because it's vulnerable to XSS. I prefer an httpOnly, Secure, SameSite cookie, especially for the refresh token: httpOnly blocks JavaScript from reading it, so it's safe from XSS, and SameSite protects against CSRF. The short-lived access token can sit in memory for a SPA."*

### Q: "What are the three parts of a JWT?"
> *"Header, payload, and signature. The header says the signing algorithm. The payload holds the claims — user ID, role, issued-at, expiry — and it's only Base64-encoded, not encrypted, so you never put secrets in it. The signature is an HMAC of the header and payload with the server's secret key, which makes the token tamper-proof: change anything and the signature no longer matches."*

### Q: "If the payload is readable, how is a JWT secure?"
> *"Security comes from the signature, not secrecy. Anyone can read the payload, but they can't change it without invalidating the signature, because forging a valid signature requires the server's secret key. So a JWT guarantees integrity — the data hasn't been tampered with — not confidentiality. That's why you never put sensitive data in it, and always send it over HTTPS."*

---

<a name="cheatsheet"></a>
# 8. Cheat Sheet

### Structure: header.payload.signature
- **Header** — algorithm (`alg`, `typ`).
- **Payload** — claims (`sub`, `role`, `iat`, `exp`); **Base64, not encrypted** → no secrets.
- **Signature** — HMAC(header+payload, SECRET) → tamper-proof.
- Security = **integrity (signature), not confidentiality**. Always HTTPS.

### Access vs Refresh token
- **Access** — short (~15 min), sent every request (`Authorization: Bearer`), verified locally.
- **Refresh** — long (days), used to mint new access tokens, revocable.
- Why two: limit stolen-token damage + enable revocation.

### Flow
Login → access + refresh · request with access token · 401 on expiry → refresh → new access · logout → kill refresh token.

### Storage
- Send: `Authorization: Bearer`.
- Store: **httpOnly + Secure + SameSite cookie** (never refresh token in localStorage).
- localStorage = XSS risk; cookie = CSRF risk (SameSite mitigates).

### Connects to
- Part 6: JWT vs sessions, cookie storage. · Part 15: role claim → authorization. · Part 7: HTTPS.

### Suggested next (auth series)
- **OAuth 2.0 / OIDC / SSO** ("Login with Google", delegated auth).
- **RBAC** (role-based authorization).
- **Password hashing** (bcrypt, salting).

*— End of Part 16 —*
