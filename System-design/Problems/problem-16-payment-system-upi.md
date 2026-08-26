# Design Problem 16 — Payment System (UPI / Google Pay)

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 04, 08, 13, 14, 21.
>
> **Signature challenge:** **money-correctness under failure** — idempotency so a retried request never moves money twice, a double-entry ledger so the books always balance, and a saga (not 2PC) to coordinate a debit in one bank with a credit in another.
>
> **Why this problem matters more than it looks:** every other problem in this folder tolerates a little sloppiness — a duplicate tweet in a feed, a stale cache read, a lost location ping. Here, a duplicated write is *stolen money* and a lost write is *money that vanished*. This is the only design in the track where "eventually consistent, best effort" is not an acceptable answer for the core path.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: idempotency + the double-entry ledger](#core)
5. [Coordinating across banks — saga, not 2PC](#saga)
6. [The UPI/NPCI model concretely](#upi)
7. [Database](#db)
8. [Reconciliation — the safety net](#recon)
9. [Scaling](#scaling)
10. [Full architecture](#arch)
11. [Interview Q&A](#interview)
12. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. User A sends money to user B by an identifier (VPA / handle / phone), authenticated by a PIN.
2. The system **debits** A's bank account and **credits** B's bank account.
3. Both parties get a definitive status: `SUCCESS`, `FAILED`, or `PENDING` — and pending must eventually resolve.
4. Full transaction history + receipts, queryable.

**Non-functional:**
- **Correctness above all** — money is never created, never destroyed, never moved twice. This beats availability *and* latency.
- **Idempotent under retry** — the network will time out; the client will retry; the same logical payment must execute at most once.
- **Auditable** — every balance must be explainable by an immutable trail. Regulators ask "why is this number what it is," and "the service computed it" is not an answer.
- **Latency ~2–5s end to end** — slow but not unbounded; user is staring at a spinner.
- **High availability**, but note the ordering: given a choice, this system **stops** rather than guesses. **CP, not AP** (Part 4).

> **The requirement that shapes everything:** there is no "undo" for a wrong balance the way there is for a wrong cache entry. So the design is built around *making duplicate and partial execution structurally impossible*, not around detecting and fixing them later.

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Sizing against real UPI scale (July 2026: **23.66B transactions/month**):

- **Transactions/day:** ~23.66B ÷ 30 ≈ **~790M/day**
- **Average TPS:** 790M ÷ 86,400 ≈ **~9,100/s** (published UPI averages sit around **7,500 TPS**, architected for **10,000+ TPS** peak)
- **Peak TPS:** festival/salary-day spikes → assume **3–5× average ≈ 30,000–45,000/s**
- **Ledger writes:** each payment is **at least 2 ledger entries** (one debit, one credit) — often 4+ once fee/commission legs are included → **~20K–40K ledger rows/sec sustained**
- **Storage:** 790M txns/day × ~4 ledger rows × ~200 bytes ≈ **~630GB/day** of append-only ledger — and it can **never be deleted** (regulatory retention, typically 7–10 years) → **~200TB+/year, growing forever**
- **Read:** history/receipt lookups are far lower volume than writes, and are almost always "recent transactions for one user" — a narrow, cacheable, partition-friendly query

> Two numbers define the design: **~2–4 immutable ledger rows per payment** (so the ledger, not the payment count, is the real write load), and **storage only ever grows** (so the ledger must be partitioned by time from day one — see §9).

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
POST /api/v1/payments
Headers: Idempotency-Key: <client-generated UUID>   ← MANDATORY, not optional
Body: { "payerVpa", "payeeVpa", "amount": {"value": 50000, "currency": "INR"}, "note" }
→ 201 { "paymentId", "status": "PENDING" | "SUCCESS" | "FAILED", "ledgerRef" }

GET  /api/v1/payments/{paymentId}
→ 200 { "paymentId", "status", "amount", "createdAt", "settledAt", "failureReason" }

POST /api/v1/payments/{paymentId}/refund
Headers: Idempotency-Key: <new UUID>
→ 201 { "refundId", "status" }

GET  /api/v1/accounts/{accountId}/transactions?cursor=&limit=
→ 200 { "items": [...], "nextCursor" }
```

**Three API decisions that are actually design decisions:**

1. **`Idempotency-Key` is a required header, not a nice-to-have.** Reject the request with `400` if it's missing. Making it optional means someone will omit it and double-charge a customer.
2. **Amount is an integer in the currency's minor unit** (`50000` = ₹500.00), never a float. Floating-point rounding in a ledger is a correctness bug that compounds silently across millions of rows.
3. **`PENDING` is a first-class response, not an error.** A payment system that only knows `SUCCESS`/`FAILED` is lying — when the downstream bank times out, the honest answer is "I don't know yet," and the client must be able to poll.

---

<a name="core"></a>
# 4. Core: idempotency + the double-entry ledger 🎯

This is the heart of the problem. Two mechanisms, doing two different jobs:

| Mechanism | Protects against |
|---|---|
| **Idempotency key** | The *same* payment being executed twice (client retry, network timeout, queue redelivery) |
| **Double-entry ledger** | Money being created or destroyed *within* one execution (partial write, bad arithmetic, silent corruption) |

You need both. Idempotency alone won't tell you your books are wrong; a ledger alone won't stop a retry from posting a second correct-looking payment.

### 4a. Idempotency — the mechanics

```
POST /payments  +  Idempotency-Key: 7f3a-...

┌─────────────────────────────────────────────┐
│ idempotency_records                          │
├──────────────┬───────────┬────────┬─────────┤
│ key (UNIQUE) │ req_hash  │ status │ response│
└──────────────┴───────────┴────────┴─────────┘
```

The flow, in exact order:

1. **`INSERT` the key first, before doing any work**, with `status = IN_PROGRESS`. The table has a **UNIQUE constraint on the key** — the database, not application logic, is what enforces "once."
2. **Insert succeeded** → this is the first time we've seen this request. Proceed to execute the payment.
3. **Insert violated the unique constraint** → we've seen it before. Now branch on the stored row:
   - `status = COMPLETED` → **return the stored response verbatim**. Do not re-execute. The caller gets the same `paymentId` and same result they got the first time.
   - `status = IN_PROGRESS` → the original attempt is still running (or crashed mid-flight). Return `409 Conflict` / "still processing" — **do not** start a second execution racing the first.
4. **Also store a hash of the request body.** If the same key arrives with a *different* body, that's a client bug (key reuse across different payments) — return `422`, don't silently serve the wrong cached response.
5. On completion, update the row to `COMPLETED` with the response, **in the same transaction that writes the ledger entries**. If those two aren't atomic, you can end up with money moved but no idempotency record — and the next retry moves it again.

> **The insight worth saying out loud in an interview:** "exactly-once" doesn't exist at the network layer. What you actually build is **at-least-once delivery + idempotent writes**, which produces an *exactly-once effect* at the ledger. Everything upstream is allowed to retry freely precisely *because* the ledger write is idempotent.

**Stale `IN_PROGRESS` rows** — if a worker crashes after step 1, that key is stuck forever and the client can never retry. Fix: store a **lease/expiry** on the record (say 60s). A sweeper (or the next request itself) sees an expired `IN_PROGRESS` lease and can safely reclaim it, because the ledger write either committed (in which case it's visible and we mark `COMPLETED`) or it didn't (nothing happened, safe to retry).

### 4b. Double-entry ledger — the mechanics

**Never store a mutable `balance` column as the source of truth.** A balance is a *derived* number. The truth is an **append-only, immutable list of entries**, and every money movement writes **at least two rows that sum to zero**:

```
Payment: A sends ₹500 to B

entry_id  txn_id   account        direction  amount   created_at
────────────────────────────────────────────────────────────────
  1       txn_99   A_bank_acct    DEBIT      50000    t0
  2       txn_99   B_bank_acct    CREDIT     50000    t0
                                             ────────
                            sum for txn_99 = 0  ✅
```

Rules that make this work:

- **Entries are immutable.** Never `UPDATE`, never `DELETE`. A mistake is fixed by **appending a reversal** (a compensating pair of rows), not by editing history. That's what makes the trail auditable — you can replay it and see both the error and the correction.
- **Every transaction's entries must sum to zero.** Enforce it in the write path *and* verify it with a periodic job. If it ever doesn't, you have a bug and you want to know within minutes, not at the next audit.
- **Balance = `SUM(credits) - SUM(debits)`** for an account. Summing millions of rows on every read is too slow, so keep a **materialized balance snapshot** (`balance as of entry_id N`), and compute current balance as `snapshot + entries since N`. The snapshot is a *cache*; the entries remain the truth, and the snapshot can always be rebuilt by replay.
- **Money entering or leaving the system still needs two legs.** Use a system/nostro account as the counterparty, so the ledger balances globally — the sum of *every* entry in the system is always exactly zero.

> **Why double-entry and not just "decrement A, increment B"?** Because with two independent updates, a crash between them leaves money destroyed and *nothing in the data tells you it happened*. With double-entry, an unbalanced transaction is immediately detectable by a query anyone can run — the invariant is checkable, which means it's monitorable, which means it's alertable.

---

<a name="saga"></a>
# 5. Coordinating across banks — saga, not 2PC

A payment spans **two different banks**, owned by two different companies, behind a network you don't control. The debit and the credit must both happen — or neither.

### Why two-phase commit is the wrong tool here

2PC gives real atomicity: a coordinator asks all participants to *prepare*, and only when all say yes does it tell them to *commit*.

The problem is what "prepare" costs: each participant must **hold a lock** on the affected row from prepare until commit. Across a network you don't control:
- If the **coordinator dies** after prepare, participants are **blocked holding locks indefinitely** — the classic 2PC blocking problem.
- Lock hold time = full network round trip to the slowest bank. At 10,000 TPS that's catastrophic contention.
- It requires every participant to **implement your 2PC protocol**. Banks won't. You get an HTTP API and a settlement file, and that's it.

**Verdict:** 2PC is defensible inside one database or one team's services. Across organizational boundaries at high throughput, it's not an option — this is exactly what the interviewer is checking you know.

### The saga: local transactions + compensations

Break the payment into a sequence of **local** transactions, each committing independently, with a **compensating action** for each step that can be run if a later step fails.

```
  Step 1: RESERVE  — debit payer, mark funds held        ──▶ compensate: RELEASE (credit payer back)
  Step 2: CREDIT   — credit payee at beneficiary bank    ──▶ compensate: REVERSE (debit payee)
  Step 3: SETTLE   — finalize, mark txn COMPLETE
```

- **Orchestrated saga** (a central Payment Orchestrator drives the steps) is the right call here over choreography. Money flows need an explicit, inspectable state machine — when support asks "where is this ₹500," you want one service that can answer, not an emergent conversation between five event handlers.
- **Every step is idempotent** and carries the transaction ID, because every step will be retried.
- **Compensation is not rollback.** The debit *really happened* and is visible in the ledger; the compensation *appends a reversal*. The customer may briefly see money leave and come back. That's correct behaviour, and it's why the ledger is append-only.
- The orchestrator's state must itself be **durably persisted before each step** — if it crashes mid-saga, it recovers by reading its own state and resuming, not by starting over.

### Handling the genuinely ambiguous case

The hard failure isn't "bank said no." It's **"bank never answered."** Did the debit happen or not?

You **must not guess**. The correct handling:
1. Mark the transaction `PENDING`, surface that honestly to the user.
2. Retry a **status query** (not the debit — a *query*) against the bank with backoff.
3. If it's still unresolved past a threshold, it falls to **reconciliation** (§8) — the settlement file will tell you the truth, and the compensating entry gets posted then.

> This is why UPI transactions sometimes sit "pending" for a few minutes and then resolve. That's not a bug; it's the system correctly refusing to invent an answer.

---

<a name="upi"></a>
# 6. The UPI/NPCI model concretely

Worth knowing specifically, because "design GPay" is really "design a **TPAP on top of UPI**," not "design a bank."

```
[GPay / PhonePe / Paytm]        ← TPAP  (the app — what you're designing)
        │
        ▼
[  Sponsor Bank / PSP  ]        ← holds the UPI handle, signs & routes requests
        │
        ▼
┌───────────────────────┐
│   NPCI CENTRAL SWITCH │       ← the hub. Everything routes through here.
└───────────────────────┘
    │               │
    ▼               ▼
[Remitter Bank]  [Beneficiary Bank]
  (debits A)        (credits B)
```

**Hub-and-spoke:** every participant connects to NPCI; **no participant talks directly to another**. That's the architectural decision that made UPI work — N banks need N connections, not N² bilateral integrations. It's the same reason you'd put a message broker or API gateway in the middle of a service mesh (Parts 13, 15).

**The flow:**
1. Payer enters payee's **VPA** (`someone@okhdfcbank`) + amount, authorizes with **M-PIN** (second factor; the PIN is never known to the app — it's captured by a bank-controlled secure component and sent encrypted).
2. TPAP → PSP → **NPCI**.
3. **VPA resolution** — NPCI (or the payee's PSP) maps the handle to a real account number + IFSC. *This is the layer of indirection that is the whole point of UPI:* the payer never learns the payee's account number, and the payee can rotate handles without anything breaking.
4. NPCI sends **debit request** to the remitter bank → bank verifies PIN + funds, debits, responds.
5. NPCI sends **credit request** to the beneficiary bank → credits.
6. NPCI notifies both PSPs → both apps notify their users.

Total: **~2–5 seconds**.

**What you own as the TPAP:** the app, the idempotency layer, your own ledger/mirror of transaction state, notifications, history, retries, and reconciliation against NPCI's settlement files. **What you don't own:** the actual money movement — that's the banks'. Your ledger is a *record of instructions and their outcomes*, which is exactly why reconciliation (§8) is mandatory rather than optional.

> **Interview framing:** if asked to "design GPay," clarify this boundary in the first minute. Designing the switch (NPCI) and designing an app on top of it (TPAP) are different problems, and answering the wrong one costs you the interview.

---

<a name="db"></a>
# 7. Database *(Part 8)*

This is one of the few designs in the folder where the answer is emphatically **SQL, not NoSQL** on the core path:

| Data | Pattern | Store | Why |
|---|---|---|---|
| **Ledger entries** | Append-only, ~20–40K writes/s, never updated, never deleted | **SQL** (Postgres/MySQL/Spanner), sharded + time-partitioned | Needs **ACID multi-row transactions** — the debit and credit rows must commit together or not at all. Eventual consistency here is money loss. |
| **Idempotency records** | Insert-once + read, UNIQUE constraint enforced | Same SQL cluster, **same transaction as the ledger write** | The uniqueness guarantee *is* the feature. Must be atomic with the ledger, so it can't live in a separate store. |
| **Saga / orchestrator state** | Small, frequently updated per in-flight txn | SQL or Redis-with-durability | Must survive orchestrator restart. |
| **Transaction history (read path)** | Read-heavy, "recent txns for one user" | Read replicas + cache (Part 5), or a denormalized copy in NoSQL | Reads don't need the strict guarantees; keep them off the write primary. |
| **Analytics / fraud / spend insights** | Bulk scan, no correctness requirement | Async fan-out via queue (Part 13) → warehouse | Never let analytics touch the ledger primary. |

**On NoSQL:** you *can* build a ledger on DynamoDB or Cassandra, and some do — but you then have to rebuild multi-row atomicity yourself (conditional writes, transactional APIs with tight limits, or single-partition tricks). At interview altitude the strong answer is: **"ACID transactions are the requirement, so I start with SQL and shard it, rather than starting with a scalable store and bolting transactions back on."**

---

<a name="recon"></a>
# 8. Reconciliation — the safety net

Every real payment system runs a **reconciliation job** — usually nightly, sometimes continuous — that compares:

```
   Your internal ledger   ⟷   The bank/PSP/NPCI settlement file
```

**What it catches:**

| Discrepancy | Meaning | Resolution |
|---|---|---|
| In your ledger, not in theirs | You recorded a payment that never actually moved | Post a reversal; investigate |
| In theirs, not in your ledger | Money moved that you don't know about (a "pending" that actually succeeded) | Post the missing entries |
| Amounts differ | Fee/rounding/FX mismatch | Post an adjusting entry |
| Duplicate on their side | Their system double-processed | Raise a dispute; post reversal on confirmation |

**Design points that matter:**
- Reconciliation is **why `PENDING` is survivable**. §5's ambiguous timeouts don't need to be resolved live — the settlement file resolves them within hours, deterministically.
- It is **append-only too**. A recon fix is a new compensating entry, never an edit to the original.
- **Auto-heal the known patterns, alert on the rest.** A timeout-that-actually-succeeded is a known pattern you can safely automate. An unexplained amount mismatch goes to a human.
- The **zero-sum invariant** (`SUM of all entries == 0`) should be asserted continuously, not just at recon. It's the cheapest possible corruption detector.

> A payment system without reconciliation is a payment system that is quietly wrong and doesn't know it. This section is a very common gap in interview answers — mentioning it unprompted is a strong signal.

---

<a name="scaling"></a>
# 9. Scaling *(Parts 21, 24)*

**Shard the ledger by `account_id`.** The natural unit of consistency is one account's entries, and the overwhelming majority of queries are "entries for account X."

```
                      hash(account_id)
    ┌────────────┬────────────┬────────────┐
    ▼            ▼            ▼            ▼
[Shard 0]    [Shard 1]    [Shard 2]    [Shard 3]
 accounts     accounts     accounts     accounts
 + their      + their      + their      + their
 entries      entries      entries      entries
```

**The cross-shard problem:** payer and payee are usually on **different shards**, so a single ACID transaction can't cover both legs. Two acceptable answers:

1. **Accept it and use the saga** (§5) — the debit leg commits on shard A, the credit leg on shard B, with the orchestrator guaranteeing both complete or both compensate. This is what most systems do, and it composes cleanly with the fact that the *banks* are already separate systems.
2. **Route both legs to one shard when possible** — e.g. for internal wallet-to-wallet transfers, co-locate by a shared entity. Only works for a subset of traffic.

**Other scaling moves:**
- **Time-partition within each shard** (monthly/quarterly). Storage grows forever and can never be deleted, so old partitions get **rolled to cold storage** while recent ones stay hot. Without this, indexes degrade indefinitely.
- **Consistent hashing (Part 24)** for adding shards — remap a fraction of accounts, not all of them.
- **Synchronous replication** for the ledger (Part 21). This is the one place you do **not** take async replication: a failover that loses the last few seconds of writes loses *money*. Accept the write-latency cost.
- **Regional data residency** — payments are regulated per-country, so shards are often pinned to a jurisdiction. That constraint frequently *simplifies* sharding, since cross-border is a separate, slower flow anyway.
- **Backpressure over dropping.** Under overload, a payment system queues and slows down; it does not shed writes. Rejecting cleanly (`503`, client retries with the same idempotency key — safely) is far better than a half-executed payment.

---

<a name="arch"></a>
# 10. Full architecture

```
                       [ Mobile App / Merchant SDK ]
                                   │  Idempotency-Key
                                   ▼
                       [ API Gateway — authN, rate limit ]   (Part 15, 23)
                                   │
                                   ▼
                       [ Payment Service ]
                          │  1. INSERT idempotency key (UNIQUE)  ← dedupe happens HERE
                          │  2. if duplicate → replay stored response, STOP
                          ▼
                       [ Payment Orchestrator (saga state machine) ]
                          │        durably persists state before each step
        ┌─────────────────┼──────────────────┬─────────────────────┐
        ▼                 ▼                  ▼                     ▼
  [ Ledger Service ]  [ Risk / Fraud ]  [ Bank/NPCI Adapter ]  [ Notification ]
   append-only,        sync pre-check    retries + timeouts     (Part 13 queue)
   double-entry,          │                  │
   ACID, sharded          │                  ▼
   by account_id          │        ┌──────────────────┐
        │                 │        │  NPCI SWITCH     │
        │                 │        └──────────────────┘
        │                 │            │           │
        │                 │      [Remitter Bank] [Beneficiary Bank]
        ▼                 ▼
  [ Ledger DB — SQL, sharded + time-partitioned, SYNC replication ]
        │
        ├──▶ (async, Part 13/14) ──▶ [ Analytics / Fraud ML / Spend insights ]
        │
        └──▶ [ RECONCILIATION JOB ] ◀── settlement files from banks/NPCI
                    │
                    └──▶ posts compensating entries + alerts on mismatch
```

**Write path:** request + idempotency key → dedupe check (DB unique constraint) → saga: reserve/debit → credit → settle, each step idempotent and durably logged → two ledger rows per leg, summing to zero → response cached against the idempotency key.

**Failure path:** any step times out → transaction marked `PENDING` (never guessed) → status polling → unresolved ones settled by the nightly reconciliation, which appends compensating entries.

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: "The user taps Pay, the request times out, and they tap again. How do you make sure they're only charged once?"
> *"Every payment request carries a client-generated idempotency key. Before doing any work, I insert that key into a table with a unique constraint — so it's the database enforcing 'once', not application logic. If the insert succeeds, it's a genuinely new request and I execute. If it hits the unique violation, I look at the stored record: if it's completed, I return the exact response from the first attempt without re-executing; if it's still in progress, I return a conflict rather than starting a second execution that races the first. And the idempotency record is updated to completed in the same database transaction that writes the ledger entries — if those two weren't atomic, I could end up with money moved and no record of the key, and the next retry would move it again."*

### Q: "Why a double-entry ledger instead of just updating balance columns?"
> *"Because a mutable balance can't tell you when it's wrong. With double-entry, every movement writes at least two immutable rows — a debit and a credit — that sum to zero, and the balance is derived by summing them. That gives me three things: an audit trail I can replay to explain any balance, a checkable global invariant — every transaction sums to zero, and the whole system sums to zero — so corruption is detectable by a query I can run continuously and alert on, and immutability, so corrections are appended as reversals rather than editing history. For read performance I keep a materialized balance snapshot, but that's explicitly a cache — the entries are the truth and the snapshot can always be rebuilt by replay."*

### Q: "Would you use two-phase commit to make the debit and credit atomic?"
> *"No. 2PC gives real atomicity but each participant has to hold a lock from prepare until commit, and if the coordinator dies after prepare they're blocked holding those locks indefinitely. Across two different banks — a network I don't control, at ten thousand transactions a second — the lock hold time is a full round trip to the slowest participant, which is unworkable. And practically, external banks aren't going to implement my 2PC protocol; I get an HTTP API and a settlement file. So I use an orchestrated saga: each step is a local transaction that commits independently, each has a compensating action, and the orchestrator durably persists its state before each step so it can resume after a crash. Compensation isn't rollback — the debit really happened and is in the ledger, so the compensation appends a reversal."*

### Q: "The remitter bank times out and never responds. Did the money move?"
> *"I don't know, and the critical thing is not to guess. I mark the transaction PENDING and show the user that honestly. Then I retry a *status query* against the bank — not the debit itself — with backoff. If it's still unresolved past a threshold, it goes to reconciliation: the settlement file from the bank tells me the truth, and I post the compensating entry then. That's why real UPI payments sometimes sit pending for a few minutes and then resolve — the system is correctly refusing to invent an answer. The design point is that reconciliation is what makes PENDING survivable; without it you'd be forced to guess."*

### Q: "SQL or NoSQL for the ledger?"
> *"SQL. The core requirement is a multi-row ACID transaction — the debit row, the credit row, and the idempotency record all have to commit together or not at all — and that's exactly what a relational database gives me natively. The usual argument for NoSQL is write scale, but I'd rather start with the correctness guarantee and shard SQL by account ID than start with a scalable store and rebuild atomicity on top of conditional writes. I'd also time-partition within each shard, because ledger data can never be deleted for regulatory reasons, so without partitioning the indexes degrade forever."*

### Q: "Payer and payee are on different shards. How do you write both legs atomically?"
> *"I don't — and that's fine, because they're already in different banks, so a single ACID transaction was never going to span the real money movement anyway. I shard by account ID, so the two legs land on different shards, and the saga handles the coordination: debit commits on shard A, credit commits on shard B, and the orchestrator guarantees both complete or both compensate. Each leg is individually atomic and each is idempotent, so retries are safe. For purely internal wallet-to-wallet transfers I can sometimes co-locate both accounts on one shard and get a real single-shard transaction, but I wouldn't design assuming that."*

### Q: "How do you know your ledger is actually correct in production?"
> *"Two layers. Continuously, I assert the invariant — every transaction's entries sum to zero, and the sum of every entry in the system is zero. That's a cheap query and it's the earliest possible corruption detector, so it's monitored and alerted. Then daily reconciliation compares my ledger against the settlement files from the banks and PSP, and classifies every discrepancy: recorded but never moved, moved but never recorded, amount mismatch, or duplicate on their side. Known patterns like a timeout that actually succeeded get auto-healed with a compensating entry; anything unexplained goes to a human. A payment system without reconciliation is one that's quietly wrong and doesn't know it."*

### Q: "Design Google Pay." *(clarifying question you should ask)*
> *"First — am I designing the switch or the app? Google Pay in India is a TPAP: it sits on top of UPI, and NPCI's central switch does the actual routing between banks in a hub-and-spoke model, so no bank talks directly to another. If I'm designing the app, I own the idempotency layer, my own record of transaction state, the saga against the PSP, notifications, history, and reconciliation — but I don't own the money movement itself, which is why my ledger is a record of instructions and outcomes and why reconciliation is mandatory. If I'm designing the switch, that's a different system: VPA resolution, routing, and settlement across hundreds of banks. Which one do you want?"*

---

<a name="cheatsheet"></a>
# 12. Cheat Sheet

- **Shape:** the one system in the folder where correctness beats availability and latency. CP, not AP. No "best effort" on the core path.
- **Estimate:** ~790M txns/day, ~9K TPS avg / ~30–45K peak, **2–4 ledger rows per payment**, ~630GB/day append-only that can never be deleted.
- **Core mechanism 1 — idempotency:** client-generated key, **UNIQUE constraint in the DB** enforces "once." Insert key *before* work; duplicate → replay stored response; `IN_PROGRESS` → conflict, don't race. Update to `COMPLETED` **in the same transaction as the ledger write**. Lease/expiry to recover crashed in-flight keys.
- **Core mechanism 2 — double-entry ledger:** append-only, immutable, ≥2 rows per movement **summing to zero**. Balance = derived (`SUM(credits) - SUM(debits)`), materialized snapshot as a rebuildable cache. Corrections are **appended reversals**, never edits.
- **"Exactly-once" = at-least-once delivery + idempotent writes.** There's no exactly-once at the network layer.
- **Coordination: saga, not 2PC.** 2PC blocks on coordinator failure while participants hold locks, and external banks won't implement your protocol. Orchestrated saga (not choreography) — money needs one inspectable state machine.
- **Ambiguous timeout → `PENDING`, never a guess.** Retry a *status query*, not the debit. Reconciliation resolves the rest.
- **Reconciliation:** ledger vs settlement file, nightly. Auto-heal known patterns, alert the rest. Continuously assert the zero-sum invariant.
- **DB:** SQL for ledger + idempotency (need multi-row ACID), sharded by `account_id`, **time-partitioned**, **synchronous** replication (async replication = losing money on failover).
- **UPI specifics:** hub-and-spoke via NPCI (N connections, not N²); VPA is the indirection layer hiding account numbers; TPAP ≠ switch — **clarify which you're designing**.
- **Cross-refs:** Part 13.5 (delivery semantics, outbox pattern — the *publish-and-commit-atomically* problem this design implies), Part 4 (CAP — this is the CP example), Part 13/14 (queues for the async legs), Part 21 (sync replication, sharding), Part 24 (consistent hashing to add shards), Problem 18 (e-commerce reuses the same saga + idempotency spine).

*— Design Problem 16 complete —*
