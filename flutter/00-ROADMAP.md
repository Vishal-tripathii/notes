# 🦋 Flutter Study Notes — Master Roadmap

> **Purpose:** the full study plan for the Flutter track. 25 parts, ordered so each depends only on what came before it. Every part is its own note file in this folder (`NN-topic-slug.md`), same convention as the [Angular](../Angular/00-ROADMAP.md) and [javascript](../javascript/) tracks — a proper definition for every concept, code snippets, predict-before-you-run output where applicable, interview Q&A, and follow-up scenario-style challenge questions.
>
> **Prerequisite:** the [Dart track](../dart/00-ROADMAP.md) — Flutter is unusable without a solid grip on null safety, `Future`/`Stream`, and Dart's OOP model, the same way Angular leans on TypeScript.
>
> **Target:** interview-ready for a Flutter/mobile role — widget composition, state management (the highest-weight topic, same role RxJS/DI play in the Angular track), navigation, performance, and the rendering internals interviewers actually probe for at 2–5 years of experience.

---

## How to study each part

Same sequence that worked for the [Angular track](../Angular/00-ROADMAP.md):

```
1. Concept        → what it is, in one sentence
2. Why it exists  → what people did BEFORE it, and what hurt
3. How internally → what Flutter actually does under the hood
4. Write it       → type the code yourself, don't read it
5. Break it       → the common mistakes, deliberately made
6. Answer it      → the interview questions, spoken aloud
7. Compress it    → the cheat sheet at the end of each note
```

---

## Progress tracker

