# Flutter Study Notes — Part 09

## Riverpod ⭐⭐⭐⭐☆

**Topics:** what Riverpod fixes about Provider · provider types · `ref.watch()`/`ref.read()`/`ref.listen()` · `.autoDispose`/`.family` · **provider lifecycle** (`ref.onDispose()`, `ref.keepAlive()`, `ref.invalidate()`/`ref.refresh()`) · code generation (`@riverpod`).

---

## 1. What Riverpod Fixes About Provider

> **Definition:** Riverpod (by the same author as Provider) removes `BuildContext` as a requirement for reading state entirely — providers are declared as **global, compile-time-safe references** (top-level variables), read via a `ref` object instead of a `context`, which fixes several structural issues Provider inherits from being built directly on `InheritedWidget`.

| | Provider | Riverpod |
|---|---|---|
| Requires `BuildContext` to read? | yes (`context.watch<T>()`) | no (`ref.watch(provider)`) |
| Provider-not-found failure | **runtime** error if `Provider<T>` isn't found above in the tree | **compile-time** — a provider reference either exists or it's a compile error, no tree lookup that can fail at runtime |
| Reading state outside widgets (tests, business logic) | awkward — needs a `BuildContext` | straightforward — `ref`/`ProviderContainer` works without any widget tree at all |
| Multiple instances of the "same" provider type | needs distinct `Provider` instances manually managed | `.family` modifier, built in (§4) |

**The concrete problems Riverpod solves that Provider has:** Provider's `context.watch<CartModel>()` can fail at **runtime** with "could not find a CartModel above this widget" if the provider was forgotten somewhere in the tree, or if the widget calling it is accidentally positioned above the provider instead of below — a mistake only caught when that code path actually runs. Riverpod's providers are plain Dart objects referenced directly, so a missing/misplaced provider is generally a compile-time reference error instead, and testing business logic that reads provided state no longer requires spinning up a widget tree just to get a `BuildContext` to read from.

## 2. Provider Types

> **Definition:** Riverpod offers several provider "shapes" for different kinds of state — `Provider` (a plain, unchanging computed value or dependency), `StateProvider` (simple mutable state, akin to a single `useState`), `StateNotifierProvider` (state managed by a dedicated `StateNotifier` class, for more complex mutation logic), `FutureProvider`/`StreamProvider` (state derived from a `Future`/`Stream`, automatically exposing loading/data/error states).

```dart
final apiClientProvider = Provider((ref) => ApiClient()); // simple dependency, computed once

final counterProvider = StateProvider((ref) => 0);           // simple mutable state

final userProvider = FutureProvider((ref) async {                // async data, auto-wraps in
  final api = ref.watch(apiClientProvider);                          // an AsyncValue (loading/data/error)
  return api.fetchCurrentUser();
});

class TodoListNotifier extends StateNotifier<List<Todo>> {
  TodoListNotifier() : super([]);
  void add(Todo todo) => state = [...state, todo]; // reassigns state — StateNotifier is immutable-state-based
}
final todoListProvider = StateNotifierProvider<TodoListNotifier, List<Todo>>((ref) => TodoListNotifier());
```

## 3. `ref.watch()` vs `ref.read()` vs `ref.listen()`

