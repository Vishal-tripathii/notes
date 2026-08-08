# Flutter Study Notes — Part 12

## Navigation & Routing ⭐⭐⭐⭐⭐

**Topics:** `Navigator` as a route stack · push/pop/replace family · named routes vs `MaterialPageRoute` · passing arguments/returning results · Navigator 1.0 vs 2.0 · `go_router` · nested navigation.

---

## 1. `Navigator` as a Stack of Routes

> **Definition:** `Navigator` manages a **stack** of `Route`s — each screen is pushed on top of the previous one, and navigating "back" pops the top route off, revealing what's beneath — the same LIFO mental model as [the JS call stack](../javascript/00-js-fundamentals.md#1-execution-context--call-stack), applied to screens instead of function calls.

```dart
Navigator.push(context, MaterialPageRoute(builder: (context) => const DetailScreen()));
Navigator.pop(context);                                     // removes the top route, reveals what's under it
Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const NewScreen())); // swaps
                                                                                                     // the top route without adding to stack depth
Navigator.pushAndRemoveUntil(                                 // e.g. after login: clear the whole
  context, MaterialPageRoute(builder: (context) => const HomeScreen()),
  (route) => false,                                             // stack, start fresh at Home
);
```

## 2. Named Routes vs `MaterialPageRoute`

> **Definition — `MaterialPageRoute`:** directly constructs a route with an inline widget builder — simple, but couples the navigation call site to the destination widget's constructor directly.
> **Definition — Named routes:** a centrally-registered `String → WidgetBuilder` map, navigated to by name (`Navigator.pushNamed(context, '/details')`) — decouples call sites from constructor details, at the cost of losing some compile-time argument-type safety (arguments are typically passed as an untyped `Object?`/`Map`).

```dart
// direct
Navigator.push(context, MaterialPageRoute(builder: (_) => DetailScreen(id: itemId)));

// named — registered centrally
MaterialApp(routes: {'/details': (context) => const DetailScreen()});
Navigator.pushNamed(context, '/details', arguments: itemId); // arguments are Object? — untyped
```

## 3. Passing Arguments & Returning a Result

```dart
// passing arguments — direct constructor is simplest and type-safe
Navigator.push(context, MaterialPageRoute(builder: (_) => DetailScreen(itemId: '123')));

// returning a result from a popped route
Future<void> _selectItem(BuildContext context) async {
  final selectedItem = await Navigator.push<Item>(     // push<T> — T is the type popped BACK
    context,
    MaterialPageRoute(builder: (_) => const SelectionScreen()),
  );
  if (selectedItem != null) { /* use it */ }
}
// inside SelectionScreen, when the user picks something:
Navigator.pop(context, chosenItem); // the value passed to pop() becomes push<T>()'s awaited result
```

## 4. Navigator 1.0 vs Navigator 2.0

