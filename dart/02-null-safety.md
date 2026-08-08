# Dart Study Notes — Part 02

## Null Safety ⭐⭐⭐⭐⭐

> The single highest-yield Dart-specific topic — the one thing here with no direct JS equivalent, and the foundation Flutter's entire API is built on. Every widget constructor, every `State` field, leans on this.

**Topics:** sound null safety · nullable vs non-nullable types · the `!` operator · `late` · `required` · flow analysis/type promotion · `??=` · migrating pre-null-safety code.

---

## 1. Sound Null Safety

> **Definition:** Dart's null safety is **sound**, meaning the compiler doesn't just warn about possible null dereferences (like a linter) — it mathematically **guarantees** that a variable typed as non-nullable can never, under any code path, hold `null` at runtime. This is a compile-time proof, not a best-effort heuristic.

```dart
String name = 'V';       // non-nullable — the compiler GUARANTEES this is never null
String? nickname;          // nullable — explicitly opted into via the ? suffix, defaults to null

// name = null;                 // compile-time error — impossible, not just discouraged
nickname = null;                // fine — nickname's type allows it
```
**Why "sound" matters, precisely, vs TypeScript's `strictNullChecks`:** TypeScript's null checking is a compile-time-only convenience layered on top of JavaScript, which has no real non-nullable types at runtime — a `Function` cast, `any`, or a value crossing a JS boundary (an untyped library, `JSON.parse`) can still smuggle `null`/`undefined` into a "non-nullable" TS variable with no runtime check at all. Dart's soundness is enforced by the **runtime type system itself**, not just the compiler — a non-nullable `String` variable is genuinely, structurally incapable of holding `null` at runtime, checked by the VM, not just at analysis time.

## 2. Nullable vs Non-Nullable Types

> **Definition:** any type `T` is non-nullable by default; appending `?` (`T?`) produces the nullable version, a distinct type that is the union of `T` and `null`.

```dart
int count = 5;         // int — never null
int? maybeCount;          // int? — either an int, or null; defaults to null if uninitialized

void printLength(String s) { print(s.length); } // s is guaranteed non-null — no null check needed
                                                     // ANYWHERE in this function body, guaranteed by the type
```

## 3. The `!` Null-Assertion Operator

> **Definition:** `expr!` asserts to the compiler "trust me, this nullable expression is not actually null right now" — it casts a `T?` to `T`, throwing a runtime exception immediately if the assertion is wrong.

```dart
String? maybeName = getName();
String definiteName = maybeName!; // if getName() actually returned null, this THROWS right here
```
**Why it's a runtime landmine:** `!` moves the null-safety guarantee from the compiler back onto the developer's judgment at that exact line — every `!` is a spot where soundness is temporarily suspended by assertion, and being wrong produces a runtime crash (`Null check operator used on a null value`) instead of the compile-time error null safety exists to prevent in the first place. Idiomatic code treats every `!` as a code-review flag: is there truly no path where this could be null, or should this be a proper null check / `??` fallback instead?

## 4. `late`

> **Definition:** `late` defers a variable's initialization requirement — a `late` variable doesn't need a value at declaration time, but Dart still guarantees it will be non-null by the time it's actually **read**, checked at runtime with a `LateInitializationError` if that promise is broken.

```dart
// Problem 1 — deferred initialization, e.g. a value only available after some setup step
class Config {
  late String apiUrl; // no value yet, but the FIELD's type is still non-nullable String
  void init(String url) { apiUrl = url; } // must be set before first use
}
final config = Config();
// print(config.apiUrl);  // LateInitializationError if read before init() is called
config.init('https://api.example.com');
print(config.apiUrl);     // fine now

// Problem 2 — a non-nullable instance field that depends on another field/constructor logic
class Circle {
  final double radius;
  late final double area = 3.14159 * radius * radius; // computed lazily, only when first accessed,
  Circle(this.radius);                                    // and only once (late final = compute-once)
}
```
**When `late` is legitimate vs a code smell:** legitimate when initialization genuinely can't happen at declaration/constructor time (a two-phase setup, a value computed lazily from other fields) or when you're modeling something truly always-initialized-before-use, like a Flutter `State` field set in `initState()`. It becomes a smell when it's reached for reflexively to silence a "this field isn't initialized" error without actually reasoning about whether a real initial value or `?` nullable type would be more honest.

## 5. `required` on Named Parameters

