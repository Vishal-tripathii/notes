# Dart Study Notes — Part 14

## Extension Methods & Operator Overloading ⭐⭐⭐☆☆

**Topics:** extension methods · extension scoping · operator overloading (`+`, `==`/`hashCode`) · callable classes.

---

## 1. Extension Methods

> **Definition:** an `extension` adds new methods/getters to an **existing type you don't own** — including built-in types like `String`/`int`/`List` — without subclassing it or modifying its source, resolved entirely at **compile time** (static dispatch), not a real runtime addition to the type itself.

```dart
extension StringExtensions on String {
  String capitalize() => isEmpty ? this : '${this[0].toUpperCase()}${substring(1)}';
  bool get isValidEmail => contains('@') && contains('.');
}

print('hello'.capitalize());     // 'Hello' — reads exactly like a real built-in String method
print('v@example.com'.isValidEmail); // true
```
**What an extension method actually compiles to:** it is **not** a real method added to `String` itself — there's no runtime modification of the `String` class. `'hello'.capitalize()` compiles to something closer to `StringExtensions(‘hello’).capitalize()` — a static function call resolved by the compiler based on the **static type** of the receiver at the call site. This is why extension methods can't be called via `dynamic` dispatch or reflection the way a real instance method can, and why two extensions on the same type with a same-named method require an explicit disambiguation if both are imported into the same scope.

## 2. Extension Scoping & Import-Based Visibility

> **Definition:** an extension is only usable in code where it's been imported — it's not globally attached to the type everywhere in the program, which is a deliberate namespacing safeguard against extension-method naming collisions across unrelated packages.

```dart
// in string_extensions.dart
extension StringExtensions on String {
  String shout() => '${toUpperCase()}!';
}

// in another file that does NOT import string_extensions.dart:
// 'hello'.shout(); // compile-time error — 'shout' isn't visible here, extension not imported
```

## 3. Operator Overloading

> **Definition:** Dart lets a class define custom behavior for operators (`+`, `-`, `==`, `[]`, etc.) via `operator` method declarations, so instances of that class can be combined/compared using natural operator syntax instead of a named method call.

```dart
class Vector {
  final double x, y;
  const Vector(this.x, this.y);

  Vector operator +(Vector other) => Vector(x + other.x, y + other.y);
  Vector operator *(double scalar) => Vector(x * scalar, y * scalar);

  @override
  bool operator ==(Object other) =>                    // overriding == — see the hashCode obligation below
      other is Vector && other.x == x && other.y == y;
  @override
  int get hashCode => Object.hash(x, y);                  // MUST be overridden alongside ==
}

final v1 = Vector(1, 2), v2 = Vector(3, 4);
print(v1 + v2);          // Vector(4, 6) — via operator+
print(v1 == Vector(1, 2)); // true — via the overridden ==, structural equality now, not identity
```
**Why overriding `==` without also overriding `hashCode` is a real bug, not just a lint nag:** `Set` and `Map` use `hashCode` to bucket objects internally, and their contract requires that **equal objects (per `==`) must have equal `hashCode`s**. If you override `==` to mean "same x and y" but leave the default identity-based `hashCode`, two structurally-equal `Vector` instances can end up in different hash buckets — a `Set<Vector>` might then contain what looks like a duplicate (two `==`-equal vectors both present), and `map[vectorInstance]` lookups can fail to find an entry that's genuinely there by `==`, because the lookup hashes to the wrong bucket first.

## 4. Callable Classes

> **Definition:** a class implementing a `call(...)` method can have its **instances invoked directly like a function**, `instance(args)`, letting an object behave as a function while still carrying state/behavior a plain function closure can't.

```dart
class Multiplier {
  final int factor;
  Multiplier(this.factor);
  int call(int value) => value * factor; // makes instances of Multiplier directly callable
}

final triple = Multiplier(3);
print(triple(5)); // 15 — calling the INSTANCE directly, as if it were a function
```

---

## Interview Q&A

**Q: What does an extension method actually compile to — is it a real method on the type?**
> No — it's resolved at compile time based on the receiver's *static* type, effectively compiling to a static function call, not a genuine addition to the target type at runtime. That's why it can't be reached via `dynamic` dispatch or reflection, and why extension method resolution can be ambiguous (requiring explicit disambiguation) if two imported extensions on the same type both declare a method with the same name.

**Q: Why is overriding `==` without also overriding `hashCode` a real, concrete bug rather than just a style issue?**
> `Set` and `Map` rely on the contract that equal objects (per `==`) must produce equal `hashCode`s, since they use the hash to bucket objects for fast lookup. Override `==` alone and leave the default identity-based `hashCode`, and two objects that are `==`-equal can hash to different buckets — producing real bugs like a `Set` silently containing "duplicate" equal elements, or a `Map` lookup failing to find an entry that genuinely exists by `==`.

**Q: What's a callable class, and why would you use one over a plain function/closure?**
> A class with a `call()` method, letting its instances be invoked directly like a function while still carrying real state and other methods a plain closure can't cleanly hold — useful when you want function-call ergonomics at the use site but need the configurability, testability, or additional behavior a full object provides (e.g. a configurable transformer/validator passed around as if it were a simple function).

**Q: Predict:**
```dart
class Point {
  final int x, y;
  Point(this.x, this.y);
  @override
  bool operator ==(Object other) => other is Point && other.x == x && other.y == y;
  // note: hashCode NOT overridden
}
final set = <Point>{};
set.add(Point(1, 1));
set.add(Point(1, 1));
print(set.length);
```
> Likely `2`, not `1` — even though `Point(1,1) == Point(1,1)` is `true`, the `Set` uses the (unoverridden, identity-based) `hashCode` to bucket entries first, so the two structurally-equal-but-differently-hashed instances typically land in different buckets and both get added, silently violating the intended "no duplicates" behavior — exactly the bug the `==`/`hashCode` pairing rule exists to prevent.

---

## Follow-ups (challenge questions)

- *Failure mode:* a data model class overrides `==`/`hashCode` correctly based on an `id` field, but that `id` field is mutable and gets changed *after* the instance was already inserted into a `Set` — walk through why the object effectively "disappears" from the set's perspective (can no longer be found via `contains()`/`remove()`), even though it's still physically present in the underlying data structure.
- *Consistency:* two different packages both define an extension method named `.isValid` on `String`, and a file imports both — what happens when that file tries to call `'x'.isValid`, and what's the actual fix Dart provides for this ambiguity?

---

**Previous:** [Part 13 — Records](13-records.md) · **Next:** [Part 15 — Packages, pubspec.yaml & Tooling](15-packages-pubspec-and-tooling.md)
