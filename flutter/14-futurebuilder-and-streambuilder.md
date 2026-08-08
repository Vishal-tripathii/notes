# Flutter Study Notes — Part 14

## FutureBuilder & StreamBuilder ⭐⭐⭐⭐☆

**Topics:** `FutureBuilder`'s `ConnectionState`/snapshot · the "Future created inside `build()`" bug · `StreamBuilder` · when to use these vs a state-management solution.

---

## 1. `FutureBuilder`

> **Definition:** a widget that rebuilds itself based on the state of a given `Future` — exposing that state via an `AsyncSnapshot` with a `ConnectionState` (`none`/`waiting`/`active`/`done`) and `hasData`/`hasError`/`data`/`error` accessors, letting `build()` render differently for loading/success/error without any manual state tracking.

```dart
FutureBuilder<User>(
  future: _userFuture, // see the bug below for why this MUST be created outside build()
  builder: (context, snapshot) {
    if (snapshot.connectionState == ConnectionState.waiting) {
      return const CircularProgressIndicator();
    }
    if (snapshot.hasError) {
      return Text('Error: ${snapshot.error}');
    }
    if (snapshot.hasData) {
      return Text('Hello, ${snapshot.data!.name}');
    }
    return const SizedBox.shrink(); // ConnectionState.none — no future provided yet
  },
);
```
**`ConnectionState` values, precisely:** `none` — no future has been provided at all. `waiting` — a future is provided but hasn't completed yet. `active` — relevant to `StreamBuilder` specifically, a stream has started emitting but hasn't closed. `done` — the future completed (with data or an error) or the stream closed.

## 2. The "Future Created Inside `build()`" Bug

> **The bug:** calling the function that starts an async operation **directly inside `build()`** (rather than once, earlier, and storing the resulting `Future`) means a **new** `Future` — and therefore a **new** network request/async operation — is created on **every single rebuild**, not just the first time.

