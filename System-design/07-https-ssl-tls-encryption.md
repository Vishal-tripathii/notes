# System Design Study Notes — Part 7

## HTTPS, SSL, TLS, Certificates & Encryption (Conceptual)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. **Conceptual focus** (as requested) — clear mental models, not byte-level protocol detail. Diagrams and analogies included.
>
> **Continues from:** Part 6. The `Secure` cookie flag ("only sent over HTTPS") means "only over a TLS-encrypted connection" — this part explains what that actually is.

---

## Table of Contents

1. [The problem HTTPS solves](#problem)
2. [The three guarantees of HTTPS](#guarantees)
3. [Encryption — the core concept (symmetric vs asymmetric)](#encryption)
4. [SSL & TLS — the protocol](#ssl-tls)
5. [Certificates & Certificate Authorities](#certs)
6. [The TLS handshake (conceptual)](#handshake)
7. [How it all connects](#connects)
8. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="problem"></a>
# 1. The problem HTTPS solves

Plain **HTTP** sends everything in **plain text** — every header, cookie, password, and message travels readable. Anyone in between (ISP, someone on public WiFi, a compromised router) can:
1. **Read** your data (passwords, messages) → no privacy
2. **Tamper** with it (inject ads, alter content) → no integrity
3. **Impersonate** the server (pretend to be your bank) → no authenticity

**HTTPS** = HTTP + a security layer that fixes all three. The "S" = **Secure**.

> Plain HTTP = mailing a **postcard** (anyone handling it can read it). HTTPS = a **sealed, tamper-proof envelope** only the recipient can open, and you can verify who sent it.

---

<a name="guarantees"></a>
# 2. The three guarantees of HTTPS

Everything else exists to deliver these three:

| Guarantee | Meaning | Solved by |
|---|---|---|
| **Encryption (Confidentiality)** | Nobody in between can read the data | Encryption (symmetric + asymmetric) |
| **Integrity** | Data can't be secretly altered in transit | Cryptographic checks in TLS |
| **Authentication** | You're really talking to the genuine server, not an impostor | Certificates + Certificate Authorities |

> These three are the "why" behind every piece below.

---

<a name="encryption"></a>
# 3. Encryption — the core concept

**Encryption scrambles data using a key, so only someone with the right key can unscramble (decrypt) it.** Two fundamentally different types — the difference is the whole key to HTTPS.

## Symmetric encryption — one shared key
The **same key** locks and unlocks the data. Both sides need that one secret key.
```
[Message] --encrypt with KEY--> [scrambled] --decrypt with SAME KEY--> [Message]
```
- ✅ **Very fast** — great for lots of data.
- ❌ **Problem:** how do both sides get the shared key without an eavesdropper stealing it in transit? You can't mail the key over the same insecure line.

**Analogy:** one key that both locks and unlocks a box. Fast — but how do you safely get a copy to your friend in the first place?

## Asymmetric encryption — a key *pair*
Two mathematically-linked keys: a **public key** (shared with everyone) and a **private key** (kept secret).
> **What the public key locks, only the private key can unlock** (and vice versa).
```
[Message] --encrypt with PUBLIC key--> [scrambled] --decrypt with PRIVATE key--> [Message]
```
- ✅ **Solves key-sharing** — anyone can encrypt with your public key, but only *you* (private key) can decrypt. Public being public is fine.
- ❌ **Slow** — computationally expensive, bad for large data.

**Analogy:** a **padlock (public key)** handed out freely, and the **only key that opens it (private key)** stays with you. Anyone can snap the padlock shut on a box and send it; only you open it.

## The clever combination HTTPS uses
Symmetric is fast but can't share the key safely; asymmetric shares safely but is slow. HTTPS uses **both**:
1. Use **slow asymmetric** encryption *once* to safely exchange a **shared symmetric key**.
2. Then use **fast symmetric** encryption for all the actual data.

> Asymmetric solves "how do we agree on a secret key safely," then symmetric does the fast bulk work. This exchange happens in the **TLS handshake**.

---

<a name="ssl-tls"></a>
# 4. SSL & TLS — the protocol

**SSL (Secure Sockets Layer)** and **TLS (Transport Layer Security)** are the **protocols** that implement the security — the rules for how client and server encrypt, verify, and communicate.

- **SSL** = the original (1990s). Now **obsolete and insecure** — all versions deprecated.
- **TLS** = SSL's successor and improvement. **What everything uses today** (TLS 1.2, TLS 1.3).

> **Confusing part:** people still say "SSL" out of habit ("SSL certificate"), but they almost always mean **TLS**. *"SSL/TLS" = the same family; TLS is modern & secure; SSL is the deprecated ancestor.* **HTTPS = HTTP over TLS.**

```
HTTPS  =  HTTP  +  TLS (the security layer)
                    └─ (SSL was the old name; TLS replaced it)
```

---

<a name="certs"></a>
# 5. Certificates & Certificate Authorities

Encryption keeps data secret, but there's a gap: **how do you know the public key you received actually belongs to your bank, not an impostor who intercepted the connection?** If an attacker slips you *their* public key, you'd encrypt data *they* can read. This is the **authentication** problem — solved by **certificates**.

## What a certificate is
A **digital certificate** = an **ID card / passport for a website.** It contains:
- The website's **domain name** (e.g. `bank.com`)
- The website's **public key**
- The **issuer** (who vouches for it)
- An **expiry date**
- A **digital signature** from a trusted authority

## Certificate Authority (CA) — the trusted vouchers
A **CA** is a trusted organization (Let's Encrypt, DigiCert) that **verifies** a website really owns its domain, then **signs** its certificate — saying *"I vouch that this public key genuinely belongs to bank.com."*

**The chain of trust:** your browser/OS ships with a built-in list of **trusted CAs**. When a site presents a certificate, the browser checks:
1. Is it signed by a CA I trust?
2. Does the domain match?
3. Is it still valid (not expired/revoked)?

Yes → padlock 🔒. No → "Your connection is not private" ⚠️.

```
Trusted CA  --signs-->  bank.com's certificate  --presented to-->  Your browser
                                                                       │
                        "Signed by a CA I trust? Domain match? Valid?"
                                                                       │
                                                            ✅ Yes → 🔒 trusted
                                                            ❌ No  → ⚠️ warning
```

**Analogy:** a certificate is a **passport** — you trust it because a government (the CA) you recognize issued it, not because the person just *tells* you who they are. The CA verifying the domain = the passport office verifying identity before issuing.

---

<a name="handshake"></a>
# 6. The TLS handshake (conceptual)

Before any real data flows, client and server do a quick **handshake**. Conceptually (not memorizing steps):

```
1. Client: "Hello, let's talk securely." (proposes TLS versions/ciphers)

2. Server: sends its CERTIFICATE (with its PUBLIC KEY)

3. Client: verifies the certificate with its trusted CAs   ← AUTHENTICATION
           "Yes, this really is bank.com." ✅

4. Client & Server: use ASYMMETRIC encryption (the public key)
           to safely agree on a shared SYMMETRIC key         ← KEY EXCHANGE

5. Both now share a secret symmetric key.
   All further communication uses fast SYMMETRIC encryption   ← ENCRYPTION
```

After the handshake: a secure channel with all three guarantees — **encrypted** (symmetric key), **authenticated** (verified certificate), **integrity-protected** (TLS checks every message).

> **Elegant summary:** the handshake uses **asymmetric** encryption + **certificates** to *authenticate the server and safely establish a shared key*, then switches to fast **symmetric** encryption for the actual conversation.

---

<a name="connects"></a>
# 7. How it all connects

```
              ┌─────────────────────── HTTPS ───────────────────────┐
              │  = HTTP  +  TLS security layer                       │
              └──────────────────────────────────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          ▼                          ▼                          ▼
   ENCRYPTION                  CERTIFICATES               SSL / TLS
   (confidentiality)           + CAs                      (the protocol)
   symmetric (fast, bulk)      (authentication —          TLS = modern,
   + asymmetric (safe          "you're really             SSL = old/dead
   key exchange)                talking to bank.com")
```

- **Encryption** (symmetric + asymmetric) → confidentiality.
- **Certificates + CAs** → authentication (who you're talking to).
- **SSL/TLS** → the protocol orchestrating it all (TLS = the live one).
- **HTTPS** → HTTP running over that TLS layer.

**Ties back to Part 6:** the `Secure` cookie flag = "only send over HTTPS" = "only over a TLS-encrypted connection," so the cookie can't be sniffed in transit.

---

<a name="cheatsheet"></a>
# 8. Cheat Sheet — everything on one page

### HTTPS
- **HTTPS = HTTP + TLS.** Fixes plain HTTP's three weaknesses (readable, alterable, impersonatable).
- Delivers 3 guarantees: **Encryption** (confidentiality), **Integrity**, **Authentication**.

### Encryption
| Type | Keys | Speed | Role in HTTPS |
|---|---|---|---|
| **Symmetric** | One shared key (lock = unlock) | Fast | Encrypts the actual data (bulk) |
| **Asymmetric** | Public + private pair | Slow | Safely exchanges the symmetric key |
- Public locks → only private unlocks. **Padlock (public) / key (private)** analogy.
- HTTPS uses **asymmetric to share a key, then symmetric for the data** (best of both).

### SSL vs TLS
- **SSL** = original, obsolete, insecure (deprecated).
- **TLS** = successor, modern, in use today (1.2 / 1.3).
- People say "SSL" but mean **TLS**. HTTPS = HTTP over TLS.

### Certificates & CAs
- **Certificate** = website's ID card: domain + public key + issuer + expiry + CA signature.
- **Certificate Authority (CA)** = trusted org (Let's Encrypt, DigiCert) that verifies domain ownership and signs the cert.
- **Chain of trust:** browser trusts built-in CAs → checks signature + domain + validity → 🔒 or ⚠️.
- Solves **authentication** ("am I really talking to bank.com?").
- Analogy: certificate = **passport** issued by a government (CA) you trust.

### TLS handshake (conceptual)
1. Client hello → 2. Server sends certificate (public key) → 3. Client verifies cert with CAs (**auth**) → 4. Asymmetric exchange of a shared symmetric key (**key exchange**) → 5. Fast symmetric encryption for all data (**encryption**).

### Mapping guarantees → mechanisms
| Guarantee | Delivered by |
|---|---|
| Confidentiality | Symmetric + asymmetric encryption |
| Integrity | TLS message checks |
| Authentication | Certificates + CAs |

### Connects to
- Part 6: `Secure` cookie flag = "only over HTTPS/TLS" (can't be sniffed). HTTPS protects headers/cookies/tokens in transit.

### Suggested next topics
- **Message queues** (async, decoupling, absorbing spikes).
- **SQL vs NoSQL** (choosing a database, indexing).
- **API design** (REST vs GraphQL, rate limiting).
- **Capacity estimation** (users → RPS → storage).

*— End of Part 7 —*
