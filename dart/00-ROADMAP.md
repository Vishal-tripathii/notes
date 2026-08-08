# 🎯 Dart Study Notes — Master Roadmap

> **Purpose:** the full study plan for the Dart track — the language underneath Flutter, the same role [javascript](../javascript/00-ROADMAP.md) plays underneath Angular/React. 17 parts, ordered so each depends only on what came before it. Every part is its own note file in this folder (`NN-topic-slug.md`), same convention as the [javascript](../javascript/) and [Angular](../Angular/) tracks — a proper definition for every concept, code snippets, predict-before-you-run output, interview Q&A, and follow-up challenge questions.
>
> **Target:** interview-ready for a Flutter/mobile role. Dart is smaller than JavaScript as a language, but sound null safety, `Future`/`Stream`, and isolates are the three that eat the budget — the same role closures/event-loop/prototypes play in the JS track.
>
> **Connects to:** [flutter track](../flutter/) — every part here is a direct prerequisite for the Flutter framework track; Flutter's state management (Part 09) and async widgets lean directly on Parts 08–10 here. · [javascript track](../javascript/) — worth contrasting Part 09 (Futures/Streams) against JS Promises, and Part 11 (Isolates) against JS's single-threaded event loop — same problem, different solution.

---

## Progress tracker

| # | Part | Priority | Status |
|---|---|---|---|
| 00 | [Dart Fundamentals](00-dart-fundamentals.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 01 | [Functions](01-functions.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 02 | [Null Safety](02-null-safety.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 03 | [Classes & Constructors](03-classes-and-constructors.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 04 | [Inheritance, Interfaces & Abstract Classes](04-inheritance-interfaces-and-abstract-classes.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 05 | [Mixins](05-mixins.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 06 | [Collections](06-collections.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 07 | [Generics](07-generics.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 08 | [Exception Handling](08-exception-handling.md) | ⭐⭐⭐☆☆ | ✅ done |
| 09 | [Futures & async/await](09-futures-and-async-await.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 10 | [Streams](10-streams.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 11 | [Isolates & Concurrency](11-isolates-and-concurrency.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 12 | [Enums & Pattern Matching](12-enums-and-pattern-matching.md) | ⭐⭐⭐☆☆ | ✅ done |
| 13 | [Records](13-records.md) | ⭐⭐⭐☆☆ | ✅ done |
| 14 | [Extension Methods & Operator Overloading](14-extension-methods-and-operator-overloading.md) | ⭐⭐⭐☆☆ | ✅ done |
| 15 | [Packages, pubspec.yaml & Tooling](15-packages-pubspec-and-tooling.md) | ⭐⭐⭐☆☆ | ✅ done |
| 16 | [Testing in Dart](16-testing-in-dart.md) | ⭐⭐⭐☆☆ | ✅ done |

**If you have one week left:** null safety + async/Futures + Streams + classes/constructors + collections + isolates. Those six carry most Dart-specific interview questions — everything else either transfers from general OOP knowledge or gets covered again in [Flutter Part 09 — State Management](../flutter/09-state-management.md).

---

# PHASE 0 — Foundations

## Part 00 — [Dart Fundamentals](00-dart-fundamentals.md) ⭐⭐⭐⭐⭐

**Topics:** variables (`var`, `final`, `const` — and the real difference) · static types & type inference · built-in types (`int`, `double`, `num`, `String`, `bool`) · `dynamic` vs `Object` vs `var` · string interpolation · operators (including `??`, `?.`, `..` cascade, `~/`) · control flow (`if`/`switch`, including Dart 3 pattern-matching `switch`) · `for`/`for-in`/`while` · everything-is-an-object (even numbers and functions).

**Must be able to answer:** `final` vs `const`, precisely (compile-time vs runtime constant) · `dynamic` vs `Object` vs `var` · what the cascade operator (`..`) actually does and why it exists.

---

# PHASE 1 — Core language

## Part 01 — [Functions](01-functions.md) ⭐⭐⭐⭐☆

**Topics:** positional vs named parameters · optional positional (`[]`) vs optional named (`{}`) · required named parameters · default parameter values · arrow functions (`=>`) · anonymous functions & closures · functions as first-class values · typedefs for function types.

**Must be able to answer:** named vs positional parameters, when each is idiomatic · what a Dart closure captures (same live-reference semantics as [JS closures](../javascript/01-scope-and-closures.md), worth contrasting directly).

## Part 02 — [Null Safety](02-null-safety.md) ⭐⭐⭐⭐⭐

> The single highest-yield Dart-specific topic — the one thing that has no real JS equivalent (`??`/`?.` alone don't cover it) and the one Flutter's entire API surface is built around.

**Topics:** sound null safety and what "sound" actually guarantees (compile-time proof, not just a lint) · nullable (`String?`) vs non-nullable (`String`) types · the `!` null-assertion operator and its runtime risk · `late` and the two problems it solves (deferred init, non-nullable instance fields) · `required` on named parameters · flow analysis / type promotion (`if (x != null) { x.length }`) · `??=` · migrating pre-null-safety code.

**Must be able to answer:** what "sound" null safety means, precisely, vs TypeScript's `strictNullChecks` · when `late` is legitimate vs a code smell · why the `!` operator is a runtime landmine.

## Part 03 — [Classes & Constructors](03-classes-and-constructors.md) ⭐⭐⭐⭐⭐

**Topics:** the default constructor · named constructors (`Point.origin()`) · constructor initializer lists · `this.x` shorthand parameters · factory constructors and when a real constructor can't do the job · const constructors and compile-time-constant instances · private members (`_underscore`, library-level not class-level privacy) · getters/setters · static members.

**Must be able to answer:** factory constructor vs regular constructor, with a concrete case where only factory works (e.g. returning a cached instance, a subtype based on input) · why Dart privacy is per-library, not per-class — the surprising bit for OOP developers from other languages.

## Part 04 — [Inheritance, Interfaces & Abstract Classes](04-inheritance-interfaces-and-abstract-classes.md) ⭐⭐⭐⭐⭐

**Topics:** `extends` and single inheritance · `implements` — and the fact that **every class implicitly defines an interface** in Dart · abstract classes and abstract methods · `@override` · calling `super` · `is`/`as` for type checks and casts · sealed classes (Dart 3) and exhaustive `switch`.

**Must be able to answer:** `extends` vs `implements`, precisely — and why implementing multiple "interfaces" works but extending multiple classes doesn't · what a sealed class buys you with `switch` exhaustiveness checking.

## Part 05 — [Mixins](05-mixins.md) ⭐⭐⭐⭐☆

**Topics:** `mixin` / `with` · what problem mixins solve that single inheritance can't · `on` clause (constraining which classes a mixin can apply to) · mixin resolution order when multiple mixins are applied · mixins vs abstract classes vs interfaces — when each is the right tool.

**Must be able to answer:** why Dart has mixins given it already has interfaces via `implements` · what `on` does and why you'd constrain a mixin to a specific superclass.

## Part 06 — [Collections](06-collections.md) ⭐⭐⭐⭐⭐

**Topics:** `List`, `Set`, `Map` — literals, growable vs fixed-length lists · collection-if / collection-for inside literals · spread (`...`) and null-aware spread (`...?`) · `Iterable` and lazy evaluation · common methods (`map`, `where`, `fold`, `reduce`, `expand`) and which are lazy vs eager · `List.generate` · unmodifiable collections.

**Must be able to answer:** `Iterable` vs `List`, precisely — laziness and when a chain of `.map().where()` actually executes · `fold` vs `reduce` (initial value requirement, same distinction as [JS `reduce`](../javascript/05-arrays.md#3-reduce--the-one-that-can-implement-everything-else)).

## Part 07 — [Generics](07-generics.md) ⭐⭐⭐⭐☆

**Topics:** generic classes and methods (`class Box<T>`) · bounded type parameters (`<T extends Comparable>`) · generic type inference · why Dart collections are generic by default (`List<int>` vs a raw `List`) · covariance/contravariance basics (enough to explain a `List<Cat>` vs `List<Animal>` assignment question).

**Must be able to answer:** why generics exist beyond "type safety" — what breaks at runtime with a raw, untyped collection that a generic one prevents at compile time.

## Part 08 — [Exception Handling](08-exception-handling.md) ⭐⭐⭐☆☆

**Topics:** `try`/`catch`/`finally` · `on` (catching by type) vs `catch` (catching everything) · `throw` — and that Dart lets you throw any object, not just `Exception`/`Error` · custom exception classes · `Error` vs `Exception`, the intended distinction (programmer mistake vs recoverable failure) · `rethrow` vs `throw` inside a catch block · async error handling (errors from a `Future`/`async` function).

**Must be able to answer:** `Error` vs `Exception`, the intended semantic difference · `rethrow` vs re-`throw`-ing the caught variable — why they're not the same (stack trace preservation).

---

# PHASE 2 — Asynchronous Dart

> The highest-yield phase after null safety — this is where most "explain X" interview questions live, and it's the direct foundation for every async widget in Flutter.

## Part 09 — [Futures & async/await](09-futures-and-async-await.md) ⭐⭐⭐⭐⭐

**Topics:** `Future<T>` — the direct analogue of a JS `Promise`, worth actively contrasting with [javascript Part 11](../javascript/11-promises.md) · `async`/`await` · `Future.value` / `Future.error` / `Future.delayed` · `.then()`/`.catchError()`/`.whenComplete()` chaining · `Future.wait` (Dart's `Promise.all`) · sequential vs parallel awaiting · microtask vs event queue (Dart's own two-queue model, distinct from but analogous to JS's).

**Must be able to answer:** `Future` vs `Promise` — what's the same, what's actually different (e.g. Dart's microtask queue draining rules) · why awaiting inside a loop is the same performance trap as in JS, and the same `Future.wait(items.map(...))` fix.

## Part 10 — [Streams](10-streams.md) ⭐⭐⭐⭐⭐

> No direct JS equivalent in the base language (RxJS Observables are the closest analogue, if coming from Angular) — this is where a JS-background learner has to build genuinely new intuition.

**Topics:** `Stream<T>` as a sequence of async events over time (vs `Future`'s single value) · single-subscription vs broadcast streams · `StreamController` · listening (`.listen()`, `onData`/`onError`/`onDone`) · transforming (`.map`, `.where`, `.transform`) · `async*` generator functions and `yield` · `StreamSubscription` and cancellation · combining streams · `StreamBuilder` as the Flutter consumer (cross-ref [flutter](../flutter/)).

**Must be able to answer:** `Future` vs `Stream`, precisely — one value vs many over time · single-subscription vs broadcast, and what breaks if you try to `.listen()` twice on a single-subscription stream.

## Part 11 — [Isolates & Concurrency](11-isolates-and-concurrency.md) ⭐⭐⭐⭐☆

**Topics:** Dart is single-threaded **per isolate** — direct parallel to [JS's single-threaded model](../javascript/10-event-loop-and-concurrency-model.md), but Dart's answer to "how do you use multiple cores" is isolates, not Web Workers · isolates share **no memory** — message passing only (`SendPort`/`ReceivePort`), not the JS Worker model's structured-clone-per-message but conceptually the same isolation guarantee · `Isolate.spawn` · the `compute()` helper Flutter provides on top of isolates · when isolates are worth the overhead (CPU-heavy work only, same rule as JS Web Workers).

**Must be able to answer:** why Dart chose isolates (no shared memory, no locks needed) over OS threads with shared memory · when you'd actually reach for `compute()` in a Flutter app, concretely (e.g. parsing a huge JSON payload without janking the UI thread).

---

# PHASE 3 — Modern Dart & tooling

## Part 12 — [Enums & Pattern Matching](12-enums-and-pattern-matching.md) ⭐⭐⭐☆☆

**Topics:** basic enums · **enhanced enums** (Dart 2.17+) — fields, constructors, methods on an enum · Dart 3 pattern matching — `switch` expressions, destructuring patterns, guard clauses (`when`) · exhaustiveness checking against sealed classes/enums.

**Must be able to answer:** what an enhanced enum buys you over a plain one · how pattern-matching exhaustiveness checking catches a missed case at compile time.

## Part 13 — [Records](13-records.md) ⭐⭐⭐☆☆

**Topics:** Dart 3 records — anonymous, immutable, structurally-typed aggregates (`(int, String)` or `({int id, String name})`) · positional vs named record fields · returning multiple values from a function without a dedicated class · records vs a full class — when each is the right call.

**Must be able to answer:** what problem records solve that they didn't have a clean answer for before Dart 3 (multiple return values without a throwaway class).

## Part 14 — [Extension Methods & Operator Overloading](14-extension-methods-and-operator-overloading.md) ⭐⭐⭐☆☆

**Topics:** extension methods — adding methods to a type you don't own (including built-in types like `String`/`int`) without subclassing · extension scoping and import-based visibility · operator overloading (`operator +`, `operator ==` and the paired `hashCode` obligation) · callable classes (`call()` method).

**Must be able to answer:** why overriding `==` without also overriding `hashCode` is a real bug, not just a lint nag (breaks `Set`/`Map` key lookups) · what an extension method actually compiles to (static dispatch, not a real method on the type).

## Part 15 — [Packages, pubspec.yaml & Tooling](15-packages-pubspec-and-tooling.md) ⭐⭐⭐☆☆

**Topics:** `pubspec.yaml` anatomy — dependencies, dev_dependencies, environment SDK constraints · semantic versioning and Dart's caret (`^`) constraint syntax · `pub get` / `pub upgrade` · `dart:` core libraries vs pub.dev packages · `part`/`part of` vs `import`/`export` for splitting a library across files · analysis options (`analysis_options.yaml`) and lint rules.

**Must be able to answer:** what `^1.2.3` actually allows to be installed, precisely (semver caret range) · `import` vs `part` — why most code should prefer `import`.

## Part 16 — [Testing in Dart](16-testing-in-dart.md) ⭐⭐⭐☆☆

**Topics:** the `test` package — `test()`, `group()`, `setUp`/`tearDown` · `expect()` and matchers · testing async code (`Future`/`Stream` expectations) · mocking with `mockito` or `mocktail` · what belongs in a pure-Dart unit test vs a Flutter widget test (cross-ref [flutter testing part](../flutter/)).

**Must be able to answer:** how you'd test a class with an async dependency without hitting the real network — mocking strategy, not just syntax.

---

# Interview priority — what to revise last

| Priority | Topics |
|---|---|
| ⭐⭐⭐⭐⭐ | Dart Fundamentals · Null Safety · Classes & Constructors · Inheritance/Interfaces · Collections · Futures & async/await · Streams |
| ⭐⭐⭐⭐☆ | Functions · Mixins · Generics · Isolates & Concurrency |
| ⭐⭐⭐☆☆ | Exception Handling · Enums & Pattern Matching · Records · Extension Methods · Packages & Tooling · Testing |

If you have one week left: null safety + async/Futures + Streams + classes/constructors + collections + isolates. Those six carry most Dart interview questions.

---

## Connects to

- **[flutter track](../flutter/):** every part here is prerequisite material — Flutter Part 09 (State Management) leans directly on Futures/Streams (Parts 09–10), and Flutter's widget rebuild model connects to how records/pattern matching (Parts 12–13) are used in modern Flutter code.
- **[javascript track](../javascript/):** worth actively contrasting rather than studying in isolation — `Future` vs `Promise` (Part 09 vs [javascript Part 11](../javascript/11-promises.md)), null safety vs `??`/`?.` (Part 02 vs [javascript Part 04](../javascript/04-objects.md)), isolates vs the single-threaded event loop (Part 11 vs [javascript Part 10](../javascript/10-event-loop-and-concurrency-model.md)).
- **[scenario-bank/](../scenario-bank/):** once a part is studied, expect "what happens when..." follow-ups woven in per that folder's workflow.

*— Work through these in order. One part at a time. —*
