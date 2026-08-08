# Flutter Study Notes — Part 06

## setState & Local State ⭐⭐⭐⭐⭐

**Topics:** what `setState()` actually does · why it throws outside `State`/after `dispose` · "lift state up" · where `setState` stops scaling.

---

## 1. What `setState()` Actually Does

> **Definition:** `setState(callback)` runs the given callback synchronously (mutating whatever local fields it touches), then marks **this specific `State`'s Element** as dirty, scheduling that Element's `build()` to be re-run on the next frame. It does **not** rebuild the whole app, a whole screen, or any Element outside this one's own subtree — full mechanism traced tree-by-tree in [Part 01](01-flutter-architecture-and-the-three-trees.md#3-what-actually-happens-when-setstate-is-called).

```dart
class _CounterState extends State<Counter> {
  int _count = 0;
  void _increment() {
    setState(() {
      _count++; // the mutation itself can happen INSIDE or outside the callback — what matters
    });            // is that setState() is CALLED, telling Flutter "something changed, rebuild me"
  }
  @override
  Widget build(BuildContext context) => Text('$_count');
}
```
**Exactly which subtree rebuilds — not "the whole app," precisely which:** calling `setState()` inside `_CounterState` marks *only* that `State`'s associated Element dirty. `build()` re-runs for `_CounterState` and, cascading naturally, for whatever new widget subtree that `build()` call produces — but **not** for sibling `State`s elsewhere in the tree, and not for ancestors above it, unless something else independently also marks them dirty. This locality is exactly why splitting a large `build()` method into smaller widgets is a real [performance technique](16-performance-optimization.md#1-const-widget-and-splitting-widgets), not just code organization — a `setState()` deep in a small, extracted widget only re-runs that small widget's `build()`, not its entire ancestor chain's.

## 2. Why `setState()` Throws Outside `State` or After `dispose`

```dart
// setState() is a METHOD ON State<T> — it literally cannot be called from outside a State object
// (it's not a global function), and:

class _MyState extends State<MyWidget> {
  Future<void> _load() async {
    final data = await fetchData();
    setState(() { /* ... */ }); // throws if this State has ALREADY been disposed by the time
  }                                  // this line runs — "setState() called after dispose()"
}
```
Two distinct failure modes, both real and common: **(1)** trying to call `setState` from code that isn't a `State` method at all (a compile error, since `setState` simply isn't in scope) — and **(2)** calling it correctly, from within a `State` method, but *after* that `State`'s `dispose()` has already run (a runtime error) — the exact scenario [Part 02's `mounted` guard](02-stateless-vs-stateful-and-lifecycle.md#6-mounted-and-the-async-gap-bug) exists to prevent.

## 3. "Lift State Up"

> **Definition:** when two sibling widgets need to share or coordinate state, the state is moved ("lifted") to their nearest common ancestor, which then owns it and passes it down to both children as constructor parameters (with a callback passed down for children to request changes) — the same [pattern React/Angular use](../Angular/06-component-communication.md) under a different name.

```dart
class Parent extends StatefulWidget {
  @override
  State<Parent> createState() => _ParentState();
}
class _ParentState extends State<Parent> {
  int _sharedValue = 0;
  void _updateValue(int newValue) => setState(() => _sharedValue = newValue);

  @override
  Widget build(BuildContext context) => Column(children: [
    DisplayWidget(value: _sharedValue),              // reads the shared state
    ControlWidget(onChanged: _updateValue),              // triggers changes to it, via callback
  ]);
}
```

## 4. Where `setState` Stops Scaling

> **The pain points that motivate everything in [Phase 2](07-inheritedwidget-and-inheritedmodel.md) onward:** "lift state up" works cleanly for two or three levels, but degrades badly beyond that.

- **Prop-drilling pain:** state lifted to a distant common ancestor has to be threaded down through every intermediate widget's constructor, even ones that don't use it themselves, purely to pass it along to a descendant that does — a maintenance burden that grows with tree depth.
- **Siblings that need to share state across genuinely unrelated subtrees:** if the "nearest common ancestor" is close to the app's root, lifting state there couples otherwise-independent parts of the app, and a `setState()` there potentially triggers a rebuild of a much larger subtree than necessary (mitigated somewhat by the const/splitting techniques in [Part 16](16-performance-optimization.md), but still a real structural cost).
- **State genuinely global to the app** (a logged-in user, a shopping cart, an app-wide theme preference) has no sensible "common ancestor" to lift to at all short of the app root — which is exactly the gap `InheritedWidget` ([Part 07](07-inheritedwidget-and-inheritedmodel.md)) and everything built on it (Provider, Riverpod, BLoC) exists to fill.

**When `setState` genuinely stops being enough:** the moment prop-drilling depth becomes a real maintenance cost, or state needs to be readable/writable from parts of the tree with no reasonably-close common ancestor — that's the concrete signal to reach for one of Parts 07–10's tools instead of continuing to lift state.

---

## Interview Q&A

**Q: What exactly rebuilds when `setState()` runs — not "the whole app," precisely which subtree?**
> Only the specific `State`'s associated Element gets marked dirty, causing that `State`'s `build()` method to re-run on the next frame — along with whatever new widget subtree that particular `build()` call produces. Sibling `State`s elsewhere in the tree, and ancestors above it, are untouched unless something independently marks them dirty too. This locality is exactly why decomposing a large widget into smaller ones is a genuine performance technique, not just organizational style.

**Q: When does `setState` genuinely stop being enough, and why?**
> When lifting state to the nearest common ancestor either requires prop-drilling it through many intermediate widgets that don't otherwise need it (a real maintenance cost that compounds with tree depth), or when the state is needed by parts of the tree with no reasonably close common ancestor at all — genuinely app-wide state like a logged-in user or a cart. At that point, `InheritedWidget`-based solutions let data be read from anywhere below a single provider point without threading it through every intermediate widget's constructor.

**Q: Why does `setState()` throw if called after `dispose()`?**
> Because `dispose()` marks the `State`'s permanent removal from the tree — there is no longer an Element to actually mark dirty or a `build()` call site to schedule. This scenario is common in practice via the async-gap bug: an async operation started before disposal, calling `setState()` in its continuation after the widget was disposed mid-operation — which is exactly why the `mounted` check exists as the standard guard.

---

## Follow-ups (challenge questions)

- *Scale:* a screen has 5 sibling widgets sharing one piece of state lifted to their common parent — every `setState()` call on that parent, even one that only conceptually affects one of the five children, re-runs `build()` for the parent and therefore recreates the widget configuration for all five children. Walk through how `const` constructors ([Part 16](16-performance-optimization.md)) on the four unaffected children specifically mitigates the real cost here, and what it doesn't mitigate (the parent's own `build()` method still runs).
- *Consistency:* two unrelated features in a large app both happen to lift closely-related state (say, both need "is the user premium") to their own local common ancestors independently, rather than sharing one source of truth — what's the actual risk of these two copies drifting out of sync, and how does that risk connect directly to the motivation for [`InheritedWidget`](07-inheritedwidget-and-inheritedmodel.md)?

---

**Previous:** [Part 05 — Keys](05-keys.md) · **Next:** [Part 07 — InheritedWidget & InheritedModel](07-inheritedwidget-and-inheritedmodel.md)
