# Application Security Fundamentals — Scenario Bank

> Rate limiting is covered in [`02-api-design/rest-design-fundamentals.md`](../02-api-design/rest-design-fundamentals.md) (token bucket vs leaky bucket) — cross-linked below for the brute-force angle rather than repeated. Secure file upload specifics (presigned URLs, virus scanning) get fuller treatment in [`13-file-storage-systems/`](../13-file-storage-systems/).

---

### "How do you prevent SQL/NoSQL injection?"

Injection happens when user input is concatenated directly into a query **as code**, letting an attacker's input change the query's actual structure, not just its data. Classic SQL example: a login form building `SELECT * FROM users WHERE username = '` + input + `'` — an attacker submitting `' OR '1'='1` turns the query into something that matches every row, bypassing the password check entirely.

**Prevention: never build a query by string-concatenating user input.** Use **parameterized queries / prepared statements**, where the query structure and the data are sent to the database **separately** — the database treats the input strictly as a data value, never as part of the query's logic, no matter what characters it contains.

```js
// vulnerable — input becomes part of the query's structure
db.query(`SELECT * FROM users WHERE username = '${input}'`);

// safe — input is always treated as data, never as query syntax
db.query('SELECT * FROM users WHERE username = ?', [input]);
```

**NoSQL injection** is the same root cause in a different shape — e.g. MongoDB accepting an object like `{ "$gt": "" }` as a filter value instead of a plain string, which changes the *query operator*, not just the value, if user input is passed directly into a query object without validation. Prevention: validate/sanitize input types strictly (reject anything that isn't the expected primitive type before it reaches the query), and use an ODM/query builder that doesn't let raw user objects become query operators unchecked.

**Interview line:** *"Injection happens when user input becomes part of the query's structure instead of staying pure data — I prevent it with parameterized queries, where the query and the data are sent to the database separately so input can never be interpreted as query syntax, no matter what's in it. For NoSQL specifically, the same risk shows up as an object like $gt being passed straight through as a filter, so I also validate that input types are strictly what's expected before they ever reach the query."*

**Tests:** injection prevention, parameterized queries

*Axis: failure · Source: challenge question*

---

### "XSS vs CSRF? How does CSRF happen? Why does SameSite cookie configuration matter?"

**XSS (Cross-Site Scripting)** — an attacker gets **their JavaScript to run in your page**, in your users' browsers — usually by injecting a `<script>` tag or similar through unsanitized user input that later gets rendered as HTML (a comment field, a username displayed without escaping). Once their script runs in your page's context, it can read cookies (unless `httpOnly`), make requests as the logged-in user, or steal anything in `localStorage`. Prevention: escape/sanitize all user-generated content before rendering it as HTML (most modern frameworks — React, Angular — do this by default; the danger is explicitly opting out, like `dangerouslySetInnerHTML` or `bypassSecurityTrust*`), and a `Content-Security-Policy` header as a second layer of defense.

**CSRF (Cross-Site Request Forgery)** — a **different** attack: the attacker doesn't need to run any code in your page at all. They just get the victim's browser to send a request to *your* site while the victim happens to be logged in elsewhere — e.g. a malicious page with a hidden auto-submitting form pointed at `yourbank.com/transfer`. Since browsers attach cookies automatically to any request to the matching domain regardless of which page triggered it, your server sees what looks like a legitimate, authenticated request, because the victim's session cookie gets sent along automatically.

**Why `SameSite` matters:** `SameSite=strict` (or `lax`) tells the browser **not** to send this cookie on a request that originated from a different site — which directly defeats the classic CSRF pattern above, since the malicious page's request no longer carries the victim's session cookie at all. This is why modern browsers defaulting cookies to `SameSite=Lax` meaningfully reduced CSRF's real-world impact even for sites that never explicitly added CSRF tokens.

**Interview line:** *"XSS is getting your own JavaScript to run inside my page, which can then do anything my page's own JS could — read cookies, make authenticated requests. CSRF is different — no code injection needed, just tricking a victim's browser into sending a request to my site while they're logged in, relying on cookies being attached automatically. SameSite on the cookie is what stops that specifically, by telling the browser not to send it on a cross-site-originated request — which is why it defends directly against CSRF, but doesn't help at all against XSS."*

**Tests:** XSS vs CSRF mechanisms, SameSite defense

*Axis: failure · Source: challenge question*

---

### "How do you prevent brute-force attacks?"

A brute-force attack is simply an attacker (or a bot) trying many credential guesses rapidly against a login (or similarly sensitive) endpoint until one works. The core defenses layer together:

- **Rate limiting** on the specific endpoint — cap login attempts per IP and/or per account within a time window (see [`02-api-design/rest-design-fundamentals.md`](../02-api-design/rest-design-fundamentals.md) for the token bucket/leaky bucket mechanics). This is the direct, first-line defense.
- **Account lockout / progressive delay** — after N failed attempts for a specific account, either lock it temporarily or add an increasing delay before the next attempt is even evaluated — makes rapid guessing impractical even if the attacker rotates IPs to dodge IP-based rate limiting.
- **CAPTCHA** after a few failed attempts — specifically targets automated/bot attempts rather than a legitimate user who mistyped their password once or twice.
- **Strong password hashing** (bcrypt/argon2, with a proper work factor) — this doesn't stop online brute-forcing directly, but it's the critical defense if the password database itself is ever stolen, making offline brute-forcing of the leaked hashes computationally expensive.
- **Monitor and alert** on unusual failure patterns (many failures across many accounts from one source) — a sign of credential-stuffing rather than an isolated user error.

**Interview line:** *"Layers, not one silver bullet: rate limiting login attempts per IP and per account as the first line, account lockout or progressive delay to make rapid guessing impractical even across rotating IPs, and CAPTCHA specifically to filter out automated attempts. Separately, strong password hashing like bcrypt matters for the case where the database itself leaks — it's what makes offline brute-forcing the stolen hashes expensive."*

**Tests:** brute-force defense layers, password hashing rationale

*Axis: failure · Source: challenge question*

---

### "How do you securely upload files? How do you prevent path traversal?"

**Secure upload, top concerns:**
- **Validate file type by actual content, not just the extension or client-supplied MIME type** — both are trivially spoofable (rename `malware.exe` to `photo.jpg`); check the file's actual magic bytes/signature server-side.
- **Enforce a maximum file size** before/while accepting the upload, not after it's already fully received.
- **Never execute or serve an uploaded file from the same origin/directory as your application code** — store uploads somewhere they can't be interpreted as executable server code (a separate object storage bucket like S3, or a directory the web server is configured to only ever serve as static files, never execute).
- **Scan for malware** if the files will be shared with other users, not just the uploader.
- **Generate a new filename server-side** rather than trusting the client-supplied filename directly — which also closes off path traversal (next).

**Path traversal** — an attacker supplies a filename like `../../etc/passwd` (or similar) hoping the server naively concatenates it into a file path, letting them read (or in an upload context, write) files **outside** the intended directory. Prevention: never build a file path by directly concatenating user-supplied input — generate the filename/storage key server-side (a UUID, unrelated to whatever the client sent), and if a path must incorporate any user input, resolve it to an absolute path and explicitly verify it's still within the intended base directory before using it, rejecting anything that resolves outside.

```js
// vulnerable — client-controlled filename becomes part of the file path directly
fs.writeFile(`./uploads/${req.body.filename}`, data);

// safe — server generates its own filename, client input never touches the path
const safeName = crypto.randomUUID();
fs.writeFile(`./uploads/${safeName}`, data);
```

**Interview line:** *"For uploads I validate file type by actual content rather than trusting the extension or client MIME type, enforce a size limit, and critically, never store or serve uploads from anywhere they could be executed as server code. Path traversal specifically I prevent by never using the client-supplied filename in the actual file path at all — I generate my own filename server-side, so there's nothing for an attacker to manipulate into escaping the intended directory."*

**Tests:** file upload security, path traversal prevention

*Axis: failure · Source: challenge question*

---

### "How do you protect internal APIs?"

An "internal" API (service-to-service, not meant for public/end-user traffic) is often mistakenly treated as safe by default just because it's "not public-facing" — but if it's reachable at all from a network an attacker could reach (a compromised container, a misconfigured network boundary, a public-facing service that itself got compromised and is now inside the network), no auth on it at all is a real exposure, not a theoretical one.

- **Authenticate service-to-service calls too** — mutual TLS (mTLS, where both sides present certificates) or service-specific API keys/tokens, not just "it's on the internal network so it's fine."
- **Network segmentation** — internal services shouldn't be reachable from the public internet at all (private subnets, security groups/firewall rules restricting which services can even reach which other services) — defense in depth alongside auth, not instead of it.
- **Least privilege between services** — a service should only be able to call the specific other services/endpoints it actually needs, not have blanket network access to everything internal; this limits blast radius if any one service is compromised.
- **Still validate/sanitize input** on internal APIs — "it's only called by our own trusted service" is exactly the assumption that turns one compromised service into a foothold for attacking everything downstream of it.

**Interview line:** *"I don't treat 'internal' as synonymous with 'safe' — I authenticate service-to-service calls too, usually with mTLS or service-specific tokens, combine that with network segmentation so internal services aren't even reachable from outside, and apply least privilege so a service can only reach what it actually needs. That matters because 'internal and trusted' is exactly the assumption that turns one compromised service into a foothold for attacking everything else behind it."*

**Tests:** zero-trust internal architecture, defense in depth

*Axis: failure · Source: challenge question*

---

### "How do you manage secrets? What happens if an API key leaks? How do you rotate credentials without downtime?"

**Managing secrets:** never commit them to source control (an `.env` file with real secrets in a git repo is a classic, recurring incident) and never hardcode them in application code. Use a dedicated secrets manager (AWS Secrets Manager, HashiCorp Vault, or at minimum environment variables injected at deploy time, not baked into the codebase or image) — this also centralizes access control (who/what can even read a given secret) and audit logging (who accessed it, when).

**If an API key leaks:** the response is time-sensitive and has to happen in this order —
1. **Revoke/rotate the leaked key immediately** — the highest priority, since every second it's live is exposure.
2. **Issue a new key** and update every service that uses it.
3. **Audit usage logs** for the leaked key's activity window to understand what it was actually used for while compromised — you need to know the actual blast radius, not just assume it was fine.
4. **Investigate how it leaked** (committed to a public repo, logged accidentally, exposed in a client-side bundle) and fix that root cause — otherwise the next key leaks the same way.

**Rotating credentials without downtime** requires the destination (database, third-party service) to briefly **accept both the old and new credential simultaneously** — you can't atomically swap a credential everywhere at once across every service instance:
1. Create the **new** credential alongside the still-valid old one (most systems support multiple valid API keys/credentials concurrently for exactly this reason).
2. Deploy the new credential to all consuming services (a rolling deploy, so some instances briefly use old, some new — both still work).
3. Once every instance has confirmed switched to the new credential, **revoke the old one**.

Skipping the "both valid simultaneously" step and just swapping in one shot is what causes the downtime — some instance is guaranteed to still be using the old credential for the brief window before it's redeployed.

**Interview line:** *"Secrets go in a dedicated secrets manager, never committed to source control or hardcoded. If a key leaks, I revoke it immediately before anything else, then audit its usage logs to understand actual exposure, then fix how it leaked in the first place. Rotating without downtime means the destination has to accept both old and new credentials simultaneously during a rolling deploy — swap in one shot and some instance is guaranteed to still be using the old one and break."*

**Tests:** secrets management, incident response, zero-downtime rotation

*Axis: recovery · Source: challenge question*

---
