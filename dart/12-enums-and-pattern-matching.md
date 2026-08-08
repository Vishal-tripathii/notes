# Dart Study Notes — Part 12

## Enums & Pattern Matching ⭐⭐⭐☆☆

**Topics:** basic enums · enhanced enums (fields/constructors/methods) · Dart 3 pattern matching (`switch` expressions, destructuring, guards) · exhaustiveness checking.

---

## 1. Basic Enums

> **Definition:** a fixed, closed set of named constant values of a distinct type.

```dart
enum Status { pending, active, completed }
final s = Status.active;
print(s);          // Status.active
print(s.name);        // 'active'
print(s.index);         // 1 — position in declaration order
```

## 2. Enhanced Enums (Dart 2.17+)

> **Definition:** unlike a basic enum (just named constants), an **enhanced enum** can declare fields, constructors, and methods — each enum value effectively becomes a fully-fledged const instance carrying real data and behavior, not just a label.

```dart
enum Planet {
  mercury(diameterKm: 4879, hasMoons: false),
  earth(diameterKm: 12742, hasMoons: true),
  jupiter(diameterKm: 139820, hasMoons: true);

  final int diameterKm;
  final bool hasMoons;
  const Planet({required this.diameterKm, required this.hasMoons}); // const constructor — required

  bool get isLarge => diameterKm > 10000; // real computed method/getter, not just a label
}

print(Planet.earth.diameterKm);  // 12742
print(Planet.jupiter.isLarge);     // true
```
**What an enhanced enum buys you over a plain one:** without it, associating data with an enum value required an external `Map<Status, SomeData>` maintained separately from the enum declaration itself — easy to forget to update when a new enum value is added. An enhanced enum keeps the data and the value declaration in exactly one place, and (combined with sealed-class-style exhaustiveness, §4) the compiler can even help catch a missing case.

## 3. Dart 3 Pattern Matching

> **Definition:** Dart 3 extended `switch` to support **pattern matching** — matching a value against a *shape* (a specific type, a destructured object's fields, a range, a combination) rather than only simple equality — and introduced `switch` **expressions** (`switch (x) { ... }` used as a value-producing expression, not just a statement).

```dart
// switch EXPRESSION — evaluates to a value directly, no `case`/`break` boilerplate
String describe(Object value) => switch (value) {
  int n when n < 0 => 'negative int',        // "when" is a GUARD clause — extra boolean condition
  int n when n == 0 => 'zero',
  int() => 'positive int',                     // matches ANY int (type pattern, ignoring the value)
  String s => 'a string: $s',                     // destructures — binds the matched value to `s`
  [int a, int b] => 'a two-element int list: $a, $b', // matches a List of exactly 2 ints, destructured
  _ => 'something else',                              // wildcard, catches anything unmatched above
};
```
**Guard clauses (`when`):** let a pattern match on shape/type *and* an additional boolean condition — `case int n when n < 0` only matches an `int` that's also negative, distinct from having two separate `case`s.

## 4. Exhaustiveness Checking

> **Definition:** when `switch`ing over a type with a known, closed set of possible values (an `enum`, or a `sealed class` hierarchy — [Part 04](04-inheritance-interfaces-and-abstract-classes.md#7-sealed-classes--exhaustive-switch)), the compiler verifies every possible case is handled — a missing case is a **compile-time error**, not a silent runtime gap.

```dart
enum Status { pending, active, completed }

String label(Status s) => switch (s) {
  Status.pending => 'Pending',
  Status.active => 'Active',
  Status.completed => 'Completed',
  // if a new Status value were added later and NOT handled here, this switch EXPRESSION
  // becomes a compile-time error: "not exhaustive" — caught immediately, not discovered
  // later at runtime by a user hitting the unhandled case
};
```

---

## Interview Q&A

**Q: What does an enhanced enum buy you over a plain one?**
> A plain enum is just a set of named labels — associating real data with each value requires a separate, manually-maintained lookup structure elsewhere in the code, which can drift out of sync when a new enum value is added. An enhanced enum lets each value carry its own fields and even computed methods/getters, declared once, directly alongside the value itself — there's no separate structure to forget to update.

**Q: How does pattern-matching exhaustiveness checking catch a missed case at compile time?**
> When switching over a type with a closed, known set of possible values — an enum or a sealed class hierarchy — the compiler can enumerate every possible case and verify the switch handles all of them. If a new case is added later (a new enum value, a new sealed subclass) and an existing switch expression doesn't handle it, that switch becomes a compile error immediately, rather than silently falling through to nothing or throwing at runtime the first time a user actually triggers that unhandled value.

**Q: What does a `when` guard clause add to a pattern match that a plain type/shape pattern alone can't express?**
> It adds an arbitrary boolean condition evaluated *after* the shape/type match succeeds — letting one case distinguish, for example, a negative `int` from a non-negative one, without needing two entirely separate case branches or an `if` nested inside the matched branch's body.

**Q: Predict:**
```dart
Object value = [1, 2];
final result = switch (value) {
  [int a] => 'one: $a',
  [int a, int b] => 'two: $a, $b',
  [int a, int b, ...] => 'three or more, starting: $a, $b',
  _ => 'not a list of ints',
};
print(result);
```
> `'two: 1, 2'` — the list pattern `[int a, int b]` matches a `List` of exactly two elements, both destructured and bound; Dart evaluates cases top-to-bottom and this is the first (and only) matching pattern for a 2-element list.

---

## Follow-ups (challenge questions)

- *Consistency:* a `sealed class` hierarchy models API response states (`Loading`, `Success`, `Failure`) and is switched over exhaustively in 15 different places across a large app — a new `Cancelled` state is added. Walk through the actual experience of fixing this: does the compiler guide you precisely to every site that needs updating, and why is that meaningfully better than a runtime `if`/`else if` chain missing the new case silently?
- *Failure mode:* a pattern match on a `Map<String, dynamic>` (e.g. parsed JSON) destructures expected keys directly (`{'name': String name, 'age': int age}`) — what happens at that match point if the actual JSON is missing the `age` key entirely, or has it as a `String` instead of an `int`?

---

**Previous:** [Part 11 — Isolates & Concurrency](11-isolates-and-concurrency.md) · **Next:** [Part 13 — Records](13-records.md)
