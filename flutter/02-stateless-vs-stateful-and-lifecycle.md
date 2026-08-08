# Flutter Study Notes — Part 02

## StatelessWidget vs StatefulWidget & Lifecycle ⭐⭐⭐⭐⭐

> One of the highest-frequency Flutter interview topics — the full lifecycle order, from memory, is a near-guaranteed question.

**Topics:** `StatelessWidget` and immutability · `StatefulWidget` + its paired `State<T>` object · the full lifecycle in order · what belongs in `initState` vs `build` · `mounted` and async gaps.

---

## 1. `StatelessWidget`

> **Definition:** a widget with no mutable state of its own — its `build()` output is fully determined by its constructor arguments (and any external data it reads via `BuildContext`, e.g. `InheritedWidget`). It has no internal lifecycle beyond being constructed and calling `build()`.

```dart
class Greeting extends StatelessWidget {
  final String name;
  const Greeting({super.key, required this.name}); // const constructor — Dart Part 03/Flutter Part 16

  @override
  Widget build(BuildContext context) {
    return Text('Hello, $name!');
  }
}
```
`StatelessWidget` **can still change what it displays** — but only by being rebuilt with different constructor arguments from its parent, never by mutating something internal to itself.

## 2. `StatefulWidget` + Its Paired `State<T>` Object

> **Definition:** a `StatefulWidget` is itself still immutable — but it has an associated **mutable** `State<T>` object (created once via `createState()`) that persists across rebuilds and holds the widget's actual mutable data.

```dart
class Counter extends StatefulWidget {
  const Counter({super.key});
  @override
  State<Counter> createState() => _CounterState();
}

class _CounterState extends State<Counter> {
  int _count = 0; // the MUTABLE state — lives here, not on Counter itself

  void _increment() => setState(() => _count++);

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Text('Count: $_count'),
      ElevatedButton(onPressed: _increment, child: const Text('+')),
    ]);
  }
}
```
**Why `State` is a separate object from `StatefulWidget`, precisely:** the `StatefulWidget` itself gets thrown away and recreated on every rebuild — same as any widget, per [Part 01](01-flutter-architecture-and-the-three-trees.md). If mutable state lived directly on the widget, it would be wiped out every single rebuild, which defeats the entire purpose of "state." By living on the **Element**-attached `State` object instead — which persists across rebuilds — the mutable data survives exactly as long as it should (as long as that widget stays at that position in the tree), independent of how many times the widget itself is thrown away and recreated above it.

## 3. The Full Lifecycle, in Order

```
createState()              → State object created (StatefulWidget only, once)
        ↓
initState()                → called ONCE, when the State is first inserted into the tree
        ↓
didChangeDependencies()    → called after initState(), AND again whenever an
        ↓                      InheritedWidget this State depends on changes
build()                    → called after initState()/didChangeDependencies(), and
        ↓                      again on EVERY subsequent rebuild
   (rebuild happens: setState() called, parent rebuilds with new config, or an
    InheritedWidget dependency changes)
        ↓
didUpdateWidget(oldWidget) → called when the PARENT rebuilds and provides a new
        ↓                      widget instance of the same type/key to this Element
build()                    → runs again after didUpdateWidget()
        ↓
   (widget is being removed from the tree)
        ↓
deactivate()                → called when the Element is removed from the tree
        ↓                       (but might be REINSERTED elsewhere before the frame ends —
        ↓                       GlobalKey-based tree moves, Part 05)
dispose()                     → called when the Element is permanently removed —
                                  release resources here: controllers, subscriptions, listeners
```

**What each transition-triggering event actually is, precisely:**
- `initState()` — runs exactly once, when this `State` first becomes part of the tree. This is where you'd initialize a `StreamSubscription`, an `AnimationController`, or read `widget.someInitialValue` to seed local state.
- `didChangeDependencies()` — runs right after `initState()`, and then again any time an `InheritedWidget` this `State` depends on (via `context.dependOnInheritedWidgetOfExactType`, [Part 07](07-inheritedwidget-and-inheritedmodel.md)) actually changes. This is specifically why `Theme.of(context)`/`MediaQuery.of(context)`-dependent setup can't safely happen in `initState()` — the `InheritedWidget` data might not even be fully available at that exact point in the tree's construction, and this hook exists to handle that safely, including on later changes.
- `didUpdateWidget(oldWidget)` — runs when the **same** `Element` (same position, same type, same key) receives a **new** widget configuration from its parent's rebuild — e.g. the parent passed a different `name` prop this time. You get both the old and new widget instance here, letting you compare and react (e.g. re-subscribe to a stream if the `streamUrl` prop changed).
- `deactivate()`/`dispose()` — `deactivate()` fires first and is *reversible* within the same frame (a `GlobalKey`-based move can reinsert the Element elsewhere in the tree before the frame completes, [Part 05](05-keys.md)); `dispose()` fires only once removal is final and permanent — this is where cleanup that must genuinely happen (canceling subscriptions, disposing controllers) belongs.

## 4. What Belongs in `initState` vs `build`

> **The rule:** `initState()` runs **once** — put one-time setup there. `build()` runs on **every** rebuild, potentially many times per second during an animation — anything expensive or side-effecting placed there runs repeatedly and unnecessarily, a direct [performance](16-performance-optimization.md) concern.

