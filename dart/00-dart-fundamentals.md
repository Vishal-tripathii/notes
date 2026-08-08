# Dart Study Notes — Part 00

## Dart Fundamentals ⭐⭐⭐⭐⭐

**Topics:** variables (`var`/`final`/`const`) · static types & inference · built-in types · `dynamic` vs `Object` vs `var` · string interpolation · operators · control flow · everything-is-an-object.

---

## 1. Variables — `var`, `final`, `const`

> **Definition:** `var` declares a mutable, type-inferred variable. `final` declares a variable that can be assigned **exactly once**, with its value fixed at **runtime** (e.g. computed from a function call). `const` declares a value that must be known at **compile time** and is deeply immutable — a stricter guarantee than `final`.

```dart
var name = 'V';           // type inferred as String, can be reassigned
name = 'Someone else';      // fine

final now = DateTime.now(); // fixed once assigned, but the VALUE is only known at runtime
// now = DateTime.now();     // error — final cannot be reassigned

const pi = 3.14159;           // must be a compile-time constant
// const now2 = DateTime.now(); // ERROR — DateTime.now() isn't known at compile time, only final works here

const list = [1, 2, 3];         // deeply immutable — the list itself can't be mutated
// list.add(4);                  // runtime error — Unsupported operation
```
**The precise distinction:** every `const` is also effectively `final` (single-assignment), but not every `final` can be `const` — `final` just needs the value fixed *once execution reaches that line*; `const` needs the value fixed *before the program even runs*, which is why `const` values can be safely canonicalized (two identical `const` object literals are actually the same instance in memory).

## 2. Static Types & Type Inference

> **Definition:** Dart is a statically-typed language — every variable has a type checked at compile time — but supports **type inference**, where the compiler determines a variable's type from its initializer so you don't have to write it explicitly.

```dart
var count = 5;        // inferred as int — cannot later become a String
count = 'five';         // compile-time error: A value of type 'String' can't be assigned to 'int'

int explicit = 5;         // same thing, type written explicitly — identical behavior
```

## 3. Built-in Types

> **Definition:** Dart's core number/text/boolean types are `int` (64-bit integer), `double` (64-bit floating point), `num` (the common supertype of both `int` and `double`), `String` (UTF-16 sequence), and `bool`.

```dart
int age = 30;
double price = 9.99;
num anything = 5;      // can hold either an int or a double
anything = 5.5;          // fine — num accepts both

String greeting = 'Hello, $age'; // string interpolation, see §5
bool isActive = true;
```

## 4. `dynamic` vs `Object` vs `var`

> **Definition — `var`:** not a type itself — a keyword telling the compiler to infer the actual static type from the initializer; once inferred, that type is enforced.
> **Definition — `Object` (or `Object?`):** the root type every Dart class ultimately extends — a variable of type `Object` can hold *any* value, but the compiler only lets you call methods that `Object` itself defines (`toString()`, `hashCode`, `==`) without an explicit cast.
> **Definition — `dynamic`:** opts a variable **out of static type checking entirely** — any method call is allowed at compile time, deferred to a runtime check that throws `NoSuchMethodError` if the object doesn't actually support it.

```dart
var a = 'hello';    // inferred as String — a = 5 is a compile-time error
Object b = 'hello';   // b.length is a compile-time error — Object doesn't define .length
dynamic c = 'hello';   // c.length works AND c.nonsense() compiles fine too — only fails at RUNTIME
```
**The rule:** prefer `var` (safe, inferred) almost always; reach for `Object`/`Object?` when a variable genuinely might hold anything but you still want compile-time safety on what you do with it; treat `dynamic` as an escape hatch, not a default — it silently defers entire classes of bugs to runtime.

## 5. String Interpolation

> **Definition:** embedding an expression's value directly inside a string literal using `$variable` (for a simple identifier) or `${expression}` (for any expression), evaluated and converted via `toString()`.

```dart
final name = 'V';
final age = 30;
print('Name: $name, next year: ${age + 1}'); // 'Name: V, next year: 31'
```

## 6. Operators

> **Definition:** beyond the standard arithmetic/comparison/logical operators, Dart has a few distinctive ones — `??` (if-null), `?.` (null-aware member access), `..` (cascade — perform a sequence of operations on the *same* object), and `~/` (integer/truncating division).

