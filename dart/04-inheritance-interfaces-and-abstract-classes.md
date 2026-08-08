# Dart Study Notes — Part 04

## Inheritance, Interfaces & Abstract Classes ⭐⭐⭐⭐⭐

**Topics:** `extends` and single inheritance · `implements` and implicit interfaces · abstract classes/methods · `@override` · `super` · `is`/`as` · sealed classes & exhaustive `switch`.

---

## 1. `extends` — Single Inheritance

> **Definition:** `extends` establishes an inheritance relationship — a subclass inherits its superclass's implementation (fields, method bodies) and can override methods. Dart supports only **single** inheritance — a class can `extends` exactly one other class.

```dart
class Animal {
  final String name;
  Animal(this.name);
  void speak() => print('$name makes a sound');
}
class Dog extends Animal {
  Dog(super.name);            // Dart 2.17+ super-parameter shorthand for calling the parent constructor
  @override
  void speak() => print('$name barks'); // overrides the inherited implementation
}
```

## 2. `implements` — Every Class Is Implicitly an Interface

> **Definition:** in Dart, **every class implicitly defines an interface** matching its public API — `implements SomeClass` means "conform to `SomeClass`'s method/property signatures," without inheriting any of its actual implementation. A class can `implements` **multiple** classes/interfaces, unlike the single-superclass limit of `extends`.

```dart
class Flyable { void fly() => print('flying'); }
class Swimmable { void swim() => print('swimming'); }

class Duck implements Flyable, Swimmable {  // MUST provide its own implementation of BOTH —
  @override                                    // implements gives you the CONTRACT, not the code
  void fly() => print('duck flying');
  @override
  void swim() => print('duck swimming');
}
```
**Why implementing multiple "interfaces" works but extending multiple classes doesn't:** `implements` only obligates you to satisfy a method *signature* — there's no implementation to merge, so no ambiguity about which parent's method body "wins" if two interfaces defined the same method differently. `extends` inherits real, executable code — allowing multiple superclasses (as in C++ multiple inheritance) reintroduces the classic diamond-inheritance ambiguity (whose implementation of a shared method runs?), which Dart sidesteps entirely by disallowing it, offering [mixins](05-mixins.md) as the controlled alternative for sharing implementation across multiple sources.

## 3. Abstract Classes & Abstract Methods

> **Definition:** an `abstract class` cannot be instantiated directly (`Shape()` is a compile error) — it exists to be extended or implemented, and may declare **abstract methods** (a signature with no body) that concrete subclasses are obligated to implement.

```dart
abstract class Shape {
  double area();          // abstract — no body, subclasses MUST implement it
  void describe() => print('Area: ${area()}'); // concrete method, CAN be inherited as-is
}
// Shape();                    // compile-time error — cannot instantiate an abstract class

class Circle extends Shape {
  final double radius;
  Circle(this.radius);
  @override
  double area() => 3.14159 * radius * radius; // required — Shape declared area() abstract
}
```
**Abstract class vs a pure interface:** an abstract class can mix abstract *and* concrete methods (giving subclasses free, inherited behavior alongside required overrides); a class used purely via `implements` gives you zero free implementation at all — every member must be reimplemented from scratch, since `implements` never inherits code.

## 4. `@override`

> **Definition:** an annotation (not strictly required by the compiler in most cases, but strongly conventional and enforced by the linter) marking a method as intentionally overriding a superclass/interface member — catches a common bug where a typo in the method name silently creates a brand-new method instead of overriding the intended one.

```dart
class Base { void process() {} }
class Derived extends Base {
  @override
  void proces() {} // TYPO — @override flags this as an ERROR: doesn't actually override anything,
}                     // catching the bug at compile time instead of silently creating a dead method
```

## 5. `super`