```dart
// BROKEN
class _MyWidgetState extends State<MyWidget> {
  @override
  Widget build(BuildContext context) {
    return FutureBuilder<User>(
      future: fetchUser(),          // NEW Future created EVERY build() call — including rebuilds
      builder: (context, snapshot) => /* ... */ Container(),  // triggered for totally unrelated reasons
    );
  }
}

// FIXED
class _MyWidgetState extends State<MyWidget> {
  late Future<User> _userFuture; // held in State, created ONCE

  @override
  void initState() {
    super.initState();
    _userFuture = fetchUser(); // fetched exactly once, in initState (Part 02)
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<User>(
      future: _userFuture, // the SAME Future instance every rebuild — FutureBuilder just re-checks
      builder: (context, snapshot) => /* ... */ Container(),      // its already-in-progress/settled state
    );
  }
}
```
**The exact user-visible symptom:** the data appears to re-fetch and flicker back to a loading spinner every time *anything* triggers a rebuild of this widget — even something completely unrelated to the fetched data, like an unrelated `setState()` elsewhere in the same `build()` scope, or a parent rebuilding and passing down otherwise-identical props. This is a very common real bug, and the fix — holding the `Future` in `State`, created once in `initState` — is exactly the same lesson as [Part 02's `initState` vs `build` guidance](02-stateless-vs-stateful-and-lifecycle.md#4-what-belongs-in-initstate-vs-build).

## 3. `StreamBuilder`

> **Definition:** the same shape as `FutureBuilder`, for a `Stream` instead of a single `Future` — rebuilds on every new event the stream emits, useful for live/ongoing data (a BLoC's state stream, a live Firestore query, a WebSocket feed).

```dart
StreamBuilder<int>(
  stream: _counterStream, // same "create once, hold in State" rule applies here too
  initialData: 0,             // optional — what to show before the FIRST event arrives
  builder: (context, snapshot) {
    if (snapshot.hasError) return Text('Error: ${snapshot.error}');
    return Text('Count: ${snapshot.data}');
  },
);
```
The same "created inside `build()`" bug applies identically to `StreamBuilder` — if the stream itself is recreated on every rebuild (e.g. `stream: getStream()` called inline), you get a fresh stream (and potentially a fresh underlying subscription/connection) every rebuild instead of continuously listening to one ongoing stream.

## 4. When to Use These vs a State-Management Solution

> **The rule:** `FutureBuilder`/`StreamBuilder` are the right tool for **local, widget-scoped** async state — one specific piece of data needed by exactly this widget subtree, with no other part of the app needing to read or react to it. Once that async state needs to be **shared** across multiple, possibly-distant widgets — or needs more complex handling (retry logic, caching, combining multiple async sources) — it belongs in a proper state-management solution ([Phase 2](07-inheritedwidget-and-inheritedmodel.md)) instead, which then exposes a simpler, already-resolved value that `FutureBuilder`/`StreamBuilder` (or a plain `Consumer`/`ref.watch()`) can display.

```dart
// appropriate FutureBuilder use — local, one-off, nobody else needs this data
FutureBuilder<Weather>(future: fetchTodaysWeather(), builder: /* ... */);

// should probably be Riverpod's FutureProvider/AsyncValue instead — this is APP-WIDE user
// data multiple screens need, with retry/caching concerns beyond one widget's lifecycle
final userProvider = FutureProvider((ref) => fetchCurrentUser()); // Part 09
```

---

## Interview Q&A

**Q: Walk through the "Future created inside `build()`" bug — exactly why it happens and its user-visible symptom.**
> If the async function that produces the `Future` is called directly inline inside `build()` (e.g. `future: fetchUser()`), a brand-new `Future` — and a brand-new underlying async operation, like a fresh network request — is created on *every single rebuild*, not just the first time the widget is built. The visible symptom is data appearing to re-fetch and flicker back to a loading state on every rebuild, even ones triggered by something entirely unrelated to that data. The fix is holding the `Future` in the `State` object, created exactly once inside `initState()`, so the same `Future` instance is passed to `FutureBuilder` across every subsequent rebuild.

**Q: What do the `ConnectionState` values mean, and what should you render for each?**
> `none` — no future/stream provided yet, typically render nothing or a placeholder. `waiting` — in progress, no data yet, render a loading indicator. `active` — stream-specific, has emitted at least one event but hasn't closed, render the latest data. `done` — future completed or stream closed, render final data or an error state, checked via `snapshot.hasData`/`hasError`.

**Q: When would you reach for `FutureBuilder` versus a full state-management solution for the same async data?**
> `FutureBuilder`/`StreamBuilder` are appropriate for local, widget-scoped async state that nothing else in the app needs to read or react to. Once that data needs to be shared across multiple, possibly distant widgets, or needs more complex handling like caching, retries, or combining several async sources, it belongs in a proper state-management solution instead — which resolves the async complexity once, centrally, and exposes a simpler already-resolved value for individual widgets to display.

---

## Follow-ups (challenge questions)

- *Failure mode:* a screen with a search bar rebuilds on every keystroke (via `setState` updating a query string), and a `FutureBuilder` further down uses `future: searchApi(query)` called inline — walk through the actual behavior a user experiences while typing, connecting directly to the bug in §2, and why this is a particularly bad case of it (a rapidly-typing user firing many redundant, immediately-stale search requests).
- *Consistency:* a `StreamBuilder` displays live data from a stream that's actually owned and provided by a BLoC/Riverpod provider elsewhere — is there any redundancy or risk in wrapping an already-reactive state-management value in a `StreamBuilder` on top, versus just using `BlocBuilder`/`ref.watch()` directly? Reason through what each approach is actually subscribing to.
- *Scale:* a screen shows five independent `FutureBuilder`s, each fetching a different piece of data for the same screen, all fired in `initState()` — do these five fetches run sequentially or concurrently, and how would you know without adding explicit `Future.wait` ([Dart Part 09](../dart/09-futures-and-async-await.md#5-futurewait--darts-promiseall))?

---

**Previous:** [Part 13 — Networking & JSON Serialization](13-networking-and-json-serialization.md) · **Next:** [Part 15 — Forms & Validation](15-forms-and-validation.md)