> **Definition — Navigator 1.0 (imperative):** the `Navigator.push`/`pop` API above — you explicitly command the stack to change, one operation at a time, with no single declarative source of truth for "what's the current route stack."
> **Definition — Navigator 2.0 (declarative):** built around `Router`, `RouteInformationParser` (parses a URL into app-specific route data), and `RouterDelegate` (declares the current `Navigator`'s page stack as a function of app state, rebuilding it when that state changes) — the navigation stack becomes a *derived value*, not a sequence of imperative commands.

**Why 2.0 exists — what it solves that 1.0 genuinely can't:** Navigator 1.0 has no built-in concept of "the current URL," so on **Flutter web**, the browser's address bar, back/forward buttons, and deep links (opening a specific in-app screen directly from an external URL) don't naturally synchronize with an imperative push/pop stack — there's no single source of truth to read the current state *from*. Navigator 2.0's declarative model makes the route stack a function of app state (which can itself be driven by a parsed URL), so the browser's URL and the in-app navigation stack can be kept in sync in both directions, and the OS back gesture/browser back button integrate properly. Navigator 1.0's imperative push/pop calls have no natural way to express "the URL just changed externally, please update the stack to match."

## 5. `go_router` — the Practical Answer to Navigator 2.0's Verbosity

> **Definition:** `go_router` is the ecosystem's standard package wrapping Navigator 2.0's `Router`/`RouteInformationParser`/`RouterDelegate` machinery behind a much simpler, mostly-declarative route-table API — URL-based, deep-link-friendly, without hand-writing the full Navigator 2.0 boilerplate directly.

```dart
final router = GoRouter(routes: [
  GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
  GoRoute(
    path: '/details/:id',                                          // URL path parameter
    builder: (context, state) => DetailScreen(id: state.pathParameters['id']!),
  ),
]);

MaterialApp.router(routerConfig: router); // MaterialApp.router, not the plain MaterialApp constructor

context.go('/details/123');   // navigate via URL-like path — works identically on mobile AND web
context.push('/details/123');  // push onto the stack (vs go(), which can replace depending on context)
```

## 6. Nested Navigation

> **Definition:** a common pattern — a bottom navigation bar where **each tab maintains its own independent navigation stack**, so switching tabs and switching back preserves each tab's scroll position/navigation depth, rather than resetting it — implemented via a `Navigator` widget nested inside each tab, separate from the app's root `Navigator`.

```dart
// simplified shape — each tab gets its OWN Navigator, not sharing the root one
IndexedStack(
  index: currentTabIndex,
  children: [
    Navigator(onGenerateRoute: (settings) => MaterialPageRoute(builder: (_) => const HomeTab())),
    Navigator(onGenerateRoute: (settings) => MaterialPageRoute(builder: (_) => const SearchTab())),
    Navigator(onGenerateRoute: (settings) => MaterialPageRoute(builder: (_) => const ProfileTab())),
  ],
);
```

---

## Interview Q&A

**Q: Navigator 1.0 vs 2.0 — what problem does 2.0 genuinely solve that 1.0 can't?**
> Navigator 1.0's imperative push/pop model has no single declarative source of truth for "what's the current route stack" derived from external state like a URL — which breaks down specifically for Flutter web's browser back/forward buttons and address bar, and for deep linking into a specific screen from an external URL. Navigator 2.0 makes the route stack a *derived* function of app state via `RouterDelegate`, so it can be kept in sync with an externally-changing URL in both directions — something an imperative push/pop sequence has no natural mechanism to express.

**Q: How would you pass data to a new route and get a result back when it's popped?**
> Pass data directly via the destination widget's constructor when pushing (type-safe, the simplest approach). To get a result back, `await` the `Navigator.push<T>()` call — its returned `Future<T?>` resolves with whatever value the pushed route later passes to `Navigator.pop(context, value)`, or `null` if it's popped with no value (e.g. the user pressed back without completing an action).

**Q: `Navigator.pushReplacement` vs `Navigator.push` — what's the practical difference and when would you use each?**
> `push` adds a new route on top of the stack, so the previous screen is still there beneath it and reachable via back. `pushReplacement` swaps the current top route out for a new one without growing the stack depth — appropriate for something like a login screen transitioning to a home screen, where you specifically don't want the user able to navigate "back" into the now-irrelevant login screen.

---

## Follow-ups (challenge questions)

- *Failure mode:* an app uses plain Navigator 1.0, ships to Flutter web, and users report that the browser's back button sometimes exits the entire app instead of navigating within it, and refreshing the page always returns to the home screen regardless of what was actually being viewed — trace both symptoms back to Navigator 1.0's lack of URL-synchronization, and explain how migrating to `go_router`/Navigator 2.0 fixes each specifically.
- *Consistency:* a bottom-nav app with per-tab nested Navigators — the user is three screens deep in Tab A, switches to Tab B, then back to Tab A — does Tab A's navigation stack reset to its root, or does it preserve exactly where the user left off? Reason through why `IndexedStack` (keeping all tabs' widget trees alive simultaneously, just hidden) versus rebuilding a tab's Navigator from scratch on every switch produces genuinely different user-facing behavior here.
- *Scale:* a deep-linked URL like `/details/123/reviews/456` needs to reconstruct a multi-level navigation stack (Home → Details → Reviews) when opened cold from an external link, not just land directly on the Reviews screen with an empty back stack — how does `go_router`'s route configuration support building that full intended stack rather than just the single deepest screen?

---

**Previous:** [Part 11 — State Management Comparison](11-state-management-comparison.md) · **Next:** [Part 13 — Networking & JSON Serialization](13-networking-and-json-serialization.md)