```dart
final value = null ?? 'default';    // 'default' — ?? returns the right side only if left is null
user?.name;                            // null-aware access — evaluates to null instead of throwing
                                          // if user is null (same idea as JS's ?., Part 04 there)

7 ~/ 2;                                  // 3 — truncating division, discards the remainder
7 / 2;                                     // 3.5 — regular division, always returns a double

final buffer = StringBuffer()
  ..write('Hello')                          // cascade: each .. calls a method on buffer
  ..write(' ')                                // and returns buffer itself, not the method's result —
  ..write('World');                             // lets you chain calls without repeating the receiver
print(buffer.toString());                        // 'Hello World'
```
**What the cascade operator (`..`) actually does, precisely:** each `..method()` call executes on the *same original object* and the expression as a whole evaluates to that object, not to whatever the last method call returned — unlike normal method chaining (`.`), where each `.method()` call's *own return value* becomes the receiver for the next call. This is why cascades work even when a method returns `void`.

## 7. Control Flow

> **Definition:** Dart's `if`/`else`, `for`, `for-in`, `while`, `do-while` behave like their equivalents in most C-family languages; `switch` additionally supports Dart 3 **pattern matching** — matching against a value's shape, not just equality (full depth in [Part 12](12-enums-and-pattern-matching.md)).

```dart
for (var i = 0; i < 3; i++) { print(i); }          // classic C-style for
for (final item in ['a', 'b', 'c']) { print(item); } // for-in over any Iterable

final result = switch (2) {
  1 => 'one',
  2 => 'two',                 // Dart 3 switch EXPRESSION — evaluates to a value directly
  _ => 'other',                 // _ is the wildcard/default case
};
```

## 8. Everything Is an Object

> **Definition:** Dart has no "primitive" types in the JS sense — `int`, `double`, `bool`, `Function`, and even `null` (as `Null`, its own type) are all objects with methods, all ultimately extending `Object`.

```dart
5.isEven;              // true — a method call directly on an int literal
'hello'.toUpperCase(); // 'HELLO'
(() => 'hi').runtimeType; // functions are values with a real runtime type too
```
**Why this matters practically:** there's no JS-style split between "primitive vs reference type with boxing" — every value in Dart uniformly supports method calls, which is why `5.isEven` and `'x'.toUpperCase()` read naturally without needing a wrapper class or static utility function.

---

## Interview Q&A

**Q: `final` vs `const`, precisely?**
> Both are single-assignment, but `final`'s value only needs to be fixed by the time execution reaches that line — it can come from a runtime computation like `DateTime.now()`. `const` requires the value to be known at **compile time**, which is a strictly stronger guarantee — every `const` is effectively `final`, but not every `final` can be `const`. Compile-time-constant values also get canonicalized: two identical `const` list literals are literally the same object in memory.

**Q: `dynamic` vs `Object` vs `var`?**
> `var` isn't a type — it tells the compiler to infer the real static type from the initializer, and that inferred type is then enforced normally. `Object` (or `Object?`) is a real type — the root of everything — so a variable declared as `Object` can hold any value, but you can only call methods `Object` itself defines without an explicit cast. `dynamic` opts a variable out of static type checking entirely, deferring method-existence checks to runtime, where a missing method throws `NoSuchMethodError` instead of failing to compile.

**Q: What does the cascade operator (`..`) actually do, and why does it exist?**
> It performs a sequence of operations on the same object without repeating the receiver, and critically, the whole cascaded expression evaluates to the *original object*, not the return value of the last call in the chain — which is what makes it work even with `void`-returning methods, unlike regular `.` chaining where each call's own return value becomes the next receiver.

**Q: Predict:**
```dart
const a = [1, 2, 3];
const b = [1, 2, 3];
print(identical(a, b));
final c = [1, 2, 3];
final d = [1, 2, 3];
print(identical(c, d));
```
> `true`, then `false` — identical `const` expressions are canonicalized to the same object at compile time; `final` list literals are each a fresh runtime allocation, so `c` and `d` are equal in content but distinct objects.

---

## Follow-ups (challenge questions)

- *Consistency:* a function parameter is typed `dynamic` "to be flexible," and six months later a caller passes an object missing an expected method — at what point does this actually fail, and how does that compare to the same mistake with a properly-typed parameter?
- *Scale:* a large const configuration map is used as a default value across hundreds of call sites — why does `const` canonicalization matter here beyond "it's slightly faster," in terms of actual memory behavior?

---

**Next:** [Part 01 — Functions](01-functions.md)