```dart
class Animal {
  final String name;
  Animal(this.name);
  void speak() => print('$name makes a sound');
}
class Dog extends Animal {
  Dog(super.name);
  @override
  void speak() {
    super.speak();               // calls the PARENT's version first
    print('$name specifically barks');
  }
}
```
Same mechanics as [JS's `super`](../javascript/09-classes.md#3-extends-and-super) — `super.method()` invokes the parent's implementation of an overridden method; a constructor's `super(...)` call (or the `super.field` shorthand parameter, Dart 2.17+) invokes the parent constructor.

## 6. `is` / `as` — Type Checks & Casts

> **Definition — `is`:** a runtime type-check operator returning `bool`, and Dart's flow analysis promotes the checked variable's type within the `true` branch (the same [type-promotion mechanism as null checks](02-null-safety.md#6-flow-analysis--type-promotion)).
> **Definition — `as`:** an explicit downcast, asserting a value's runtime type — throws a `TypeError` at runtime if the assertion is wrong, similar in spirit to the `!` [null-assertion operator's risk](02-null-safety.md#3-the--null-assertion-operator).

```dart
void handle(Object value) {
  if (value is String) {
    print(value.length); // promoted to String here — no cast needed, same flow-analysis mechanism
  }
  final s = value as String; // explicit cast — throws TypeError at runtime if value ISN'T a String
}
```

## 7. Sealed Classes & Exhaustive `switch`

> **Definition:** a `sealed class` (Dart 3) restricts which classes may extend/implement it to those declared in the **same library (file)** — in exchange, a `switch` statement/expression over a sealed class's subtypes gets **compile-time exhaustiveness checking**: omitting a known subtype is a compile error, not a runtime surprise.

```dart
sealed class Result<T> {}
class Success<T> extends Result<T> { final T value; Success(this.value); }
class Failure<T> extends Result<T> { final String error; Failure(this.error); }

String describe(Result<int> result) => switch (result) {
  Success(value: final v) => 'Got $v',
  Failure(error: final e) => 'Error: $e',
  // if a THIRD subtype of Result existed and wasn't handled here, this switch
  // would be a COMPILE-TIME error — "not exhaustive" — not a missed runtime case
};
```

---

## Interview Q&A

**Q: `extends` vs `implements`, precisely — and why does implementing multiple interfaces work but extending multiple classes doesn't?**
> `extends` inherits a superclass's actual implementation and only allows one superclass. `implements` only obligates conformance to a class's method *signatures* — every class implicitly defines an interface — with zero inherited code, and a class can implement any number of them. Multiple inheritance of real implementation reintroduces diamond-inheritance ambiguity (which parent's method body wins?); multiple interface conformance has no such ambiguity since there's no code to merge, only signatures to satisfy independently.

**Q: What does a sealed class buy you with `switch` exhaustiveness checking?**
> Because a sealed class restricts its possible subtypes to a known, closed set declared in the same file, the compiler can prove whether a `switch` over that type handles every possible case. Add a new subtype later and forget to handle it in an existing `switch` — that's now a compile-time error instead of a silent runtime gap (a case that falls through unexpectedly or throws at runtime).

**Q: Abstract class vs pure interface (a class used only via `implements`) — what's the practical difference?**
> An abstract class can provide concrete, inherited method implementations alongside abstract ones its subclasses must fill in — free shared behavior. A class used purely as an interface via `implements` gives the implementing class zero free code; every member, even ones with an "obvious" shared implementation, must be reimplemented from scratch in each class, since `implements` never inherits a method body.

**Q: Predict:**
```dart
abstract class Shape {
  double area();
}
class Circle extends Shape {
  final double radius;
  Circle(this.radius);
}
```
> Compile-time error — `Circle` doesn't implement the abstract `area()` method inherited from `Shape`, and a concrete (non-abstract) class is required to implement every abstract member it inherits.

---

## Follow-ups (challenge questions)

- *Consistency:* a large codebase has both `Bird implements Flyable` (duplicating a `fly()` implementation across a dozen unrelated classes) and a `Bird extends FlyingAnimal` alternative under discussion — walk through the actual maintenance cost of the `implements`-everywhere approach as more flying creature types are added, and how [mixins](05-mixins.md) resolve it.
- *Failure mode:* a sealed class hierarchy is used for API response modeling (`Success`/`Failure`/`Loading`), and a new `Cancelled` variant is added in a library update — what specifically breaks (and where, precisely — compile time or runtime) in downstream code that has an exhaustive `switch` over the old three variants?

---

**Previous:** [Part 03 — Classes & Constructors](03-classes-and-constructors.md) · **Next:** [Part 05 — Mixins](05-mixins.md)
