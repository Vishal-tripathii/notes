# Dart Study Notes — Part 06

## Collections ⭐⭐⭐⭐⭐

**Topics:** `List`/`Set`/`Map` · collection-if/collection-for · spread · `Iterable` and laziness · common methods · `List.generate` · unmodifiable collections.

---

## 1. `List`, `Set`, `Map` — Literals

> **Definition:** `List<T>` is an ordered, index-accessible, duplicate-allowing collection. `Set<T>` is an **unordered**, duplicate-**free** collection (membership tested via `==`/`hashCode`). `Map<K, V>` is a key-value store (unordered by default, though `LinkedHashMap`, Dart's default `Map` implementation, actually preserves insertion order in practice).

```dart
List<int> nums = [1, 2, 3];
Set<int> unique = {1, 2, 2, 3};   // {1, 2, 3} — duplicate silently dropped, same as JS Set
Map<String, int> ages = {'V': 30, 'A': 25};

var growable = <int>[1, 2, 3];       // growable by default
var fixedLength = List.filled(3, 0);   // [0, 0, 0] — FIXED length, .add() throws
```

## 2. Collection-If / Collection-For

> **Definition:** Dart allows `if`/`for` directly **inside a collection literal**, conditionally or repeatedly including elements without a separate imperative loop building the collection up.

```dart
final showDiscount = true;
final items = [
  'apple',
  'banana',
  if (showDiscount) 'discount-coupon', // included only if the condition is true
  for (var i = 0; i < 3; i++) 'item$i', // 'item0', 'item1', 'item2' generated inline
];
```

## 3. Spread (`...`) & Null-Aware Spread (`...?`)

> **Definition:** `...` expands another collection's elements directly into a new collection literal, the same [expansion semantics as JS spread](../javascript/07-destructuring-and-spread-rest.md#5-spread-literals-vs-rest-parameters). `...?` does the same, but safely no-ops if the spread source is `null` instead of throwing.

```dart
final a = [1, 2, 3];
final b = [0, ...a, 4]; // [0, 1, 2, 3, 4]

List<int>? maybeNull;
final c = [...?maybeNull, 5]; // [5] — null-aware spread skips a null source cleanly
```

## 4. `Iterable` and Laziness

> **Definition:** `Iterable<T>` is the interface `List`/`Set` (and the return type of methods like `.map()`/`.where()`) implement — representing a sequence that can be walked **once**, front to back. Critically, methods like `.map()` and `.where()` on an `Iterable` are **lazy** — they don't actually run until the sequence is iterated (via a `for`, `.toList()`, `.first`, etc.).

```dart
final nums = [1, 2, 3, 4, 5];
final mapped = nums.map((n) {
  print('mapping $n');    // won't print YET
  return n * 2;
});
print('created the mapped iterable, nothing ran yet');
final result = mapped.toList(); // THIS is what actually triggers evaluation, printing all 5 lines
```
**`Iterable` vs `List`, precisely — laziness and when a `.map().where()` chain actually executes:** a `List` is a concrete, fully-realized, in-memory collection; an `Iterable` returned by `.map()`/`.where()` is a lazy *description* of a transformation, not yet-computed data. Chaining `.map().where().map()` builds up a pipeline of lazy transformations with **zero actual work done** until something forces evaluation — calling `.toList()`, iterating with `for...in`, or accessing `.first`. This matters for performance: a long lazy chain terminated early (e.g. `.firstWhere(...)`) never processes elements past the match, unlike an eagerly-materialized intermediate `List` at every step.

## 5. Common Methods — Lazy vs Eager

> **Definition:** `.map()`, `.where()`, `.expand()`, `.take()`, `.skip()` are **lazy** (return an `Iterable`, deferred). `.fold()`, `.reduce()`, `.toList()`, `.toSet()`, `.forEach()`, `.firstWhere()` are **eager** — they force the whole (or partial, for `firstWhere`) chain to actually run immediately.

```dart
// fold — always requires an initial value (unlike reduce)
final sum = [1, 2, 3].fold<int>(0, (acc, n) => acc + n); // 6

// reduce — no initial value, uses the first element as the seed
final max = [3, 1, 4, 1, 5].reduce((a, b) => a > b ? a : b); // 5
// [].reduce((a, b) => a + b);  // throws StateError: No element — same empty-collection trap as
                                   // JS's reduce without an initial value, Part 05 in the JS track
```
**`fold` vs `reduce`:** `fold` always takes an explicit initial value and can even change the accumulator's *type* from the collection's element type (e.g. folding a `List<String>` into an `int` character count). `reduce` uses the first element as the seed and the accumulator type must match the element type — and, same as JS, `reduce` throws on an empty collection with no initial value to fall back on.

## 6. `List.generate`

> **Definition:** `List.generate(length, generator)` builds a `List` by calling a generator function once per index, `0` through `length - 1` — a declarative alternative to a manual loop with `.add()`.

```dart
final squares = List.generate(5, (i) => i * i); // [0, 1, 4, 9, 16]
```

## 7. Unmodifiable Collections

> **Definition:** `List.unmodifiable(...)` (and the `UnmodifiableListView` wrapper) produce a collection that throws at runtime on any mutation attempt — the mutable-collection analogue of exposing a defensive, read-only view instead of the real backing collection.

```dart
final readOnly = List.unmodifiable([1, 2, 3]);
// readOnly.add(4); // throws: Unsupported operation: Cannot add to an unmodifiable list
```

---

## Interview Q&A

**Q: `Iterable` vs `List`, precisely?**
> `List` is a concrete, fully materialized, in-memory ordered collection. `Iterable` is the more general interface both `List` and lazy transformation chains (`.map()`, `.where()`) implement — a lazy `Iterable` describes a pending transformation that hasn't run yet, and only executes when something actually forces evaluation, like `.toList()` or a `for...in` loop. A chain of `.map().where()` builds up description, not computed data, until that forcing point.

**Q: `fold` vs `reduce`?**
> Both combine a collection into a single accumulated value. `fold` always requires an explicit initial value and its accumulator can even be a different type than the collection's elements. `reduce` has no initial-value parameter — it uses the collection's first element as the seed, so the accumulator type must match the element type, and it throws `StateError` on an empty collection with nothing to seed from, mirroring the exact same trap as JS's `Array.prototype.reduce` without an initial value.

**Q: Why does laziness in `.map()`/`.where()` matter for real performance, not just as a trivia fact?**
> A lazy chain only actually processes elements when evaluation is forced, and if that forcing point is something like `.firstWhere()`, processing can stop the moment a match is found — elements past that point in the source collection are never even touched. An eagerly-materialized intermediate `List` at every chained step, by contrast, always processes every element at every stage regardless of whether a later step would have short-circuited.

**Q: Predict:**
```dart
final list = [1, 2, 3];
final iterable = list.map((n) => n * 2);
list.add(4);
print(iterable.toList());
```
> `[2, 4, 6, 8]` — because `.map()` is lazy and doesn't evaluate until `.toList()` is called, it operates on the list's state *at evaluation time*, which now includes the `4` added after the `.map()` call was made — a real gotcha if you assume laziness means "captured a snapshot" the way it might in an eagerly-evaluated language.

---

## Follow-ups (challenge questions)

- *Failure mode:* code holds onto a lazy `Iterable` derived from a mutable source `List` for an extended period, expecting a stable result each time it's iterated — walk through why that assumption is wrong, per the predict question above, and what the fix is (materializing via `.toList()` at the point you actually want a frozen snapshot).
- *Scale:* a data-processing pipeline chains `.where().map().where().map()` over a 10-million-element `List` before calling `.toList()` at the very end — does laziness here actually save memory compared to eagerly materializing a new `List` at every intermediate step? Reason through what's actually allocated at each stage.
- *Consistency:* a function returns `List.unmodifiable(_internalList)` to "protect" internal state, but a caller still holds a reference to the *original* `_internalList` from before it was wrapped — does the unmodifiable wrapper actually prevent the underlying data from changing?

---

**Previous:** [Part 05 — Mixins](05-mixins.md) · **Next:** [Part 07 — Generics](07-generics.md)
