# System Design Study Notes — Part 15

## Authentication vs Authorization

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Kept tight & smart. Kicks off the **Authentication phase**.
>
> **Connects:** Part 6 (JWT/sessions — how identity is proven), Part 11 (401 vs 403).

---

## Table of Contents

1. [What (one line each)](#what)
2. [Why](#why)
3. [Analogy: the airport](#analogy)
4. [Identity vs Permissions](#id-perm)
5. [The difference at a glance](#difference)
6. [Interview Q&A](#interview)
7. [Cheat Sheet](#cheatsheet)

---

<a name="what"></a>
# 1. What (one line each)

- **Authentication (AuthN)** = **Who are you?** → verifying **identity**.
- **Authorization (AuthZ)** = **What are you allowed to do?** → checking **permissions**.

Authentication **always comes first** — you can't decide what someone's allowed to do until you know who they are.
```
Request ──▶ [ Authentication ] ──▶ [ Authorization ] ──▶ Access granted
             "Who are you?"          "Are you allowed?"
             (identity)              (permissions)
```

---

<a name="why"></a>
# 2. Why

- **AuthN** stops impostors — confirms you're really *you* (password, OTP, token).
- **AuthZ** enforces boundaries — even a valid user shouldn't access *everything* (a regular user can't open the admin panel).

> Both needed: identity without permissions = anyone verified can do anything; permissions without identity = you don't know whose rules to apply.

---

<a name="analogy"></a>
# 3. Analogy: the airport ✈️

- **Authentication** = the **passport check** at security. "Is this really you?" → verifies **identity**.
- **Authorization** = your **boarding pass**. Which flight, which seat you can board — a first-class pass ≠ cockpit access. → **permissions**.

> Passing security (authenticated) doesn't mean you can sit in first class or fly the plane (authorized). Same person, two separate checks.

---

<a name="id-perm"></a>
# 4. Identity vs Permissions

- **Identity (AuthN):** *proving* who you are. Methods: password, OTP, biometrics, JWT/session (Part 6), OAuth/SSO login.
- **Permissions (AuthZ):** *what that identity can do*. Methods: roles (admin/user), **RBAC** (role-based access control), ownership checks ("is this *your* post?").

---

<a name="difference"></a>
# 5. The difference at a glance

| | **Authentication** | **Authorization** |
|---|---|---|
| Question | Who are you? | What can you do? |
| Verifies | Identity | Permissions |
| Comes | First | After AuthN |
| Fails with | **401** Unauthorized | **403** Forbidden |
| Example | Logging in with password | Blocking a user from `/admin` |
| Changes? | Same across the app | Varies per resource/action |

---

<a name="interview"></a>
# 6. Interview Q&A

### Q: "Authentication vs authorization?"
> *"Authentication verifies who you are — identity, like logging in with a password or token. Authorization decides what you're allowed to do — permissions, like whether you can access the admin panel. Authentication always comes first; you verify identity, then check permissions. A quick memory hook: authentication is the 401 error — 'I don't know who you are' — and authorization is the 403 — 'I know you, but you're not allowed.'"*

### Q: "Which comes first and why?"
> *"Authentication, always. You can't decide someone's permissions until you know who they are. Identity first, then permissions."*

### Q: "Give a real example of both."
> *"On a blog platform: authentication is logging in with your credentials so the system knows you're user 42. Authorization is that user 42 can edit their own posts but not someone else's, and can't access the admin dashboard. Same login, different permission checks per action."*

### Q: "401 vs 403?"
> *"401 Unauthorized means you're not authenticated — the system doesn't know who you are, like a missing or invalid token. 403 Forbidden means you're authenticated but not authorized — it knows who you are, but you lack permission for this action."*

### Q: "How do you implement each?"
> *"Authentication with something like a JWT or session — the user logs in, gets a token, and sends it on each request to prove identity. Authorization with roles or RBAC — the token or session carries the user's role, and the server checks whether that role, or that specific user, is allowed to perform the action, including ownership checks like 'is this your resource?'"*

---

<a name="cheatsheet"></a>
# 7. Cheat Sheet

### Core
- **AuthN (Authentication)** = who are you? → **identity**. Fails → **401**.
- **AuthZ (Authorization)** = what can you do? → **permissions**. Fails → **403**.
- **AuthN first, then AuthZ.**

### Airport analogy
- Passport check = authentication (identity).
- Boarding pass = authorization (which flight/seat = permissions).

### Identity vs Permissions
- Identity: password, OTP, biometrics, JWT/session, OAuth/SSO.
- Permissions: roles, RBAC, ownership checks.

### Difference table
| | AuthN | AuthZ |
|---|---|---|
| Question | Who are you? | What can you do? |
| Verifies | Identity | Permissions |
| Order | First | After |
| Failure | 401 | 403 |

### Connects to
- Part 6: JWT/sessions (proving identity). · Part 11: 401 vs 403.

### Suggested next (auth series)
- **JWT & sessions** (already in Part 6 — the AuthN mechanics).
- **OAuth 2.0 / SSO** (delegated auth, "Login with Google").
- **RBAC & permission models** (the AuthZ mechanics).
- **Password hashing** (bcrypt, salting).

*— End of Part 15 —*