Covered in depth in [Part 01 §3](01-functions.md#3-required-named-parameters) — worth restating in a null-safety lens: `required` and non-nullable types work together to make illegal states genuinely unrepresentable — a `required` non-nullable named parameter *cannot* be constructed without a real, non-null value, enforced entirely at compile time.

## 6. Flow Analysis / Type Promotion

> **Definition:** Dart's compiler tracks control flow to **promote** a nullable variable's type to non-nullable within a block where it's proven safe — after a null check, inside the `true` branch of an `if (x != null)`, the compiler treats `x` as `T` instead of `T?` for the rest of that scope, with no `!` needed.

```dart
void printLength(String? s) {
  if (s != null) {
    print(s.length); // no ! needed — the compiler PROVED s is non-null in this branch
  }
  print(s?.length);      // outside the branch, back to nullable — needs ?. or another check
}

String? maybeName;
if (maybeName == null) return;
print(maybeName.length); // promoted for the rest of the function — the early return proved it
```
**The limit of promotion:** it only works for local variables and only when the compiler can prove nothing else could have mutated the value between the check and the use (e.g. it breaks for a nullable *field*, since another method could theoretically mutate it between the check and the use — Dart requires a local copy in that case).

## 7. `??=`

```dart
int? count;
count ??= 0;      // assign 0 only if count is currently null — same semantics as JS's ??=, Part 23
count ??= 99;       // no-op now — count is already 0, not null
```

---

## Interview Q&A

**Q: What does "sound" null safety actually mean, precisely, and how is it different from TypeScript's `strictNullChecks`?**
> Sound means the guarantee is enforced by the runtime type system itself, not just the compiler's static analysis — a non-nullable Dart variable is structurally incapable of holding `null` at runtime, full stop. TypeScript's `strictNullChecks` is a compile-time-only convenience on top of a language (JavaScript) that has no real non-nullable types at runtime, so a value crossing an untyped boundary (an `any`, a JS interop call, `JSON.parse`) can still smuggle `null` into a "non-nullable" TS variable with zero runtime check — TypeScript's guarantee can be defeated by code TypeScript itself never analyzed. Dart's can't.

**Q: When is `late` legitimate, and when is it a code smell?**
> Legitimate for genuine two-phase initialization (a Flutter `State` field set in `initState`, a value that depends on setup logic that can't run in a field initializer) or lazy, compute-once values (`late final` for something expensive derived from other fields). It's a smell when it's used reflexively to make an "uninitialized field" compiler error go away without actually asking whether the field should just be nullable (`T?`) or given a real default — `late` is a promise that can be broken at runtime (`LateInitializationError`), so it should be reached for deliberately, not by default.

**Q: Why is the `!` operator described as a runtime landmine?**
> Because it moves the compiler's soundness guarantee back onto the developer's judgment at that specific line — it compiles cleanly regardless of whether the assertion is actually true, and if it's wrong, the failure surfaces as a runtime crash (`Null check operator used on a null value`) at that exact point, instead of the compile-time error null safety was built to prevent in the first place. Every `!` in a codebase is worth treating as a spot to double-check rather than a routine cast.

**Q: Predict — does this compile, and if so what happens at runtime?**
```dart
class Foo {
  late String name;
  void printName() => print(name);
}
void main() {
  final foo = Foo();
  foo.printName();
}
```
> It compiles fine — `late` defers the compiler's initialization check to runtime. But it throws `LateInitializationError: Field 'name' has not been initialized` when `printName()` actually tries to read `name`, since it was never assigned before that read.

---

## Follow-ups (challenge questions)

- *Failure mode:* a Flutter `State` class declares `late final AnimationController _controller;` and initializes it in `initState()` — what happens if a refactor accidentally moves that initialization into `didChangeDependencies()` instead, and some code path reads `_controller` from `build()` before `didChangeDependencies` has run for the first time?
- *Consistency:* a JSON-parsing function returns a model class with several `late` fields populated from a map — what's the actual risk if the JSON is missing an expected key, compared to using nullable (`?`) fields with explicit fallback values instead?
- *Scale:* a large codebase has hundreds of `!` null-assertions accumulated over time, mostly defensive "this should never be null" cases — how would you go about auditing which ones are load-bearing (a real invariant) versus which ones are silently masking a null-safety bug waiting to happen?

---

**Previous:** [Part 01 — Functions](01-functions.md) · **Next:** [Part 03 — Classes & Constructors](03-classes-and-constructors.md)
