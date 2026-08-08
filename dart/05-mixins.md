# Dart Study Notes — Part 05

## Mixins ⭐⭐⭐⭐☆

**Topics:** `mixin`/`with` · what problem mixins solve · the `on` clause · mixin resolution order · mixins vs abstract classes vs interfaces.

---

## 1. `mixin` / `with`

> **Definition:** a `mixin` is a way to **reuse a class's implementation across multiple, otherwise-unrelated class hierarchies**, without using `extends` (limited to one superclass) or `implements` (which gives zero free code — [Part 04](04-inheritance-interfaces-and-abstract-classes.md)). Applied to a class via the `with` keyword; a class can mix in **multiple** mixins.

```dart
mixin Flyable {
  void fly() => print('flying');
}
mixin Swimmable {
  void swim() => print('swimming');
}

class Duck extends Animal with Flyable, Swimmable { // real, working fly()/swim() implementations,
  Duck(super.name);                                     // inherited from the mixins, not reimplemented
}
final duck = Duck('Donald');
duck.fly();   // 'flying' — actual inherited behavior, unlike implements
duck.swim();  // 'swimming'
```
**What problem this solves that single inheritance can't:** `Duck` needs both `Flyable` and `Swimmable` behavior, but can only `extends` one class (`Animal`). Without mixins, the choice would be either duplicating `fly()`/`swim()` implementations in every flying/swimming class (the exact problem flagged in [Part 04's follow-up](04-inheritance-interfaces-and-abstract-classes.md#follow-ups-challenge-questions)), or falling back to `implements` and losing the free, shared implementation entirely. Mixins let you compose real, working behavior from multiple independent sources onto one class.

## 2. The `on` Clause

> **Definition:** `mixin M on SuperClass` restricts which classes `M` may be mixed into — only classes that are (or extend) `SuperClass` — and, critically, lets the mixin's own code call methods declared on `SuperClass` even though the mixin itself doesn't extend it.

```dart
abstract class Animal {
  void makeSound();
}
mixin Loud on Animal {           // can ONLY be mixed into an Animal (or subclass)
  void makeLoudSound() {
    makeSound();                    // calls a method the mixin itself never declared —
    makeSound();                      // legal because `on Animal` guarantees it'll be there
  }
}
class Dog extends Animal with Loud { // OK — Dog IS an Animal
  @override
  void makeSound() => print('Woof');
}
// class Rock with Loud {}          // compile-time error — Rock is not an Animal, `on` forbids this
```
**Why you'd constrain a mixin to a specific superclass:** the mixin's own logic (`makeLoudSound`) depends on a method (`makeSound`) it assumes will exist on whatever class it's applied to — `on Animal` turns that assumption into a compile-time-checked guarantee instead of a runtime crash if someone mixes `Loud` into an unrelated class with no `makeSound()` method.

## 3. Mixin Resolution Order

> **Definition:** when multiple mixins are applied (`class C extends Base with M1, M2`), Dart builds a **linearized** superclass chain where each mixin sits between the previous one and the class itself — meaning **later mixins in the `with` list override earlier ones** (and both override the base class) for any method they share.

```dart
class Base { void greet() => print('Base'); }
mixin M1 { void greet() => print('M1'); }
mixin M2 { void greet() => print('M2'); }

class C extends Base with M1, M2 {}
C().greet(); // 'M2' — the LAST mixin in the list wins for a shared method name

class D extends Base with M2, M1 {}
D().greet(); // 'M1' — order reversed, so the winner reverses too
```
**The mental model:** think of `with M1, M2` as inserting `M1` then `M2` into the inheritance chain, in that order, each one "layered on top of" the previous — so resolution for a shared method walks from the class itself outward/backward through the mixin list before reaching the base class, and the *last*-applied mixin is closest to the class, winning any naming conflict.

## 4. Mixins vs Abstract Classes vs Interfaces — When Each Is Right

| | Gives free implementation? | Multiple allowed? | Primary use |
|---|---|---|---|
| `extends` (regular/abstract class) | ✅ | ❌ (one only) | "IS-A" relationship, a true base type |
| `implements` | ❌ | ✅ | "conforms to this contract," no shared code |
| `mixin` / `with` | ✅ | ✅ | "HAS-THIS-CAPABILITY," shared behavior across unrelated hierarchies |

**The rule of thumb:** reach for `extends` when there's a genuine single-parent "is-a" relationship; `implements` when you only need to guarantee an API shape with zero shared code; `mixin` when a capability (logging, comparability, disposability) needs to be composed onto classes that don't otherwise share a common ancestor.

---

## Interview Q&A

**Q: Why does Dart have mixins given it already has interfaces via `implements`?**
> `implements` only gives you a contract to fulfill — every method must be reimplemented from scratch with zero shared code. Mixins let you compose **real, working implementation** onto a class from multiple independent sources, something single inheritance (`extends`, limited to one superclass) can't do and `implements` explicitly doesn't offer. They solve the specific problem of needing shared behavior across classes that don't share a common base class.

**Q: What does the `on` clause do, and why would you constrain a mixin to a specific superclass?**
> `on SuperClass` restricts which classes the mixin can be applied to, and in exchange lets the mixin's own methods safely call methods declared on that superclass, trusting they'll be present. Without `on`, a mixin that assumes a certain method exists on whatever it's mixed into would only discover a missing method at runtime; `on` turns that into a compile-time guarantee.

**Q: If two mixins both define the same method, which one wins?**
> The last one listed in the `with` clause — mixins are linearized into the inheritance chain in the order given, with each subsequent mixin layered closer to the class itself, so it takes priority over earlier ones (and over the base class) for any shared method name.

**Q: Predict:**
```dart
mixin A { String who() => 'A'; }
mixin B { String who() => 'B'; }
class Base { String who() => 'Base'; }
class C extends Base with A, B {}
print(C().who());
```
> `'B'` — `B` is the last mixin applied, so it wins the resolution order over both `A` and `Base`.

---

## Follow-ups (challenge questions)

- *Consistency:* a large codebase mixes in 4 different mixins onto one widget-like class, two of which happen to define a method with the same name — walk through the actual debugging experience of figuring out which implementation "wins" and whether that was intentional, versus the alternative of composition (a class holding references to separate behavior objects instead of mixing them in).
- *Failure mode:* a mixin constrained with `on Animal` is later needed by a class that logically has the same capability but isn't an `Animal` subclass (e.g. a `Robot` that also needs to "make sounds" but has its own unrelated hierarchy) — what are the actual options here, and what does each trade off?

---

**Previous:** [Part 04 — Inheritance, Interfaces & Abstract Classes](04-inheritance-interfaces-and-abstract-classes.md) · **Next:** [Part 06 — Collections](06-collections.md)
