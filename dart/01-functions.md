# Dart Study Notes — Part 01

## Functions ⭐⭐⭐⭐☆

**Topics:** positional vs named parameters · optional positional vs optional named · required named parameters · default values · arrow functions · anonymous functions & closures · functions as first-class values · typedefs.

---

## 1. Positional vs Named Parameters

> **Definition:** a **positional** parameter is matched to an argument by its position in the call (`greet('V', 30)`). A **named** parameter (declared inside `{}`) is matched by an explicit `name: value` label at the call site, in any order.

```dart
void greetPositional(String name, int age) { print('$name, $age'); }
greetPositional('V', 30); // position matters — 'V' then 30

void greetNamed({required String name, required int age}) { print('$name, $age'); }
greetNamed(age: 30, name: 'V'); // order doesn't matter — labeled explicitly
```
**When each is idiomatic:** positional for a small number of required, order-obvious parameters (`Point(x, y)`); named for anything with more than ~2 parameters, or where the call site reads ambiguously without labels (`Container(width: 100, height: 50)` is far clearer than `Container(100, 50)`).

## 2. Optional Positional (`[]`) vs Optional Named (`{}`)

> **Definition:** wrapping positional parameters in `[]` makes them **optional** (omittable, filling in `null` or a default) while still being positional. Named parameters (`{}`) are optional by default unless individually marked `required`.

```dart
String buildUrl(String host, [String? path, int? port]) {
  return '$host${path ?? ''}${port != null ? ':$port' : ''}';
}
buildUrl('example.com');                  // path/port omitted, both null
buildUrl('example.com', '/api', 8080);      // both provided, still positional (no labels)

void configure({String env = 'dev', bool debug = false}) {} // named, both optional with defaults
configure();                                                    // env='dev', debug=false
configure(debug: true);                                          // env='dev', debug=true
```

## 3. Required Named Parameters

> **Definition:** the `required` keyword on a named parameter makes it mandatory at the call site — a compile-time error if omitted — while still requiring the caller to label it, combining named-parameter clarity with positional-parameter mandatoriness.

```dart
void createUser({required String name, required String email, int? age}) {}
createUser(name: 'V', email: 'v@example.com'); // fine — age omitted, it's not required
// createUser(name: 'V');                          // compile-time error: missing 'email'
```

## 4. Default Parameter Values

```dart
void log(String message, {String level = 'info'}) { print('[$level] $message'); }
log('started');                // '[info] started'
log('failed', level: 'error');  // '[error] failed'
```
Default values must themselves be compile-time constants — the same constraint `const` has ([Part 00](00-dart-fundamentals.md#1-variables--var-final-const)).

## 5. Arrow Functions

> **Definition:** `=>` is shorthand syntax for a function body that's a single expression — `T foo() => expr;` is exactly equivalent to `T foo() { return expr; }`.

```dart
int square(int n) => n * n;
bool isEven(int n) => n % 2 == 0;
// NOT equivalent to a multi-statement body — => only works for a single expression
```

## 6. Anonymous Functions & Closures

> **Definition:** an anonymous function is a function literal with no name, assignable to a variable or passed directly as an argument. Like JS closures, a Dart closure captures a **live reference** to variables from its surrounding scope, not a snapshot — the same [live-reference semantics as JS](../javascript/01-scope-and-closures.md#2-closures).

```dart
final multiplier = (int a, int b) { return a * b; }; // anonymous function assigned to a variable

[1, 2, 3].forEach((item) => print(item)); // anonymous function passed directly as an argument

Function makeCounter() {
  var count = 0;
  return () { count++; return count; }; // closes over `count` — same live-reference behavior as JS
}
final counter = makeCounter();
print(counter()); print(counter()); // 1, 2 — count persists across calls, same as JS Part 01
```

## 7. Functions as First-Class Values

> **Definition:** functions in Dart are objects like any other value — assignable to variables, passable as arguments, returnable from other functions — the direct Dart analogue of [JS's higher-order functions](../javascript/02-functions.md#4-higher-order-functions--callbacks).

```dart
void applyTwice(int Function(int) fn, int value) { print(fn(fn(value))); }
applyTwice((x) => x + 1, 5); // 7 — fn applied twice: 5 -> 6 -> 7
```

## 8. Typedefs for Function Types

> **Definition:** `typedef` gives a readable name to a function signature, useful when the same function-type shape (e.g. a callback signature) is used repeatedly across a codebase.

```dart
typedef IntTransformer = int Function(int);

int increment(int x) => x + 1;
IntTransformer transformer = increment; // typed explicitly via the typedef, reads clearer than
                                            // `int Function(int) transformer = increment;` at every use
```

---

## Interview Q&A

**Q: Named vs positional parameters — when is each idiomatic?**
> Positional for a small number of parameters where the order is obvious and unlikely to be confused (`Point(x, y)`). Named for anything with more parameters or where the call site would otherwise be ambiguous — `Container(width: 100, height: 50)` self-documents in a way `Container(100, 50)` never will, and named parameters can be reordered freely without breaking the call.

**Q: What does a Dart closure actually capture?**
> A live reference to the variable in its enclosing scope, not a copy of its value at creation time — identical semantics to a JS closure. A function returned from another function that increments and returns an outer variable keeps working correctly across repeated calls because it's reading and mutating the *same* variable each time, not a frozen snapshot.

**Q: `required` on a named parameter — what does it actually enforce, and when?**
> It makes an otherwise-optional named parameter mandatory, checked at **compile time** — omitting it at a call site is a compile error, not a runtime `null` surprise. It's what lets you combine the self-documenting clarity of named parameters with the mandatoriness of positional ones.

**Q: Predict:**
```dart
Function counter() {
  var count = 0;
  return () => ++count;
}
final c1 = counter();
final c2 = counter();
print(c1()); print(c1()); print(c2());
```
> `1 2 1` — same reasoning as [JS Part 01's makeCounter example](../javascript/01-scope-and-closures.md#2-closures): `c1` and `c2` are separate closures over separate `count` variables from two independent calls to `counter()`.

---

## Follow-ups (challenge questions)

- *Consistency:* a widely-used function has 6 optional named parameters and no `required` ones — what's the real cost to callers and maintainers of that design, versus grouping related parameters into a config object?
- *Failure mode:* a closure returned from a loop (mirroring [JS's classic `var` loop bug](../javascript/01-scope-and-closures.md#5-the-classic-loop-bug)) — does Dart's `for` loop variable scoping have the same pitfall as JS's `var`, or does it behave like `let` by default? Worth verifying directly rather than assuming.

---

**Previous:** [Part 00 — Dart Fundamentals](00-dart-fundamentals.md) · **Next:** [Part 02 — Null Safety](02-null-safety.md)
