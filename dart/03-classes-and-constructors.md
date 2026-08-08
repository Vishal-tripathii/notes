# Dart Study Notes — Part 03

## Classes & Constructors ⭐⭐⭐⭐⭐

**Topics:** the default constructor · named constructors · initializer lists · `this.x` shorthand · factory constructors · const constructors · private members · getters/setters · static members.

---

## 1. The Default Constructor

> **Definition:** a class's default constructor shares the class's name and is called via `ClassName(args)`; Dart provides one implicitly if no constructor is declared at all.

```dart
class Point {
  double x, y;
  Point(this.x, this.y); // "this.x" shorthand — see §3
}
final p = Point(3, 4);
```

## 2. Named Constructors

> **Definition:** `ClassName.name(args)` — an alternate, explicitly labeled constructor, letting a class expose multiple distinct construction paths beyond the single unnamed default constructor a language like Java/TS would allow via overloading (which Dart doesn't support).

```dart
class Point {
  double x, y;
  Point(this.x, this.y);
  Point.origin() : x = 0, y = 0;                     // named constructor, initializer list (see §3)
  Point.fromJson(Map<String, dynamic> json) : x = json['x'], y = json['y'];
}
final origin = Point.origin();
final fromApi = Point.fromJson({'x': 1.0, 'y': 2.0});
```
**Why named constructors exist at all:** Dart has no constructor overloading (you can't declare two `Point(...)` constructors with different parameter lists) — named constructors are the language's answer, giving each distinct construction strategy its own clear name instead of forcing awkward optional-parameter gymnastics into one constructor.

## 3. Initializer Lists & the `this.x` Shorthand

> **Definition — `this.x` shorthand:** declaring a constructor parameter as `this.fieldName` automatically assigns the argument to the instance field of the same name, without a manual `fieldName = fieldName` body line.
> **Definition — Initializer list:** the `: expr1, expr2` clause after a constructor's parameter list, which runs **before** the constructor body and is the only place `final` fields can be assigned from a computed expression (not just a direct parameter).

```dart
class Rectangle {
  final double width, height;
  final double area;                                        // final, computed — must use initializer list
  Rectangle(this.width, this.height) : area = width * height; // initializer list runs BEFORE the body,
                                                                  // and can reference other params directly
}
```

## 4. Factory Constructors

> **Definition:** `factory ClassName(...)` declares a constructor that does **not** automatically create a new instance — its body must explicitly `return` an object, giving it the freedom to return a cached instance, an instance of a *subtype*, or perform validation logic before construction — none of which a normal constructor can do (a normal constructor always creates a genuinely new instance of exactly its own class).

```dart
class Logger {
  final String name;
  static final Map<String, Logger> _cache = {};

  factory Logger(String name) {
    return _cache.putIfAbsent(name, () => Logger._internal(name)); // returns a CACHED instance if one
  }                                                                    // exists — impossible with a
  Logger._internal(this.name);                                          // regular constructor
}

// subtype-selection use case
abstract class Shape {
  factory Shape.fromType(String type) {
    switch (type) {
      case 'circle': return Circle();
      case 'square': return Square();
      default: throw ArgumentError('Unknown shape: $type');
    }
  }
}
class Circle implements Shape { Circle(); }
class Square implements Shape { Square(); }
```
**The concrete case where only `factory` works:** a singleton/cache-backed constructor (the `Logger` example) — a regular constructor is contractually guaranteed by the language to always produce a brand-new instance, so returning an existing cached one is simply not expressible without `factory`.

## 5. Const Constructors

> **Definition:** a constructor marked `const` allows creating a **compile-time-constant** instance of the class, provided every field is `final` and every argument passed is itself a compile-time constant — enabling the same canonicalization behavior as [Part 00's `const` collections](00-dart-fundamentals.md#1-variables--var-final-const).

```dart
class Point {
  final double x, y;
  const Point(this.x, this.y); // requires x, y to both be final
}
const p1 = Point(0, 0);
const p2 = Point(0, 0);
print(identical(p1, p2)); // true — canonicalized, same instance

final p3 = Point(0, 0);      // still legal without const, just not canonicalized
```
This is exactly why Flutter widgets are so often declared with `const` constructors ([flutter Part 16](../flutter/16-performance-optimization.md)) — a `const` widget instance is identical across rebuilds and can be skipped entirely by Flutter's diffing.

## 6. Private Members

> **Definition:** prefixing an identifier with `_` makes it private — but privacy in Dart is scoped to the **library** (roughly, the file, unless explicitly combined via `part`/`part of`), not to the class, which is the detail that surprises developers coming from Java/C#/TypeScript's per-class privacy model.

```dart
class BankAccount {
  double _balance = 0; // private to this FILE, not just this class
  void deposit(double amount) { _balance += amount; }
}
// in the SAME file, even unrelated code can access _balance directly — no real
// class-level encapsulation the way Java's `private` provides
// in a DIFFERENT file (different library), _balance is genuinely inaccessible
```
**Why this is the surprising bit:** two classes in the *same file* can freely read/write each other's `_private` fields — Dart's privacy boundary is the library (file), so it protects against access from *other files*, not from sibling code within the same file, which is a materially different guarantee than Java-style per-class access modifiers.

## 7. Getters/Setters

> **Definition:** `get`/`set` define computed properties — accessed with plain property syntax (`obj.value`, not `obj.value()`) while running arbitrary logic underneath, the same underlying idea as [JS getters/setters](../javascript/09-classes.md#1-the-basics).

```dart
class Temperature {
  double _celsius;
  Temperature(this._celsius);

  double get fahrenheit => _celsius * 9 / 5 + 32;         // computed, read-only (no setter)
  set fahrenheit(double f) { _celsius = (f - 32) * 5 / 9; } // writing fahrenheit updates celsius
}
final t = Temperature(0);
print(t.fahrenheit);   // 32.0 — called like a property, not a method
t.fahrenheit = 212;
print(t._celsius);       // 100.0
```

## 8. Static Members

> **Definition:** `static` fields/methods belong to the **class itself**, not to any instance — shared across every instance, accessed via `ClassName.member` without needing an instance at all.

```dart
class MathUtils {
  static const double pi = 3.14159; // one shared value, not per-instance
  static double square(double x) => x * x;
}
print(MathUtils.square(5)); // 25.0 — no instance needed
```

---

## Interview Q&A

**Q: Factory constructor vs regular constructor — give a concrete case where only factory works.**
> A regular constructor is guaranteed by the language to always return a genuinely new instance of exactly that class. A `factory` constructor's body must explicitly return an object, so it can return a cached existing instance (a singleton/logger-cache pattern), or an instance of a *different subtype* chosen based on the arguments (a `Shape.fromType('circle')` factory returning a `Circle` — impossible for `Shape`'s own regular constructor, which could only ever construct a `Shape`).

**Q: Why is Dart privacy per-library instead of per-class — the surprising bit for OOP developers from other languages?**
> A `_`-prefixed member is inaccessible from a *different file* (library), but fully accessible to any other code within the *same file*, including unrelated sibling classes. That's a materially weaker boundary than Java/C#'s per-class `private`, where even a sibling class in the same file can't reach another class's private members — Dart trades strict per-class encapsulation for a simpler, file-scoped model.

**Q: Why does an initializer list exist at all, instead of just assigning fields in the constructor body?**
> A `final` field can only ever be assigned once, and the initializer list runs *before* the constructor body executes — it's the only place a `final` field can be set from a computed expression (like `area = width * height`) rather than a raw parameter, since by the time the constructor body runs, `final` fields declared with `this.x` shorthand are already assigned and can't be touched again.

**Q: Predict:**
```dart
class Foo { const Foo(); }
void main() {
  const a = Foo();
  const b = Foo();
  final c = Foo();
  print(identical(a, b));
  print(identical(a, c));
}
```
> `true`, then `false` — `a` and `b` are both compile-time constants and get canonicalized to the same instance; `c` is a plain runtime allocation via the same const-eligible constructor, but without the `const` keyword at the call site it's just a normal (distinct) instance.

---

## Follow-ups (challenge questions)

- *Failure mode:* a class exposes a mutable `List<int>` field via a getter that just returns the field directly (`List<int> get items => _items;`) — walk through exactly how a caller can mutate the "encapsulated" internal state despite there being no public setter, and how a defensive copy or `UnmodifiableListView` would close that hole.
- *Scale:* the `Logger` factory-constructor cache above never evicts entries — for an app that creates loggers dynamically by a high-cardinality key (e.g. per-request ID instead of per-module-name), what actually happens to memory over the app's lifetime?

---

**Previous:** [Part 02 — Null Safety](02-null-safety.md) · **Next:** [Part 04 — Inheritance, Interfaces & Abstract Classes](04-inheritance-interfaces-and-abstract-classes.md)
