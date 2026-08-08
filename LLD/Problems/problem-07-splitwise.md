# LLD Problem 07 — Splitwise / Expense Sharing

> Worked end-to-end using the **[LLD Problem-Solving Framework](../04-lld-problem-solving-framework.md)**. Signature challenge: **debt-simplification** — minimizing the number of settle-up transactions across a group.

---

## Table of Contents

1. [Requirements & Scope](#requirements)
2. [Actors & Entities](#actors)
3. [Class Design](#class-design)
4. [Patterns Applied](#patterns)
5. [Core Code](#core-code)
6. [Concurrency](#concurrency)
7. [Extensibility](#extensibility)
8. [Interview Q&A](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements & Scope *(Framework Step 1)*

**Functional:**
1. Add users; create a group and add members.
2. Add an expense within a group, split among members — **Equal** (evenly), **Exact** (payer states exact ₹ per person, must sum to total), or **Percentage** (must sum to 100).
3. Show each user's **net balance** — overall, and per counterparty ("Bob owes you ₹500").
4. **Simplify debts** — collapse a group's tangled IOUs into the minimum number of payments that settle everyone up.

**Non-functional:**
- **Consistency** — sum of all balances in a group is always **zero**; money is never created or destroyed.
- **Concurrency-safe** — two expenses added at once must not corrupt shared balances.
- New split types shouldn't require touching existing code (Open/Closed).

> CRUD on expenses is easy. The two genuinely hard parts are **debt simplification** (a greedy/graph algorithm) and **balance consistency under concurrent writes** — everything else is scaffolding around those two.

---

<a name="actors"></a>
# 2. Actors & Entities *(Framework Step 2–3)*

**Actor:** a `User` who creates expenses, joins groups, views balances, settles up.

| Entity | Responsibility |
|---|---|
| `User` | id, name, email — identity only. |
| `Group` | named collection of `User`s + the `Expense`s logged against it. |
| `Expense` | one spend event: amount, who paid, which group, how it's split. |
| `Split` (abstract) | one person's share of one expense — `userId` + `amount`. |
| `EqualSplit` / `ExactSplit` / `PercentSplit` | subclasses of `Split` — differ only in *how the share is calculated*. |
| `Balance` / `Ledger` | derived state — who owes whom, how much, tracked pairwise. |

**Why a `Split` hierarchy, not a `type` field:** the calculation logic is the part likely to grow (e.g. "split by shares" later) — Strategy territory, Section 4.

---

<a name="class-design"></a>
# 3. Class Design *(Framework Step 4 — relationships before code)*

```
Group ──has-many──▶ User            Group ──has-many(composition)──▶ Expense
  id, name, members[]                                                  id, paidBy, amount, groupId, splits[]
  │                                                                        │
  owns                                                                    has-many (composition)
  ▼                                                                        ▼
Ledger                                                                  Split (abstract: calculateShares())
  balances: Map<"debtor->creditor", amount>                               ▲ implements
                                                              EqualSplit · ExactSplit · PercentSplit
```

- `Group`—`User`: **aggregation** (a `User` outlives any single group).
- `Group`—`Expense`, `Expense`—`Split`: **composition** (neither outlives its parent).
- `Split` subclasses **is-a** `Split`, differing only in `calculateShares()`.
- `Ledger` is **derived** from `Expense`s, not an independent source of truth.

---

<a name="patterns"></a>
# 4. Patterns Applied *(Framework Step 6)*

## Strategy — split calculation
`EqualSplit` / `ExactSplit` / `PercentSplit` all implement one interface: `calculateShares(totalAmount, participants) → [{ userId, amount }]`. `Expense.addSplit()` doesn't care which subclass it holds — it just calls `calculateShares()` and trusts the sum. Adding a fourth mode ("split by shares") means one new class; `Expense`, `Group`, `Ledger` stay untouched. That's **Open/Closed**: open to new split types (add a class), closed to modification. A `switch(splitType)` inside `Expense` would instead grow unbounded with every new type.

## Observer — balance-change notifications
Adding an `Expense` changes every participant's balance, and users expect a push ("Alice added an expense, you owe ₹250"). Rather than `addSplit()` hard-coding email + push + activity-feed calls, `Ledger` **publishes** a `BalanceChanged` event; `EmailNotifier`, `PushNotifier`, `ActivityFeed` subscribe independently. A new channel (SMS) subscribes without touching `Ledger` or `Expense` — same Open/Closed argument, discussed here rather than fully coded since Section 5 stays focused on split + ledger + debt-simplification.

---

<a name="core-code"></a>
# 5. Core Code *(Framework Step 8 — the critical path)*

## 5.1 Split hierarchy + `Expense.addSplit()`

```javascript
class Split {
  calculateShares(totalAmount, participants) { throw new Error("implement in subclass"); }
}

class EqualSplit extends Split {
  calculateShares(totalAmount, participants) {
    const n = participants.length;
    const base = Math.floor((totalAmount / n) * 100) / 100;
    const shares = participants.map(userId => ({ userId, amount: base }));
    shares[0].amount += Math.round((totalAmount - base * n) * 100) / 100; // rounding remainder
    return shares;
  }
}

class ExactSplit extends Split {
  calculateShares(totalAmount, participants /* [{userId, amount}] */) {
    const sum = participants.reduce((s, p) => s + p.amount, 0);
    if (Math.round(sum * 100) !== Math.round(totalAmount * 100)) {
      throw new Error(`Exact splits (${sum}) must sum to total (${totalAmount})`);
    }
    return participants;
  }
}

class PercentSplit extends Split {
  calculateShares(totalAmount, participants /* [{userId, percent}] */) {
    const sumPct = participants.reduce((s, p) => s + p.percent, 0);
    if (Math.round(sumPct) !== 100) throw new Error(`Percentages (${sumPct}) must sum to 100`);
    return participants.map(p => ({
      userId: p.userId,
      amount: Math.round(totalAmount * (p.percent / 100) * 100) / 100,
    }));
  }
}

class Expense {
  constructor(id, groupId, paidBy, amount, splitStrategy) {
    Object.assign(this, { id, groupId, paidBy, amount, splitStrategy, splits: [] });
  }

  addSplit(participants, ledger) {
    this.splits = this.splitStrategy.calculateShares(this.amount, participants);
    for (const { userId, amount } of this.splits) {
      if (userId === this.paidBy) continue; // payer doesn't owe themself
      ledger.recordDebt(userId, this.paidBy, amount); // "userId owes paidBy amount"
    }
    return this.splits;
  }
}
```

## 5.2 `Ledger` — pairwise balances

Balances are stored **pairwise** (`"A->B" => amount`) — that's what makes "Bob, you owe Alice ₹250" possible. Debt simplification only needs the *net* figure per user, so `Ledger` also derives that on demand.

```javascript
class Ledger {
  constructor() { this.pairwise = new Map(); } // "debtor->creditor" -> net amount owed

  recordDebt(debtorId, creditorId, amount) {
    const fwd = `${debtorId}->${creditorId}`, rev = `${creditorId}->${debtorId}`;
    const existingReverse = this.pairwise.get(rev) || 0;
    if (existingReverse > 0) {
      const net = existingReverse - amount;
      if (net >= 0) this.pairwise.set(rev, net);
      else { this.pairwise.delete(rev); this.pairwise.set(fwd, -net); }
      return;
    }
    this.pairwise.set(fwd, (this.pairwise.get(fwd) || 0) + amount);
  }

  netBalance(userId) { // +ve = is owed, -ve = owes
    let net = 0;
    for (const [key, amount] of this.pairwise) {
      const [debtor, creditor] = key.split("->");
      if (debtor === userId) net -= amount;
      if (creditor === userId) net += amount;
    }
    return Math.round(net * 100) / 100;
  }

  allNetBalances(userIds) { return userIds.map(id => ({ userId: id, balance: this.netBalance(id) })); }
}
```

## 5.3 Debt simplification — the signature algorithm

**Problem:** given each user's net balance (creditors +ve, debtors -ve, always summing to zero), find the minimum set of transactions that settles everyone to zero. Netting first matters: if A owes B and B owes C the same amount, B is actually flat — the real settlement is A paying C directly, not two separate payments.

**Greedy approach:**
```
1. Split users into creditors (balance > 0) and debtors (balance < 0).
2. Repeat until both are empty:
     a. Take the MAX creditor and the MAX debtor (max-heaps, by |balance|).
     b. settle = min(maxCredit, |maxDebt|); record "debtor pays creditor settle".
     c. Reduce both balances by settle; drop whichever hits 0; re-heapify.
3. Return recorded transactions.
```
Pairing the two largest each round zeroes out at least one person per round, which bounds this at **≤ N-1 transactions** for N people — the worst case being one person collecting everyone else's debt in a star pattern.

> **Interview caveat:** greedy-by-largest is *good*, not provably the absolute minimum — true minimum-transaction settlement is a harder, NP-hard-flavored combinatorial problem. Greedy is the expected, acceptable answer; name the caveat, don't try to build an optimal solver live.

```javascript
function simplifyDebts(netBalances /* [{ userId, balance }] */) {
  const creditors = netBalances.filter(b => b.balance > 0.001).map(b => ({ ...b }));
  const debtors = netBalances.filter(b => b.balance < -0.001).map(b => ({ ...b, balance: -b.balance }));
  // Arrays re-sorted each round stand in for max-heaps here — fine for small
  // groups; swap in a real binary heap for O(log n) pop+push at scale.
  const transactions = [];

  while (creditors.length && debtors.length) {
    creditors.sort((a, b) => b.balance - a.balance);
    debtors.sort((a, b) => b.balance - a.balance);
    const c = creditors[0], d = debtors[0];
    const settle = Math.round(Math.min(c.balance, d.balance) * 100) / 100;

    transactions.push({ from: d.userId, to: c.userId, amount: settle });
    c.balance = Math.round((c.balance - settle) * 100) / 100;
    d.balance = Math.round((d.balance - settle) * 100) / 100;

    if (c.balance <= 0.001) creditors.shift();
    if (d.balance <= 0.001) debtors.shift();
  }
  return transactions;
}
```

### Worked example — 4 users

Net balances after every expense (must sum to zero — if not, the ledger has a bug):
```
A: +400   B: +200   C: -100   D: -500
```

| Round | Max creditor | Max debtor | Settle | Transaction | Remaining |
|---|---|---|---|---|---|
| 1 | A (+400) | D (-500) | 400 | **D → A: 400** | A:0, B:+200, C:-100, D:-100 |
| 2 | B (+200) | D (-100) | 100 | **D → B: 100** | B:+100, C:-100, D:0 |
| 3 | B (+100) | C (-100) | 100 | **C → B: 100** | B:0, C:0 |

**Result: 3 transactions** (= N-1, the worst-case bound, hit exactly here) settle all 4 people:
```
D → A : 400
D → B : 100
C → B : 100
```
Naive pairwise settlement (paying back every direct debt as logged) could have taken up to 6 transactions — that gap is the entire value of this feature.

---

<a name="concurrency"></a>
# 6. Concurrency *(Framework Step 7)*

**The race:** Alice logs "dinner ₹1200, split with Bob" while Bob concurrently logs "cab ₹400, split with Alice." Both read `balance[A][B]`, compute independently, and write back:
```
Req 1 (Alice's expense): read 0 → compute 0+600 → write 600
Req 2 (Bob's expense):   read 0 → compute 0-200 → write -200   ← overwrites Req 1, Alice's 600 is lost
```
A classic **lost-update** race on shared mutable state — same shape as two threads decrementing one counter.

**Fix 1 — atomic/serialized updates (mutate in place, guarded).** Lock per `(userA, userB)` pair (DB row-level lock, or an app mutex) so `recordDebt()` is a true read-modify-write critical section — or push the increment into the DB itself (`UPDATE ledger SET amount = amount + ? WHERE pair = ?`), so the read-modify-write is atomic at the storage layer. Simple to reason about; contention is the cost under heavy write volume on a hot group.

**Fix 2 — event-sourced ledger (derive, don't mutate).** Never write a balance directly — every expense is an immutable `ExpenseAdded` event appended to a log; balances are computed on read (or via an async materialized-view projection) by folding all events. Concurrent writes are just concurrent appends, which don't conflict the way read-modify-writes do — no lost-update window at all. Bonus: full audit trail and trivial "undo" (append a compensating event). Cost: reading a balance means replaying/aggregating events, or maintaining a projection that's eventually (not immediately) consistent.

**Trade-off:** atomic/locked updates are the right default at friend-group scale — simple, immediate consistency. Event sourcing is the answer once the interviewer pushes toward audit logs, undo, or high write concurrency on large groups — more moving parts on the read side, in exchange for a write path with nothing to race on.

---

<a name="extensibility"></a>
# 7. Extensibility *(Framework Step 9 — "now add X")*

**"Now add multi-currency support."** `Expense.amount` becomes `Money{amount, currencyCode}` — never a bare number once more than one currency exists. `Ledger` keys become currency-scoped (`"A->B:USD"`, `"A->B:INR"`) — an INR debt never nets against a USD one. Debt simplification runs once per currency. Optionally a `CurrencyConverter` (Strategy again) for *display* totals only, never for computing what's actually owed. **Unchanged:** `Split` subclasses, `addSplit()`, the greedy algorithm — they operate on plain numbers, indifferent to currency, because currency was kept out of that layer from the start.

**"Now add partial settlements."** A settlement ("Bob pays Alice ₹300 of the ₹500 owed") is just another ledger-affecting event — model it as a `Payment` that calls the same `recordDebt()` path with a negated amount, rather than a bolted-on special case. **Unchanged:** `netBalance()` (already sums whatever's in `pairwise`) and `simplifyDebts()` (only ever reads current net balances, which the payment already updated). The one real addition is a `Payment` history separate from `Expense` history, so the activity feed reports it correctly — a reporting concern, not a balance-math change.

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: "How do you simplify N people's mutual debts into the minimum number of transactions?"
> *"Compute net balance per person — creditors positive, debtors negative, always summing to zero. Greedily match the biggest creditor with the biggest debtor each round, settle the smaller of the two, drop whoever hits zero, repeat. Max-heaps make each round O(log n). It terminates in at most N-1 transactions since every round fully zeroes out someone. It's not provably the global minimum — that's NP-hard-flavored — but greedy-by-largest is the standard, expected interview answer."*

### Q: "Why net balances first instead of settling every direct debt?"
> *"Direct debts don't reflect what's really owed — if A owes B and B owes C the same amount, B nets to flat, and the true settlement is A paying C directly. Netting collapses chains before simplification even starts."*

### Q: "Why is `Split` a class hierarchy instead of a switch on a `splitType` field?"
> *"The thing that varies — how a share is calculated — is exactly what new requirements add to, not replace. A Strategy interface means a new split mode is one new class with `Expense` untouched; a switch statement means editing that switch every time, which is Open/Closed violated in miniature."*

### Q: "What happens when two expenses hit the same group's balance at once?"
> *"A lost-update race — both read the current balance, compute independently, and the second write silently overwrites the first. I'd guard it with an atomic DB increment or row-level lock on the pair, or go event-sourced — append immutable expense events, derive balances by folding them — if the product needs a full audit trail or expects heavy concurrent writes on hot groups."*

### Q: "How do you add multi-currency without a rewrite?"
> *"Money becomes amount-plus-currency, ledger keys become currency-scoped so different currencies never net against each other, and simplification runs per currency. The split logic and the greedy algorithm don't change — they only ever touch numbers, which is why keeping currency out of that layer from day one pays off here."*

### Q: "Why store balances pairwise instead of one running total per user?"
> *"Pairwise (`debtor->creditor => amount`) is what lets me show 'Bob owes you ₹500' directly, which the UI needs. Net-per-user is then just a derived view — sum a person's pairwise rows — so I get both the detail and the aggregate without maintaining two separate sources of truth."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

- **Scope:** users, groups, expenses split equal/exact/percent, net balances, debt simplification.
- **Entities:** `User`, `Group` (has-many `User`, has-many `Expense`), `Expense` (has-many `Split`), `Split` base + `EqualSplit`/`ExactSplit`/`PercentSplit`, `Ledger`.
- **Patterns:** **Strategy** for split calculation (Open/Closed); **Observer** for balance-change notifications.
- **Ledger:** stored **pairwise**; net balance per user is *derived* by summing.
- **Debt simplification:** net balances → greedy match max-creditor/max-debtor, settle `min()`, drop zeros → **≤ N-1 transactions**. Not provably optimal (NP-hard variant), but the expected answer.
- **Concurrency:** concurrent expense adds race on shared balance (lost-update). Fix: atomic DB increment/row lock (simple, immediate) **or** event-sourced ledger (append-only, derived reads, no write-path locking).
- **Extend — multi-currency:** `Money{amount, currency}`, currency-scoped ledger keys, simplify per-currency; split logic + algorithm untouched.
- **Extend — partial settlements:** signed entry through the same `recordDebt()` path; `netBalance()` and simplification need zero changes.

*— LLD Problem 07 complete —*
