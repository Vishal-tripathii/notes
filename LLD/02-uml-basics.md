# LLD Study Notes — Part 02 — UML Basics

> **Purpose:** just enough UML to *communicate* a design fast in an interview — class boxes, the four relationship arrows, and sequence diagrams for tricky flows. Not a full UML spec course.
>
> **Continues from:** Part 00 (OOP) and Part 01 (SOLID) — UML is just the *notation* for drawing the has-a/is-a decisions those parts taught you to make. **Feeds into:** every problem in `LLD/Problems/` — Part 04 (the framework) has you draw this at Step 5, before any code.

---

## Table of Contents

1. [Class diagram notation](#class-box)
2. [The four relationships](#relationships)
3. [Sequence diagrams](#sequence)
4. [How much UML to actually draw in an interview](#pragmatic)
5. [Interview Q&A](#interview)
6. [Cheat Sheet](#cheatsheet)

---

<a name="class-box"></a>
# 1. Class diagram notation

A class box has **three compartments**: name on top, fields in the middle, methods at the bottom.

```
┌───────────────────────────────┐
│              Car               │   ← class name
├───────────────────────────────┤
│ - engine: Engine                │   ← fields (state)
│ - driver: Driver                │
│ - fuelLevel: number              │
├───────────────────────────────┤
│ + start(): void                   │   ← methods (behavior)
│ + stop(): void                    │
│ - checkFuel(): boolean            │
└───────────────────────────────┘
```

**Visibility marks** (prefix on every field/method):

| Mark | Meaning |
|---|---|
| `+` | public — anyone can call it |
| `-` | private — only this class |
| `#` | protected — this class + subclasses |
| `~` | package/internal (rarely used in interviews) |

That's it. You don't need stereotypes, tagged values, or interface `<<interface>>` decorations unless you want the extra clarity — a plain box with `+ methodName(): ReturnType` communicates 95% of what an interviewer needs.

---

<a name="relationships"></a>
# 2. The four relationships

The whole point of a class diagram is showing **how classes are connected** — and there are exactly four connection types worth knowing cold.

## Association — "knows about"
The weakest relationship: one class holds a reference to another, no ownership, no lifecycle coupling.

```
┌───────────┐                ┌───────────────┐
│    Car    │───────────────▶│  ParkingSpot  │
└───────────┘   association  └───────────────┘
```
*Car knows about a ParkingSpot (e.g. it was passed a reference to park itself), but neither owns the other. Delete the Car and the ParkingSpot is completely unaffected.*

## Aggregation — "has-a, but survives independently" (hollow diamond ◇)
A **whole-part** relationship where the part can exist without the whole, and can even be shared or moved to a different whole.

```
┌───────────┐                ┌───────────┐
│    Car    │◇──────────────▶│  Driver   │
└───────────┘   aggregation  └───────────┘
   (hollow diamond at the "Car" end)
```
*A Car has-a Driver, but the Driver existed before getting in the car and keeps existing after getting out — could drive a different Car tomorrow. The Driver's lifecycle is independent of the Car's.*

## Composition — "has-a, and dies with it" (filled diamond ◆)
A **stronger whole-part** relationship: the part's lifecycle is *owned* by the whole. Destroy the whole, the part goes with it.

```
┌───────────┐                ┌───────────┐
│    Car    │◆──────────────▶│  Engine   │
└───────────┘   composition  └───────────┘
   (filled diamond at the "Car" end)
```
*A Car has-a Engine, and that specific Engine object is created when the Car is created (usually in the constructor) and destroyed when the Car is destroyed. It doesn't get reused in another Car.*

## Inheritance — "is-a" (hollow triangle △, points at the parent)
The subclass **is a kind of** the parent — shares its interface and can be used anywhere the parent is expected (Liskov Substitution, Part 01).

```
┌───────────┐
│  Vehicle  │
└─────△─────┘
      │           inheritance (is-a)
┌───────────┐
│    Car    │
└───────────┘
```
*Car is-a Vehicle. The triangle always points UP at the more general/parent class, regardless of which end you started drawing from.*

## Side-by-side (the memory trick)

| Relationship | Arrow | Question it answers | Example | Lifecycle |
|---|---|---|---|---|
| **Association** | plain arrow `───▶` | "knows about" | Car → ParkingSpot | independent |
| **Aggregation** | hollow diamond `◇──▶` | "has-a, but loosely" | Car ◇ Driver | part outlives whole |
| **Composition** | filled diamond `◆──▶` | "has-a, tightly" | Car ◆ Engine | part dies with whole |
| **Inheritance** | hollow triangle `△` | "is-a" | Car △ Vehicle | subclass shares parent's contract |

**Multiplicity** goes on the ends of the line when it matters: `1`, `0..1`, `1..*`, `*`. e.g. `ParkingLot 1 ──── * Floor` (one lot has many floors). Only bother writing it when the number actually affects the design (a `Floor` belonging to exactly one `ParkingLot` vs. potentially shared is a real decision — draw it).

---

<a name="sequence"></a>
# 3. Sequence diagrams

A class diagram shows **structure** (what exists and how it's connected). A sequence diagram shows **behavior over time** — the order calls happen in, across objects, for ONE specific flow.

Each participant gets a vertical "lifeline"; a **solid arrow** is a synchronous call, a **dashed arrow** is the return, and a small self-loop is internal processing.

## Example: login flow

```
 User          LoginController        AuthService         UserRepository
  │                   │                     │                    │
  │  submit(u, p)     │                     │                    │
  │──────────────────▶│                     │                    │
  │                   │  authenticate(u,p)  │                    │
  │                   │────────────────────▶│                    │
  │                   │                     │ findByUsername(u)  │
  │                   │                     │───────────────────▶│
  │                   │                     │   User{hash}       │
  │                   │                     │◀───────────────────│
  │                   │                     │ compare(p, hash)   │
  │                   │                     │─┐                  │
  │                   │                     │◀┘ (internal)       │
  │                   │  AuthResult(token)  │                    │
  │                   │◀────────────────────│                    │
  │  200 {token}      │                     │                    │
  │◀──────────────────│                     │                    │
```

Reading it: `User` calls `LoginController.submit()`, which delegates to `AuthService.authenticate()`, which calls out to `UserRepository.findByUsername()`, gets a `User` back, does an internal password comparison, and the result flows back up the same chain as returns (dashed arrows).

**When a sequence diagram earns its place:** any flow that crosses 3+ objects with an order that matters — login, checkout, seat-booking-with-lock, elevator-dispatch. Skip it for a single `getX()` call; it's not worth drawing.

---

<a name="pragmatic"></a>
# 4. How much UML to actually draw in a 35–40 min interview

**None of this is a spec you're graded against.** In a real LLD interview:

- ✅ Draw **boxes with class names + method signatures** (`+ parkVehicle(v: Vehicle): Ticket`) — this alone tells the interviewer your interfaces are thought through.
- ✅ Draw **arrows** between boxes to show has-a/is-a — even without formal diamond/triangle notation, just labeling the line ("composition", "is-a") communicates the same intent.
- ✅ Draw **one sequence diagram only if there's a genuinely tricky multi-object flow** (e.g. seat booking + payment + lock release) — it's the fastest way to expose a concurrency bug to yourself before you code it.
- ❌ Don't hand-draw exact hollow-vs-filled diamonds under time pressure — say the word ("this is composition, the Spot doesn't outlive the Floor") instead of perfecting the glyph.
- ❌ Don't diagram getters/setters, don't add UML stereotypes (`<<interface>>`, `<<abstract>>`) unless asked, don't spend more than ~3–5 minutes total on diagrams — the code is where the real signal is.

**The rule of thumb:** UML in an interview is a **thinking tool for you**, not a deliverable for the interviewer. If a box-and-arrow sketch stops you from writing a class that has to be rewritten five minutes later, it did its job.

---

<a name="interview"></a>
# 5. Interview Q&A

### Q: "What's the difference between aggregation and composition?"
> *"Both are has-a relationships, but the difference is lifecycle ownership. In composition, the part cannot exist without the whole — like a Car and its Engine — if you destroy the Car, that Engine object goes with it, usually because the Car's constructor creates it. In aggregation, the part has an independent lifecycle — like a Car and its Driver — the Driver existed before getting into the car and keeps existing, potentially driving a different car later. UML draws composition with a filled diamond and aggregation with a hollow diamond, both on the 'whole' end of the line."*

### Q: "When would you actually draw a sequence diagram in an interview?"
> *"When a flow crosses several objects and the ORDER of calls is the interesting part — not just what exists, but what happens first. Seat booking is a good example: you lock the seat, then process payment, then confirm or release the lock on timeout — a sequence diagram exposes exactly where a race condition could sneak in, which a class diagram won't show you. For a single getter or a simple CRUD call, it's overkill — I'd only reach for it when the interaction itself is the hard part of the problem."*

### Q: "Is inheritance a 'has-a' or 'is-a' relationship?"
> *"Is-a. Car is-a Vehicle means Car inherits Vehicle's interface and can be used anywhere a Vehicle is expected — that's Liskov Substitution. Has-a relationships (aggregation, composition) mean one class holds a reference to another as a field; is-a means one class extends another's contract. Mixing them up is a common design smell — e.g. modeling 'Car has-a Engine' as inheritance would be wrong, because a Car isn't a kind of Engine."*

### Q: "How much UML should you actually draw in a machine-coding round?"
> *"Lightweight. I draw boxes with the class name and key method signatures, and arrows labeled with the relationship — composition, aggregation, is-a — but I don't fuss over exact diamond/triangle glyphs under time pressure; saying it out loud is enough. I'll only draw a full sequence diagram if there's a genuinely tricky multi-object flow, like a booking-with-lock scenario. The diagram is a thinking tool to catch design mistakes before I code, not a deliverable to be graded on its own."*

---

<a name="cheatsheet"></a>
# 6. Cheat Sheet

### Class box
```
┌─────────────┐
│  ClassName   │
├─────────────┤
│ - field: T    │   + public  - private  # protected  ~ package
├─────────────┤
│ + method(): T │
└─────────────┘
```

### Relationships
| Type | Notation | Meaning | Example |
|---|---|---|---|
| Association | `A ───▶ B` | knows about | Car → ParkingSpot |
| Aggregation | `A ◇──▶ B` (hollow diamond) | has-a, part outlives whole | Car ◇ Driver |
| Composition | `A ◆──▶ B` (filled diamond) | has-a, part dies with whole | Car ◆ Engine |
| Inheritance | `△` (hollow triangle → parent) | is-a | Car △ Vehicle |

### Sequence diagram
- Solid arrow `──▶` = synchronous call. Dashed arrow `◀┄┄` = return.
- Self-loop = internal processing on that object.
- Draw it only for multi-object flows where **order** matters (booking, checkout, dispatch).

### Interview rule
Boxes + labeled arrows + method signatures. Skip formal glyph precision, skip stereotypes, spend ≤5 min on diagrams total — the code is the real signal.

### Connects to
Part 00 (OOP: is-a vs has-a) · Part 01 (SOLID: Liskov = safe is-a) · Part 04 (the framework: Step 5 is "draw this before coding") · every `LLD/Problems/` file.

*— End of Part 02 —*
