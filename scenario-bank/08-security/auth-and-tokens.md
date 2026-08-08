# Authentication & Tokens — Scenario Bank

---

### "JWT vs session-based authentication?"

**Session-based** — after login, the server creates a session record (typically in a database or Redis) and gives the client an opaque session ID (usually in a cookie). Every request, the server looks up that ID to find the session data. The server can invalidate a session instantly by just deleting that record — it's authoritative and fully in the server's control.

**JWT (token-based)** — after login, the server issues a signed token containing the user's claims (ID, roles, expiry) directly, with a cryptographic signature the server can verify without needing a database lookup at all. The server just checks the signature and trusts the claims inside it — this is what makes JWTs attractive for **stateless** scaling: any server instance can verify a token without needing shared session storage.

The trade-off that actually matters: a session can be revoked instantly (delete the record). A JWT **can't** — it's valid until it expires, because there's no server-side record to delete; the server that issued it has no ongoing relationship with it. This is why real systems using JWTs almost always add a workaround for revocation (below) rather than relying on JWTs' stateless purity alone.

**Interview line:** *"Sessions are stateful — the server holds the source of truth and can revoke instantly by deleting the record. JWTs are stateless — the server just verifies a signature, no database lookup needed, which is great for scaling across instances, but it means a JWT can't actually be revoked before it expires, since there's no server-side record to delete. That trade-off is the real decision, not just a technical preference."*

**Tests:** stateful vs stateless auth, revocation trade-off

*Axis: normal · Source: challenge question*

---

### "Where should tokens be stored? Access token vs refresh token?"

**Access token** — short-lived (minutes), sent with every API request to prove identity. Short lifetime deliberately limits the damage if it's stolen — it expires soon regardless.
**Refresh token** — long-lived (days/weeks), used only to obtain a new access token when the old one expires, without forcing the user to log in again. Because it's long-lived and powerful (it can mint new access tokens), it needs to be protected more carefully than the access token.

**Storage options and their trade-offs:**
- **`localStorage`** — accessible to any JS running on the page, which means it's directly readable by an **XSS** attack (any injected script can just read it). Convenient, but the classic bad-practice answer for anything sensitive.
- **`httpOnly` cookie** — not accessible to JavaScript at all (mitigates XSS reading it directly), sent automatically by the browser on requests to the matching domain — but that automatic sending is exactly what makes it vulnerable to **CSRF** unless mitigated (`SameSite` attribute, CSRF tokens).
- **In-memory (a JS variable, not persisted)** — safest against both XSS *reading* it after the fact and CSRF (since it's not a cookie, nothing sends it automatically) — but it's lost on page refresh, so it only really works well for the access token specifically, paired with a refresh mechanism to get a new one after a reload.

**Common real-world pattern:** access token in memory (short-lived, refreshed silently), refresh token in an `httpOnly`, `Secure`, `SameSite=strict` cookie (long-lived, protected from both major attack vectors as much as practical).

**Interview line:** *"Access tokens are short-lived, refresh tokens are long-lived and more sensitive since they can mint new access tokens. I keep the access token in memory — safest against both XSS and CSRF, at the cost of not surviving a refresh — and the refresh token in an httpOnly, SameSite cookie, which protects it from XSS reading it directly while SameSite limits CSRF exposure."*

**Tests:** token storage security trade-offs, XSS/CSRF mitigation

*Axis: failure · Source: challenge question*

---

### "How do you revoke JWTs? How do you rotate refresh tokens?"

**Revoking a JWT** is fundamentally awkward because the whole point of a JWT is that the server doesn't need to look anything up to trust it — so "revoking" it means reintroducing some form of server-side state, which is exactly what JWTs were meant to avoid. Real approaches:
- **Short expiry + refresh** — the simplest practical mitigation isn't true revocation at all; it just bounds the damage window by making access tokens expire quickly (minutes), so a compromised token is only dangerous briefly.
- **A denylist/blocklist** — store revoked token IDs (or user IDs) in a fast lookup (Redis), and check every request against it. This reintroduces a server-side check on every request — meaning you've given up some of the "stateless, no lookup needed" benefit specifically to gain revocation.
- **A token version/generation number per user** — store a version number on the user record; embed that version in the JWT at issue time; on each request, compare the token's version to the user's current version. Bumping the user's version instantly invalidates every previously-issued token for them (useful for "log out everywhere" / a password change), without needing to track individual token IDs.

**Rotating refresh tokens** — issue a **new** refresh token every time the old one is used to get a new access token, and invalidate the old one immediately. This limits how long a stolen refresh token is useful for (it becomes worthless the next time the legitimate user refreshes) and — as a bonus — lets you detect theft: if a refresh token that's already been used/rotated is presented again, that's a strong signal it was stolen and used by someone else, and you can revoke the whole token family in response.

**Interview line:** *"True JWT revocation fights the whole point of JWTs being stateless, so in practice I bound the damage instead — short access-token expiry, and a version number on the user record embedded in the token, so bumping it on logout-everywhere or a password change instantly invalidates everything previously issued, without tracking individual token IDs. For refresh tokens specifically, I rotate on every use — issue a new one, invalidate the old — which also gives me theft detection: a reused, already-rotated refresh token is a clear signal of compromise."*

**Tests:** JWT revocation strategies, refresh token rotation

*Axis: failure · Source: challenge question*

---