```dart
class _MyWidgetState extends State<MyWidget> {
  late final AnimationController _controller; // set up ONCE
  late Future<Data> _dataFuture;                  // set up ONCE — the classic FutureBuilder gotcha,
                                                       // full depth in Part 14

  @override
  void initState() {
    super.initState();                           // ALWAYS call super first in lifecycle overrides
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 1));
    _dataFuture = fetchData();                       // fetch ONCE, not on every build()
  }

  @override
  Widget build(BuildContext context) {
    // BAD: fetchData() called here would re-trigger the fetch on EVERY rebuild
    return FutureBuilder(future: _dataFuture, builder: (context, snapshot) { /* ... */ return Container(); });
  }

  @override
  void dispose() {
    _controller.dispose(); // MUST dispose anything with real resources/listeners
    super.dispose();          // ALWAYS call super LAST in dispose
  }
}
```

## 5. `didUpdateWidget`, Concretely

```dart
class VideoPlayer extends StatefulWidget {
  final String videoUrl;
  const VideoPlayer({super.key, required this.videoUrl});
  @override
  State<VideoPlayer> createState() => _VideoPlayerState();
}
class _VideoPlayerState extends State<VideoPlayer> {
  @override
  void didUpdateWidget(VideoPlayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.videoUrl != widget.videoUrl) { // compare OLD vs NEW (current) widget config
      _reloadVideo(widget.videoUrl);                 // react specifically to that prop changing
    }
  }
  void _reloadVideo(String url) { /* ... */ }
}
```
Without `didUpdateWidget`, there'd be no clean hook to react to "this specific prop changed" versus a rebuild that happened for an unrelated reason — `build()` alone can't distinguish "video URL changed, reload the player" from "some sibling's state changed and I just happen to rebuild too."

## 6. `mounted` and the Async-Gap Bug

> **Definition:** `mounted` is a `State` property that's `true` while the `State` object is attached to the tree, and `false` after `dispose()` has run. Checking it after an `await` guards against calling `setState()` (or accessing `context`) on a `State` that's already been disposed — a very common real Flutter crash.

```dart
class _MyWidgetState extends State<MyWidget> {
  Future<void> _loadData() async {
    final data = await fetchData(); // the widget might get DISPOSED during this await —
                                         // e.g. the user navigated away while the fetch was in flight
    if (!mounted) return;                // GUARD — without this, setState() below can throw
    setState(() { /* use data */ });        // "setState() called after dispose()"
  }
}
```
**Why this matters, concretely:** an `await` genuinely suspends execution and hands control back to the event loop ([Dart Part 09](../dart/09-futures-and-async-await.md)) — real time passes, and real things can happen in that gap, including the user navigating away and this exact `State` object being disposed. Resuming after the `await` and calling `setState()` on an already-disposed `State` throws a runtime error — `mounted` is the standard, idiomatic guard against it. (Dart 3's `context.mounted` extends this same check to `BuildContext` usage after an async gap, [Part 03](03-buildcontext.md).)

---

## Interview Q&A

**Q: The full lifecycle order, from memory?**
> `createState()` → `initState()` → `didChangeDependencies()` → `build()`, then on every subsequent rebuild: `didUpdateWidget()` (only if the parent passed new widget config) followed by `build()` again, or just `build()` again for a `setState()`-triggered rebuild with no new parent config, or `didChangeDependencies()` again followed by `build()` if a depended-on `InheritedWidget` changed. On removal: `deactivate()` (potentially reversible within the same frame), then `dispose()` (final, where real cleanup happens).

**Q: Why is `State` a separate object from `StatefulWidget`?**
> Because the widget itself is recreated on every rebuild, same as any widget — if mutable state lived directly on it, it would be wiped out every single rebuild, defeating the purpose. The `State` object is tied to the persistent Element instead, surviving across however many times the widget configuration above it gets recreated, so the mutable data lives exactly as long as it should.

**Q: What is `didUpdateWidget` for, concretely?**
> It fires when the same `Element` receives a new widget configuration from a parent rebuild — giving you both the old and new widget instances so you can detect and react specifically to a prop that changed, like re-subscribing to a new URL. Without it, there'd be no way inside `build()` alone to distinguish "a specific prop just changed, react to that" from "a rebuild happened for some unrelated reason."

**Q: Why does checking `mounted` after an `await` inside a `State` method matter?**
> An `await` genuinely suspends execution, handing control back to the event loop, and real things can happen during that gap — including the widget being removed from the tree and its `State` disposed, e.g. the user navigated away mid-fetch. Resuming after the `await` and calling `setState()` on an already-disposed `State` throws at runtime; `mounted` is the standard guard that checks the `State` is still actually attached before touching it.

---

## Follow-ups (challenge questions)

- *Failure mode:* a `State`'s `initState()` starts a `Timer.periodic` that calls `setState()` on every tick, but `dispose()` never cancels it — walk through the exact crash (and its message) that occurs once the widget is removed from the tree while the timer keeps firing, and why this specific bug is common enough to be a classic Flutter interview scenario question.
- *Consistency:* a `ListView` rebuilds and reorders its children (same widget types, different order, no keys) — connect this to [Part 05 — Keys](05-keys.md): does `didUpdateWidget` fire for "the same conceptual item" that moved position, or does Flutter's Element-matching-by-position potentially associate the wrong State with the wrong data after a reorder?
- *Scale:* a screen with 50 `StatefulWidget` children each does expensive setup in `initState()` (e.g. spinning up an `AnimationController`) — what's the actual cost if that screen is inside a `PageView` that keeps all pages alive in memory simultaneously versus one that disposes off-screen pages, and how does `AutomaticKeepAliveClientMixin` change that tradeoff (full depth in [Part 16](16-performance-optimization.md))?

---

**Previous:** [Part 01 — Flutter Architecture & the Three Trees](01-flutter-architecture-and-the-three-trees.md) · **Next:** [Part 03 — BuildContext](03-buildcontext.md)