> **Definition:** the same `watch`/`read` distinction as Provider ([Part 08](08-provider.md#3-contextwatch-vs-contextread)), but via `ref` instead of `context` — `ref.watch()` subscribes (rebuild on change), `ref.read()` is a one-time access (correct inside callbacks, same reasoning as Provider's `read()`). `ref.listen()` is new: runs a callback as a **side effect** when a provider changes, without itself causing a rebuild — for things like showing a `SnackBar` in reaction to a state change, which isn't itself something you'd want to trigger during `build()`.

```dart
class CounterWidget extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(counterProvider); // subscribes
    ref.listen(counterProvider, (previous, next) {  // side effect, NOT a rebuild trigger itself
      if (next > 10) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('High!')));
    });
    return ElevatedButton(
      onPressed: () => ref.read(counterProvider.notifier).state++, // one-time access to mutate
      child: Text('$count'),
    );
  }
}
```

## 4. Provider Modifiers — `.autoDispose` and `.family`

> **Definition — `.autoDispose`:** automatically disposes a provider's state once it has **no more listeners** (e.g. the screen that was watching it was popped) — without it, providers live for the **entire app lifetime** by default, which can leak memory for screen-scoped state that should genuinely go away.
> **Definition — `.family`:** parameterizes a provider, letting the *same* provider definition produce a distinct provider instance per parameter value — e.g. one `userProvider` definition that, given a different user ID, produces and caches a separate provider/state per ID.

```dart
final userDetailProvider = FutureProvider.autoDispose.family<User, String>((ref, userId) async {
  return fetchUser(userId); // a SEPARATE cached provider instance per distinct userId,
});                            // AND automatically disposed once no widget is watching a given userId anymore

// usage — each distinct userId gets its own independently-cached, independently-disposed state
ref.watch(userDetailProvider('user-123'));
ref.watch(userDetailProvider('user-456'));
```
**Why `.autoDispose` matters for memory:** a provider without it stays alive and cached for the app's entire lifetime once created, even after every widget that ever watched it has been removed from the tree — for screen-scoped state (a detail screen's data, tied to that screen's visit), that's a real, accumulating leak across many navigations. `.autoDispose` ties the provider's lifetime to actual usage instead.

## 5. Provider Lifecycle

> **Definition:** a provider has its own lifecycle, distinct from — and running alongside — the widget lifecycle covered in [Part 02](02-stateless-vs-stateful-and-lifecycle.md#3-the-full-lifecycle-in-order): **created** (lazily, the first time something reads it — not when it's declared as a top-level variable), **active** (while at least one listener is watching), and, for `.autoDispose` providers, a **disposal** step once the last listener goes away. This is the mechanism `.autoDispose` from §4 is actually built on, and it has its own explicit hooks.

```
declared as a top-level variable   → NOT created yet, just a reference that exists
        ↓ first ref.watch()/ref.read() call, from anywhere
CREATED   → provider's build function runs, initial value/state computed
        ↓
ACTIVE    → stays alive as long as at least one listener is watching
        ↓ (autoDispose only) last listener stops watching
GRACE PERIOD → briefly still alive (handles a quick widget rebuild removing/re-adding a listener)
        ↓ grace period elapses with still no listeners
DISPOSED   → ref.onDispose() callbacks fire, provider's state is discarded
```

**`ref.onDispose()`** — registers a cleanup callback that runs when the provider is disposed, the Riverpod-provider equivalent of a `State`'s `dispose()` method ([Part 02](02-stateless-vs-stateful-and-lifecycle.md#4-what-belongs-in-initstate-vs-build)) — for closing a `StreamSubscription`, cancelling a `Timer`, or disposing a controller the provider created:

```dart
final searchProvider = StreamProvider.autoDispose<List<Result>>((ref) {
  final controller = StreamController<List<Result>>();
  final subscription = watchSearchResults().listen(controller.add);
  ref.onDispose(() {           // fires when this provider is disposed (autoDispose, no listeners left)
    subscription.cancel();        // same discipline as canceling a StreamSubscription in State.dispose()
    controller.close();
  });
  return controller.stream;
});
```

**`ref.keepAlive()`** — called from inside an `.autoDispose` provider to programmatically **suppress** disposal even after listeners drop to zero, typically conditionally (e.g. keep a fetched result alive once it successfully loaded, but still allow disposal if it's still loading and the last listener leaves):

```dart
final userProvider = FutureProvider.autoDispose<User>((ref) async {
  final link = ref.keepAlive();      // holding this suppresses normal autoDispose behavior
  final user = await fetchUser();
  return user;                          // once successfully loaded, this data survives even if the
});                                        // screen watching it is popped — a manual caching decision
```

**`ref.invalidate()` / `ref.refresh()`** — force a provider back through creation again, discarding its current state — `invalidate()` just marks it stale (next read recreates it); `refresh()` invalidates **and** immediately reads the new value in one call, commonly used for pull-to-refresh:

```dart
ElevatedButton(
  onPressed: () => ref.invalidate(userDetailProvider('user-123')), // forces a fresh fetch next read
  child: const Text('Refresh'),
);
// or, to get the new value immediately:
final freshUser = await ref.refresh(userDetailProvider('user-123').future);
```

**Why this is a genuinely separate lifecycle from the widget one, not a duplicate of it:** a provider can be created, stay active, and get disposed entirely independently of any *one* particular widget's own lifecycle — multiple different widgets across the tree, mounting and unmounting on their own schedules, can all watch the same provider, and the provider's lifecycle tracks the aggregate "does *anything* still care about this" rather than being tied to any single `State` object's existence. This is precisely why `ref.onDispose()` exists as its own hook rather than the guidance simply being "clean up in the watching widget's `dispose()`" — the provider may outlive, or be disposed independently of, any specific widget currently watching it.

## 6. Code Generation (`@riverpod`)

> **Definition:** modern Riverpod favors an annotation-based, code-generated style — `@riverpod` on a function or class, with `build_runner` generating the actual provider boilerplate — reducing manual provider-declaration verbosity and adding stronger compile-time guarantees.

```dart
@riverpod
Future<User> userDetail(UserDetailRef ref, String userId) async {
  return fetchUser(userId);
} // build_runner generates userDetailProvider automatically, including .autoDispose and
   // .family-equivalent behavior inferred from the function signature — no manual wiring
```

---

## Interview Q&A

**Q: What are the concrete problems Riverpod solves that Provider has?**
> Provider's context-based lookup can fail at *runtime* if a provider is missing or the reading widget is positioned wrong in the tree relative to it — a mistake only surfacing when that code path actually executes. Riverpod's providers are global, compile-time-referenced objects read via `ref` instead of `context`, so a missing provider is generally caught as a compile-time reference error instead. It also removes the `BuildContext` requirement entirely, making state trivially readable/testable outside a widget tree.

**Q: What does `.autoDispose` do, and why does it matter for memory?**
> Without it, a Riverpod provider's state persists for the entire app's lifetime once created, even after every widget watching it has been removed from the tree. `.autoDispose` ties the provider's lifetime to actual usage — disposing its state once it has no remaining listeners — which matters specifically for screen-scoped state, preventing an accumulating memory leak across many screen visits/navigations over a long session.

**Q: What's `ref.listen()` for, and why isn't `ref.watch()` enough for something like showing a `SnackBar` on a state change?**
> `ref.listen()` runs a callback as a *side effect* in reaction to a provider's value changing, without itself triggering or being part of the widget's rebuild — appropriate for one-off reactions like showing a `SnackBar` or navigating, which shouldn't happen as a side effect of the `build()` method itself running (which can happen for many unrelated reasons, and re-showing a `SnackBar` every rebuild would be wrong). `ref.watch()` is for driving what gets *rendered*, not for triggering one-off imperative side effects.

**Q: Walk through a provider's lifecycle, and how is it different from a widget's lifecycle?**
> A provider is created lazily — the first time something actually reads it, not when it's declared — then stays active as long as at least one listener is watching it. For an `.autoDispose` provider, once the last listener stops watching, it briefly holds in a grace period (to survive a quick widget rebuild that removes and immediately re-adds a listener) before disposing, at which point any `ref.onDispose()` callbacks fire and its state is discarded. This is a genuinely separate lifecycle from any one widget's — the provider tracks whether *anything at all* still cares about it, aggregated across potentially many independent widgets watching it on their own schedules, rather than being tied to one specific `State` object's `initState`/`dispose` cycle.

**Q: What's `ref.onDispose()` for, and when would you actually need it?**
> It registers a cleanup callback that runs when the provider itself is disposed — the provider-level equivalent of a `State`'s `dispose()` method. It's needed whenever a provider's build function acquires something that needs explicit cleanup — a `StreamSubscription` it started listening to, a `Timer`, a `StreamController` it created — following the exact same "whatever you acquire, you must release" discipline as `TextEditingController`/`AnimationController` disposal in widget code.

---

## Follow-ups (challenge questions)

- *Scale:* an app has 50 screens, each using `.family`-parameterized providers keyed by an ID, without `.autoDispose` — walk through what accumulates in memory over a long user session navigating between many of these screens repeatedly, and how `.autoDispose` changes that trajectory.
- *Failure mode:* a widget calls `ref.watch(someProvider)` inside a `ref.listen()` callback (instead of `ref.read()`) — what's actually wrong with that, connecting back to the same `watch`-vs-`read` distinction and *when* watching is meant to be called (during build, to establish a subscription) versus a one-off imperative callback context?
- *Consistency:* two widgets both watch `userDetailProvider('user-123')` — does each get its own independently-fetched copy of the user data, or do they share one cached instance and one in-flight fetch? Reason through this using what `.family` actually caches, and why that matters for avoiding duplicate network requests for the same logical data.
- *Failure mode:* an `.autoDispose` provider's build function starts a `Timer.periodic` but the developer forgets to register a matching `ref.onDispose()` to cancel it — walk through why this leak is arguably worse than an undisposed widget-level `Timer` (Part 02's `mounted`-check scenario), given the provider might not even be tied to any widget still visibly on screen when it leaks.
- *Consistency:* a provider uses `ref.keepAlive()` conditionally — only calling it after a fetch succeeds, never on failure — walk through why this specific conditional pattern (cache successes, allow retry-by-recreation on failure) is a deliberate design choice, and what would go wrong if `ref.keepAlive()` were called unconditionally at the top of the provider regardless of outcome.

---

**Previous:** [Part 08 — Provider](08-provider.md) · **Next:** [Part 10 — BLoC / Cubit](10-bloc-and-cubit.md)
