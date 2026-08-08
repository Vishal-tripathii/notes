# Dart Study Notes — Part 15

## Packages, pubspec.yaml & Tooling ⭐⭐⭐☆☆

**Topics:** `pubspec.yaml` anatomy · semantic versioning & the caret constraint · `pub get`/`pub upgrade` · `dart:` core libraries vs pub.dev packages · `part`/`part of` vs `import`/`export` · `analysis_options.yaml`.

---

## 1. `pubspec.yaml` Anatomy

> **Definition:** `pubspec.yaml` is a Dart/Flutter project's manifest — declaring its name, version, SDK constraints, and dependencies — the Dart ecosystem's direct analogue of `package.json` in the [JS/Node ecosystem](../nodejs/).

```yaml
name: my_app
description: A sample application.
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'   # which Dart SDK versions this package supports

dependencies:
  http: ^1.1.0              # a real runtime dependency
  provider: ^6.1.0

dev_dependencies:            # only needed during development/testing, NOT shipped with the app
  test: ^1.24.0
  mockito: ^5.4.0
```

## 2. Semantic Versioning & the Caret (`^`) Constraint

> **Definition:** Dart follows semantic versioning (`MAJOR.MINOR.PATCH`) — a breaking change bumps `MAJOR`, a backward-compatible feature addition bumps `MINOR`, a backward-compatible bug fix bumps `PATCH`. The caret (`^1.2.3`) constraint means **"compatible with 1.2.3"** — allowing any version `>=1.2.3 and <2.0.0`, i.e. any newer `MINOR`/`PATCH` release within the same `MAJOR` version, but never a `MAJOR` bump.

```yaml
dependencies:
  http: ^1.1.0   # allows 1.1.0, 1.2.0, 1.9.5, ... but NEVER 2.0.0 or above
```
**What `^1.2.3` actually allows to be installed, precisely:** any version greater than or equal to `1.2.3` and strictly less than `2.0.0` — the assumption baked into semver is that a `MAJOR` bump signals a breaking change, so the caret constraint deliberately excludes it, trusting that anything within the same major version is safe to auto-upgrade to without manual review.

## 3. `pub get` / `pub upgrade`

> **Definition:** `dart pub get` (or `flutter pub get`) resolves and downloads dependencies matching the constraints in `pubspec.yaml`, writing the exact resolved versions to `pubspec.lock` (the lockfile — analogous to `package-lock.json`). `pub upgrade` re-resolves dependencies to the newest versions *allowed by the existing constraints*, updating the lockfile.

```
dart pub get       # installs based on pubspec.yaml + respects the existing pubspec.lock if present
dart pub upgrade    # re-resolves to the latest versions still satisfying pubspec.yaml's constraints
dart pub outdated     # shows which dependencies have newer versions available, including ones
                          # outside the current constraint (would require a manual pubspec.yaml edit)
```

## 4. `dart:` Core Libraries vs pub.dev Packages

> **Definition:** `dart:`-prefixed imports (`dart:core`, `dart:async`, `dart:io`, `dart:convert`) are part of the **Dart SDK itself** — always available, no `pubspec.yaml` entry needed. Packages from **pub.dev** are third-party, community-published, and must be declared as a dependency before use.

```dart
import 'dart:async';    // SDK-provided, no pubspec.yaml entry needed
import 'dart:convert';    // jsonEncode/jsonDecode live here
import 'package:http/http.dart' as http; // pub.dev package — REQUIRES a pubspec.yaml dependency entry
```

## 5. `part`/`part of` vs `import`/`export`

> **Definition — `import`/`export`:** the standard way to bring in and re-expose code from separate files/libraries, each file remaining its own distinct compilation unit.
> **Definition — `part`/`part of`:** splits a **single logical library** across multiple physical files that share one namespace — the `part` file has direct, unqualified access to everything in the main library file (and vice versa), as if it were all one file.

```dart
// main_library.dart
library my_library;
part 'helper.dart'; // helper.dart is part of THIS library's namespace

// helper.dart
part of 'main_library.dart';
// can reference anything declared in main_library.dart directly, no import needed
```
**Why most code should prefer `import`:** `part`/`part of` couples files tightly into one shared namespace with no explicit visibility boundary between them — convenient for code-generation tools (which is genuinely where `part` shows up most today, e.g. `freezed`/`json_serializable` generated files), but it erodes the clear, explicit dependency boundaries `import`/`export` gives ordinary hand-written code, making it harder to reason about what a given file actually depends on just by reading its imports.

## 6. `analysis_options.yaml`

> **Definition:** configures the Dart analyzer's static checks and lint rules for a project — what gets flagged as a warning/error beyond genuine compile errors, e.g. requiring `const` where possible, disallowing `print()` in production code, enforcing consistent style.

```yaml
include: package:flutter_lints/flutter.yaml  # a common baseline lint set for Flutter projects

linter:
  rules:
    prefer_const_constructors: true    # nudges toward const widget usage (flutter Part 16)
    avoid_print: true
```

---

## Interview Q&A

**Q: What does `^1.2.3` actually allow to be installed, precisely?**
> Any version greater than or equal to `1.2.3` but strictly less than `2.0.0` — the caret constraint trusts semantic versioning's convention that a `MAJOR` version bump signals a breaking change, so it locks out major upgrades while allowing any newer minor/patch release within the same major version to be picked up automatically.

**Q: `import` vs `part` — why should most code prefer `import`?**
> `import`/`export` keeps each file its own distinct compilation unit with an explicit, readable dependency boundary — you can tell what a file depends on just by its import list. `part`/`part of` merges multiple files into one shared namespace with implicit, unqualified cross-file access, which erodes that clarity. It's genuinely useful for generated code (where a tool manages the coupling automatically), but a poor default for hand-written application code.

**Q: `dart:` libraries vs pub.dev packages — what's the practical distinction?**
> `dart:`-prefixed libraries ship with the Dart SDK itself and need no `pubspec.yaml` entry or installation step — they're always available. pub.dev packages are third-party, must be explicitly declared as a dependency, and are resolved/downloaded via `pub get`, with their exact versions pinned in `pubspec.lock`.

---

## Follow-ups (challenge questions)

- *Consistency:* a team's `pubspec.lock` is accidentally excluded from version control (in `.gitignore`) — walk through the concrete consequence the next time two different developers run `pub get` on the same `pubspec.yaml` at different points in time, given the caret constraint allows a range of versions.
- *Scale:* a large app has 80+ dependencies, several of which transitively depend on different, incompatible versions of the same shared package — how does Dart's dependency resolution actually handle (or fail to handle) this "diamond dependency" conflict, and what's the practical fallout when it can't be resolved?

---

**Previous:** [Part 14 — Extension Methods & Operator Overloading](14-extension-methods-and-operator-overloading.md) · **Next:** [Part 16 — Testing in Dart](16-testing-in-dart.md)