| # | Part | Priority | Status |
|---|---|---|---|
| 00 | [Dart for Flutter](00-dart-for-flutter.md) *(pointer to the dart/ track)* | ⭐⭐⭐⭐⭐ | ✅ done |
| 01 | [Flutter Architecture & the Three Trees](01-flutter-architecture-and-the-three-trees.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 02 | [StatelessWidget vs StatefulWidget & Lifecycle](02-stateless-vs-stateful-and-lifecycle.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 03 | [BuildContext](03-buildcontext.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 04 | [Layout System](04-layout-system.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 05 | [Keys](05-keys.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 06 | [setState & Local State](06-setstate-and-local-state.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 07 | [InheritedWidget & InheritedModel](07-inheritedwidget-and-inheritedmodel.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 08 | [Provider](08-provider.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 09 | [Riverpod](09-riverpod.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 10 | [BLoC / Cubit](10-bloc-and-cubit.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 11 | [State Management Comparison](11-state-management-comparison.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 12 | [Navigation & Routing](12-navigation-and-routing.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 13 | [Networking & JSON Serialization](13-networking-and-json-serialization.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 14 | [FutureBuilder & StreamBuilder](14-futurebuilder-and-streambuilder.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 15 | [Forms & Validation](15-forms-and-validation.md) | ⭐⭐⭐☆☆ | ✅ done |
| 16 | [Performance Optimization](16-performance-optimization.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 17 | [Animations](17-animations.md) | ⭐⭐⭐☆☆ | ✅ done |
| 18 | [Platform Channels & Native Integration](18-platform-channels-and-native-integration.md) | ⭐⭐⭐☆☆ | ✅ done |
| 19 | [Testing](19-testing.md) | ⭐⭐⭐☆☆ | ✅ done |
| 20 | [App Architecture](20-app-architecture.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 21 | [Flutter Internals](21-flutter-internals.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 22 | [Flutter vs React Native vs Native](22-flutter-vs-react-native-vs-native.md) | ⭐⭐⭐☆☆ | ✅ done |
| 23 | [Machine Coding — Projects](23-machine-coding-projects.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 24 | [Latest Flutter Features](24-latest-flutter-features.md) | ⭐⭐⭐☆☆ | ✅ done |

**If you have one week left:** the three trees + widget lifecycle + `InheritedWidget` + one real state management solution (BLoC or Riverpod, pick one deeply) + navigation + performance (rebuilds/`const`). Those six carry most Flutter interviews.

---

# PHASE 0 — Prerequisite

## Part 00 — [Dart for Flutter](00-dart-for-flutter.md) ⭐⭐⭐⭐⭐

Flutter is not usable without Dart the way Angular isn't usable without TypeScript — null safety, `Future`/`Stream`, and mixins show up in nearly every widget you write. This part is a pointer, not a rewrite: work through the **[full Dart track](../dart/00-ROADMAP.md)** first, then come back here.

**Must be able to answer before continuing:** sound null safety · `Future` vs `Stream` · mixins vs interfaces · what `late` and `required` actually guarantee.

---

# PHASE 1 — Foundations

## Part 01 — [Flutter Architecture & the Three Trees](01-flutter-architecture-and-the-three-trees.md) ⭐⭐⭐⭐⭐

**Topics:** "everything is a widget" and what that actually means · the **Widget tree** (immutable configuration) vs the **Element tree** (the mutable, persistent instance that manages a widget's lifecycle) vs the **RenderObject tree** (the layer that actually does layout/paint) — and why there are three trees instead of one · how a `setState()` call maps onto these three trees · `runApp()` and the path from `main()` to pixels on screen · the rendering pipeline at a glance (build → layout → paint → composite) — full internals deferred to [Part 21](21-flutter-internals.md).

**Must be able to answer:** why Flutter has three separate trees instead of one · what actually happens, tree by tree, when `setState()` is called · widget vs element, precisely.

## Part 02 — [StatelessWidget vs StatefulWidget & Lifecycle](02-stateless-vs-stateful-and-lifecycle.md) ⭐⭐⭐⭐⭐

**Topics:** `StatelessWidget` and immutability · `StatefulWidget` + its paired `State<T>` object (and why the state is a *separate* object, not a field on the widget itself) · the full lifecycle in order — `createState` → `initState` → `didChangeDependencies` → `build` → `didUpdateWidget` (on rebuild with new config) → `deactivate` → `dispose` · what belongs in `initState` vs `build` (and why `initState` can't use `InheritedWidget` data safely — that's what `didChangeDependencies` is for) · `mounted` and why you check it after an async gap.

**Must be able to answer:** the full lifecycle order, from memory · why `State` is a separate object from `StatefulWidget` · what `didUpdateWidget` is for, concretely · why checking `mounted` after an `await` inside a `State` method matters.

## Part 03 — [BuildContext](03-buildcontext.md) ⭐⭐⭐⭐☆

**Topics:** what a `BuildContext` actually is — a handle to a location in the Element tree, not a generic "app context" · why `context` is passed into `build(BuildContext context)` · `context.dependOnInheritedWidgetOfExactType` (what `Theme.of(context)`/`Provider.of(context)` do under the hood) · the classic "using a `context` across an `async` gap" bug · `context.mounted` (Dart 3) as the fix · a new `BuildContext` per widget instance, and why a `Navigator.of(context)` call above vs below a certain widget in the tree can behave differently.

**Must be able to answer:** what `BuildContext` actually represents, precisely (not "the app," a specific tree location) · why using `context` after an `await` without checking `mounted` is a real, common bug.

## Part 04 — [Layout System](04-layout-system.md) ⭐⭐⭐⭐⭐

**Topics:** the **constraints go down, sizes go up, parent sets position** rule — Flutter's entire layout algorithm in one sentence · `Row`/`Column`/`Flex` and `MainAxisAlignment`/`CrossAxisAlignment` · `Expanded` vs `Flexible` (and the `FlexFit.tight` vs `FlexFit.loose` difference underneath) · `Stack`/`Positioned` · `Container` as a convenience composite (padding + margin + decoration + constraints in one widget) · `SizedBox`/`ConstrainedBox` · the classic "unbounded height" `RenderFlex overflowed` error and why it happens (a `Column` inside a `Row` inside a `ListView`, etc.) · `IntrinsicHeight`/`IntrinsicWidth` and their real performance cost.

**Must be able to answer:** the constraints-down/sizes-up/position-set-by-parent rule, and how to use it to debug ANY layout overflow error · `Expanded` vs `Flexible`, precisely · why an unconstrained axis (e.g. a `Column` inside another `Column` with no bound) throws.

## Part 05 — [Keys](05-keys.md) ⭐⭐⭐⭐☆

**Topics:** what a `Key` actually solves — helping Flutter match Elements to widgets across rebuilds when the widget list changes shape (reorder, insert, delete) · `ValueKey`/`ObjectKey`/`UniqueKey` and when each is appropriate · `GlobalKey` and its two real uses (accessing a `State` object from outside, preserving state across a widget moving to a different part of the tree) and its costs · the concrete bug that appears *without* keys — a reordered/filtered list where the wrong item's local state (an animation, a `TextField`'s content) follows the wrong row.

**Must be able to answer:** what breaks, concretely, in a reorderable list with no keys — walk through the actual wrong-state-follows-wrong-widget bug · `GlobalKey`'s real cost (forces a full widget rebuild identity check across the tree, shouldn't be reached for casually).

---

# PHASE 2 — State management

> The Flutter equivalent of the Angular track's DI/RxJS phase — this is where interviews spend the most time, and where a candidate's real production experience shows or doesn't.

## Part 06 — [setState & Local State](06-setstate-and-local-state.md) ⭐⭐⭐⭐⭐

**Topics:** what `setState()` actually does — schedules a rebuild of *that* `State` object and its subtree, nothing more, nothing global · why calling `setState` outside the `State` class (or after `dispose`) throws · the "lift state up" pattern and where it stops scaling · why `setState` alone becomes unmanageable past a small widget subtree (the direct motivation for everything in Parts 07–10).

**Must be able to answer:** exactly what rebuilds when `setState()` runs — not "the whole app," precisely which subtree · when `setState` genuinely stops being enough, and why (prop-drilling pain, siblings that need to share state).

## Part 07 — [InheritedWidget & InheritedModel](07-inheritedwidget-and-inheritedmodel.md) ⭐⭐⭐⭐⭐

> The foundation every other state management library in this phase is built on top of — `Theme`, `MediaQuery`, `Provider`, and Riverpod's `ProviderScope` all ultimately compile down to this mechanism.

**Topics:** `InheritedWidget` as a way to push data down the tree without prop-drilling · `updateShouldNotify` and how a descendant widget efficiently rebuilds only when the data it actually depends on changes · `context.dependOnInheritedWidgetOfExactType<T>()` vs `context.getInheritedWidgetOfExactType<T>()` (subscribes to rebuilds vs a one-time read) · `InheritedModel` and selective rebuilds on specific "aspects" of a larger data object.

**Must be able to answer:** how `InheritedWidget` avoids rebuilding the entire subtree on every change — the mechanism behind `updateShouldNotify` · why `Theme.of(context)`/`MediaQuery.of(context)` "just work" without any external package.

## Part 08 — [Provider](08-provider.md) ⭐⭐⭐⭐⭐

**Topics:** `Provider`/`ChangeNotifierProvider`/`Consumer`/`context.watch()` vs `context.read()` (rebuild-triggering vs one-time access) · `ChangeNotifier` and `notifyListeners()` · `MultiProvider` · `Selector` for narrowing rebuilds to a specific field · `ProxyProvider` for providers that depend on other providers · why Provider is "just" a well-designed wrapper around `InheritedWidget` (Part 07) plus lifecycle management.

**Must be able to answer:** `context.watch()` vs `context.read()`, and the bug that happens from using `watch()` inside a callback (e.g. `onPressed`) instead of `read()` · what `Selector` buys you over a plain `Consumer`.

## Part 09 — [Riverpod](09-riverpod.md) ⭐⭐⭐⭐☆

**Topics:** what Riverpod fixes about Provider — no `BuildContext` dependency for reading state, compile-time-safe provider references, testability without a widget tree · `Provider`/`StateProvider`/`StateNotifierProvider`/`FutureProvider`/`StreamProvider` · `ref.watch()` vs `ref.read()` vs `ref.listen()` · provider modifiers (`.autoDispose`, `.family`) · code generation (`@riverpod`) in modern Riverpod.

**Must be able to answer:** the concrete problems Riverpod solves that Provider has (context-dependency, runtime provider-not-found errors vs compile-time safety) · `.autoDispose` and why it matters for memory.

## Part 10 — [BLoC / Cubit](10-bloc-and-cubit.md) ⭐⭐⭐⭐⭐

**Topics:** the BLoC pattern's core idea — UI sends **events**, business logic emits **states**, nothing in between talks directly to the UI · `Cubit` (simplified — direct state-emitting methods) vs full `Bloc` (event-driven, `on<Event>` handlers, easier to test/log/replay) · `BlocProvider`/`BlocBuilder`/`BlocListener`/`BlocConsumer` · stream transformations for events (debounce, e.g. for search) · why BLoC is popular specifically for testability and strict separation of UI from business logic.

**Must be able to answer:** Cubit vs full Bloc, concretely, and when the extra event-driven ceremony of Bloc earns its keep · why BLoC-style architecture makes business logic trivially unit-testable without a widget tree at all.

## Part 11 — [State Management Comparison](11-state-management-comparison.md) ⭐⭐⭐⭐☆

**Topics:** `setState` → `InheritedWidget` → Provider → Riverpod/BLoC, as an escalation, mirroring [Angular's own state-management escalation](../Angular/16-state-management.md) · ephemeral (widget-local, `TextField` focus, animation state) vs app state (user session, cart) and why ephemeral state should almost never go into a global store · a decision framework: team size, testability requirements, how much boilerplate is tolerable · the honest trade-offs, not a popularity contest.

**Must be able to answer:** ephemeral vs app state, with an example of each, and why putting ephemeral state into a global store is usually a mistake · how you'd actually choose between Provider/Riverpod/BLoC for a new project, with real reasoning.

---

# PHASE 3 — Building real apps

## Part 12 — [Navigation & Routing](12-navigation-and-routing.md) ⭐⭐⭐⭐⭐

**Topics:** `Navigator` as a stack of routes · `Navigator.push`/`pop`/`pushReplacement`/`pushAndRemoveUntil` · named routes vs `MaterialPageRoute` · passing arguments and returning a result from a popped route · **Navigator 1.0 (imperative)** vs **Navigator 2.0 (declarative, `Router`/`RouteInformationParser`/`RouterDelegate`)** and why 2.0 exists (deep linking, web URL sync, browser back button) · `go_router` as the practical, widely-adopted answer to Navigator 2.0's verbosity · nested navigation (bottom nav bar with its own stack per tab).

**Must be able to answer:** Navigator 1.0 vs 2.0, and specifically what problem 2.0 solves that 1.0 genuinely can't (browser back-button/deep-link/URL sync on Flutter web) · how you'd pass data to a new route and get a result back when it's popped.

## Part 13 — [Networking & JSON Serialization](13-networking-and-json-serialization.md) ⭐⭐⭐⭐☆

**Topics:** `http` package vs `dio` (interceptors, cancellation tokens, easier error handling — `dio`'s actual value-add) · manual `fromJson`/`toJson` vs code-generated serialization (`json_serializable`/`freezed`) and why hand-writing it doesn't scale past a few models · error handling for network failures vs non-2xx responses (the same [`fetch`-doesn't-reject-on-404 gotcha](../javascript/20-browser-apis.md#3-fetch-vs-xmlhttprequest) exists here too, worth contrasting) · repository pattern as the layer that hides the actual HTTP client from the rest of the app.

**Must be able to answer:** why hand-written JSON parsing doesn't scale, and what `json_serializable`/`freezed` actually generate for you · the repository pattern's job, concretely — what it decouples the rest of the app from.

## Part 14 — [FutureBuilder & StreamBuilder](14-futurebuilder-and-streambuilder.md) ⭐⭐⭐⭐☆

**Topics:** `FutureBuilder` — `ConnectionState` (`none`/`waiting`/`active`/`done`), `snapshot.hasData`/`hasError` · the classic **"creating the Future inside `build()`" bug** (re-triggers the async operation on every rebuild) and the fix (hold the `Future` in `initState`/state, not inline in `build`) · `StreamBuilder` — same shape, for a stream of values (a live Firestore query, a BLoC's state stream) · when a `FutureBuilder`/`StreamBuilder` is the right tool vs when a state-management solution ([Phase 2](07-inheritedwidget-and-inheritedmodel.md)) should own the async state instead.

**Must be able to answer:** the "Future created inside `build()`" bug, exactly why it happens and its user-visible symptom (data re-fetches/flickers on every unrelated rebuild) · `ConnectionState` values and what each means for what you should render.

## Part 15 — [Forms & Validation](15-forms-and-validation.md) ⭐⭐⭐☆☆

**Topics:** `Form` + `GlobalKey<FormState>` · `TextFormField` and `validator` · `FormState.validate()`/`.save()`/`.reset()` · `TextEditingController` and why it must be disposed · `FocusNode` and manual focus management · cross-field validation · debounced async validation (e.g. username availability, mirroring the same pattern from [Angular Part 15](../Angular/15-forms.md)).

**Must be able to answer:** why `TextEditingController` needs manual disposal (and what leaks if you forget) · how `Form`/`GlobalKey<FormState>` cascades a `validate()` call down to every child `TextFormField`.

---

# PHASE 4 — Production quality

## Part 16 — [Performance Optimization](16-performance-optimization.md) ⭐⭐⭐⭐⭐

**Topics:** the `const` constructor and why a `const` widget is skipped entirely during a rebuild diff (identical, so Flutter doesn't even re-run its `build`) · splitting widgets into smaller pieces specifically so `setState` in a parent doesn't force an expensive child subtree to rebuild · `ListView.builder`/`GridView.builder` (lazy, only builds visible items) vs building a full `List` of widgets upfront · `RepaintBoundary` — isolating a subtree's paint so it doesn't repaint just because a sibling changed · `AutomaticKeepAliveClientMixin` for preserving state in an off-screen tab · DevTools' widget rebuild profiler and the "why did this rebuild" question.

**Must be able to answer:** why `const` matters for performance, precisely (not just style) · what `RepaintBoundary` actually isolates, and a concrete symptom (unrelated sibling widgets repainting together) it fixes · `ListView` vs `ListView.builder` and the memory/perf consequence of getting it wrong on a long list.

## Part 17 — [Animations](17-animations.md) ⭐⭐⭐☆☆

**Topics:** implicit animations (`AnimatedContainer`, `AnimatedOpacity`, `AnimatedSwitcher`) — declare the end state, Flutter interpolates · explicit animations — `AnimationController`, `Tween`, `CurvedAnimation`, `AnimatedBuilder` · `vsync` and why `TickerProviderStateMixin`/`SingleTickerProviderStateMixin` is required (ties animations to the screen refresh cycle, same underlying idea as [`requestAnimationFrame`](../javascript/10-event-loop-and-concurrency-model.md#4-requestanimationframe-vs-settimeoutfn-16)) · `Hero` animations for shared-element transitions between routes.

**Must be able to answer:** implicit vs explicit animation, and when the extra control of explicit (`AnimationController`) is actually necessary · what `vsync` does and why forgetting it (or disposing the controller late) leaks resources.

## Part 18 — [Platform Channels & Native Integration](18-platform-channels-and-native-integration.md) ⭐⭐⭐☆☆

**Topics:** why Flutter sometimes needs to talk to native Android/iOS code at all (a device API with no Dart plugin yet) · `MethodChannel` for one-off request/response calls · `EventChannel` for a continuous stream of native events · the serialization boundary (only certain types cross the channel) · plugin vs package (a plugin wraps a platform channel; a pure-Dart package doesn't need one) · async nature of every platform channel call.

**Must be able to answer:** `MethodChannel` vs `EventChannel`, with a use case each · plugin vs package, precisely.

## Part 19 — [Testing](19-testing.md) ⭐⭐⭐☆☆

**Topics:** the testing pyramid in Flutter specifically — **unit tests** (pure Dart logic, no widgets, fastest) → **widget tests** (`WidgetTester`, `pumpWidget`, `find.byType`/`find.text`, pumping frames for animations) → **integration tests** (`integration_test` package, real device/emulator, full user flows) · mocking dependencies (`mockito`/`mocktail`) · golden tests (pixel-perfect UI regression testing) · testing state management (BLoC's `bloc_test`, Riverpod's `ProviderContainer`).

**Must be able to answer:** the three tiers and what each actually verifies (and doesn't) · what a golden test catches that a normal widget test wouldn't · how you'd test a `Cubit`/`Bloc` in isolation, without a widget tree.

## Part 20 — [App Architecture](20-app-architecture.md) ⭐⭐⭐⭐☆

**Topics:** layered/clean architecture applied to Flutter — presentation (widgets + state management) → domain (business logic, use cases) → data (repositories, data sources) · why the domain layer shouldn't import Flutter at all (pure Dart, independently testable) · feature-first vs layer-first folder structure · dependency injection in Flutter (`get_it`, `injectable`, or Riverpod's own DI) · MVVM as it maps onto Flutter (ViewModel ≈ a Cubit/Bloc/`ChangeNotifier`).

**Must be able to answer:** why the domain layer should have zero Flutter imports · feature-first vs layer-first structure, with the scaling argument for each.

---

# PHASE 5 — Internals & comparison

## Part 21 — [Flutter Internals](21-flutter-internals.md) ⭐⭐⭐⭐☆

**Topics:** the full rendering pipeline in depth — build phase → layout phase (single pass, parent-then-child constraint propagation) → paint phase → compositing (layers) → the **Skia**/**Impeller** rendering engine underneath (and why Impeller replaced Skia as the default — predictable frame timing, no shader-compilation jank) · why Flutter draws every pixel itself instead of using native platform widgets (the actual answer to "why is Flutter fast/consistent across platforms") · the engine/framework/embedder split · `flutter run --profile` and frame timing (`Jank`, the 16ms/8ms budget for 60/120Hz).

**Must be able to answer:** the build→layout→paint→composite pipeline, in order, and what each phase actually does · why Flutter renders its own pixels instead of wrapping native widgets, and what that trades away/buys · Skia vs Impeller, at a "why does this matter" level.

## Part 22 — [Flutter vs React Native vs Native](22-flutter-vs-react-native-vs-native.md) ⭐⭐⭐☆☆

**Topics:** Flutter's own-rendering-engine approach vs React Native's (historically) native-widget-bridging approach vs fully native (Swift/Kotlin) · Dart AOT compilation vs JS bridge/JSI · hot reload mechanics and why Flutter's is exceptionally fast (stateful hot reload preserving app state) · the honest trade-offs — team skill overlap with web (RN) vs a dedicated but consistent toolchain (Flutter) vs maximum platform fidelity (native). Cross-references the [React track](../React/) for the RN side.

**Must be able to answer:** the honest trade-offs between the three, without cheerleading any of them.

---

# PHASE 6 — Machine coding

## Part 23 — [Machine Coding — Projects](23-machine-coding-projects.md) ⭐⭐⭐⭐☆

Two projects, mirroring the [Angular track's approach](../Angular/00-ROADMAP.md#phase-5--machine-coding) — a second CRUD app teaches nothing the first didn't.

### Project 1 — E-Commerce / Product Catalog App *(covers Parts 1–15)*

```
Splash → Auth (login/register)
         └── Home (product grid, ListView.builder)
             ├── Product Detail (route args, image, add-to-cart)
             ├── Cart (state shared across screens, quantity updates)
             ├── Checkout (form + validation)
             └── Order History (FutureBuilder / repository pattern)
```
Widget composition · a real state management choice, committed to end-to-end · navigation with argument passing · forms · networking + JSON.

### Project 2 — Chat / Real-Time Feed App *(covers Parts 09–10, 14, 16, 17)*

Deliberately not another CRUD app — the point is async and performance:

- a `StreamBuilder`-driven live message feed
- optimistic message send with rollback on failure
- a long, smooth-scrolling list (`ListView.builder` + `const` + `RepaintBoundary` discipline)
- a typing-indicator implicit animation
- debounced search over conversations

---

# PHASE 7 — Staying current

## Part 24 — [Latest Flutter Features](24-latest-flutter-features.md) ⭐⭐⭐☆☆

**Topics:** Impeller as the stable default rendering engine (cross-ref [Part 21](21-flutter-internals.md)) · Material 3 (`useMaterial3`) as the current default design system · the modern `flutter_riverpod` code-generation workflow (`@riverpod`) · Dart 3 features as they land in idiomatic Flutter code (records, patterns, sealed classes — cross-ref the [Dart track](../dart/00-ROADMAP.md)) · Flutter web/desktop maturity — what's genuinely production-ready vs still rough.

**Must be able to answer:** what Impeller fixed that Skia struggled with · what Material 3 changed at a practical level for existing apps migrating to it.

---

# Interview priority — what to revise last

| Priority | Topics |
|---|---|
| ⭐⭐⭐⭐⭐ | The Three Trees · Stateless/Stateful & Lifecycle · Layout System · `setState`/Local State · `InheritedWidget` · Provider · BLoC/Cubit · Navigation · Performance |
| ⭐⭐⭐⭐☆ | Dart for Flutter · `BuildContext` · Keys · Riverpod · State Management Comparison · Networking/JSON · FutureBuilder/StreamBuilder · App Architecture · Flutter Internals |
| ⭐⭐⭐☆☆ | Forms · Animations · Platform Channels · Testing · Flutter vs RN vs Native · Latest Features |

If you have one week left: the three trees + widget lifecycle + `InheritedWidget` + one state management solution end-to-end + navigation + performance (`const`/rebuilds). Those six carry most Flutter interviews.

---

## Connects to

- **[dart track](../dart/):** hard prerequisite — every Flutter part leans on the async/null-safety/OOP foundation built there.
- **[Angular track](../Angular/):** Part 11 (State Management Comparison) directly mirrors [Angular Part 16](../Angular/16-state-management.md)'s escalation; `InheritedWidget` (Part 07) is the rough analogue of Angular's DI tree for "data reachable without prop-drilling."
- **[React track](../React/):** Part 22 (Flutter vs React Native vs Native) is the natural cross-reference point; Flutter's widget-rebuild model and React's VDOM-diff model are worth actively contrasting.
- **[scenario-bank/](../scenario-bank/):** once a part is solid, production-failure-style follow-ups (a `setState` called after `dispose`, a memory leak from an undisposed `AnimationController`, a stale `Future` racing a newer one) are prime scenario-bank material.

*— Work through these in order. One part at a time. —*
