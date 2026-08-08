# Dart Study Notes — Part 13

## Records ⭐⭐⭐☆☆

**Topics:** Dart 3 records — anonymous, immutable, structurally-typed aggregates · positional vs named fields · multiple return values · records vs a full class.

---

## 1. What a Record Is

> **Definition:** a record is an **anonymous**, **immutable**, **structurally-typed** aggregate of values — `(int, String)` groups an `int` and a `String` together without declaring a named class for it, and two records with the same shape are type-compatible even though neither was declared as implementing some shared interface (structural, not nominal, typing — a genuine departure from the rest of Dart's class-based type system).

```dart
(int, String) pair = (1, 'one');            // positional record — a 2-tuple
print(pair.$1); // 1                             // positional fields accessed via $1, $2, ...
print(pair.$2); // 'one'

({int id, String name}) user = (id: 1, name: 'V'); // named-field record
print(user.id);   // 1
print(user.name);   // 'V'
```

## 2. Positional vs Named Record Fields

> **Definition:** a record can mix positional fields (accessed via `$1`, `$2`, ...) and named fields (accessed by name, declared with `{}` in the type) — named fields make the record's shape self-documenting at the cost of slightly more verbose construction syntax.

```dart
(String, int, {bool isActive}) mixed = ('V', 30, isActive: true); // positional AND named combined
print(mixed.$1);         // 'V'
print(mixed.$2);         // 30
print(mixed.isActive);     // true
```

## 3. Multiple Return Values

> **Definition:** records let a function return more than one logically-related value without declaring a dedicated wrapper class purely for that purpose — the specific gap Dart 3 closed.

```dart
(double, double) minMax(List<double> values) {
  double min = values.first, max = values.first;
  for (final v in values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return (min, max); // returns BOTH values in one record, no throwaway class needed
}

final (lowest, highest) = minMax([3.2, 1.1, 5.5, 2.2]); // destructured directly at the call site
print('Min: $lowest, Max: $highest');
```
**What problem this solves that didn't have a clean answer before Dart 3:** the pre-record options were all worse — returning a `List`/`Map` (loses type safety on each element, awkward indexing), declaring a one-off class just to bundle two return values (real boilerplate for something conceptually trivial), or using an `out`-parameter-style mutable wrapper object (unidiomatic in Dart). Records give a genuinely lightweight, type-safe, throwaway-class-free answer.

## 4. Records vs a Full Class — When Each Is Right

| | Records | Classes |
|---|---|---|
| Identity | structural — same shape = same type | nominal — identity tied to the declared class name |
| Mutability | always immutable | can have mutable fields |
| Methods/behavior | none — pure data | can carry real behavior |
| Best for | quick, local groupings of values (function returns, temporary aggregation) | anything with real identity, behavior, or that's part of a public API's stable shape |

**The rule of thumb:** reach for a record for a lightweight, local, throwaway grouping — especially a function's return value used immediately by its caller. Reach for a real class once the data needs behavior, needs to be part of a stable, named, documented public API shape, or benefits from nominal typing (so two coincidentally-same-shaped-but-conceptually-different things can't be accidentally interchanged).

```dart
// good record use — local, throwaway, immediately destructured
(int, int) divmod(int a, int b) => (a ~/ b, a % b);

// should probably be a class instead — this is a real domain concept with likely-future behavior
class User {
  final String id;
  final String name;
  User(this.id, this.name);
  // ...would likely grow methods, validation, equality overrides, etc. over time
}
```

---

## Interview Q&A

**Q: What problem do records solve that Dart didn't have a clean answer for before Dart 3?**
> Returning multiple logically-related values from a function without declaring a dedicated wrapper class just for that purpose. Before records, the options were all compromises — a `List`/`Map` loses per-element type safety, and a one-off class for a single function's return shape is real boilerplate for something conceptually trivial. Records give a lightweight, type-safe, throwaway-class-free way to bundle values together.

**Q: What does "structurally typed" mean for records, and why is that a departure from the rest of Dart?**
> Two records are type-compatible if they have the same shape — same field types in the same positions/names — regardless of where or how they were constructed, with no shared declared type linking them. That's structural typing. The rest of Dart's type system is nominal — a `Dog` and a `Cat` with identical fields are still unrelated types unless one explicitly extends/implements the other. Records are Dart's one genuinely structural-typing feature.

**Q: When would you choose a record over a full class, and vice versa?**
> A record for something lightweight and local — especially a function's return value, immediately consumed and destructured by the caller, with no real behavior attached. A class once the data needs actual methods/behavior, needs to be a stable, documented part of a public API's shape, or benefits from nominal typing so structurally-similar-but-conceptually-different things can't be silently interchanged.

**Q: Predict:**
```dart
(int, String) a = (1, 'x');
(int, String) b = (1, 'x');
print(a == b);
class Point { final int x; Point(this.x); }
print(Point(1) == Point(1));
```
> `true`, then `false` — records have structural, value-based `==` by default (equal if every field is equal). A plain class has no custom `==` override, so it falls back to identity comparison — two separately-constructed `Point(1)` instances are unequal despite identical field values, unless the class explicitly overrides `==`/`hashCode` ([Part 14](14-extension-methods-and-operator-overloading.md#2-operator-overloading)).

---

## Follow-ups (challenge questions)

- *Consistency:* a function's return type evolves from `(String, int)` to `(String name, int age)` (adding field names) across a refactor — what breaks for existing callers destructuring the old positional form, and how does that compare to the impact of adding a new field to an existing class?
- *Scale:* a large codebase starts using deeply nested records (`(String, (int, int), List<(String, bool)>)`) as a lightweight alternative to defining several small classes — at what point does the lack of named types (records have no declared name to reference in error messages, documentation, or IDE navigation) start to hurt more than the boilerplate savings help?

---

**Previous:** [Part 12 — Enums & Pattern Matching](12-enums-and-pattern-matching.md) · **Next:** [Part 14 — Extension Methods & Operator Overloading](14-extension-methods-and-operator-overloading.md)
