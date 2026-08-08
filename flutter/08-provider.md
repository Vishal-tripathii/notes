# Flutter Study Notes — Part 08

## Provider ⭐⭐⭐⭐⭐

**Topics:** `Provider`/`ChangeNotifierProvider`/`Consumer` · `context.watch()` vs `context.read()` · `ChangeNotifier`/`notifyListeners()` · `MultiProvider` · `Selector` · `ProxyProvider` · why Provider is "just" `InheritedWidget` plus ergonomics.

---

## 1. Why Provider Is "Just" `InheritedWidget` Plus Ergonomics

> **Definition:** Provider is a package that wraps [Part 07's `InheritedWidget` mechanism](07-inheritedwidget-and-inheritedmodel.md) with a much friendlier API — `context.watch<T>()`/`context.read<T>()` instead of hand-writing a static `.of(context)` method and `updateShouldNotify` override for every single piece of shared data, plus lifecycle management (disposing a provided object automatically when its provider leaves the tree).

```dart
// what you'd have to hand-write with raw InheritedWidget for EVERY piece of shared state
// (Part 07) — Provider exists specifically so you don't repeat this boilerplate constantly
```
Nothing about Provider is a fundamentally different mechanism from `InheritedWidget` — it's the same tree-walking lookup underneath, packaged for everyday ergonomics.

## 2. `Provider` / `ChangeNotifierProvider` / `Consumer`

> **Definition — `ChangeNotifier`:** a class (from Flutter's own `foundation` library, not Provider-specific) that maintains a list of listener callbacks and calls `notifyListeners()` to invoke all of them — the "observable" half of Provider's most common pattern.
> **Definition — `ChangeNotifierProvider`:** creates and provides a `ChangeNotifier` instance to the widget tree below it, automatically disposing it when the provider itself is removed from the tree.
> **Definition — `Consumer<T>`:** rebuilds its `builder` whenever the provided `T` (a `ChangeNotifier`) calls `notifyListeners()`.

```dart
class CartModel extends ChangeNotifier {
  final List<Item> _items = [];
  List<Item> get items => List.unmodifiable(_items);

  void add(Item item) {
    _items.add(item);
    notifyListeners(); // tells every listening Consumer/watch() to rebuild
  }
}

// providing it, high enough in the tree to be visible where needed
ChangeNotifierProvider(create: (context) => CartModel(), child: MyApp());

// consuming it
Consumer<CartModel>(
  builder: (context, cart, child) => Text('${cart.items.length} items'),
);
```

## 3. `context.watch()` vs `context.read()`

> **Definition — `context.watch<T>()`:** subscribes the calling widget to `T`, causing a rebuild whenever `T` calls `notifyListeners()` — the Provider-ergonomic equivalent of [`dependOnInheritedWidgetOfExactType`](07-inheritedwidget-and-inheritedmodel.md#3-dependoninheritedwidgetofexacttype-vs-getinheritedwidgetofexacttype).
> **Definition — `context.read<T>()`:** a **one-time** read of `T`, with **no subscription** — the equivalent of `getInheritedWidgetOfExactType`.

```dart
@override
Widget build(BuildContext context) {
  final cart = context.watch<CartModel>(); // subscribes — THIS widget rebuilds when cart changes
  return Column(children: [
    Text('${cart.items.length} items'),
    ElevatedButton(
      onPressed: () => context.read<CartModel>().add(newItem), // one-time access, NOT watch()
      child: const Text('Add'),                                    // — see the bug below for why
    ),
  ]);
}
```
**The bug from using `watch()` inside a callback instead of `read()`:** `context.watch<T>()` relies on being called during the `build()` phase specifically — calling it inside `onPressed` (which fires later, in response to a user gesture, entirely outside any active build phase) throws a runtime error (`watch() was called with a context that does not support watching`, or similar). Beyond the immediate error, semantically `watch()` inside a callback doesn't even make sense — a callback isn't "rebuilt," it's just invoked once per tap, so there's nothing for a subscription to attach to. `read()` is the correct choice for any one-off "just get me the current value/call a method on it" access outside `build()`.

## 4. `MultiProvider`

```dart
MultiProvider(
  providers: [
    ChangeNotifierProvider(create: (_) => CartModel()),
    Provider(create: (_) => ApiService()),          // plain Provider — for a value that ISN'T
    ChangeNotifierProvider(create: (_) => UserModel()), // itself a ChangeNotifier, just a dependency
  ],
  child: MyApp(),
);
```
Avoids deeply nesting several individual `Provider`/`ChangeNotifierProvider` widgets inside one another — purely an ergonomic flattening.

## 5. `Selector` — Narrowing Rebuilds to a Specific Field

> **Definition:** `Selector<T, S>` rebuilds its `builder` only when the **selected slice** `S` (computed from `T` via a `selector` function) actually changes — narrower than `Consumer<T>`, which rebuilds on *any* `notifyListeners()` call from `T` regardless of whether the specific data this widget actually displays changed.

```dart
Selector<CartModel, int>(
  selector: (context, cart) => cart.items.length,     // only cares about the COUNT
  builder: (context, itemCount, child) => Text('$itemCount items'),
  // this widget does NOT rebuild if, say, an item's PRICE changes but the count doesn't —
  // a plain Consumer<CartModel> WOULD rebuild in that case, unnecessarily
);
```
The same granularity motivation as [`InheritedModel`'s aspects](07-inheritedwidget-and-inheritedmodel.md#4-inheritedmodel--selective-rebuilds-on-aspects), packaged more ergonomically.

## 6. `ProxyProvider` — Providers That Depend on Other Providers

> **Definition:** `ProxyProvider<A, B>` creates a `B` that depends on an already-provided `A`, automatically recreating (or updating) `B` whenever `A` changes — for when one piece of provided state needs to be derived from or depend on another.

```dart
MultiProvider(
  providers: [
    Provider(create: (_) => AuthService()),
    ProxyProvider<AuthService, ApiClient>(
      update: (context, auth, previousApiClient) => ApiClient(authToken: auth.token), // rebuilt
    ),                                                                                    // whenever
  ],                                                                                        // AuthService changes
  child: MyApp(),
);
```

---

## Interview Q&A

**Q: `context.watch()` vs `context.read()`, and what bug happens using `watch()` inside a callback like `onPressed`?**
> `watch()` subscribes the calling widget to future changes and must be called during the build phase — it's how the widget registers to rebuild automatically. `read()` is a one-time, non-subscribing access, appropriate anywhere outside `build()`. Calling `watch()` inside a callback like `onPressed` throws at runtime, since callbacks fire outside any active build phase and there's no build to attach a subscription to — `read()` is the correct choice there, since you just want the current value or want to call a method on it once, not subscribe to future changes.

**Q: What does `Selector` buy you over a plain `Consumer`?**
> `Consumer<T>` rebuilds whenever `T` calls `notifyListeners()` at all, regardless of whether the specific data this particular widget displays actually changed. `Selector<T, S>` narrows that to only rebuild when a specifically selected slice `S` of `T`'s data changes — so a widget that only displays a cart's item count won't rebuild just because an unrelated field (like an item's price) changed elsewhere in the same model.

**Q: Is Provider a fundamentally different mechanism from `InheritedWidget`, or built on top of it?**
> Built directly on top of it — Provider doesn't introduce a new tree-lookup mechanism; it wraps `InheritedWidget`'s existing tree-walking lookup with a much friendlier API (`watch()`/`read()` instead of hand-writing `.of(context)` and `updateShouldNotify` for every piece of state) plus automatic lifecycle management like disposing a provided object when its provider leaves the tree.

---

## Follow-ups (challenge questions)

- *Failure mode:* a widget calls `context.watch<CartModel>()` at the top of its `build()` method but only actually displays `cart.items.length` — walk through why this widget still rebuilds every time *any* field on `CartModel` changes (e.g. an item's price updated, item count unchanged), and how switching to `Selector` fixes it.
- *Scale:* a large app provides 15 different `ChangeNotifier`s via one big `MultiProvider` at the app root — a deeply nested leaf widget calls `context.watch<SomeModel>()` for just one of them. Walk through, using [Part 07's `updateShouldNotify` mechanism](07-inheritedwidget-and-inheritedmodel.md#2-updateshouldnotify--efficient-selective-rebuilds), why this leaf widget doesn't rebuild when an entirely unrelated one of the 15 models changes.
- *Consistency:* a `ChangeNotifierProvider`'s `create` callback constructs a new `CartModel()` — if the provider widget itself gets rebuilt (its own parent rebuilds), does `create` run again, creating a brand-new `CartModel` and silently losing the cart's contents? Reason through this using what you know about `InheritedWidget` reconciliation from Part 07 (hint: `create` is documented to run only once, lazily, tied to the provider's Element lifetime, not on every rebuild — verify and explain why that's the correct, expected behavior).

---

**Previous:** [Part 07 — InheritedWidget & InheritedModel](07-inheritedwidget-and-inheritedmodel.md) · **Next:** [Part 09 — Riverpod](09-riverpod.md)
