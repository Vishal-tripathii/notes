# Flutter Study Notes — Part 01

## Flutter Architecture & the Three Trees ⭐⭐⭐⭐⭐

**Topics:** "everything is a widget" · the Widget tree vs the Element tree vs the RenderObject tree · how `setState()` maps onto them · `runApp()` and the path from `main()` to pixels · the rendering pipeline at a glance.

---

## 1. "Everything Is a Widget"

> **Definition:** in Flutter, the entire UI — layout, styling, animation, even things that feel like "app configuration" (a `Theme`, a `MediaQuery`) — is expressed as a tree of **widgets**, immutable, lightweight, declarative description objects. A widget is not a pixel-drawing entity itself; it's a **configuration** describing what should appear, which Flutter's internals turn into actual rendered output.

```dart
Widget build(BuildContext context) {
  return Container(                     // a widget
    padding: EdgeInsets.all(16),           // ALSO configured via widgets/value objects
    child: Column(                            // a widget containing widgets
      children: [
        Text('Hello'),                            // a widget
        ElevatedButton(onPressed: () {}, child: Text('Tap')), // a widget composed of widgets
      ],
    ),
  );
}
```

## 2. The Three Trees

> **Definition — Widget tree:** the tree of **immutable configuration objects** you actually write in `build()` methods — cheap to create, thrown away and rebuilt constantly.
> **Definition — Element tree:** the tree of **mutable, persistent** `Element` objects, each tied to a specific widget instance's "slot" in the tree — an `Element` is what actually manages a widget's lifecycle, decides whether to update in place or discard-and-recreate, and holds the associated `State` object for stateful widgets. Elements are **not** thrown away on every rebuild — they persist across rebuilds, which is the whole point.
> **Definition — RenderObject tree:** the tree of objects that actually perform **layout** (sizing/positioning) and **paint** (drawing pixels) — a separate concern from the widget's declarative configuration entirely.

```
Widget tree           Element tree              RenderObject tree
(immutable config,    (mutable, PERSISTENT,      (layout + paint,
 rebuilt often)         manages lifecycle)          the actual pixels)

 Container      →      ComponentElement    →       (no RenderObject of its own —
                                                       Container is a composite widget)
   Column        →      MultiChildElement    →       RenderFlex (does the actual
                                                        Row/Column layout math)
     Text          →      LeafElement           →       RenderParagraph (draws the text)
```

**Why three trees instead of one:** each tree solves a different problem, and collapsing them into one would conflate concerns that need to stay separate. The Widget tree is optimized for being **cheap to create and discard constantly** — every `build()` call produces a fresh widget subtree, and that has to be nearly free or Flutter's whole "rebuild the UI descriptively on every change" model would be too slow. The Element tree is what makes that cheap-and-frequent widget recreation *efficient* — it persists across rebuilds and does the actual work of diffing "is this new widget configuration meaningfully different from what's already here," only touching the RenderObject tree when something real actually changed. The RenderObject tree is where the genuinely expensive work (layout math, painting) happens, and it's deliberately shielded from unnecessary work by the Element tree's diffing.

## 3. What Actually Happens When `setState()` Is Called

Walking it tree by tree — the exact sequence an interviewer is listening for:

1. `setState()` marks the associated `Element` (via its `State` object) as **dirty**, scheduling a rebuild.
2. On the next frame, Flutter calls that `State`'s `build()` method again, producing a **new Widget subtree** (a fresh set of immutable configuration objects).
3. The **existing Element** for that subtree doesn't get thrown away — it **compares** the new widget configuration against the old one it's currently associated with, widget-by-widget, same-position-in-tree.
4. If a new widget at a given position is the **same runtime type** as the old one (and, if keyed, matches by key — [Part 05](05-keys.md)), the Element **updates in place**, reusing itself, and only updates the underlying `RenderObject`'s properties if they actually changed.
5. If the widget type differs, the old `Element`/`RenderObject` subtree is **discarded** and a new one is created from scratch.
6. Only `RenderObject`s that actually changed get re-laid-out/re-painted — this is *why* the three-tree split exists: it lets Flutter skip real work (layout, paint) for parts of the tree that didn't meaningfully change, even though the Widget tree above them was fully, cheaply recreated.

**The precise answer, compressed:** `setState()` triggers a `build()` that produces new widget configuration; the persistent Element tree diffs that new configuration against what's already there and updates only what changed; the RenderObject tree only redoes layout/paint for the parts that were actually determined to have changed.

## 4. Widget vs Element, Precisely

| | Widget | Element |
|---|---|---|
| Mutability | immutable | mutable |
| Lifespan | recreated constantly, on every `build()` | persists across rebuilds |
| Holds `State`? | no | yes, for `StatefulWidget`s |
| Job | describes *what* the UI should look like | manages the *lifecycle* and reconciliation of that description against what's already rendered |

**The interview-ready one-liner:** a widget is a blueprint; an element is the actual, living object built from (and repeatedly re-compared against) that blueprint.

