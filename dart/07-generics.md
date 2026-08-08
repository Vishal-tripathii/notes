# Dart Study Notes — Part 07

## Generics ⭐⭐⭐⭐☆

**Topics:** generic classes and methods · bounded type parameters · generic type inference · why collections are generic by default · covariance basics.

---

## 1. Generic Classes and Methods

> **Definition:** a generic type/method is parameterized over a type placeholder (conventionally `T`, `E`, `K`/`V`), letting the same code work uniformly across many concrete types while the compiler still enforces type safety for whichever specific type is actually used.

```dart
class Box<T> {
  final T value;
  Box(this.value);
  T unwrap() => value;
}
final intBox = Box<int>(5);
final stringBox = Box<String>('hello');
// intBox.unwrap() is statically known to be an int, stringBox.unwrap() a String —
// ONE class definition, type safety preserved for each concrete instantiation

T firstOrDefault<T>(List<T> list, T defaultValue) {
  return list.isEmpty ? defaultValue : list.first;
}
firstOrDefault<int>([1, 2, 3], 0); // 1 — generic method, T inferred as int
```

## 2. Bounded Type Parameters

> **Definition:** `<T extends SomeType>` restricts a generic's type parameter to `SomeType` or one of its subtypes, letting the generic code call methods/operators that `SomeType` guarantees exist, which an unbounded `<T>` couldn't safely assume.

```dart
T findMax<T extends Comparable<T>>(List<T> items) { // T must be Comparable — so .compareTo() is safe
  var max = items.first;
  for (final item in items.skip(1)) {
    if (item.compareTo(max) > 0) max = item; // .compareTo() wouldn't compile without the bound
  }
  return max;
}
findMax<int>([3, 1, 4, 1, 5]); // 5 — int implements Comparable<int>
```

## 3. Generic Type Inference

```dart
final box = Box('hello'); // Box<String> — T inferred from the constructor argument, no <String> needed
final list = <int>[];      // explicit here since there's no argument to infer from
```

## 4. Why Collections Are Generic by Default

> **Definition:** a "raw" (non-generic, effectively `List<dynamic>`) collection loses all compile-time element-type checking — every read requires an unsafe cast, and a wrong-typed element inserted anywhere in the collection only surfaces as a runtime crash wherever it's later used incorrectly, not at the point it was actually inserted.

```dart
List<dynamic> raw = [];
raw.add(5);
raw.add('oops'); // compiles fine — raw has NO element type constraint

List<int> typed = [];
typed.add(5);
// typed.add('oops'); // compile-time error — caught IMMEDIATELY, at the point of the mistake,
                          // not later when something tries to treat 'oops' as an int
```
**Why this matters concretely:** a bug caught at the exact line that introduced it (compile time, `List<int>`) is dramatically cheaper to fix than the same bug surfacing as a runtime `TypeError` somewhere far downstream, in code that has no idea the wrong-typed element was ever inserted (a raw/`dynamic` list) — the same underlying argument as [Part 00's `dynamic` vs typed discussion](00-dart-fundamentals.md#4-dynamic-vs-object-vs-var).

## 5. Covariance Basics

> **Definition:** Dart generics are **covariant** by default — `List<Cat>` is considered a subtype of `List<Animal>` if `Cat` is a subtype of `Animal`, meaning a `List<Cat>` can be assigned where a `List<Animal>` is expected. This is convenient for *reading* but unsound for *writing*, which Dart handles with a runtime check rather than disallowing it outright.

```dart
class Animal {}
class Cat extends Animal {}
class Dog extends Animal {}

List<Cat> cats = [Cat()];
List<Animal> animals = cats;    // ALLOWED — covariance: List<Cat> assignable to List<Animal>
animals.add(Dog());              // compiles fine (Dog IS an Animal)... but throws at RUNTIME:
                                    // a Dog doesn't belong in what's actually a List<Cat> underneath
```
**Why this is a real, if uncommon, gotcha:** `animals` is statically typed as `List<Animal>`, so adding a `Dog` type-checks fine at compile time. But `animals` and `cats` are the *same underlying list object* — actually a `List<Cat>` at runtime — so inserting a `Dog` into it violates the list's real, concrete element type and throws a runtime `TypeError`. This is a deliberate, documented trade-off (unsound covariance, checked at runtime) rather than a bug, made for practical ergonomics around read-heavy generic collection usage.

---

## Interview Q&A

**Q: Why do generics exist beyond "type safety" as a buzzword — what breaks at runtime with a raw, untyped collection that a generic one prevents at compile time?**
> A raw/`dynamic` collection accepts a wrong-typed element with no error at the point of insertion — the mistake only surfaces later, as a runtime crash, wherever code eventually tries to use that element assuming the "expected" type, often far from where the actual bug was introduced. A properly generic, typed collection (`List<int>`) rejects the wrong-typed element immediately at compile time, at the exact line responsible, which is categorically cheaper to diagnose and fix.

**Q: What does a bounded type parameter (`<T extends Comparable<T>>`) actually buy you?**
> It restricts what concrete types can be used for `T` to ones guaranteed to support a specific capability — here, `.compareTo()`. Without the bound, generic code couldn't safely call any method on a `T` value beyond what `Object` itself guarantees, since the compiler has no information about what `T` will actually be at any given call site.

**Q: Walk through why `List<Cat>` can be assigned to a `List<Animal>` variable, and why that's not fully sound.**
> Dart generics are covariant by default, so a `List<Cat>` is treated as a subtype of `List<Animal>` for assignment purposes, since every `Cat` is-an `Animal`. It's convenient for reading (any element you pull out really is an `Animal`), but unsound for writing — the compiler will happily let you `.add(Dog())` to what's statically typed as `List<Animal>`, even though the actual underlying list is a `List<Cat>`, and that specific insertion throws a runtime `TypeError` because a `Dog` genuinely doesn't belong in the real, concrete collection underneath.

**Q: Predict:**
```dart
List<int> numbers = [1, 2, 3];
List<num> asNum = numbers;
asNum.add(3.14);
print(numbers);
```
> Throws a runtime `TypeError` at the `.add(3.14)` line — `numbers` is actually a `List<int>` underneath despite `asNum`'s static type being `List<num>` (covariance allows the assignment), and `3.14` (a `double`) doesn't belong in the real, concrete `List<int>`.

---

## Follow-ups (challenge questions)

- *Failure mode:* a function accepts a `List<Object>` parameter specifically so callers can pass any `List<T>` via covariance, then the function internally does `list.add(SomeSpecificType())` — under what caller-supplied list types does this compile fine but throw at runtime, and how would you redesign the function signature to make that impossible rather than just unlikely?
- *Consistency:* a generic repository class `Repository<T>` is used across a codebase for several different model types — what's the actual argument for making it generic over one repository class instead of writing `UserRepository`, `ProductRepository`, etc. by hand, and where does the generic version start to strain (e.g. type-specific query logic)?

---

**Previous:** [Part 06 — Collections](06-collections.md) · **Next:** [Part 08 — Exception Handling](08-exception-handling.md)
