# Dart Study Notes — Part 08

## Exception Handling ⭐⭐⭐☆☆

**Topics:** `try`/`catch`/`finally` · `on` vs `catch` · `throw` (any object) · custom exceptions · `Error` vs `Exception` · `rethrow` vs `throw`.

---

## 1. `try`/`catch`/`finally`

> **Definition:** same core mechanics as [JS's `try`/`catch`/`finally`](../javascript/13-error-handling.md#1-trycatchfinally) — `try` wraps code to monitor, `catch` handles a thrown value, `finally` runs unconditionally afterward regardless of whether an exception occurred.

```dart
try {
  final result = 10 ~/ 0; // throws IntegerDivisionByZeroException
} catch (e) {
  print('Caught: $e');
} finally {
  print('cleanup runs either way');
}
```

## 2. `on` (Catch by Type) vs `catch` (Catch Everything)

> **Definition:** `on ExceptionType catch (e)` catches **only** exceptions matching `ExceptionType` (or its subtypes), letting different exception types be routed to different handlers. Bare `catch (e)` catches **anything** thrown, regardless of type.

```dart
try {
  riskyOperation();
} on FormatException catch (e) {
  print('Bad format: ${e.message}');
} on TimeoutException catch (e) {
  print('Timed out: $e');
} catch (e, stackTrace) {           // catches anything NOT already matched above
  print('Unknown error: $e');         // second param, if present, captures the stack trace
  print(stackTrace);
}
```
**The rule:** `on` clauses are checked top-to-bottom, first match wins — order matters, and a generic `catch` should go last so it doesn't swallow exceptions a more specific `on` clause could have handled with better context.

## 3. `throw` — Any Object, Not Just `Exception`/`Error`

> **Definition:** like JS, Dart technically allows `throw`ing any object — a string, an int, a custom class — though idiomatic code throws instances of `Exception` or `Error` (or subtypes) specifically, because that's the convention every catch clause, logging tool, and the language's own built-in exceptions assume.

```dart
throw 'Something broke';        // legal, but non-idiomatic — loses structured info
throw Exception('Something broke'); // idiomatic — a real Exception object
throw ArgumentError('Invalid input: must be positive'); // a specific, built-in Error subtype
```

## 4. Custom Exception Classes

> **Definition:** a class implementing `Exception` (a marker interface with no required members) that carries structured, domain-specific data — the Dart analogue of [JS custom `Error` subclasses](../javascript/13-error-handling.md#3-custom-error-subclasses).

```dart
class ValidationException implements Exception {
  final String message;
  final String field;
  ValidationException(this.message, this.field);
  @override
  String toString() => 'ValidationException: $message (field: $field)';
}

void validateAge(int age) {
  if (age < 0) throw ValidationException('Age cannot be negative', 'age');
}

try {
  validateAge(-5);
} on ValidationException catch (e) {
  print('Validation failed on ${e.field}: ${e.message}');
}
```

## 5. `Error` vs `Exception` — the Intended Distinction

> **Definition — `Error`:** represents a **programmer mistake** — a bug that shouldn't be caught and recovered from in normal operation, only fixed in the code (`ArgumentError`, `RangeError`, `StateError`, `TypeError`, `LateInitializationError` from [Part 02](02-null-safety.md#4-late)).
> **Definition — `Exception`:** represents an **anticipated, recoverable failure condition** — something a well-written program should catch and handle gracefully as part of normal operation (`FormatException`, `TimeoutException`, a custom `ValidationException`).

```dart
int divide(int a, int b) {
  if (b == 0) throw ArgumentError('Cannot divide by zero'); // programmer misuse — an Error
  return a ~/ b;
}

Future<String> fetchData() async {
  try {
    return await http.get(url);
  } on TimeoutException {          // anticipated, recoverable — an Exception, catch and retry/fallback
    return 'cached fallback data';
  }
}
```
**The practical consequence:** code should generally catch `Exception`s (or specific subtypes) and handle them gracefully, but let `Error`s propagate and crash loudly during development — an `Error` caught and silently swallowed just hides a real bug instead of surfacing it for a fix.

## 6. `rethrow` vs Re-`throw`ing the Caught Variable

> **Definition:** `rethrow` re-throws the **currently-caught exception**, preserving its **original stack trace**. `throw e` (throwing the caught variable directly) creates what looks like a *new* throw from that line, **losing** the original stack trace that would show where the exception actually originated.

```dart
void process() {
  try {
    riskyOperation();
  } catch (e) {
    logError(e);
    rethrow;      // preserves the ORIGINAL stack trace, pointing back to riskyOperation()
    // throw e;      // would instead show THIS line as the "origin," losing the real crash site
  }
}
```
**Why they're not the same:** debugging a production crash relies heavily on an accurate stack trace to find where things actually went wrong. `rethrow` is a language-level operation that hands the exception back along with its original trace intact; `throw e` is just a normal throw statement whose "origin," as far as the stack trace is concerned, is that exact `throw e` line — the real failure site gets erased from the trace.

---

## Interview Q&A

**Q: `Error` vs `Exception` — what's the intended semantic difference?**
> `Error` represents a programmer mistake — a bug, like an out-of-range index or a misused API — that generally shouldn't be caught and silently handled; it should crash loudly so it gets fixed. `Exception` represents an anticipated, recoverable failure condition — a network timeout, invalid user input — that well-written code is expected to catch and handle gracefully as part of normal operation.

**Q: `rethrow` vs `throw e` inside a catch block — why aren't they the same?**
> `rethrow` re-throws the exception currently being handled while preserving its original stack trace, pointing back to where it actually occurred. `throw e` throws the caught variable as a brand-new throw statement, which resets the stack trace to originate at that `throw e` line instead — losing the real crash site, which matters a lot when debugging a production failure from its stack trace.

**Q: Why does Dart allow throwing any object, and why is that generally considered bad practice?**
> Dart's `throw` statement has no restriction on what type of object it accepts, same as JavaScript. It's bad practice because catch clauses, logging tools, and the language's own conventions all assume a thrown value is an `Exception`/`Error` (or subtype) with structured, predictable fields like `.message` — throwing a bare string or arbitrary object breaks that assumption for anything downstream trying to inspect or log the failure meaningfully.

**Q: Predict — what does the stack trace show in each case?**
```dart
void inner() { throw Exception('boom'); }
void outerRethrow() {
  try { inner(); } catch (e) { rethrow; }
}
void outerNewThrow() {
  try { inner(); } catch (e) { throw e; }
}
```
> `outerRethrow()`'s propagated exception carries a stack trace pointing to `inner()` as the actual origin. `outerNewThrow()`'s propagated exception's stack trace instead originates at the `throw e;` line inside `outerNewThrow` — `inner()`'s real involvement is lost from the trace.

---

## Follow-ups (challenge questions)

- *Failure mode:* a `catch (e) {}` block with an empty body silently swallows every exception, including genuine `Error`s representing real bugs — walk through how this kind of pattern makes a production issue *harder* to diagnose than if the code had no try/catch at all.
- *Consistency:* an app-wide error handler logs `e.toString()` for every caught exception, but half the codebase throws bare strings (`throw 'failed'`) instead of proper `Exception` subclasses — what specific structured information (beyond the message) is unavailable to that handler for the bare-string throws that would be available for real `Exception` objects?

---

**Previous:** [Part 07 — Generics](07-generics.md) · **Next:** [Part 09 — Futures & async/await](09-futures-and-async-await.md)
