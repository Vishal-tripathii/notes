# LLD Problem 05 — Vending Machine

> Worked end-to-end using the **[LLD Problem-Solving Framework](../04-lld-problem-solving-framework.md)**. Signature challenge: the textbook State-pattern problem — legal state transitions, not a giant if/else.

---

## Table of Contents

1. [Requirements & scope](#requirements)
2. [Actors & entities](#actors)
3. [Class design](#class-design)
4. [Patterns applied](#patterns)
5. [Core code](#code)
6. [Concurrency](#concurrency)
7. [Extensibility](#extensibility)
8. [Interview Q&A](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements & scope *(Framework step 1)*

**Functional:**
1. Customer **selects an item** by code (e.g. `B2`).
2. Customer **inserts money** — coins and notes, in increments, until enough is inserted or they cancel.
3. Machine **dispenses the item** once payment covers the price.
4. Machine **returns change** if the customer overpaid.
5. **Out-of-stock** items can't be selected/dispensed — machine tells the customer instead of silently failing.
6. **Insufficient funds** — machine keeps waiting for more money rather than dispensing early.
7. Customer can **cancel** at any point before dispensing → full refund of whatever's been inserted.

**Non-functional / narrowing questions to ask the interviewer:**
- Single machine, single customer at a time (physical hardware) — is this in scope, or a *fleet* of machines behind a software API? *(drives section 6)*
- Does change-making need to reason about denominations (give exact coins back), or is "refund total amount" good enough? *(assume denomination-aware refund, it's a nice follow-up)*
- Multiple payment methods (cash only, or cash + card)? *(section 7)*

> Read-only clarification, but it's the one that decides whether this is a 20-minute State-pattern exercise or also a hardware/inventory problem — say it out loud before writing a class.

---

<a name="actors"></a>
# 2. Actors & entities *(Framework steps 2–3: nouns → classes)*

| Entity | Responsibility |
|---|---|
| `VendingMachine` | The **context**. Holds `currentState`, `inventory`, `balance`, `selectedItem`. Delegates every customer action to `currentState`. |
| `VendingMachineState` (interface) | Declares `insertMoney()`, `selectItem()`, `dispense()`, `refund()`. Each concrete state implements only what's legal from it. |
| `IdleState` | No money, no selection. Only `selectItem()` does anything. |
| `HasMoneyState` | Item selected, money being inserted. `insertMoney()` accumulates; once ≥ price, transitions to `DispensingState`. `refund()` legal here. |
| `DispensingState` | Payment cleared. `dispense()` ejects the item, computes change, resets machine → back to `Idle`. Transient state — machine shouldn't sit here waiting on external input. |
| `OutOfStockState` | Selected item has zero inventory. Rejects `insertMoney()`/`dispense()`, tells the customer, returns to `Idle` (or accepts a different, in-stock selection). |
| `Item` | `code`, `name`, `price`. |
| `Inventory` | `Map<code, {item, quantity}>`. `hasStock(code)`, `decrement(code)`. |
| `Coin` / `Money` | Denomination + value; used both for inserted funds and for computing change. |

**Relationships:** `VendingMachine` *has-a* `VendingMachineState` (composition, swapped at runtime — the whole point of State) and *has-a* `Inventory`. `VendingMachineState` implementations *have-a* back-reference to `VendingMachine` so they can read/mutate `balance`/`selectedItem` and call `machine.setState(...)`.

---

<a name="class-design"></a>
# 3. Class design *(Framework step 5: relationships before code)*

## State-transition diagram

```
                          selectItem(code)
                      ┌───────────────────────┐
                      │                        ▼
                 ┌─────────┐   [in stock]  ┌──────────┐
        ┌───────►│  Idle   │───────────────►│ HasMoney │
        │        └─────────┘                └────┬─────┘
        │             │                           │
        │   selectItem(code)                insertMoney(coin)
        │      [out of stock]                     │
        │             ▼                    balance < price? ──► stay in HasMoney
        │        ┌──────────┐                      │
        │        │OutOfStock│              balance >= price
        │        └────┬─────┘                      │
        │             │                             ▼
        │        acknowledge()               ┌─────────────┐
        │             │                       │ Dispensing  │
        └─────────────┘                       └──────┬──────┘
                                                       │ dispense()
                              refund() ◄── (from Idle  │ - eject item
                              [from HasMoney,           │ - decrement inventory
                               any time before           │ - compute & return change
                               Dispensing]                ▼
                                                    back to Idle
```

Every arrow is a **legal transition owned by exactly one state class**. There is no arrow from `Idle` straight to `Dispensing`, no arrow from `Dispensing` back to `HasMoney` — and that's enforced by *which methods exist on which class*, not by a runtime check.

## Class diagram (ASCII)

```
┌────────────────────────┐        ┌──────────────────────────┐
│     VendingMachine      │◆──────►│  VendingMachineState      │  (interface)
├────────────────────────┤        ├──────────────────────────┤
│ - currentState          │        │ + insertMoney(coin)       │
│ - inventory: Inventory  │        │ + selectItem(code)        │
│ - balance: number        │        │ + dispense()               │
│ - selectedItem: Item     │        │ + refund()                  │
├────────────────────────┤        └───────────△──────────────┘
│ + selectItem(code)       │                    │ implements
│ + insertMoney(coin)       │      ┌─────────────┼─────────────┬───────────────┐
│ + dispense()                │  IdleState   HasMoneyState  DispensingState  OutOfStockState
│ + refund()                    │
│ + setState(state)              │
└────────────────────────┘
        │ has-a
        ▼
┌────────────────┐        ┌──────────────┐
│   Inventory      │──────►│     Item       │
├────────────────┤ 1    N ├──────────────┤
│ - stock: Map      │        │ code, name,    │
│ + hasStock(code)   │        │ price            │
│ + decrement(code)   │        └──────────────┘
└────────────────┘
```

`VendingMachine` → `VendingMachineState` is **composition with runtime swapping** — that single arrow *is* the State pattern.

---

<a name="patterns"></a>
# 4. Patterns applied *(Framework step 6 — name the SOLID principle each choice serves)*

## State (the core pattern)

**What breaks in the if/else/switch version.** A naive implementation puts everything on `VendingMachine` itself:

```js
insertMoney(coin) {
  if (this.state === 'IDLE') throw new Error('select an item first');
  else if (this.state === 'HAS_MONEY') {
    this.balance += coin.value;
    if (this.balance >= this.selectedItem.price) this.state = 'DISPENSING';
  } else if (this.state === 'DISPENSING') throw new Error('already dispensing');
  else if (this.state === 'OUT_OF_STOCK') throw new Error('out of stock, refund');
  // ...repeat this shape in selectItem(), dispense(), refund()
}
```

Every method (`insertMoney`, `selectItem`, `dispense`, `refund`) needs its **own** copy of this branch-on-state logic — 4 methods × N states = 4N hand-synchronized branches, with nothing stopping them from drifting apart.

**Now add a "maintenance" state.** In the if/else version that means opening all four methods and inserting a new `else if (state === 'MAINTENANCE')` branch into *each*, then re-reading every existing branch to confirm none needs an "unless maintenance" guard. That's an **edit to code that already works** — exactly what Open/Closed says to avoid; miss one method and the machine dispenses items while "in maintenance."

In the State-pattern version: write one new class, `MaintenanceState`, implement the four interface methods, add one transition into it. **Zero existing state classes are touched** — `IdleState`, `HasMoneyState`, `DispensingState`, `OutOfStockState` stay compiled, tested, untouched. That's Open/Closed doing real work, not a definition to recite. **SRP** falls out too: each state class has exactly one reason to change — the rules for *that* state — while `VendingMachine` changes only for how states are wired together.

## Singleton — discussion, not a default

The physical `VendingMachine` instance is a natural Singleton candidate: one machine, one piece of hardware, one global access point. But apply it only if there's genuinely **one instance for the process's lifetime** (embedded controller software) — legitimate, same category as a logger. If this is actually a **fleet of machines** behind a shared backend (section 6), each machine is its own object keyed by machine ID — Singleton is **wrong** there, because "one instance total" is false; that's a registry, not a Singleton. Don't reach for it just because there's incidentally one machine in front of you right now.

---

<a name="code"></a>
# 5. Core code *(Framework step 8 — critical path, real signatures)*

```js
// State interface — JS has no formal interfaces, so the base class throws by default.
class VendingMachineState {
  insertMoney(machine, coin) { throw new Error('Cannot insert money in current state'); }
  selectItem(machine, code)  { throw new Error('Cannot select item in current state'); }
  dispense(machine)          { throw new Error('Cannot dispense in current state'); }
  refund(machine)            { throw new Error('Nothing to refund in current state'); }
}

// Idle: waiting for a selection.
class IdleState extends VendingMachineState {
  selectItem(machine, code) {
    const entry = machine.inventory.get(code);
    if (!entry) throw new Error('No such item');
    machine.selectedItem = entry.item;
    machine.setState(entry.quantity > 0 ? new HasMoneyState() : new OutOfStockState());
  }
  // insertMoney/dispense/refund: inherited (illegal here) — no override needed.
}

// HasMoney: item selected, accumulating payment.
class HasMoneyState extends VendingMachineState {
  insertMoney(machine, coin) {
    machine.balance += coin.value;
    if (machine.balance >= machine.selectedItem.price) {
      machine.setState(new DispensingState());
      machine.currentState.dispense(machine); // auto-dispense once paid
    }
  }
  refund(machine) { return machine.reset(); } // caller returns this cash to the customer
}

// Dispensing: transient — payment already cleared, resolves in the same tick it's entered.
class DispensingState extends VendingMachineState {
  dispense(machine) {
    const item = machine.selectedItem;
    machine.inventory.decrement(item.code);
    const change = machine.balance - item.price;
    machine.reset();
    machine.eject(item, change); // hardware call: drop item + coins
  }
}

// OutOfStock: selection was invalid.
class OutOfStockState extends VendingMachineState {
  refund(machine) { return machine.reset(); } // usually 0, but covers edge cases
  selectItem(machine, code) {
    // allow picking a different, in-stock item without a separate cancel step
    machine.setState(new IdleState());
    machine.currentState.selectItem(machine, code);
  }
}

// Context: delegates everything to currentState — never branches on state itself.
class VendingMachine {
  constructor(inventory) {
    this.inventory = inventory;
    this.balance = 0;
    this.selectedItem = null;
    this.currentState = new IdleState();
  }
  setState(state) { this.currentState = state; }
  selectItem(code) { this.currentState.selectItem(this, code); }
  insertMoney(coin) { this.currentState.insertMoney(this, coin); }
  dispense() { this.currentState.dispense(this); }
  refund() { return this.currentState.refund(this); }
  reset() { // shared by refund() and dispense() — balance/selection always clear the same way
    const refunded = this.balance;
    this.balance = 0;
    this.selectedItem = null;
    this.setState(new IdleState());
    return refunded;
  }
  eject(item, change) { console.log(`Dispensing ${item.name}, change: ${change}`); }
}
```

Notice `VendingMachine` never has an `if (state === ...)` anywhere — every method is a **one-line delegate**, and the reset logic common to refund/dispense lives in one place (`reset()`) instead of being copy-pasted per state. That's the tell that the State pattern is actually buying something, not just being name-dropped.

---

<a name="concurrency"></a>
# 6. Concurrency *(Framework step 7 — the question that separates junior from senior)*

**Physical machine:** two customers can't press buttons on the same keypad at once — the hardware itself serializes interaction. Not zero concurrency concern (e.g. debounce, but that's UX not LLD), but not the interesting case in an interview.

**The interesting case — reframe as a fleet-management backend.** If this is now a software API fronting many machines (`POST /machines/{id}/purchase`), the physical serialization disappears and a **shared mutable state race** opens up:

```
Request A: purchase(machineId=7, item=B2)  ─┐
Request B: purchase(machineId=7, item=B2)  ─┤  both read inventory.quantity === 1
                                              │  both pass the "in stock" check
                                              │  both decrement → quantity = -1
                                              ▼
                            double-dispense: two customers charged, one item in the slot
```

This is the exact same class of bug as the classic "two people booking the last parking spot / last seat" — a **check-then-act** race on shared state, unguarded.

**Guards, cheapest → strongest:** ① **atomic conditional decrement at the DB layer** — `UPDATE inventory SET qty = qty - 1 WHERE machine_id=? AND code=? AND qty > 0`, check `rowsAffected`; no lock held, usually enough. ② **optimistic locking** — version column, retry on conflict, good for low contention. ③ **distributed lock per (machineId, code)** (Redis `SETNX`/Redlock) if select→pay→dispense spans multiple services and needs shared state held across them. ④ **idempotency key** on the purchase request so a client retry (timeout, not a real double-click) doesn't double-charge even after the decrement already succeeded.

The **state machine's transition logic doesn't change** — `HasMoneyState.insertMoney()` reads the same either way. What changes is that `Inventory.decrement()` stops being a naive read-then-write and becomes one atomic, conditional operation. Lead with: *"the State pattern handles the legal-sequence problem; concurrency is a separate problem solved at the data layer, not by adding locks inside the state classes."*

---

<a name="extensibility"></a>
# 7. Extensibility *(Framework step 9 — "now add X" without a rewrite)*

## "Now add a maintenance / out-of-order state"

Write `MaintenanceState extends VendingMachineState`, override the four methods to reject with "under maintenance" (plus maybe an admin-only `exitMaintenance()` outside the customer-facing interface). Add one transition into it, triggered by an operator action or fault signal (coin jam, empty change reservoir). **No existing state class changes** — confirming section 4's claim concretely, not just asserting it.

## "Now support multiple payment methods (card + cash)"

Two shapes, worth naming both:
- **If it's purely "how does money arrive"** — a `PaymentMethod` interface (`CashPayment`, `CardPayment`) with `charge(amount)`, and `HasMoneyState` depends on `PaymentMethod` instead of raw `Coin`. This is **Strategy** sitting alongside State — swapping cash for card is constructor injection, not a new state.
- **If card payment has its own lifecycle** (auth hold → capture → possible decline, unlike cash which just counts coins) — that decline path is a genuinely new *transition*: add a `PaymentProcessingState` between `HasMoneyState` and `DispensingState` that only the card flow routes through. **Strategy picks which payment path runs, State models the extra states that path introduces.**

Either way `IdleState`, `DispensingState`, `OutOfStockState` are untouched — additive and localized is the litmus test for using State correctly.

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: "Why not just use a `switch` on a status string — isn't that simpler for something this small?"
> *"For a 4-state toy version, sure. But the interview is testing whether I know when that stops scaling — every new state means revisiting every switch and re-auditing every existing branch, which is exactly what Open/Closed says to avoid. State turns 'add a state' into 'add a class,' with zero edits to code that already ships."*

### Q: "Walk me through what happens when I insert a coin that overpays."
> *"`insertMoney` is only legal from `HasMoneyState`. It adds the coin's value to balance, and once balance ≥ price it transitions into `DispensingState` and calls `dispense()`, which decrements inventory, computes `balance - price` as change, resets, and ejects item plus change. The overpay amount never needs special-casing — it falls out of `balance - price` naturally."*

### Q: "What happens if I select an out-of-stock item?"
> *"`IdleState.selectItem` checks inventory first — zero quantity routes to `OutOfStockState` instead of `HasMoneyState`. From there `insertMoney`/`dispense` are illegal — the base class throws — so a customer can't pay into a dead selection. They can `refund()` or pick a different item, which routes back through `Idle`."*

### Q: "How do you keep the customer from losing money if they cancel mid-payment?"
> *"`refund()` is legal from `HasMoneyState` and `OutOfStockState` — anywhere money can be sitting unclaimed. It's deliberately *not* legal from `DispensingState`, because by the time you're there the transaction has already cleared — that state resolves to completion, not cancellation, in the same tick it's entered."*

### Q: "Is a vending machine single-threaded in practice? Why does concurrency even come up here?"
> *"The physical machine, yes — one keypad serializes everything. But interviewers reframe this as a fleet-management backend on purpose: two concurrent purchase calls both reading 'quantity: 1', both passing the check, both decrementing, is the same check-then-act race as double-booking the last seat. I'd fix it at the data layer with an atomic conditional decrement, not locks inside the state classes — the state machine and the concurrency guard are separate concerns."*

### Q: "How would you add a maintenance mode without breaking existing behavior?"
> *"One new class, `MaintenanceState`, implementing the same four-method interface, each rejecting with 'under maintenance.' One new transition into it. `IdleState`, `HasMoneyState`, `DispensingState`, `OutOfStockState` don't change at all — the concrete proof that State is paying for itself here rather than being decorative."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

- **Core pattern:** State — `VendingMachineState` interface, one class per state (`Idle`, `HasMoney`, `Dispensing`, `OutOfStock`), `VendingMachine` delegates via `this.currentState`, never branches on state itself.
- **Why State over if/else:** adding a state = one new class, zero edits to existing states (Open/Closed). If/else version means touching every method for every new state.
- **Legal transitions:** `Idle --selectItem(in stock)--> HasMoney --insertMoney(enough)--> Dispensing --dispense()--> Idle`. Branches: `Idle --selectItem(out of stock)--> OutOfStock`, `HasMoney/OutOfStock --refund()--> Idle`.
- **Singleton:** legitimate for one physical machine's process-lifetime instance; wrong for a fleet — that's one object per machine ID, not "one instance total."
- **Concurrency:** physical machine self-serializes via hardware; a shared backend API needs an atomic conditional decrement (`qty > 0` guard in the `UPDATE`) to prevent double-dispense — same check-then-act race as double-booking a seat.
- **Extensibility litmus test:** "now add X" should mean *add a class*, not *edit N existing methods*. Maintenance mode = new state class. Card payment with its own decline lifecycle = new state + Strategy for choosing the payment path; plain multi-tender = Strategy alone.
- **Refund is legal from:** `HasMoney`, `OutOfStock` (anywhere money can be sitting unclaimed). **Not legal from:** `Dispensing` (transaction already cleared) or `Idle` (nothing to refund).

*— LLD Problem 05 complete —*
