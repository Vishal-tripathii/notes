# Flutter Study Notes — Part 07

## InheritedWidget & InheritedModel ⭐⭐⭐⭐⭐

> The foundation everything else in this phase is built on — `Theme`, `MediaQuery`, `Provider`, and Riverpod's `ProviderScope` all ultimately compile down to this mechanism. Understanding this deeply makes Provider ([Part 08](08-provider.md)) feel like a thin, obvious wrapper rather than magic.

**Topics:** `InheritedWidget` as prop-drilling avoidance · `updateShouldNotify` · `dependOnInheritedWidgetOfExactType` vs `getInheritedWidgetOfExactType` · `InheritedModel` and selective rebuilds.

---

## 1. `InheritedWidget` — Pushing Data Down Without Prop-Drilling

> **Definition:** an `InheritedWidget` is a special widget that makes data available to **any descendant**, no matter how deep, without that data needing to be threaded through every intermediate widget's constructor — a descendant looks it up directly via `BuildContext`, walking up the Element tree to find it.

```dart
class ThemeData extends InheritedWidget {
  final Color primaryColor;
  const ThemeData({super.key, required this.primaryColor, required super.child});

  static ThemeData of(BuildContext context) {
    final result = context.dependOnInheritedWidgetOfExactType<ThemeData>();
    assert(result != null, 'No ThemeData found in context');
    return result!;
  }

  @override
  bool updateShouldNotify(ThemeData oldWidget) => primaryColor != oldWidget.primaryColor; // §2
}

// usage, from ANY descendant, arbitrarily deep, with zero constructor plumbing:
Container(color: ThemeData.of(context).primaryColor);
```
This is directly solving the exact pain point flagged at the end of [Part 06](06-setstate-and-local-state.md#4-where-setstate-stops-scaling) — data reachable from anywhere below one provider point, no threading required.

## 2. `updateShouldNotify` — Efficient Selective Rebuilds

> **Definition:** every time the `InheritedWidget` is rebuilt with a new instance (its ancestor's `build()` ran again), Flutter calls `updateShouldNotify(oldWidget)` on the **new** instance, comparing it against the **old** one — returning `true` triggers a rebuild of every descendant that's registered as a dependent (via `dependOnInheritedWidgetOfExactType`); `false` skips notifying any of them, even though the `InheritedWidget` itself was recreated.

```dart
@override
bool updateShouldNotify(ThemeData oldWidget) {
  return primaryColor != oldWidget.primaryColor; // only notify dependents if the VALUE actually changed
}
```
**How this avoids rebuilding the entire subtree on every change, precisely:** without `updateShouldNotify`'s check, every rebuild of the `InheritedWidget` (even one where nothing meaningful changed) would need to notify every dependent descendant regardless. The check lets an `InheritedWidget` rebuild for unrelated reasons (its own ancestor changed something) without cascading unnecessary rebuilds to every descendant depending on it — dependents only actually re-render when the specific data they registered interest in genuinely changed value.

## 3. `dependOnInheritedWidgetOfExactType` vs `getInheritedWidgetOfExactType`

> **Definition:** `context.dependOnInheritedWidgetOfExactType<T>()` looks up the nearest ancestor `InheritedWidget` of type `T` **and registers the calling widget as a dependent**, so it automatically rebuilds whenever that widget's `updateShouldNotify` returns `true` in the future. `context.getInheritedWidgetOfExactType<T>()` performs the identical lookup but **does not** register a dependency — a one-time read that won't trigger a future rebuild when the data changes.

```dart
// inside build() — subscribes, will rebuild automatically on future changes
final theme = context.dependOnInheritedWidgetOfExactType<ThemeData>();

// a one-off read, e.g. inside an onPressed callback where you just need the CURRENT
// value once and don't want/need this widget to rebuild if it changes later
final currentTheme = context.getInheritedWidgetOfExactType<ThemeData>();
```
**Why `Theme.of(context)`/`MediaQuery.of(context)` "just work" without any external package:** they're both implemented as exactly this pattern — a static `.of(context)` method wrapping `dependOnInheritedWidgetOfExactType`, built entirely on core Flutter with no third-party dependency required. Every state-management library covered next builds this same mechanism, plus ergonomic convenience, on top.

## 4. `InheritedModel` — Selective Rebuilds on "Aspects"

> **Definition:** `InheritedModel<T>` extends `InheritedWidget` with the ability for a descendant to depend on only a specific **aspect** (a named slice) of a larger data object, rather than the whole thing — so a change to one aspect only rebuilds dependents of *that* aspect, not every dependent of the `InheritedModel` as a whole.

```dart
class UserModel extends InheritedModel<String> { // String = the "aspect" type here
  final String name;
  final int notificationCount;
  const UserModel({super.key, required this.name, required this.notificationCount, required super.child});

  static UserModel of(BuildContext context, String aspect) {
    return InheritedModel.inheritFrom<UserModel>(context, aspect: aspect)!;
  }

  @override
  bool updateShouldNotify(UserModel oldWidget) =>
      name != oldWidget.name || notificationCount != oldWidget.notificationCount;

  @override
  bool updateShouldNotifyDependent(UserModel oldWidget, Set<String> dependencies) {
    if (dependencies.contains('name') && name != oldWidget.name) return true;
    if (dependencies.contains('count') && notificationCount != oldWidget.notificationCount) return true;
    return false; // a widget that only depends on 'name' does NOT rebuild when notificationCount changes
  }
}
```
A plain `InheritedWidget` rebuilds *every* dependent whenever *anything* in it changes; `InheritedModel` narrows that to only the dependents actually interested in the specific piece that changed — more granular, at the cost of real implementation complexity, which is exactly why most real apps reach for a higher-level library ([Part 08](08-provider.md)'s `Selector`, or Riverpod's provider granularity) instead of hand-rolling `InheritedModel` directly.

---

## Interview Q&A

**Q: How does `InheritedWidget` avoid rebuilding the entire subtree on every change — the mechanism behind `updateShouldNotify`?**
> The `InheritedWidget` can be recreated (rebuilt) for reasons entirely unrelated to its actual data — its own ancestor rebuilding, for instance. `updateShouldNotify(oldWidget)` is called on every such rebuild, comparing the new instance to the old one, and only if it returns `true` does Flutter actually notify (and rebuild) every registered dependent. This decouples "the InheritedWidget instance was recreated" from "dependents actually need to rebuild," so a rebuild with no meaningful data change costs nothing extra for descendants.

**Q: Why do `Theme.of(context)`/`MediaQuery.of(context)` work without any external package?**
> They're implemented using exactly the same `InheritedWidget` mechanism available to any developer — a static `.of(context)` convenience method wrapping `context.dependOnInheritedWidgetOfExactType<T>()`. Nothing about them is special or privileged; they're built entirely on core Flutter APIs, which is also exactly what Provider and other state-management libraries build their own convenience layer on top of.

**Q: What's the difference between `dependOnInheritedWidgetOfExactType` and `getInheritedWidgetOfExactType`, and when would you use the latter?**
> `dependOnInheritedWidgetOfExactType` both looks up the data and registers the calling widget as a dependent, so it automatically rebuilds on future changes — the normal choice inside `build()`. `getInheritedWidgetOfExactType` performs the same lookup without registering a dependency — a one-time read appropriate for something like an `onPressed` callback, where you want the current value once and don't need (or want) this widget to rebuild automatically if that value changes later.

---

## Follow-ups (challenge questions)

- *Scale:* an app-wide `InheritedWidget` holds a large object with 20 fields, and 15 different widgets across the tree each depend on just one field apiece — with a plain `InheritedWidget` (not `InheritedModel`), what's the actual rebuild blast radius when just one of those 20 fields changes, and how does that compare to using `InheritedModel` with per-field aspects, or splitting into several smaller, single-purpose `InheritedWidget`s instead?
- *Failure mode:* a custom `InheritedWidget`'s `updateShouldNotify` is mistakenly hardcoded to `return false;` always — walk through the observable symptom in the app (data changes but the UI never reflects it) and why this specific bug is easy to introduce and genuinely tricky to spot without knowing exactly what this method controls.
- *Consistency:* two different descendants both call `SomeInheritedWidget.of(context)` — one inside `build()` (subscribing), one inside an `onPressed` callback using `getInheritedWidgetOfExactType` (a one-time read) — if the underlying data changes right as the button is tapped, could the callback's read reflect a stale value compared to what the subscribed widget shows? Reason through the actual timing.

---

**Previous:** [Part 06 — setState & Local State](06-setstate-and-local-state.md) · **Next:** [Part 08 — Provider](08-provider.md)
