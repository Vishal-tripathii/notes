# 🎯 Dart Interview Question Bank — Answered

> **How to use:** cover the answer, say yours out loud, then compare — speaking still finds gaps that reading hides. But unlike its terse siblings, this bank is written to work as a **standalone crash course**: every answer opens with a plain definition, then the tradeoff/reasoning behind it, then a short code snippet wherever the concept has real shape in code. If someone has time for exactly one file before an interview and never opens the rest of the `dart/` notes folder, this is the one that gets them ready.
>
> **~144 questions · 17 sections**

---

## Sections

| | Topic | Note |
|---|---|---|
| 1 | [Dart Fundamentals](#s1) ⭐ | [Part 00](00-dart-fundamentals.md) |
| 2 | [Functions](#s2) | [Part 01](01-functions.md) |
| 3 | [Null Safety](#s3) ⭐ | [Part 02](02-null-safety.md) |
| 4 | [Classes & Constructors](#s4) ⭐ | [Part 03](03-classes-and-constructors.md) |
| 5 | [Inheritance, Interfaces & Abstract Classes](#s5) ⭐ | [Part 04](04-inheritance-interfaces-and-abstract-classes.md) |
| 6 | [Mixins](#s6) | [Part 05](05-mixins.md) |
| 7 | [Collections](#s7) ⭐ | [Part 06](06-collections.md) |
| 8 | [Generics](#s8) | [Part 07](07-generics.md) |
| 9 | [Exception Handling](#s9) | [Part 08](08-exception-handling.md) |
| 10 | [Futures & async/await](#s10) ⭐ | [Part 09](09-futures-and-async-await.md) |
| 11 | [Streams](#s11) ⭐ | [Part 10](10-streams.md) |
| 12 | [Isolates & Concurrency](#s12) ⭐ | [Part 11](11-isolates-and-concurrency.md) |
| 13 | [Enums & Pattern Matching](#s13) | [Part 12](12-enums-and-pattern-matching.md) |
| 14 | [Records](#s14) | [Part 13](13-records.md) |
| 15 | [Extension Methods & Operator Overloading](#s15) | [Part 14](14-extension-methods-and-operator-overloading.md) |
| 16 | [Packages, pubspec.yaml & Tooling](#s16) | [Part 15](15-packages-pubspec-and-tooling.md) |
| 17 | [Testing in Dart](#s17) | [Part 16](16-testing-in-dart.md) |

---

<a name="s1"></a>
# 1. Dart Fundamentals

### `final` vs `const`, precisely?
Both are single-assignment, but `final`'s value only needs to be fixed by the time execution reaches that line — it can come from a runtime computation. `const` requires the value to be known at **compile time**, a strictly stronger guarantee, and compile-time constants get canonicalized: two identical `const` literals are the same object in memory.

```dart
final now = DateTime.now();  // fixed once assigned, but only known at RUNTIME
const pi = 3.14159;            // must be known BEFORE the program runs
// const now2 = DateTime.now(); // ERROR — not a compile-time constant
```

### `dynamic` vs `Object` vs `var` — what's the real difference?
`var` isn't a type — it tells the compiler to infer the real static type from the initializer, and that inferred type is then enforced like any explicit type. `Object` (or `Object?`) is the root type every class extends, so it can hold anything, but you can only call the handful of methods `Object` itself defines without a cast. `dynamic` opts a variable out of static type checking entirely — any method call compiles, and a missing one only fails at runtime with `NoSuchMethodError`.

```dart
var a = 'hello';    // inferred String — a = 5 is a compile error
Object b = 'hello';   // b.length is a compile error — Object has no .length
dynamic c = 'hello';   // c.length works AND c.nonsense() compiles too — fails only at runtime
```

### Why treat `dynamic` as an escape hatch rather than a default?
Because it silently defers an entire class of bugs — a typo'd or missing method — from compile time to runtime, in exactly the place `var`/typed variables would catch it immediately. Prefer `var` almost always; reach for `Object`/`Object?` when a value genuinely might hold anything but you still want compile-time safety on what you do with it.

### What does the cascade operator (`..`) actually do, and why does it exist?
It runs a sequence of calls on the *same original object*, letting you chain operations on one receiver without repeating it — but critically, the whole cascaded expression evaluates to that original object, not to whatever the last call returned. That's what makes it work even with `void`-returning methods, unlike ordinary `.` chaining, where each call's own return value becomes the next receiver.

```dart
final buffer = StringBuffer()
  ..write('Hello')   // each .. calls write() on buffer and returns buffer itself,
  ..write(' World'); // not write()'s (void) return value
print(buffer.toString()); // 'Hello World'
```

### `~/` vs `/`?
`~/` is truncating (integer) division — it discards the remainder and always yields an `int`. `/` is regular division and always yields a `double`, even for two `int` operands.

```dart
7 ~/ 2; // 3
7 / 2;    // 3.5
```

### `??` vs `?.`?
`??` (if-null) returns its right side only when the left side is `null`; `?.` (null-aware access) evaluates a member access as `null` instead of throwing if the receiver is `null`. They compose: `user?.name ?? 'Guest'` reads the name if `user` exists, otherwise falls back.

```dart
final value = null ?? 'default'; // 'default'
user?.name;                        // null instead of throwing if user is null
```

### What's a Dart 3 `switch` **expression**, and how is it different from a `switch` statement?
A `switch` expression evaluates directly to a value using `=>` arms and no `break`s, rather than executing statements per case — it's `switch` used the way a ternary is used, as an expression you assign or return.

```dart
final result = switch (2) {
  1 => 'one',
  2 => 'two',
  _ => 'other', // wildcard/default
};
```

### Why does "everything is an object" matter practically, compared to JS's primitive/reference split?
Dart has no primitive types in the JS sense — `int`, `double`, `bool`, `Function`, even `null` (as its own `Null` type) all extend `Object` and carry real methods. That's why `5.isEven` and `'x'.toUpperCase()` read naturally as direct method calls on a literal, with no wrapper class or static utility function needed the way a language with true primitives would require.

```dart
5.isEven;               // true — method call directly on an int literal
(() => 'hi').runtimeType; // functions are values with a real runtime type too
```

### Why does `const` canonicalization matter beyond "it's slightly faster"?
Because two structurally identical `const` expressions are literally the *same object* in memory — not just equal, but `identical()`. For something like a shared default configuration used across hundreds of call sites, this means one allocation total instead of hundreds, and it's also exactly why `const` Flutter widgets can be skipped entirely during a rebuild diff — identity comparison alone proves nothing changed.

```dart
const a = [1, 2, 3];
const b = [1, 2, 3];
print(identical(a, b)); // true — canonicalized to one instance
final c = [1, 2, 3];
final d = [1, 2, 3];
print(identical(c, d)); // false — two separate runtime allocations
```

---

<a name="s2"></a>
# 2. Functions

### Named vs positional parameters — when is each idiomatic?
A positional parameter is matched by its position in the call; a named parameter (declared in `{}`) is matched by an explicit `name: value` label, in any order. Positional suits a small number of parameters where order is obvious (`Point(x, y)`); named suits anything with more parameters or where the call site would otherwise be ambiguous — `Container(width: 100, height: 50)` self-documents in a way `Container(100, 50)` never will, and named arguments can be reordered freely without breaking the call.

```dart
void greetPositional(String name, int age) {}
greetPositional('V', 30);

void greetNamed({required String name, required int age}) {}
greetNamed(age: 30, name: 'V'); // order irrelevant — labeled
```

### Optional positional (`[]`) vs optional named (`{}`)?
Wrapping positional parameters in `[]` makes them omittable while staying positional — arguments still fill in left to right. Named parameters (`{}`) are optional by default unless individually marked `required`, and are matched by label rather than position.

```dart
String buildUrl(String host, [String? path, int? port]) { /* ... */ }
buildUrl('example.com');                // path/port both null
buildUrl('example.com', '/api', 8080);    // still positional, no labels
```

### What does `required` on a named parameter actually enforce, and when?
It makes an otherwise-optional named parameter mandatory, checked at **compile time** — omitting it at a call site is a compile error, not a runtime `null` surprise. It's what lets a signature combine the self-documenting clarity of named parameters with the mandatoriness of positional ones.

```dart
void createUser({required String name, required String email, int? age}) {}
createUser(name: 'V', email: 'v@example.com'); // fine, age omitted, not required
// createUser(name: 'V'); // compile error: missing 'email'
```

### What's the constraint on arrow functions (`=>`)?
`=>` is shorthand for a body that's a single expression — `T foo() => expr;` is exactly equivalent to `T foo() { return expr; }`. It does not work for a multi-statement body.

```dart
int square(int n) => n * n;
```

### What does a Dart closure actually capture?
A live reference to the variable in its enclosing scope, not a copy of its value at creation time — identical semantics to a JS closure. A function returned from another function that increments and returns an outer variable keeps working correctly across repeated calls because it's reading and mutating the *same* variable each time, not a frozen snapshot at creation.

```dart
Function makeCounter() {
  var count = 0;
  return () { count++; return count; }; // closes over count by live reference
}
final counter = makeCounter();
print(counter()); print(counter()); // 1, 2
```

### Why does it matter that functions are first-class values in Dart?
Because a function is an object like any other — assignable to a variable, passable as an argument, returnable from another function — which is what makes higher-order patterns (callbacks, strategy objects, `.map()`/`.where()` taking a function argument) work without any special syntax beyond a function-typed parameter.

```dart
void applyTwice(int Function(int) fn, int value) { print(fn(fn(value))); }
applyTwice((x) => x + 1, 5); // 7
```

### What's a `typedef` for a function type, and why use one?
`typedef` gives a readable name to a function signature, so a repeated callback shape (e.g. `int Function(int)`) can be referenced by one name instead of writing the full signature out at every use site.

```dart
typedef IntTransformer = int Function(int);
IntTransformer transformer = (x) => x + 1; // reads clearer than the raw signature repeated everywhere
```

### What constraint applies to a default parameter value?
It must itself be a compile-time constant — the same restriction `const` expressions have generally, since the default is baked in at compile time, not computed fresh on every call missing that argument.

```dart
void log(String message, {String level = 'info'}) {}
```

### A function has 6 optional named parameters and none marked `required` — what's the actual cost?
Every call site has to guess (or check documentation) which parameters actually matter for correct behavior, since the compiler enforces nothing — a caller can omit something load-bearing and get a silently wrong default instead of a compile error. Past a handful of related optional parameters, grouping them into a config object (or marking the genuinely load-bearing ones `required`) documents intent in a way an unbounded named-parameter list doesn't.

### Does Dart's `for` loop variable have the same closure-capture bug as JS's `var` in a loop?
No — Dart's `for` loop variable behaves like JS's `let`, not `var`: each iteration gets its own binding, so a closure created inside the loop body captures that iteration's value rather than a single shared variable that's already advanced past the loop by the time the closure runs. This is worth verifying directly rather than assuming Dart inherited the classic `var`-in-a-loop pitfall — it didn't.

---

<a name="s3"></a>
# 3. Null Safety

### What does "sound" null safety mean, precisely, and how does it differ from TypeScript's `strictNullChecks`?
Sound means the guarantee is enforced by the runtime type system itself, not just static analysis — a non-nullable Dart variable is structurally incapable of holding `null` at runtime, full stop. TypeScript's `strictNullChecks` is a compile-time-only convenience on top of JavaScript, which has no real non-nullable types at runtime — a value crossing an untyped boundary (`any`, JS interop, `JSON.parse`) can still smuggle `null` into a "non-nullable" TS variable with zero runtime check. Dart's can't be defeated that way.

```dart
String name = 'V';   // non-nullable — the compiler and runtime GUARANTEE this is never null
String? nickname;       // nullable — explicitly opted in via ?
// name = null;              // compile-time error, not just a lint
```

### Nullable vs non-nullable types?
Any type `T` is non-nullable by default; `T?` is a distinct type that's the union of `T` and `null`. A function parameter typed non-nullable needs no null check anywhere in its body — the type itself guarantees it.

```dart
void printLength(String s) { print(s.length); } // s guaranteed non-null throughout the whole body
```

### Why is the `!` null-assertion operator described as a runtime landmine?
`expr!` casts a `T?` to `T` by asserting to the compiler "trust me, this isn't null right now" — it moves the soundness guarantee back onto the developer's judgment at that exact line. It compiles cleanly regardless of whether the assertion is true, and being wrong produces a runtime crash (`Null check operator used on a null value`) instead of the compile-time error null safety exists to prevent. Every `!` is worth treating as a code-review flag rather than a routine cast.

```dart
String? maybeName = getName();
String definiteName = maybeName!; // throws HERE if getName() actually returned null
```

### What two problems does `late` solve?
Deferred initialization — a field that genuinely can't get a real value until some setup step runs later (a Flutter `State` field set in `initState()`) — and a non-nullable field computed lazily from other fields, evaluated (and cached) only on first read.

```dart
class Config {
  late String apiUrl; // non-nullable type, but no value required yet
  void init(String url) { apiUrl = url; }
}

class Circle {
  final double radius;
  late final double area = 3.14159 * radius * radius; // computed once, on first access
  Circle(this.radius);
}
```

### When is `late` legitimate vs a code smell?
Legitimate for genuine two-phase initialization or a compute-once value derived from other fields. It's a smell when reached for reflexively to silence an "uninitialized field" compiler error without asking whether the field should honestly just be `T?` with a real fallback — `late` is a promise that can be broken at runtime with `LateInitializationError`, so it should be a deliberate choice, not a default escape hatch.

### What happens if you read a `late` field before it's initialized?
It compiles fine — `late` defers the compiler's initialization check to runtime — but throws `LateInitializationError` the moment something actually reads the field before it was ever assigned.

```dart
class Foo {
  late String name;
  void printName() => print(name);
}
Foo().printName(); // LateInitializationError: Field 'name' has not been initialized
```

### How do `required` and non-nullable types combine to make illegal states unrepresentable?
A `required` non-nullable named parameter cannot be constructed without a real, non-null value — the compiler rejects any call site that omits it, so there's no code path where the constructed object ever has a missing value for that field to begin with. That's a compile-time guarantee, not a runtime null check scattered through the class.

### How does flow analysis (type promotion) work, and what's its limit?
Dart's compiler tracks control flow and promotes a nullable variable's type to non-nullable within a block where it's proven safe — inside the `true` branch of `if (x != null)`, the compiler treats `x` as `T` for the rest of that scope, no `!` needed. The limit: promotion only applies to local variables, and only where nothing could have mutated the value between the check and the use — it does **not** work for a nullable field, since another method could theoretically mutate it in between, so a local copy is required there instead.

```dart
void printLength(String? s) {
  if (s != null) {
    print(s.length); // promoted — no ! needed
  }
}
```

### What does `??=` do?
Assigns the right side only if the variable is currently `null` — a no-op otherwise.

```dart
int? count;
count ??= 0;  // assigns 0, was null
count ??= 99;   // no-op, count is already 0
```

---

<a name="s4"></a>
# 4. Classes & Constructors

### Why do named constructors exist at all?
Dart has no constructor overloading — you can't declare two `Point(...)` constructors with different parameter lists. Named constructors (`ClassName.name(args)`) are the language's answer, giving each distinct construction strategy its own clearly labeled entry point instead of forcing awkward optional-parameter gymnastics into a single constructor.

```dart
class Point {
  double x, y;
  Point(this.x, this.y);
  Point.origin() : x = 0, y = 0;
  Point.fromJson(Map<String, dynamic> json) : x = json['x'], y = json['y'];
}
```

### Why does an initializer list exist instead of just assigning fields in the constructor body?
A `final` field can only ever be assigned once, and the initializer list (the `: expr1, expr2` clause) runs **before** the constructor body — it's the only place a `final` field can be set from a computed expression rather than a raw parameter, since by the time the body runs, any `final` field declared via `this.x` shorthand is already assigned and can't be touched again.

```dart
class Rectangle {
  final double width, height, area;
  Rectangle(this.width, this.height) : area = width * height; // computed BEFORE the body
}
```

### Factory constructor vs regular constructor — give a concrete case where only factory works.
A regular constructor is guaranteed by the language to always produce a genuinely new instance of exactly that class. A `factory` constructor's body must explicitly `return` an object, so it can return a cached existing instance (a singleton/logger cache), or an instance of a different **subtype** chosen based on the arguments — a `Shape.fromType('circle')` factory returning a `Circle`, which `Shape`'s own regular constructor could never do since it can only construct a `Shape`.

```dart
class Logger {
  static final Map<String, Logger> _cache = {};
  factory Logger(String name) =>
      _cache.putIfAbsent(name, () => Logger._internal(name)); // returns a CACHED instance
  final String name;
  Logger._internal(this.name);
}
```

### Const constructors — what do they enable, and why does this matter for Flutter?
A constructor marked `const` allows creating a compile-time-constant instance, provided every field is `final` and every argument is itself a compile-time constant — enabling the same canonicalization as `const` collections: two identical `const` instances are literally the same object. That's exactly why Flutter widgets are so often built with `const` constructors — a `const` widget instance is identical across rebuilds and can be skipped entirely by Flutter's diffing.

```dart
class Point {
  final double x, y;
  const Point(this.x, this.y);
}
const p1 = Point(0, 0);
const p2 = Point(0, 0);
print(identical(p1, p2)); // true — canonicalized
```

### Why is Dart privacy per-library instead of per-class — the surprising bit for OOP developers from other languages?
A `_`-prefixed member is inaccessible from a *different file* (library), but fully accessible to any other code within the *same file*, including unrelated sibling classes. That's a materially weaker boundary than Java/C#'s per-class `private`, where even a sibling class in the same file can't reach another class's private members — Dart trades strict per-class encapsulation for a simpler, file-scoped model.

```dart
class BankAccount {
  double _balance = 0; // private to this FILE, not this class specifically
}
// a different, unrelated class in the SAME file can still read/write _balance directly
```

### How do getters/setters differ from a regular method call?
`get`/`set` define computed properties accessed with plain property syntax (`obj.value`, no parentheses) while running arbitrary logic underneath — the same idea as JS getters/setters. This lets a class expose a derived value that reads like a field to callers even though it's computed on every access.

```dart
class Temperature {
  double _celsius;
  Temperature(this._celsius);
  double get fahrenheit => _celsius * 9 / 5 + 32;
  set fahrenheit(double f) { _celsius = (f - 32) * 5 / 9; }
}
```

### What are `static` members, and when do you reach for them?
Fields/methods that belong to the class itself, not any instance — shared across every instance and accessed via `ClassName.member` with no instance required. Use them for values or utility behavior that has no per-instance state at all.

```dart
class MathUtils {
  static const double pi = 3.14159;
  static double square(double x) => x * x;
}
print(MathUtils.square(5)); // 25.0 — no instance needed
```

### A class exposes a mutable `List<int>` via a getter that just returns the field directly — is that actually encapsulated?
No — `List<int> get items => _items;` hands back a live reference to the *actual* internal list, not a copy, so a caller can call `.add()`/`.clear()` on it and mutate the "encapsulated" internal state despite there being no public setter. Closing the hole requires either returning a defensive copy (`[..._items]`) or wrapping it in `UnmodifiableListView(_items)`.

### Predict:
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
`true`, then `false` — `a` and `b` are both compile-time constants and get canonicalized to the same instance; `c` is a plain runtime allocation via the same const-eligible constructor, but without the `const` keyword at the call site it's just a normal, distinct instance.

---

<a name="s5"></a>
# 5. Inheritance, Interfaces & Abstract Classes

### `extends` vs `implements`, precisely — and why does implementing multiple interfaces work but extending multiple classes doesn't?
`extends` inherits a superclass's actual implementation (fields, method bodies) and allows only one superclass. `implements` only obligates conformance to a class's method **signatures** — every class implicitly defines an interface matching its public API — with zero inherited code, and any number of interfaces can be implemented. Multiple inheritance of real implementation reintroduces diamond-inheritance ambiguity (whose method body wins if two parents define it differently?); multiple interface conformance has no such ambiguity since there's no code to merge, only independent signatures to satisfy.

```dart
class Flyable { void fly() => print('flying'); }
class Swimmable { void swim() => print('swimming'); }
class Duck implements Flyable, Swimmable {   // MUST provide its own implementation of both
  @override void fly() => print('duck flying');
  @override void swim() => print('duck swimming');
}
```

### What does it mean that every class implicitly defines an interface in Dart?
There's no separate `interface` keyword — any class, even a fully concrete one, can be used purely as a contract via `implements`, which forces the implementing class to satisfy its method signatures with entirely fresh implementations of its own. This is different from `extends`, which inherits real, working code.

### Abstract class vs a pure interface (a class used only via `implements`) — practical difference?
An abstract class can mix abstract methods (no body, subclasses must implement) with concrete ones — subclasses get free, inherited behavior alongside required overrides. A class used purely via `implements` gives the implementing class zero free code — every member, even ones with an "obvious" shared implementation, must be reimplemented from scratch, since `implements` never inherits a method body.

```dart
abstract class Shape {
  double area();                                 // abstract — subclasses MUST implement
  void describe() => print('Area: ${area()}');   // concrete — inherited as-is, free
}
```

### Why does `@override` matter beyond being a lint convention?
It catches a real bug at compile time: a typo in a method name (`proces` instead of `process`) would otherwise silently create a brand-new, unrelated method instead of overriding the intended one — the annotation flags that mismatch as an error immediately rather than letting the typo ship as a dead method that never actually overrides anything.

### What does `super` do?
`super.method()` invokes the parent's implementation of an overridden method — useful for extending rather than replacing parent behavior. A constructor's `super(...)` call (or the `super.field` shorthand parameter, Dart 2.17+) invokes the parent constructor.

```dart
class Dog extends Animal {
  Dog(super.name);
  @override
  void speak() {
    super.speak();                   // parent's version first
    print('$name specifically barks');
  }
}
```

### `is` vs `as` — what's the difference and the risk?
`is` is a runtime type check returning `bool`, and Dart's flow analysis promotes the checked variable's type within the `true` branch — the same mechanism as null-check promotion. `as` is an explicit downcast that throws a `TypeError` at runtime if the assertion is wrong, carrying the same category of risk as the `!` null-assertion operator.

```dart
void handle(Object value) {
  if (value is String) { print(value.length); } // promoted, no cast needed
  final s = value as String;                        // throws TypeError if value isn't actually a String
}
```

### What does a sealed class buy you with `switch` exhaustiveness checking?
A `sealed class` restricts its subtypes to a known, closed set declared in the same file — in exchange, the compiler can prove whether a `switch` over that type handles every possible case. Add a new subtype later and forget to handle it in an existing `switch`, and that's a compile-time "not exhaustive" error instead of a silent runtime gap.

```dart
sealed class Result<T> {}
class Success<T> extends Result<T> { final T value; Success(this.value); }
class Failure<T> extends Result<T> { final String error; Failure(this.error); }

String describe(Result<int> r) => switch (r) {
  Success(value: final v) => 'Got $v',
  Failure(error: final e) => 'Error: $e',
  // a third unhandled subtype here would be a COMPILE-TIME error
};
```

### Predict:
```dart
abstract class Shape { double area(); }
class Circle extends Shape {
  final double radius;
  Circle(this.radius);
}
```
Compile-time error — `Circle` doesn't implement the abstract `area()` method it inherited from `Shape`, and a concrete (non-abstract) class must implement every abstract member it inherits.

### A codebase has `Bird implements Flyable` duplicated across a dozen classes — what's the real cost as more flying types get added?
`implements` gives zero shared code, so every one of those dozen classes reimplements `fly()` from scratch — a bug fix or behavior change to the flying logic has to be applied in a dozen separate places, and any of them can silently drift out of sync with the others. A [mixin](05-mixins.md) solves this directly: one `mixin Flyable` applied via `with Flyable` gives every class real, shared, single-source-of-truth behavior without needing a common `extends` ancestor.

---

<a name="s6"></a>
# 6. Mixins

### Why does Dart have mixins given it already has interfaces via `implements`?
`implements` only gives a contract to fulfill — every method must be reimplemented from scratch with zero shared code. A `mixin`, applied via `with`, lets a class compose **real, working implementation** from multiple independent sources, something single inheritance (`extends`, limited to one superclass) can't do and `implements` explicitly doesn't offer. They solve the specific problem of needing shared behavior across classes that don't share a common base class.

```dart
mixin Flyable { void fly() => print('flying'); }
mixin Swimmable { void swim() => print('swimming'); }
class Duck extends Animal with Flyable, Swimmable { Duck(super.name); }
Duck('Donald').fly(); // 'flying' — real inherited behavior, unlike implements
```

### What does the `on` clause do, and why would you constrain a mixin to a specific superclass?
`mixin M on SuperClass` restricts which classes `M` can be mixed into, and in exchange lets the mixin's own methods safely call methods declared on `SuperClass`, trusting they'll be present. Without `on`, a mixin that assumes a certain method exists on whatever it's applied to would only discover a missing method at runtime; `on` turns that into a compile-time-checked guarantee.

```dart
abstract class Animal { void makeSound(); }
mixin Loud on Animal {
  void makeLoudSound() { makeSound(); makeSound(); } // calls a method Loud never declared itself
}
class Dog extends Animal with Loud { @override void makeSound() => print('Woof'); }
// class Rock with Loud {} // compile error — Rock isn't an Animal
```

### If two mixins define the same method, which one wins?
The last one listed in the `with` clause. Mixins are linearized into the inheritance chain in the order given, with each subsequent mixin layered closer to the class itself, so it takes priority over earlier ones (and over the base class) for any shared method name.

```dart
class Base { void greet() => print('Base'); }
mixin M1 { void greet() => print('M1'); }
mixin M2 { void greet() => print('M2'); }
class C extends Base with M1, M2 {}
C().greet(); // 'M2' — last mixin applied wins
```

### `extends` vs `implements` vs `mixin` — when is each the right tool?
`extends` for a genuine single-parent "is-a" relationship, with free inherited implementation but only one allowed. `implements` when you only need to guarantee an API shape with zero shared code, and multiple are allowed. `mixin`/`with` when a capability (logging, comparability, disposability) needs to be composed onto classes that don't otherwise share a common ancestor — free implementation, and multiple allowed.

### Predict:
```dart
mixin A { String who() => 'A'; }
mixin B { String who() => 'B'; }
class Base { String who() => 'Base'; }
class C extends Base with A, B {}
print(C().who());
```
`'B'` — `B` is the last mixin applied, so it wins the resolution order over both `A` and `Base`.

### A mixin is constrained with `on Animal`, but a `Robot` class in an unrelated hierarchy logically needs the same capability — what are the actual options?
Either give `Robot` an unrelated shared ancestor purely to satisfy the `on` constraint (often an awkward, artificial hierarchy change), loosen the mixin's `on` clause to something more general it can genuinely rely on, or duplicate a smaller, independent mixin without the `on` constraint for the unrelated hierarchy. Each trades type safety on the mixin's internal assumptions against how much of the class hierarchy you're willing to reshape just to reuse one capability.

### Why doesn't mixing in multiple mixins reintroduce the diamond-inheritance ambiguity that `extends` avoids by only allowing one superclass?
Because mixins aren't merged the way true multiple inheritance would merge two parents — they're **linearized** into a single, ordered chain, with each mixin inserted as its own distinct link between the base class and the final class. For any shared method name there's a deterministic, well-defined winner (the last mixin applied), not an ambiguous "which parent's implementation runs" question with no defined answer.

### A class mixes in 4 mixins, two of which happen to define a method with the same name — what's the actual debugging experience of figuring out which one "wins"?
You have to read the `with M1, M2, M3, M4` list and know the rule (last listed wins) — nothing in the method call site itself indicates which mixin's implementation is actually running, which is easy to get wrong when the mixin list is edited later without anyone checking for name collisions. The alternative is composition: the class holds explicit references to separate behavior objects (`logger.log()`, `validator.check()`) instead of mixing them in — slightly more verbose, but which implementation runs is explicit at every call site instead of implicit in inheritance-chain order.

---

<a name="s7"></a>
# 7. Collections

### `List` vs `Set` vs `Map` — the core distinctions?
`List<T>` is ordered, index-accessible, and duplicate-allowing. `Set<T>` is unordered and duplicate-free, with membership tested via `==`/`hashCode`. `Map<K, V>` is a key-value store — unordered in principle, though Dart's default `LinkedHashMap` implementation actually preserves insertion order in practice.

```dart
Set<int> unique = {1, 2, 2, 3}; // {1, 2, 3} — duplicate silently dropped
var fixedLength = List.filled(3, 0); // [0, 0, 0] — FIXED length, .add() throws
```

### What do collection-if and collection-for do?
They let `if`/`for` appear directly inside a collection literal, conditionally or repeatedly including elements without a separate imperative loop building the collection up beforehand.

```dart
final items = [
  'apple',
  if (showDiscount) 'discount-coupon',
  for (var i = 0; i < 3; i++) 'item$i',
];
```

### Spread (`...`) vs null-aware spread (`...?`)?
`...` expands another collection's elements directly into a new literal. `...?` does the same but safely no-ops instead of throwing if the spread source is `null`.

```dart
final a = [1, 2, 3];
final b = [0, ...a, 4]; // [0, 1, 2, 3, 4]
List<int>? maybeNull;
final c = [...?maybeNull, 5]; // [5] — null source skipped cleanly
```

### `Iterable` vs `List`, precisely — laziness and when a `.map().where()` chain actually executes?
`List` is a concrete, fully materialized, in-memory collection. `Iterable` is the interface both `List` and lazy transformation chains implement — a lazy `Iterable` returned by `.map()`/`.where()` describes a pending transformation, not yet-computed data. Chaining `.map().where().map()` builds up a pipeline with zero actual work done until something forces evaluation — `.toList()`, a `for...in`, or `.first`. This matters for real performance: a lazy chain terminated early by something like `.firstWhere()` never processes elements past the match, unlike materializing an intermediate `List` at every chained step.

```dart
final mapped = [1, 2, 3].map((n) { print('mapping $n'); return n * 2; });
print('nothing ran yet');
mapped.toList(); // THIS is what triggers evaluation
```

### `fold` vs `reduce`?
`fold` always requires an explicit initial value, and its accumulator can even be a different type than the collection's elements. `reduce` has no initial-value parameter — it uses the first element as the seed, so the accumulator type must match the element type, and it throws `StateError` on an empty collection with nothing to seed from — the same trap as JS's `reduce` without an initial value.

```dart
[1, 2, 3].fold<int>(0, (acc, n) => acc + n);              // 6
[3, 1, 4, 1, 5].reduce((a, b) => a > b ? a : b);            // 5
// [].reduce((a, b) => a + b); // throws StateError: No element
```

### Which collection methods are lazy and which are eager?
`.map()`, `.where()`, `.expand()`, `.take()`, `.skip()` are lazy — they return an `Iterable`, deferred. `.fold()`, `.reduce()`, `.toList()`, `.toSet()`, `.forEach()`, `.firstWhere()` are eager — they force the chain (fully or partially) to actually run immediately.

### What is `List.generate` for?
A declarative way to build a `List` by calling a generator function once per index, `0` through `length - 1`, instead of a manual loop with repeated `.add()` calls.

```dart
final squares = List.generate(5, (i) => i * i); // [0, 1, 4, 9, 16]
```

### Does `List.unmodifiable` actually protect internal state?
Only against mutation through the wrapper itself — it throws at runtime on any attempted mutation via that reference. It does **not** protect against a caller who still holds a reference to the *original* backing list from before it was wrapped; mutating the original still changes what the "unmodifiable" view exposes, since `List.unmodifiable` (and `UnmodifiableListView`) is a read-only view over the same underlying data, not an independent copy.

```dart
final readOnly = List.unmodifiable([1, 2, 3]);
// readOnly.add(4); // throws: Unsupported operation
```

### Predict:
```dart
final list = [1, 2, 3];
final iterable = list.map((n) => n * 2);
list.add(4);
print(iterable.toList());
```
`[2, 4, 6, 8]` — because `.map()` is lazy and doesn't evaluate until `.toList()` is called, it operates on the list's state *at evaluation time*, which now includes the `4` added after the `.map()` call was made. A real gotcha if you assume laziness means "captured a snapshot" the way it might in an eagerly-evaluated language.

---

<a name="s8"></a>
# 8. Generics

### Why do generics exist beyond "type safety" as a buzzword — what actually breaks at runtime with a raw, untyped collection that a generic one prevents at compile time?
A raw/`dynamic` collection accepts a wrong-typed element with no error at the point of insertion — the mistake only surfaces later, as a runtime crash, wherever code eventually tries to use that element assuming the expected type, often far from where the bug was actually introduced. A properly typed collection rejects the wrong-typed element immediately at compile time, at the exact line responsible.

```dart
List<dynamic> raw = [];
raw.add(5); raw.add('oops'); // compiles fine — no element type constraint at all
List<int> typed = [];
typed.add(5);
// typed.add('oops'); // compile-time error, caught immediately
```

### What does a bounded type parameter (`<T extends Comparable<T>>`) actually buy you?
It restricts what concrete types can be used for `T` to ones guaranteed to support a specific capability — here, `.compareTo()`. Without the bound, generic code couldn't safely call any method on a `T` beyond what `Object` itself guarantees, since the compiler has no information about what `T` will actually be at any given call site.

```dart
T findMax<T extends Comparable<T>>(List<T> items) {
  var max = items.first;
  for (final item in items.skip(1)) { if (item.compareTo(max) > 0) max = item; }
  return max;
}
```

### How does generic type inference work at a construction site?
The compiler infers the type parameter from the constructor argument when possible, so an explicit `<T>` isn't required at every call site.

```dart
final box = Box('hello'); // inferred as Box<String> from the argument
```

### Why is `List<Cat>` assignable to a `List<Animal>` variable, and why isn't that fully sound?
Dart generics are covariant by default, so `List<Cat>` is treated as a subtype of `List<Animal>` since every `Cat` is-an `Animal` — convenient for reading, since anything pulled out really is an `Animal`. It's unsound for writing: the compiler happily lets you `.add(Dog())` to what's statically typed `List<Animal>`, even though the actual underlying list is a `List<Cat>` — that specific insertion throws a runtime `TypeError`, because a `Dog` genuinely doesn't belong in the real, concrete list underneath. This is a deliberate, documented trade-off (unsound covariance, checked at runtime), made for practical ergonomics around read-heavy generic collection usage.

```dart
List<Cat> cats = [Cat()];
List<Animal> animals = cats;   // allowed — covariance
animals.add(Dog());              // compiles... throws at RUNTIME
```

### Predict:
```dart
List<int> numbers = [1, 2, 3];
List<num> asNum = numbers;
asNum.add(3.14);
print(numbers);
```
Throws a runtime `TypeError` at `.add(3.14)` — `numbers` is actually a `List<int>` underneath despite `asNum`'s static type being `List<num>` (covariance allows the assignment), and `3.14` (a `double`) doesn't belong in the real, concrete `List<int>`.

### Class-level type parameter (`class Box<T>`) vs method-level (`T firstOrDefault<T>(...)`) — what's the practical difference?
A class-level `T` is fixed for the entire lifetime of an instance — a `Box<int>` is always a `Box<int>`, never anything else. A method-level `T` can vary on every single call, inferred fresh from that call's arguments even when called repeatedly on the same object — `firstOrDefault<int>(...)` and a hypothetical `firstOrDefault<String>(...)` are just two independent calls to the same generic method, with no shared state between them.

### What's the actual argument for a generic `Repository<T>` class instead of writing `UserRepository`, `ProductRepository`, etc. by hand — and where does it start to strain?
One implementation handles CRUD-shaped logic (`getById`, `save`, `delete`) for every model type without duplicating near-identical boilerplate across a `UserRepository`, `ProductRepository`, and so on — write it once, instantiate as `Repository<User>`, `Repository<Product>`. It starts to strain the moment a specific model needs genuinely type-specific query logic (a `User`-only "find by email") that doesn't fit the generic shape — at that point you're either bolting on conditional type-specific methods (defeating the point of genericity) or subclassing the generic repository per type anyway.

### Under what caller-supplied list types does a `List<Object>` parameter that internally does `list.add(SomeSpecificType())` compile fine but throw at runtime — and how would you redesign it?
Any caller passing a more specific `List<T>` (say, `List<String>`) via covariance — it type-checks at the call site since every `T` is-an `Object`, but the internal `.add(SomeSpecificType())` throws at runtime the moment `SomeSpecificType` isn't actually assignable into the caller's real, concrete backing list. The fix is to make the function accept exactly the type it needs to insert, or to return a new list built from the input rather than mutating the one the caller passed in — turning a runtime possibility into a compile-time impossibility.

---

<a name="s9"></a>
# 9. Exception Handling

### `try`/`catch`/`finally` — the basic mechanics?
`try` wraps code to monitor, `catch` handles a thrown value, `finally` runs unconditionally afterward regardless of whether an exception occurred — the same core mechanics as JS's version.

```dart
try {
  final result = 10 ~/ 0; // throws IntegerDivisionByZeroException
} catch (e) {
  print('Caught: $e');
} finally {
  print('cleanup runs either way');
}
```

### `on` vs `catch` — and what's the rule about ordering?
`on ExceptionType catch (e)` catches only exceptions matching that type (or its subtypes), routing different exception types to different handlers. Bare `catch (e)` catches anything thrown, regardless of type. `on` clauses are checked top-to-bottom, first match wins — a generic `catch` belongs last, so it doesn't swallow exceptions a more specific `on` clause could have handled with better context.

```dart
try {
  riskyOperation();
} on FormatException catch (e) {
  print('Bad format: ${e.message}');
} catch (e, stackTrace) {
  print('Unknown: $e'); print(stackTrace); // second param captures the stack trace
}
```

### Why does Dart allow throwing any object, and why is that generally bad practice?
Dart's `throw` has no restriction on the object's type, same as JS. It's bad practice because catch clauses, logging tools, and the language's own conventions all assume a thrown value is an `Exception`/`Error` (or subtype) with structured, predictable fields like `.message` — throwing a bare string breaks that assumption for anything downstream trying to inspect or log the failure meaningfully.

```dart
throw 'Something broke';             // legal, non-idiomatic — loses structured info
throw ArgumentError('must be positive'); // idiomatic
```

### How do you build a custom exception class?
Implement `Exception` — a marker interface with no required members — and carry whatever structured, domain-specific data the failure needs, the Dart analogue of a custom JS `Error` subclass.

```dart
class ValidationException implements Exception {
  final String message, field;
  ValidationException(this.message, this.field);
  @override String toString() => 'ValidationException: $message (field: $field)';
}
```

### `Error` vs `Exception` — the intended semantic difference?
`Error` represents a programmer mistake — a bug, like an out-of-range index or a misused API — that generally shouldn't be caught and silently handled; it should crash loudly so it gets fixed (`ArgumentError`, `RangeError`, `StateError`, `LateInitializationError`). `Exception` represents an anticipated, recoverable failure condition — a network timeout, invalid user input — that well-written code is expected to catch and handle gracefully as part of normal operation.

```dart
int divide(int a, int b) {
  if (b == 0) throw ArgumentError('Cannot divide by zero'); // programmer misuse — an Error
  return a ~/ b;
}
```

### `rethrow` vs `throw e` inside a catch block — why aren't they the same?
`rethrow` re-throws the exception currently being handled while preserving its **original stack trace**, pointing back to where it actually occurred. `throw e` throws the caught variable as a brand-new throw statement, which resets the stack trace to originate at that `throw e` line instead — losing the real crash site, which matters a lot when debugging a production failure from its stack trace.

```dart
void process() {
  try { riskyOperation(); }
  catch (e) { logError(e); rethrow; } // preserves the ORIGINAL trace
}
```

### Predict — what does the stack trace show?
```dart
void inner() { throw Exception('boom'); }
void outerRethrow()  { try { inner(); } catch (e) { rethrow; } }
void outerNewThrow() { try { inner(); } catch (e) { throw e; } }
```
`outerRethrow()`'s propagated exception carries a stack trace pointing to `inner()` as the actual origin. `outerNewThrow()`'s propagated exception's stack trace instead originates at the `throw e;` line inside `outerNewThrow` — `inner()`'s real involvement is lost from the trace.

### Why can an empty `catch (e) {}` block make a production issue *harder* to diagnose than having no try/catch at all?
With no try/catch, an exception propagates and crashes loudly with a full stack trace pointing right at the real failure — someone sees it immediately, close to its cause. An empty catch swallows the error entirely, including genuine `Error`s that represent real bugs, so the program keeps running in a corrupted or unexpected state with zero record anything went wrong — the failure only surfaces later, as some unrelated, confusing symptom downstream, disconnected from its actual cause.

### An app-wide handler logs `e.toString()` for every caught exception, but half the codebase throws bare strings (`throw 'failed'`) instead of proper `Exception` subclasses — what's actually unavailable to that handler for the bare-string throws?
Any structured information beyond the raw message text: no `.message` field to extract cleanly, no exception *type* to branch logging or alerting logic on, no consistent shape for logging tools to parse, and no way for upstream code to `on SpecificException catch` it selectively — since a bare string has no distinct type at all to match against, only its literal text.

---

<a name="s10"></a>
# 10. Futures & async/await

### `Future` vs `Promise` — what's the same, what's actually different?
Conceptually near-identical: both represent an eventually-available value or error, both settle exactly once and stay settled, both compose via `async`/`await`. What genuinely differs: Dart's concurrency model is per-isolate — no shared-memory threads at all — so there's no cross-thread race-condition concern JS arguably still has at the edges. `Future.wait` maps to `Promise.all`, but Dart's microtask/event queue draining rules are its own implementation, not literally the same algorithm as a browser/Node event loop — don't assume identical output ordering for mixed microtask/event-queue code without checking.

```dart
Future<String> fetchUsername() async {
  await Future.delayed(Duration(seconds: 1));
  return 'V'; // an async function's return value is auto-wrapped in a Future<String>
}
```

### `Future.value` / `Future.error` / `Future.delayed`?
Three ways to construct a `Future` directly rather than deriving one from `async`: `.value(x)` completes immediately with `x`; `.error(e)` completes immediately in the error state; `.delayed(duration, callback)` runs the callback and completes after the given delay.

```dart
Future.value(42);                              // immediately-completed Future<int>
Future.error(Exception('failed'));                // immediately-completed, error state
Future.delayed(Duration(seconds: 2), () => 'done'); // completes after a delay
```

### What does the `.then()`/`.catchError()`/`.whenComplete()` chain give you over `await`?
It's the callback-style alternative to `async`/`await`, with the same flattening behavior as JS's `.then()` — each `.then()` waits for a returned `Future` too — plus `.whenComplete()` as Dart's `.finally()` equivalent, running regardless of success or failure.

```dart
fetchUsername()
  .then((u) => fetchOrders(u))
  .then((orders) => print(orders))
  .catchError((e) => print('Error: $e'))
  .whenComplete(() => print('done, success or failure'));
```

### `Future.wait` — Dart's `Promise.all` — and what does `eagerErrors` control?
`Future.wait(futures)` runs a list of already-in-flight Futures concurrently and completes with a `List` of their results in input order. By default (`eagerErrors: true`) it fails fast, completing with an error the instant any one Future errors, without waiting for the others — same as `Promise.all`. Setting it `false` lets every Future finish (success or failure) before surfacing the *first* error, useful when some of those Futures have side effects you want to complete regardless of one failure elsewhere.

```dart
final results = await Future.wait([fetchUser(), fetchOrders(), fetchSettings()]);
```

### Why is awaiting inside a loop the same performance trap as in JS, and what's the fix?
Each `await` inside a loop iteration blocks that iteration from even starting the next one until the current async operation completes, turning N independent operations into N sequential ones and multiplying total latency by N — identical root cause to the JS version. The fix is identical too: build the list of Futures first (they start running the moment they're created, not when awaited), then `await Future.wait(...)` on all of them together.

```dart
// BAD — total time = sum of all delays
for (final id in ids) { results.add(await fetchUser(id)); }
// GOOD — total time = the slowest single fetch
final results = await Future.wait(ids.map(fetchUser));
```

### How does Dart's microtask/event queue model work, and how does it compare to JS's?
Structurally similar two-queue model — a **microtask queue** (drained fully before the next event-queue item, used for most `Future` callback scheduling) and an **event queue** (timers, I/O, UI events) — but the exact queue priority and draining rules are Dart's own implementation, not identical to a browser/Node event loop.

```dart
print('1');
Future(() => print('2'));                // event queue
scheduleMicrotask(() => print('3'));       // microtask queue
Future.microtask(() => print('4'));          // also microtask queue
print('5');
// 1, 5, 3, 4, 2 — sync first, then both microtasks in scheduling order, then the event-queue Future
```

### Predict:
```dart
Future<void> main() async {
  print('start');
  await Future.delayed(Duration.zero);
  print('after await');
}
```
`start`, then `after await` — printed on separate turns of the event loop; even a zero-duration delay still defers to at least the next event-queue turn, it's never truly synchronous despite `Duration.zero`.

### What happens if an `async` function's `Future` is never awaited and later completes with an error?
The error becomes an unhandled exception — Dart's runtime reports it as an uncaught error (typically crashing a CLI/test run, or logged as an unhandled exception in a Flutter app), the same shape of problem as an unhandled JS promise rejection: the failure happened, but nothing in the call chain was listening for it, so it surfaces asynchronously and disconnected from the code that triggered it, rather than at a `catch` block that could react meaningfully.

---

<a name="s11"></a>
# 11. Streams

### `Future` vs `Stream`, precisely?
A `Future` represents exactly one eventual value or error, settling permanently once. A `Stream` represents a sequence of async events — zero, one, or many values over time, plus an optional error or completion signal — modeling something ongoing, like a live data feed or a sequence of user taps, rather than a single request/response. There's no direct base-JS equivalent — RxJS Observables (familiar from an Angular background) are the closest analogue, so this is genuinely new intuition for a JS-only background, not just new syntax over a familiar idea.

```dart
Stream<int> countStream() async* {
  for (int i = 1; i <= 3; i++) { await Future.delayed(Duration(seconds: 1)); yield i; }
}
```

### Single-subscription vs broadcast streams — what breaks if you `.listen()` twice on a single-subscription stream?
A single-subscription stream (the default) allows exactly one `.listen()` call over its lifetime — a second throws `Bad state: Stream has already been listened to.` This is a deliberate design constraint: single-subscription streams model a one-shot sequence tightly coupled to one consumer's lifecycle (closing the underlying resource when that one listener cancels), which multiple independent listeners would make ambiguous — who "owns" cancellation? A broadcast stream (`.broadcast()`) explicitly supports multiple simultaneous listeners, but events emitted **before** a listener attaches are lost to it — no per-listener buffering.

```dart
final c = StreamController<int>();
c.stream.listen((v) => print('A: $v'));
// c.stream.listen((v) => print('B: $v')); // throws — already has a listener
```

### What does `StreamController` do?
It's the object that lets you manually create and populate a `Stream` — `.add(value)` emits a value, `.addError(e)` emits an error, `.close()` signals completion — exposing the actual `.stream` for consumers to listen to.

```dart
final controller = StreamController<String>();
controller.stream.listen((d) => print('Data: $d'), onDone: () => print('closed'));
controller.add('hello');
controller.close(); // triggers onDone
```

### How does transforming a Stream (`.map`, `.where`) compare to the same operations on an `Iterable`?
The same lazy-pipeline idea, applied to a sequence of async events rather than a synchronous collection — each transformation is applied per-event as it arrives, without materializing the whole sequence anywhere.

```dart
Stream.fromIterable([1, 2, 3, 4, 5])
  .where((n) => n.isEven)
  .map((n) => n * 10)
  .listen(print); // 20, 40
```

### What do `async*` and `yield`/`yield*` do?
An `async*` function is a generator that returns a `Stream<T>` instead of computing a single value — `yield value` emits one value into the stream; `yield*` emits every value from another stream or iterable in sequence, effectively splicing one stream's events into another.

```dart
Stream<int> combined() async* {
  yield* countUpTo(3); // 1, 2, 3
  yield* countUpTo(2);   // then 1, 2 again
}
```

### Why does forgetting to cancel a `StreamSubscription` matter?
The subscription keeps the stream (and anything the producer holds onto — an open socket, a Firestore listener, a timer) alive and active as long as it isn't cancelled, even after the code that created it no longer needs it — the same category of leak as a JS event listener that's never removed. In a Flutter `State` object specifically, an uncancelled subscription can try to call `setState()` after the widget's been disposed, crashing with a very common real-world error.

```dart
final subscription = someStream.listen((data) => print(data));
// later, e.g. in dispose():
subscription.cancel();
```

### How do you combine multiple streams?
Via helpers like `StreamGroup.merge` (from the `async` package), which interleaves events from several source streams into one combined stream as they arrive from each.

```dart
Stream<int> a = Stream.periodic(Duration(seconds: 1), (i) => i);
Stream<int> b = Stream.periodic(Duration(seconds: 2), (i) => i * 10);
StreamGroup.merge([a, b]).listen(print); // interleaves events from both
```

### Predict:
```dart
final controller = StreamController<int>.broadcast();
controller.stream.listen((v) => print('Early: $v'));
controller.add(1);
controller.stream.listen((v) => print('Late: $v'));
controller.add(2);
```
`Early: 1`, then `Early: 2` and `Late: 2` — the late listener misses event `1` entirely since it subscribed after that event was already emitted; broadcast streams don't buffer for late subscribers.

---

<a name="s12"></a>
# 12. Isolates & Concurrency

### What is an isolate?
Dart's unit of concurrency — each isolate has its own memory heap and runs on a single thread with its own event loop, completely isolated from every other isolate's memory. This is the direct structural parallel to JS's single-threaded execution model — one call stack per isolate, no data races possible *within* one — but Dart's answer to "how do you use multiple CPU cores" is spawning additional isolates, not Web Workers, though the underlying goal is the same.

```dart
void main() {
  heavyComputation(); // if this takes 3 seconds, the (Flutter) UI FREEZES for 3 seconds —
}                        // nothing else is running on this isolate's single thread meanwhile
```

### Why did Dart choose isolates (no shared memory) instead of OS threads with shared memory and locks?
Shared-memory concurrency requires manual synchronization — locks, mutexes — to prevent race conditions, and getting that wrong produces some of the hardest bugs to find: deadlocks, subtle data corruption from a missed lock. By making memory sharing structurally impossible between isolates — communication only via copied messages through `SendPort`/`ReceivePort` — Dart eliminates that entire bug category outright rather than just discouraging it through convention or tooling. It's conceptually the same "no locks needed" guarantee JS's single-threaded model gives synchronous code, extended to genuine multi-core parallelism via isolation instead of shared state.

```dart
void isolateEntryPoint(SendPort mainSendPort) {
  final receivePort = ReceivePort();
  mainSendPort.send(receivePort.sendPort);
  receivePort.listen((message) => mainSendPort.send(message * 2)); // result is COPIED back, not shared
}
```

### What does `Isolate.spawn` do, and what sits on top of it?
`Isolate.spawn(entryPoint, message)` creates a new isolate running the given top-level (or static) function, passing one initial message — the low-level API underlying higher-level helpers like Flutter's `compute()`.

```dart
Future<int> heavyCalculation(int input) async {
  final receivePort = ReceivePort();
  await Isolate.spawn(_isolateFunction, [receivePort.sendPort, input]);
  return await receivePort.first as int;
}
```

### What does Flutter's `compute()` helper give you over calling `Isolate.spawn` directly?
`compute(callback, message)` wraps the spawn/message/cleanup boilerplate `Isolate.spawn` requires manually into a single call for a one-shot computation — you get the isolate's parallelism without hand-writing the port setup.

```dart
Future<List<Item>> parseJsonInBackground(String jsonString) =>
    compute(_parseJson, jsonString); // runs on a SEPARATE isolate, UI isolate stays free
```

### When are isolates actually worth the overhead — and when are they not?
Spawning an isolate has real cost: memory for a new heap, startup time, and serialization cost for copying messages across the boundary. It's worth it specifically for **CPU-bound** work substantial enough that the isolation cost is smaller than the cost of janking the UI thread — parsing a multi-megabyte JSON response, image resizing, on-device ML inference, a tight synchronous loop over a large dataset. It is **not** worth it for I/O-bound work, which is already non-blocking via `Future`/`async`/`await` and gains nothing from a second isolate beyond added serialization overhead.

```dart
compute(_parseHugeJsonFile, rawJsonString);       // GOOD — genuinely CPU-heavy
// compute(_fetchFromNetwork, url);                // BAD — http.get() is already non-blocking
```

### Is Dart "single-threaded" the same claim as JavaScript being single-threaded — same nuance and caveat?
Yes, structurally identical: a single isolate/JS environment runs on one thread with one call stack, so there are no data races *within* it. Both languages have the same escape hatch for genuine parallelism — Web Workers in JS, isolates in Dart — that don't violate the single-threaded guarantee of the main context, because they're fully separate, memory-isolated execution contexts communicating only via message passing, not shared-memory threads bolted onto the same context.

### Predict — a tight, CPU-heavy synchronous loop runs directly inside Flutter build/UI code, with no `await` anywhere. What happens?
The UI freezes for the entire duration — no frames render, no touch input is processed, because it's all running synchronously on the single UI isolate with nothing yielding control back to the event loop. `async`/`await` alone doesn't help here either, since the loop itself has no `await` points to yield at — the fix requires actually moving the work to a different isolate via `compute()`/`Isolate.spawn`.

### A network call — already async via `http.get()` — gets wrapped in `compute()` "to be safe." What does that actually cost?
Isolate spawn time plus the serialization cost of copying the response across the isolate boundary, for zero real benefit — the network call was never going to block the UI thread in the first place, since `await` already yields control back to the event loop while it's in flight. "Isolate = always safer/faster" is the wrong intuition here; isolates only pay off for genuinely CPU-bound, blocking work.

---

<a name="s13"></a>
# 13. Enums & Pattern Matching

### What does an enhanced enum buy you over a plain one?
A plain enum is just a set of named labels — associating real data with each value requires a separate, manually-maintained lookup structure elsewhere in the code, which can drift out of sync when a new value is added. An enhanced enum (Dart 2.17+) lets each value carry its own fields, a `const` constructor, and even computed methods/getters, declared once, directly alongside the value itself.

```dart
enum Planet {
  mercury(diameterKm: 4879, hasMoons: false),
  earth(diameterKm: 12742, hasMoons: true);
  final int diameterKm; final bool hasMoons;
  const Planet({required this.diameterKm, required this.hasMoons});
  bool get isLarge => diameterKm > 10000;
}
```

### What did Dart 3 pattern matching add to `switch`, and what does a guard clause (`when`) add on top of that?
Dart 3 extended `switch` to match a value's **shape** — a specific type, a destructured object's fields, a list pattern — rather than only equality, and introduced `switch` **expressions** that evaluate directly to a value. A `when` guard adds an arbitrary boolean condition evaluated *after* the shape/type match succeeds, letting one case distinguish, say, a negative `int` from a non-negative one without a separate case or a nested `if` inside the branch body.

```dart
String describe(Object value) => switch (value) {
  int n when n < 0 => 'negative int',    // guard clause
  int() => 'positive int',                 // type pattern, ignores the value
  [int a, int b] => 'two ints: $a, $b',      // destructures a 2-element list
  _ => 'something else',
};
```

### How does pattern-matching exhaustiveness checking catch a missed case at compile time?
When switching over a type with a closed, known set of possible values — an `enum`, or a `sealed class` hierarchy — the compiler can enumerate every possible case and verify the switch handles all of them. Add a new case later (a new enum value, a new sealed subclass) and an existing `switch` expression that doesn't handle it becomes a compile error immediately, rather than silently falling through or throwing at runtime the first time a user hits that unhandled value.

```dart
enum Status { pending, active, completed }
String label(Status s) => switch (s) {
  Status.pending => 'Pending',
  Status.active => 'Active',
  Status.completed => 'Completed',
  // a new Status value not handled here would be a COMPILE-TIME "not exhaustive" error
};
```

### Predict:
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
`'two: 1, 2'` — the list pattern `[int a, int b]` matches a `List` of exactly two elements, both destructured and bound; Dart evaluates cases top-to-bottom, and this is the first (and only) matching pattern for a 2-element list.

### Plain enum vs a `sealed class` hierarchy — when do you reach for one over the other?
A plain or enhanced enum suits a closed set of values that are essentially interchangeable data and behavior wrapped around the same field set — a `Status` label, a `Planet` with a diameter and a moon flag. A `sealed class` hierarchy is for when each "case" needs a genuinely *different shape* of data — `Success` carries a value, `Failure` carries an error message — which an enum can't express, since every enum value is stuck sharing the exact same fields.

### What does `.index` give you on a basic enum, and why is it risky to persist (e.g. save to a database)?
`.index` is the value's zero-based position in declaration order. Persisting it is risky because reordering the enum's declared values, or inserting a new value anywhere but the end, silently shifts every subsequent value's index — previously-stored data now points at the wrong value with no error anywhere. `.name` (the string) is the safer thing to persist, since it's stable across reordering.

### A `sealed class` hierarchy models API response states (`Loading`/`Success`/`Failure`), switched over exhaustively in 15 places, and a new `Cancelled` state is added. What's the actual fix experience?
The compiler flags every single `switch` expression that isn't exhaustive over the now-four-case hierarchy as a compile error — the exact file and line, not a vague test failure discovered later. That's meaningfully better than a runtime `if`/`else if` chain missing the new case silently: with `sealed`, there's no way to ship the change without the compiler walking you to every affected site.

### A pattern destructures expected keys directly from a `Map<String, dynamic>` (parsed JSON), e.g. `{'name': String name, 'age': int age}` — what happens if `age` is missing or the wrong type?
The pattern simply fails to match — that `case` is skipped as if the value didn't match at all, falling through to the next case (or a wildcard `_`, if present). If nothing else matches and there's no wildcard, a `switch` **expression** throws at runtime for the unmatched value — so a JSON-shape mismatch here surfaces as a runtime match failure, not a graceful per-field error message, unless a fallback case is written to handle it explicitly.

---

<a name="s14"></a>
# 14. Records

### What problem do records solve that Dart didn't have a clean answer for before Dart 3?
Returning multiple logically-related values from a function without declaring a dedicated wrapper class purely for that purpose. Before records, the options were all compromises — a `List`/`Map` loses per-element type safety and reads awkwardly by index, and a one-off class for a single function's return shape is real boilerplate for something conceptually trivial. Records give a lightweight, type-safe, throwaway-class-free way to bundle values together.

```dart
(double, double) minMax(List<double> values) {
  double min = values.first, max = values.first;
  for (final v in values) { if (v < min) min = v; if (v > max) max = v; }
  return (min, max); // no throwaway class needed
}
final (lowest, highest) = minMax([3.2, 1.1, 5.5]); // destructured at the call site
```

### What does "structurally typed" mean for records, and why is that a departure from the rest of Dart?
Two records are type-compatible if they have the same shape — same field types in the same positions/names — regardless of how or where they were constructed, with no shared declared type linking them. The rest of Dart's type system is nominal — a `Dog` and a `Cat` with identical fields are still unrelated types unless one explicitly extends/implements the other. Records are Dart's one genuinely structural-typing feature.

```dart
(int, String) pair = (1, 'one');
print(pair.$1); // 1 — positional fields via $1, $2, ...
({int id, String name}) user = (id: 1, name: 'V');
print(user.id); // 1 — named field, self-documenting
```

### When would you choose a record over a full class, and vice versa?
A record for something lightweight and local — especially a function's return value, immediately consumed and destructured by the caller, with no real behavior attached; records are also always immutable. A class once the data needs actual methods/behavior, needs to be a stable, documented part of a public API's shape, or benefits from nominal typing so structurally-similar-but-conceptually-different things can't be silently interchanged.

```dart
(int, int) divmod(int a, int b) => (a ~/ b, a % b); // good record use — local, throwaway
class User { final String id, name; User(this.id, this.name); } // real domain concept — a class
```

### Predict:
```dart
(int, String) a = (1, 'x');
(int, String) b = (1, 'x');
print(a == b);
class Point { final int x; Point(this.x); }
print(Point(1) == Point(1));
```
`true`, then `false` — records have structural, value-based `==` by default (equal if every field is equal). A plain class has no custom `==` override, so it falls back to identity comparison — two separately-constructed `Point(1)` instances are unequal despite identical field values, unless the class explicitly overrides `==`/`hashCode`.

### Can a record have mutable fields?
No — records are always immutable, unconditionally. That's a fixed characteristic distinguishing them from classes, which can freely declare mutable fields; a record is only ever a fixed, structurally-typed bundle of values assigned once at construction.

### How do you destructure a record at the call site of a function that returns one?
Pattern-match its fields directly into fresh local variables in the same line that calls the function, rather than accessing `.$1`/`.$2` afterward.

```dart
final (lowest, highest) = minMax([3.2, 1.1, 5.5]); // destructured immediately, both fields bound
```

### At what point do deeply nested records (`(String, (int, int), List<(String, bool)>)`) start hurting more than the class boilerplate they saved?
Once nested deep enough, they have no declared name to point to in an error message, in documentation, or when navigating in an IDE — a type error refers to "a `(String, (int, int))`" with no domain meaning attached, where a named class (`UserCoordinates`) would read immediately. Past a couple of levels of nesting, the readability lost outweighs whatever boilerplate the record avoided.

### A function's return type evolves from `(String, int)` to `(String name, int age)` — adding field names — across a refactor. What breaks?
Existing callers destructuring the old **positional** form (`final (a, b) = fn();`) keep working fine — positional destructuring is unaffected by adding names, since `$1`/`$2` access and positional pattern destructuring don't depend on field names existing. Callers who'd want the new self-documenting `.name`/`.age` access have to opt into it explicitly. This is a materially gentler evolution than adding a field to an existing class, which doesn't risk breaking positional access at all since classes have no positional record-style access to begin with — the record case is specifically about the shape of the *type signature* changing, which is a compile-time-checked mismatch if a caller's declared record type doesn't line up.

---

<a name="s15"></a>
# 15. Extension Methods & Operator Overloading

### What does an extension method actually compile to — is it a real method on the type?
No — an `extension` adds methods/getters to a type you don't own without subclassing it, but it's resolved entirely at **compile time** (static dispatch) based on the receiver's *static* type, not a genuine runtime addition to the target type. `'hello'.capitalize()` compiles to something closer to a static function call. That's why it can't be reached via `dynamic` dispatch or reflection, and why two extensions on the same type with a same-named method both imported into scope require explicit disambiguation.

```dart
extension StringExtensions on String {
  String capitalize() => isEmpty ? this : '${this[0].toUpperCase()}${substring(1)}';
}
print('hello'.capitalize()); // 'Hello' — reads like a real built-in method, isn't one at runtime
```

### How is an extension's visibility scoped?
An extension is only usable in code where it's actually imported — it's not globally attached to the type everywhere in the program, a deliberate namespacing safeguard against extension-method naming collisions across unrelated packages.

```dart
// file A: extension StringExtensions on String { String shout() => '${toUpperCase()}!'; }
// file B, without importing file A:
// 'hello'.shout(); // compile error — not visible here
```

### What does operator overloading let you do, and what's the syntax?
It lets a class define custom behavior for operators (`+`, `-`, `==`, `[]`, etc.) via `operator` method declarations, so instances can be combined/compared with natural operator syntax instead of a named method call.

```dart
class Vector {
  final double x, y;
  const Vector(this.x, this.y);
  Vector operator +(Vector other) => Vector(x + other.x, y + other.y);
}
print(Vector(1, 2) + Vector(3, 4)); // Vector(4, 6)
```

### Why is overriding `==` without also overriding `hashCode` a real bug, not just a lint nag?
`Set` and `Map` use `hashCode` to bucket objects internally, and their contract requires that equal objects (per `==`) must have equal `hashCode`s. Override `==` to mean "same x and y" but leave the default identity-based `hashCode`, and two structurally-equal instances can hash to different buckets — a `Set` can silently contain what looks like a duplicate, and a `Map` lookup can fail to find an entry that's genuinely there by `==`, because the lookup hashes to the wrong bucket first.

```dart
class Vector {
  final double x, y;
  @override bool operator ==(Object other) => other is Vector && other.x == x && other.y == y;
  @override int get hashCode => Object.hash(x, y); // MUST be overridden alongside ==
}
```

### What is a callable class, and why use one over a plain function/closure?
A class implementing a `call(...)` method can have its instances invoked directly like a function (`instance(args)`), letting it behave as a function while still carrying state and other methods a plain closure can't cleanly hold — useful for something like a configurable transformer or validator that needs to be passed around as if it were a simple function.

```dart
class Multiplier {
  final int factor;
  Multiplier(this.factor);
  int call(int value) => value * factor;
}
final triple = Multiplier(3);
print(triple(5)); // 15 — calling the instance directly
```

### Predict:
```dart
class Point {
  final int x, y;
  Point(this.x, this.y);
  @override bool operator ==(Object other) => other is Point && other.x == x && other.y == y;
  // hashCode NOT overridden
}
final set = <Point>{};
set.add(Point(1, 1));
set.add(Point(1, 1));
print(set.length);
```
Likely `2`, not `1` — even though `Point(1,1) == Point(1,1)` is `true`, the `Set` uses the unoverridden, identity-based `hashCode` to bucket entries first, so the two structurally-equal-but-differently-hashed instances typically land in different buckets and both get added, silently violating the intended "no duplicates" behavior — exactly the bug the `==`/`hashCode` pairing rule exists to prevent.

### Two different packages both define an extension method named `.isValid` on `String`, and a file imports both — what happens?
Calling `'x'.isValid` is ambiguous, since both extensions are in scope with the same name on the same receiver type — Dart reports a compile error rather than silently picking one. The fix is to hide one via `import 'package:a/a.dart' hide StringExtensions;` or to explicitly disambiguate which extension's method to call by name (`PackageAStringExtensions('x').isValid`).

### A data model correctly overrides `==`/`hashCode` based on an `id` field, but that `id` is mutable and gets changed *after* the instance is already inserted into a `Set` — what happens?
The object's `hashCode` changes the moment `id` changes, but the `Set` already bucketed it under the **old** hash — so a later `contains()` or `remove()` call, which hashes the object with its *new* `id` to find its bucket, looks in the wrong place and can't find it. The object effectively "disappears" from the `Set`'s perspective — `contains()` returns `false` for an object still physically present inside the set's internal storage — exactly why `==`/`hashCode` should be based on immutable identity fields, not ones that change after insertion.

---

<a name="s16"></a>
# 16. Packages, pubspec.yaml & Tooling

### What does `pubspec.yaml` describe?
A Dart/Flutter project's manifest — name, version, SDK constraints, dependencies and dev dependencies — the Dart ecosystem's direct analogue of `package.json` in Node.

```yaml
name: my_app
version: 1.0.0+1
environment:
  sdk: '>=3.0.0 <4.0.0'
dependencies:
  http: ^1.1.0
dev_dependencies:      # only needed during development/testing, NOT shipped with the app
  test: ^1.24.0
```

### What does `^1.2.3` actually allow to be installed, precisely?
Any version greater than or equal to `1.2.3` but strictly less than `2.0.0` — the caret constraint trusts semantic versioning's convention that a `MAJOR` bump signals a breaking change, so it locks out major upgrades while allowing any newer minor/patch release within the same major version to be picked up automatically.

```yaml
http: ^1.1.0 # allows 1.1.0, 1.2.0, 1.9.5, ... but NEVER 2.0.0
```

### `pub get` vs `pub upgrade`?
`dart pub get` resolves and downloads dependencies matching `pubspec.yaml`'s constraints, respecting the existing `pubspec.lock` if present, and writes the exact resolved versions there. `pub upgrade` re-resolves to the newest versions still allowed by those same constraints, updating the lockfile in the process.

```
dart pub get       # installs, respecting the existing lockfile
dart pub upgrade    # re-resolves to the newest versions the constraints still allow
```

### `dart:` core libraries vs pub.dev packages?
`dart:`-prefixed imports (`dart:core`, `dart:async`, `dart:convert`) ship with the Dart SDK itself and are always available with no `pubspec.yaml` entry needed. pub.dev packages are third-party, must be explicitly declared as a dependency, and are resolved/downloaded via `pub get` with exact versions pinned in `pubspec.lock`.

```dart
import 'dart:convert';                       // SDK-provided, no pubspec entry needed
import 'package:http/http.dart' as http;      // pub.dev — requires a pubspec.yaml dependency entry
```

### `import`/`export` vs `part`/`part of` — why should most code prefer `import`?
`import`/`export` keeps each file its own distinct compilation unit with an explicit, readable dependency boundary — you can tell what a file depends on just by its import list. `part`/`part of` merges multiple physical files into one shared namespace with implicit, unqualified cross-file access, which erodes that clarity. It's genuinely useful for generated code (where a tool like `freezed` or `json_serializable` manages the coupling automatically), but a poor default for hand-written application code.

```dart
// main_library.dart
part 'helper.dart';
// helper.dart
part of 'main_library.dart'; // direct, unqualified access to main_library.dart's namespace
```

### What does `analysis_options.yaml` control?
The Dart analyzer's static checks and lint rules for a project — what gets flagged as a warning/error beyond genuine compile errors, e.g. requiring `const` where possible or disallowing `print()` in production code.

```yaml
include: package:flutter_lints/flutter.yaml
linter:
  rules:
    prefer_const_constructors: true
    avoid_print: true
```

### A team's `pubspec.lock` is accidentally `.gitignore`d — what's the concrete consequence?
Two developers running `pub get` on the same `pubspec.yaml` at different points in time can resolve to different actual dependency versions within the same caret ranges, since there's no shared lockfile pinning the exact versions everyone should get — one developer might be on `http: 1.3.0` while another is on `1.1.0`, both technically satisfying `^1.1.0`, but potentially behaving differently or hitting a bug that's already fixed for one and not the other.

### 80+ dependencies, several transitively depending on incompatible versions of the same shared package — how does Dart's resolver actually handle this "diamond dependency" conflict?
Dart's version solver tries to find one single version of each package that satisfies every transitive constraint across the whole dependency graph simultaneously — unlike npm, which can nest multiple versions of the same package side by side. If no single version can satisfy every constraint at once, `pub get` fails outright with a version-solving error rather than silently installing something incompatible. The practical fallout: you have to manually relax a constraint, upgrade whichever dependency is pinned too low, or add a `dependency_overrides` entry to force a specific version and accept the risk that comes with it.

---

<a name="s17"></a>
# 17. Testing in Dart

### What do `setUp`/`tearDown` solve, and why run before/after *every* test rather than once per group?
They eliminate repeated fixture-creation boilerplate across tests while guaranteeing test isolation — running before/after every individual test (not just once for the whole group) ensures one test's leftover state can never leak into and silently affect the next test's outcome, which would make failures hard to reproduce and dependent on test execution order.

```dart
group('Calculator', () {
  late Calculator calculator;
  setUp(() { calculator = Calculator(); }); // fresh instance before EACH test
  tearDown(() { calculator.dispose(); });
  test('adds two numbers', () { expect(calculator.add(2, 3), equals(5)); });
});
```

### What does `expect()` give you over raw equality checks?
`expect(actual, matcher)` asserts a value meets some condition — the matcher can be a plain value for implicit equality, or one of many composable matcher functions (`equals`, `isA<T>()`, `throwsA(...)`, `contains`, `closeTo`) for more expressive assertions than raw `==`, including things like approximate floating-point equality that a direct `==` check would fail on spuriously.

```dart
expect(3.14159, closeTo(3.14, 0.01)); // approximate — useful for floating point
expect(() => calculator.divide(5, 0), throwsA(isA<ArgumentError>()));
```

### How do you test async code — Futures and Streams?
`test()` bodies can themselves be `async`, letting you `await` directly inside a test. For Streams, `expectLater` combined with matchers like `emitsInOrder` asserts against the exact sequence of events a Stream emits, rather than a single already-resolved value.

```dart
test('fetchUser returns expected data', () async {
  final user = await fetchUser('123');
  expect(user.name, equals('V'));
});
test('stream emits expected sequence', () {
  expect(countStream(3), emitsInOrder([1, 2, 3, emitsDone]));
});
```

### How would you test a class with an async dependency without hitting the real network?
Inject the dependency (an API client) rather than constructing it internally, then substitute a mock in the test that stubs the specific calls the code under test will make, returning controlled fake data instead of making a real network request. This lets the test run fast, deterministically, and offline, while still verifying the class under test correctly calls and reacts to its dependency.

```dart
class MockApiClient extends Mock implements ApiClient {}
test('UserRepository returns parsed user', () async {
  final mockClient = MockApiClient();
  when(() => mockClient.get('/user/1')).thenAnswer((_) async => {'id': '1', 'name': 'V'});
  final repo = UserRepository(mockClient);
  expect((await repo.getUser('1')).name, equals('V'));
  verify(() => mockClient.get('/user/1')).called(1); // assert the dependency was actually called
});
```

### `mockito` vs `mocktail` — what's the practical difference?
`mockito` relies on code generation (or manual subclassing) to create mock classes; `mocktail` achieves the same mocking capability without any code-generation step at all, at the cost of slightly less compile-time safety on stubbed calls.

### Why should business logic live in plain Dart classes rather than directly inside widget code, from a testing perspective?
A pure-Dart unit test exercises a class or function with no widget tree or rendering involved at all — fast, and needs only the plain `test` package. Business logic embedded directly in widget `build()` methods or `State` classes can only be verified via the heavier `flutter_test` widget-testing machinery (`testWidgets`), which builds and interacts with an actual simulated widget tree — slower to run, and harder to isolate from rendering concerns entirely unrelated to the logic actually being tested.

```dart
// pure-Dart unit test — fast, no Flutter dependency
test('OrderCalculator computes total with tax', () {
  expect(OrderCalculator(taxRate: 0.08).total(100), closeTo(108.0, 0.01));
});
```

### A mocked dependency is always stubbed to return success, but the real one occasionally times out or returns malformed data in production — what's the risk?
Over-mocking hides an entire class of failure-path bugs — error handling, retries, malformed-response parsing — because the test suite never actually exercises those code paths; every test "passes" against a dependency that behaves nothing like production under stress. The fix isn't to abandon mocking, but to deliberately decide which interactions are important enough to also cover with an integration test against something closer to the real dependency (a local test server, a sandboxed API), specifically to catch what an always-happy mock can never surface.

### A 2,000-test suite takes 20 minutes because a large fraction are widget tests exercising business logic that has nothing to do with rendering — what's the argument for extracting that logic, beyond "it's good practice"?
A widget test has to build and pump an actual simulated widget tree for every single case, which is inherently much slower per test than a plain-Dart unit test that just calls a method and asserts on the return value — there's no tree, no simulated frame, no rendering pipeline involved at all. Moving pure business logic out of widget code so it's exercised by fast unit tests instead can cut a large chunk of that 20 minutes without losing any actual coverage, since the extracted logic never depended on rendering in the first place.

---

## Before an interview

```
1. Cover the answers. Say yours ALOUD. Sections 3, 10, 11, 12 first — the
   Dart-specific ones with no clean JS equivalent (null safety, Streams, isolates)
   or a JS equivalent worth actively contrasting (Futures vs Promises).
2. Any question you stumble on -> open the linked Part, reread that section only.
3. The ⭐ sections are the highest yield: Dart Fundamentals, Null Safety,
   Classes & Constructors, Inheritance/Interfaces, Collections,
   Futures & async/await, Streams, Isolates & Concurrency.
4. If you have one week left: null safety + async/Futures + Streams +
   classes/constructors + collections + isolates. Those six carry most
   Dart-specific interview questions.
5. Then build something in Flutter. Notes stop helping before an interview does.
```

*— End of question bank —*
