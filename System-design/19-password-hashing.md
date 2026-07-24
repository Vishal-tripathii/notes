# System Design Study Notes — Part 19

## Password Hashing

> **Format:** Written as **Q&A** — brief & direct. Closes the **Authentication phase**.
>
> **Connects:** Part 7 (encryption — the contrast), Part 15–18 (auth). Encryption is reversible; hashing is one-way.

---

## Table of Contents

1. [The rule + hashing vs encryption](#core)
2. [Salting](#salt)
3. [The right algorithm (slow on purpose)](#algo)
4. [The flow + pepper](#flow)
5. [Use cases](#usecases)
6. [Interview Q&A](#interview)
7. [Cheat Sheet](#cheatsheet)

---

<a name="core"></a>
# 1. The rule + hashing vs encryption

**Never store passwords as plaintext.** If the DB leaks, every password is exposed (and reused elsewhere). Store a **hash** — a scrambled, one-way version.

- **Encryption** = **two-way** (reversible with a key). Wrong for passwords — if the key leaks, all passwords are recoverable.
- **Hashing** = **one-way** (cannot be reversed). Hash a password but never "unhash" it. ✅ Correct for passwords.
```
"mypass123"  ──hash──▶  "$2b$10$N9qo8uLO..."   (one-way, irreversible)
```

---

<a name="salt"></a>
# 2. Salting (defeats precomputed attacks)

A **salt** = random data added to each password before hashing, **unique per user**.

**Why:** without salt, two users with the same password get the **same hash**, and attackers use **rainbow tables** (precomputed hash→password lookups) to crack them instantly. A unique salt makes every hash different → rainbow tables useless.
```
"password" + salt_A → hash_A
"password" + salt_B → hash_B     # same password, totally different hashes
```
The salt is stored alongside the hash (not secret — its job is uniqueness).

---

<a name="algo"></a>
# 3. Use the right algorithm (slow on purpose)

- ❌ **MD5 / SHA-256** — too **fast** → attackers brute-force billions/sec.
- ✅ **bcrypt, scrypt, Argon2** — deliberately **slow** and tunable (a "cost factor"), so each guess is expensive. **bcrypt** = common default; **Argon2** = modern gold standard. (They salt automatically.)

> **Counterintuitive:** for passwords, **slow is good** — it hurts attackers far more than your one legit login.

---

<a name="flow"></a>
# 4. The flow + pepper

```
SIGN UP:  password → hash(password + salt) → store {hash, salt}
LOGIN:    input → hash(input + stored salt) → compare to stored hash
          match ✅ → logged in   /   no match ❌ → rejected
```
You never store or compare the actual password — only hashes.

**Bonus — pepper:** a **secret** value added to all passwords, stored **separately** (app config, not the DB). Even if the DB leaks, hashes are harder to crack without it. Optional extra layer.

---

<a name="usecases"></a>
# 5. Use cases

- **User login systems** — the primary use (every app with accounts).
- **API keys / tokens** — hash before storing so a DB leak doesn't expose usable keys.
- **Anything secret you must verify but never reveal** — you only check a match, never read the value back.

---

<a name="interview"></a>
# 6. Interview Q&A

### Q: "How do you store passwords securely?"
> *"Never in plaintext. I hash them with a slow, salted algorithm like bcrypt or Argon2. Hashing is one-way so it can't be reversed, and a unique per-user salt means identical passwords produce different hashes, which defeats rainbow tables. On login I hash the input with the stored salt and compare hashes — I never store or reverse the actual password."*

### Q: "Why hashing and not encryption?"
> *"Encryption is reversible — if the key leaks, every password is recoverable. Hashing is one-way, so even if the database leaks, passwords can't be un-hashed. You don't need to read a password back; you only verify a match, so one-way hashing is exactly right."*

### Q: "Why not use SHA-256 or MD5?"
> *"They're too fast — an attacker can brute-force billions of guesses per second. Password hashing should be deliberately slow, which is why bcrypt, scrypt, and Argon2 exist — a tunable cost factor makes each guess expensive, and they salt automatically. Slowness barely affects one legit login but massively slows an attacker."*

### Q: "What's a salt and why use it?"
> *"Random data added to each password before hashing, unique per user. Without it, identical passwords hash the same, so attackers use precomputed rainbow tables. A unique salt makes every hash different, so each password must be attacked individually. The salt is stored with the hash — not secret, its job is uniqueness."*

---

<a name="cheatsheet"></a>
# 7. Cheat Sheet

### Core
- **Never store plaintext.** Store a one-way **hash**.
- **Hashing** = one-way (passwords). **Encryption** = two-way (wrong for passwords).

### Salt
- Random, unique per user; defeats **rainbow tables**.
- Same password → different hashes. Stored with the hash (not secret).

### Algorithm
- ❌ MD5/SHA-256 (too fast). ✅ **bcrypt / scrypt / Argon2** (slow, tunable cost, auto-salt).
- Slow = good (hurts attackers, not legit logins).

### Flow
Sign up: store hash(password + salt). Login: hash(input + salt) → compare. Never reverse.

### Bonus
**Pepper** — secret added to all passwords, stored separately from the DB.

### Use cases
User login · API keys/tokens · any verify-but-never-reveal secret.

### Connects to
- Part 7: encryption (reversible) vs hashing (one-way). · Parts 15–18: authentication.

### Suggested next
- **MFA / 2FA**.
- **Full system design walkthrough** (applies all parts end-to-end).

*— End of Part 19 —*
