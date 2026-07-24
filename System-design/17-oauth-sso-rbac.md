# System Design Study Notes — Part 17

## OAuth 2.0, OIDC, SSO & RBAC

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Analogies, diagrams, and interview Q&A included.
>
> **Continues:** the **Authentication phase** — Part 15 (AuthN vs AuthZ concept), Part 16 (JWT). These are the *real mechanisms*: OAuth/OIDC/SSO handle authentication & access; RBAC handles permissions.

---

## Table of Contents

1. [The big picture](#big-picture)
2. [OAuth 2.0 — delegated authorization](#oauth)
3. [OIDC & "Login with Google"](#oidc)
4. [SSO — log in once, access many](#sso)
5. [RBAC — the permissions side](#rbac)
6. [How they all connect](#connect)
7. [Interview Q&A](#interview)
8. [Cheat Sheet](#cheatsheet)

---

<a name="big-picture"></a>
# 1. The big picture

```
OAuth 2.0  → "let App X use my Google data" (delegated access / authorization)
OIDC       → OAuth + identity → "Login with Google" (authentication)
SSO        → one login → many apps (built on OIDC/SAML)
RBAC       → once you're in, what can you DO? (permissions)
```

---

<a name="oauth"></a>
# 2. OAuth 2.0 — delegated authorization

## The problem
You want a photo-printing app to access your Google Photos. **Bad way:** give it your Google **password** → full access forever, can't limit or revoke. 😱
**OAuth 2.0 grants an app *limited* access to your data on another service — without sharing your password.**

## Analogy: a valet key 🚗
Your car has a **main key** (opens everything, drives anywhere) and a **valet key** (only starts the engine + opens the door — no trunk/glovebox). You hand the valet the *limited* key.
> OAuth = the valet key: **scoped, revocable** access to specific things, never your master credentials.

## The four roles
```
[Resource Owner]        = you (owns the data)
[Client]                = the app wanting access (photo printer)
[Authorization Server]  = Google's login/consent server (issues tokens)
[Resource Server]       = Google's API holding your photos
```

## The flow (Authorization Code — the common one)
```
1. You click "Connect Google Photos" in the app (Client).
2. Redirected to Google (Authorization Server) → log in + consent screen:
   "PhotoPrinter wants to view your photos." → Allow.
3. Google redirects back with a temporary AUTHORIZATION CODE.
4. The app exchanges that code (+ its secret) for an ACCESS TOKEN.
5. The app uses the access token to call Google's API and read ONLY your photos.
```
- **Scopes** = the specific permissions granted ("read photos," not "read email").
- **Revocable** anytime from your Google account — the app never had your password.

> **Key insight:** OAuth 2.0 is about **authorization (access), not authentication (identity)** — "can this app access this resource?", not "who is this user?" (→ that's OIDC).

## OAuth 1.0 vs 2.0
OAuth **2.0** = modern standard (simpler, token-based, HTTPS). 1.0 = legacy (complex signatures). Say "OAuth 2.0 is the current standard."

---

<a name="oidc"></a>
# 3. OIDC & "Login with Google"

Since OAuth 2.0 handles *access* not *identity*, it was extended for login:

**OpenID Connect (OIDC) = a thin identity layer on top of OAuth 2.0.** It adds an **ID token** (a JWT! — Part 16) saying *who the user is*.

> **"Login with Google/GitHub/Facebook"** is technically **OIDC** (authentication) built on **OAuth 2.0** (authorization).
```
OAuth 2.0  → authorization (what the app can access)
OIDC       → OAuth 2.0 + an ID token (who the user is) → enables login
```

---

<a name="sso"></a>
# 4. SSO (Single Sign-On) — log in once, access many

**SSO lets you authenticate once and access multiple applications without logging in again.**

## Analogy: a theme-park wristband 🎢
Show ID once at the gate → get a **wristband** → every ride just checks the wristband, no re-verifying.
> SSO = one login (the gate) → a token/wristband → every app trusts it, no re-login.

## How it works
A central **Identity Provider (IdP)** authenticates you; all apps (Service Providers) trust it.
```
1. Log into the IdP once (Google, or Okta at work).
2. IdP issues a token proving your identity.
3. Every connected app trusts that token → you're in, no re-login.
```
- **Consumer:** log into Google → Gmail, YouTube, Drive without re-login.
- **Corporate:** log into **Okta/Azure AD** once → Slack, Jira, Salesforce open.
- **Protocols:** **SAML** (older, enterprise, XML) and **OIDC** (modern, on OAuth 2.0).

> **Benefit:** fewer passwords, centralized control (disable one account → cut access to *everything*).

---

<a name="rbac"></a>
# 5. RBAC (Role-Based Access Control) — the permissions side

You're authenticated; now **RBAC answers Part 15's authorization question: what can you *do*?**

**RBAC assigns permissions to roles, and roles to users** — not permissions to each user individually.
```
USER ──has──▶ ROLE ──has──▶ PERMISSIONS

Alice ──▶ Admin  ──▶ [read, write, delete, manage users]
Bob   ──▶ Editor ──▶ [read, write]
Carol ──▶ Viewer ──▶ [read]
```

## Analogy: job titles 🏢
Access is by **role**, not name. A "Manager" badge opens manager doors. New manager? Give them the Manager role — no per-door config.

## Why RBAC
- **Simple management** — change a role's permissions once → all its users update. Onboard by assigning a role, not 50 permissions.
- **Scales** — thousands of users, a handful of roles.
- **Least privilege** — each role gets only what it needs.

In practice the **role rides in the JWT** (`role` claim, Part 16); the server checks *"does this role permit this action?"* + ownership checks ("is this *your* resource?").

> **RBAC vs ABAC:** RBAC = by **role**; **ABAC** (Attribute-Based) = by **attributes/rules** (department, time, location) — more granular, more complex. RBAC is the common default.

---

<a name="connect"></a>
# 6. How they all connect

```
1. AUTHENTICATION (who are you?)
   → Login with Google (OIDC on OAuth 2.0), possibly via SSO (one login, many apps)
   → you receive a token (JWT — Part 16)

2. AUTHORIZATION (what can you do?)
   → RBAC: your role in the token decides your permissions
```
Part 15 = the *concept* (AuthN vs AuthZ). These = the *mechanisms*: OAuth/OIDC/SSO on the **authentication/access** side; RBAC on the **permission** side.

---

<a name="interview"></a>
# 7. Interview Q&A

### Q: "What is OAuth 2.0?"
> *"A protocol for delegated authorization — it lets an app access a user's data on another service without the user sharing their password. Like a valet key that only does certain things. The user grants scoped, revocable permissions, and the app gets an access token to call the API with just those permissions. It's about access, not identity."*

### Q: "Is OAuth authentication or authorization?"
> *"Authorization — it grants access to resources. It's often used for login, but that's actually OpenID Connect, a thin identity layer on top of OAuth 2.0 that adds an ID token saying who the user is. So 'Login with Google' is OIDC using OAuth underneath."*

### Q: "What is SSO and how does it work?"
> *"Single Sign-On lets you log in once and access multiple applications without re-authenticating. A central identity provider authenticates you and issues a token that all connected apps trust — like showing ID once at a theme park and using a wristband for every ride. It's built on protocols like SAML or OIDC. The benefit is fewer passwords and centralized control — disabling one account cuts access everywhere."*

### Q: "What is RBAC?"
> *"Role-Based Access Control assigns permissions to roles and roles to users, instead of assigning permissions to each user directly. So an Admin role might have read, write, and delete, and you give users that role. It's easy to manage — change the role once and every user with it updates — and it scales to lots of users with a few roles. Usually the role lives in the user's JWT and the server checks it per action."*

### Q: "OAuth vs SSO — how are they related?"
> *"Different layers. OAuth 2.0 is about delegated access to resources; OIDC adds identity on top for login. SSO is the experience of logging in once to access many apps, often implemented using OIDC or SAML. So OAuth/OIDC are the underlying protocols, and SSO is a use case built on them."*

---

<a name="cheatsheet"></a>
# 8. Cheat Sheet

### The stack
- **OAuth 2.0** — delegated **authorization** (access to resources, no password shared). Valet key.
- **OIDC** — OAuth 2.0 + **ID token** → **authentication** → "Login with Google."
- **SSO** — one login → many apps (theme-park wristband). Built on OIDC/SAML.
- **RBAC** — **permissions**: roles → users. Job titles.

### OAuth 2.0
- Roles: Resource Owner (user), Client (app), Authorization Server (issues tokens), Resource Server (API).
- Flow: click connect → consent at provider → auth code → exchange for access token → call API with scopes.
- Scoped + revocable; about **access, not identity**.

### OIDC
- Identity layer on OAuth 2.0; adds ID token (a JWT). Powers social login.

### SSO
- Central **Identity Provider** authenticates once; apps trust the token.
- Consumer: Google → Gmail/YouTube. Corporate: Okta/Azure AD → Slack/Jira.
- Protocols: SAML (old/enterprise), OIDC (modern).
- Benefit: fewer passwords, centralized control.

### RBAC
- USER → ROLE → PERMISSIONS. Change role once → all users update.
- Role rides in the JWT; server checks per action + ownership.
- RBAC (by role) vs ABAC (by attributes — more granular).

### How they connect
AuthN (OAuth/OIDC/SSO → token) → AuthZ (RBAC → permissions). Mechanisms behind Part 15's concept.

### Connects to
- Part 15: AuthN vs AuthZ. · Part 16: JWT (ID token, role claim). · Part 6: sessions/tokens. · Part 7: HTTPS.

### Suggested next (auth series)
- **Password hashing** (bcrypt, salting — how credentials are stored).
- **MFA / 2FA**.
- Then: **full system design walkthrough**.

*— End of Part 17 —*