## 5. `runApp()` — from `main()` to Pixels

```dart
void main() {
  runApp(const MyApp()); // hands the ROOT widget to the Flutter engine
}
```
`runApp()` attaches the given widget as the root of the entire app, creating the root Element and RenderObject, and hands control to the **engine** (the C++/Skia-or-Impeller layer beneath the Dart framework — full depth in [Part 21](21-flutter-internals.md)), which drives the frame-by-frame build→layout→paint→composite cycle from there. This is the Flutter analogue of Angular's [`bootstrapApplication()`](../Angular/01-angular-architecture-and-bootstrap.md) — the single explicit hand-off point from "just Dart code" to "an actually running, rendering app."

## 6. The Rendering Pipeline at a Glance

```
BUILD    → widgets describe desired UI (build() methods run)
LAYOUT   → RenderObjects determine size/position (constraints down, sizes up — Part 04)
PAINT    → RenderObjects record drawing instructions
COMPOSITE→ layers are combined into the final frame and handed to the GPU
```
Full depth (including where Impeller/Skia sit in this pipeline) is deferred to [Part 21 — Flutter Internals](21-flutter-internals.md) — this part is scoped to knowing the four phases exist and their rough order, which is enough to reason about *why* something is slow before diagnosing precisely *what's* slow.

---

## Interview Q&A

**Q: Why does Flutter have three separate trees instead of one?**
> Each tree is optimized for a different job. The Widget tree is cheap, immutable configuration meant to be recreated constantly on every rebuild — that has to be nearly free for Flutter's declarative model to work at all. The Element tree persists across rebuilds and does the actual diffing work, deciding what genuinely changed versus what's just a new widget instance describing the same thing. The RenderObject tree is where the expensive work (layout, paint) lives, and it's shielded by the Element tree's diffing from doing unnecessary work for parts of the UI that didn't actually change.

**Q: What actually happens, tree by tree, when `setState()` is called?**
> It marks the associated Element dirty, triggering a `build()` call that produces new widget configuration. The persistent Element tree compares that new configuration against what it currently holds, widget by widget — same type (and matching key) means update in place; different type means discard and recreate. Only the RenderObjects whose properties actually changed as a result get re-laid-out and repainted — the Widget tree above them is fully recreated on every build regardless, but that's cheap by design.

**Q: Widget vs Element, precisely?**
> A widget is an immutable, disposable description of desired UI configuration, recreated on every build. An Element is the mutable, persistent object that actually manages a widget's lifecycle across rebuilds, holds the `State` object for stateful widgets, and does the diffing work between old and new widget configurations at its position in the tree.

**Q: Predict — does rebuilding a parent widget necessarily rebuild every descendant's RenderObject?**
```dart
class Parent extends StatefulWidget {
  @override
  State<Parent> createState() => _ParentState();
}
class _ParentState extends State<Parent> {
  int counter = 0;
  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Text('Count: $counter'),
      const ExpensiveStaticWidget(), // const!
    ]);
  }
}
```
> No — calling `setState()` here re-runs `build()`, recreating the whole Widget subtree including a *new* `Text` widget instance and a *new* `const ExpensiveStaticWidget()` instance. But because `ExpensiveStaticWidget` is declared `const`, that new instance is `identical()` to the previous one (canonicalized — [Dart Part 00](../dart/00-dart-fundamentals.md#1-variables--var-final-const)), so the Element tree recognizes nothing changed there at all and skips it entirely — no rebuild, no re-layout, no re-paint for that subtree. Only the `Text` widget (genuinely different content) triggers real work down to the RenderObject layer.

---

## Follow-ups (challenge questions)

- *Scale:* a `ListView` with 10,000 items calls `setState()` on a single item's local checkbox state — walk through, tree by tree, why this doesn't rebuild all 10,000 items' RenderObjects, connecting back to how the Element tree's diffing (and, without `ListView.builder`'s laziness, the fact that most of those items aren't even built at all — [Part 16](16-performance-optimization.md)) contains the blast radius.
- *Failure mode:* a developer, confused about the three trees, assumes "the widget tree IS what's on screen" and tries to mutate a widget's field directly after construction to "update the UI" — walk through exactly why this compiles (widgets aren't const-enforced-immutable by the type system alone, just by convention with `final` fields) but does absolutely nothing visually, and why `setState()` is the only real path to a UI update.
- *Consistency:* two sibling widgets in the same rebuild both happen to be structurally `==`-identical Records/objects passed as props, but neither is `const` — does the Element tree's diffing treat them as "unchanged" the same way it would treat two `const` instances, or does non-`const` equality not help here at all? Reason through what `Element` reconciliation actually checks (widget `runtimeType` + `key`, not deep value equality by default).

---

**Previous:** [Part 00 — Dart for Flutter](00-dart-for-flutter.md) · **Next:** [Part 02 — StatelessWidget vs StatefulWidget & Lifecycle](02-stateless-vs-stateful-and-lifecycle.md)
