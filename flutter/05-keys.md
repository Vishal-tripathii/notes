# Flutter Study Notes — Part 05

## Keys ⭐⭐⭐⭐☆

**Topics:** what a `Key` solves · `ValueKey`/`ObjectKey`/`UniqueKey` · `GlobalKey` and its two real uses/costs · the concrete bug that appears without keys.

---

## 1. What a `Key` Solves

> **Definition:** a `Key` is metadata attached to a widget that Flutter's Element-reconciliation algorithm ([Part 01](01-flutter-architecture-and-the-three-trees.md#3-what-actually-happens-when-setstate-is-called)) uses, alongside runtime type, to decide whether a widget at a given tree position is "the same conceptual widget, just updated" or "a genuinely different widget that happens to be in the same spot." Without a key, Flutter matches purely by **position and type** — which breaks down the moment a widget list's *order* changes.

```dart
// WITHOUT keys — Flutter matches by POSITION in the children list, not by identity
ListView(children: items.map((item) => ListTile(title: Text(item.name))).toList())
// if `items` is REORDERED, Flutter sees "position 0 is still a ListTile" and reuses
// that Element/State in place — even though it now represents a DIFFERENT logical item

// WITH keys — Flutter matches by KEY, correctly tracking each item across reorders
ListView(children: items.map((item) => ListTile(key: ValueKey(item.id), title: Text(item.name))).toList())
```

## 2. `ValueKey` / `ObjectKey` / `UniqueKey`

> **Definition — `ValueKey<T>`:** wraps a simple value (an `int`, `String`) for equality — two `ValueKey`s with `==`-equal wrapped values are considered the same key. Use when each item has a natural, stable, unique identifier (a database ID).
> **Definition — `ObjectKey`:** like `ValueKey` but compares by the wrapped **object's** `==`/`identical`, useful when there's no simple primitive ID but the object itself has meaningful equality.
> **Definition — `UniqueKey`:** generates a key guaranteed never equal to any other key, including one created with the same "value" — effectively forces Flutter to always treat this widget as brand-new, never reusing an existing Element for it.

```dart
ListTile(key: ValueKey(item.id));            // idiomatic — stable ID-based identity
ListTile(key: ObjectKey(item));                 // when the object itself is the identity
ListTile(key: UniqueKey());                       // forces a fresh Element EVERY build — rarely
                                                      // what you want (defeats reuse entirely)
```

## 3. `GlobalKey`

> **Definition:** a `GlobalKey` is unique across the **entire app**, not just among siblings, and provides two capabilities no other key type does: **(1)** direct access to a widget's `State` (or `RenderObject`) from *outside* the normal widget tree/`build()` flow, and **(2)** letting a widget (and its entire subtree, including its `State`) **move to a different parent in the tree** across a rebuild while preserving that state, rather than being disposed and recreated.

```dart
final formKey = GlobalKey<FormState>();

Form(
  key: formKey,
  child: /* fields */,
);

// elsewhere, e.g. in a button's onPressed, OUTSIDE this widget's own build() method:
formKey.currentState?.validate(); // direct access to the Form's State object
```
**The real cost:** every `GlobalKey` forces Flutter's reconciliation to search the **entire tree** (not just local siblings) to find where that key's associated Element currently lives, whenever it needs to resolve it — meaningfully more expensive than the local, sibling-scoped matching a `ValueKey` does. `GlobalKey` also breaks the normal "a widget can only be built by one part of the tree" assumption, and using the same `GlobalKey` on two widgets simultaneously in the tree throws a runtime error. It should be reserved for the two genuine use cases above, not reached for casually as a general-purpose "let me grab this widget's state from anywhere" convenience.

## 4. The Concrete Bug That Appears Without Keys

> **Scenario:** a reorderable list where each item has **local, item-specific state** (a `TextField`'s current text, an expand/collapse animation state) — without keys, reordering the *data* doesn't correctly move the *State* along with it.

```dart
// Each item has its OWN local editing state via a TextEditingController created in initState()
class _EditableItemState extends State<EditableItem> {
  late TextEditingController _controller;
  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialText);
  }
  // ...
}

// WITHOUT a key, when `items` is reordered (e.g. item A moves from position 0 to position 2):
// Flutter's reconciliation sees "position 0 still has an EditableItem" and REUSES the
// EXISTING State object (and its TextEditingController's current, possibly-EDITED text)
// for whatever item NOW happens to be at position 0 — which is a DIFFERENT logical item
// than before. The user's in-progress edit follows the WRONG ROW.
```
**Walking through the actual wrong-state-follows-wrong-widget bug:** say the user is mid-edit on item A (currently at position 0), then a background refresh reorders the list so item B is now at position 0 and item A moved to position 2. Without a key, Flutter's positional matching sees "an `EditableItem` is still at position 0" and reuses that Element/State — meaning the `TextEditingController` (and whatever the user was typing) now renders as if it belongs to item B, while item A's row (now at position 2) shows *its own* fresh initial data. The user's edit visually "jumped" onto the wrong row. Adding `key: ValueKey(item.id)` fixes this — Flutter now correctly recognizes item A's Element by its key regardless of position, and moves its State along with it to position 2, while item B gets its own distinct (freshly-created, if new to the list) Element at position 0.

---

## Interview Q&A

**Q: Walk through the actual bug that appears in a reorderable list with no keys.**
> Without keys, Flutter's reconciliation matches widgets to Elements purely by position and runtime type. If a list is reordered and items carry local state (a text field's in-progress edit, an animation's current position), that state stays pinned to its *position* rather than following its *logical item* — after a reorder, a user's in-progress edit on one item can visibly appear to belong to a completely different item now occupying that same position. Adding a stable `ValueKey` (e.g. keyed by a database ID) fixes it by letting Flutter match Elements to their correct logical item regardless of position, moving the associated State along with the reorder.

**Q: What's `GlobalKey`'s real cost, and why shouldn't it be reached for casually?**
> Resolving a `GlobalKey` requires searching the entire app's Element tree, not just local siblings, which is meaningfully more expensive than a `ValueKey`'s local, positional matching. It also breaks the normal assumption that a widget is built by exactly one place in the tree — using the same `GlobalKey` on two simultaneously-present widgets throws at runtime. It's the right tool specifically for accessing a `State` object from outside the normal build flow, or preserving state across a widget moving to a genuinely different parent — not a general-purpose way to "reach into" a widget's state from elsewhere.

**Q: `ValueKey` vs `ObjectKey` vs `UniqueKey`?**
> `ValueKey` compares by a wrapped primitive value's equality — idiomatic when each item has a natural stable ID. `ObjectKey` compares by the wrapped object's own equality, for cases without a simple primitive identifier. `UniqueKey` is never equal to any other key, including one constructed identically — it forces Flutter to always treat the widget as brand new on every build, which defeats the entire purpose of reuse and is rarely the right choice outside very specific "I explicitly want to force a full rebuild/reset" scenarios.

---

## Follow-ups (challenge questions)

- *Failure mode:* a `ListView.builder` displays a list of expandable cards, each with its own `AnimationController` for the expand/collapse transition, built without keys — a filter is applied that removes some items from the middle of the list. Walk through which cards' expand/collapse state ends up visually wrong after the filter, and why.
- *Scale:* a `GlobalKey<FormState>` is stored as an instance field on a widget that gets rebuilt (a new instance created) on every parent rebuild — does the `GlobalKey` itself need to be recreated too, and what happens if a NEW `GlobalKey` were mistakenly created on every rebuild instead of being held stable (e.g. in `initState` or as a `final` field)?
- *Consistency:* two completely unrelated widgets in different parts of a large app both accidentally use `GlobalKey<MyCustomState>()` constructed the same way in two different files — under what circumstances does this actually collide at runtime, and what's the actual error Flutter throws?

---

**Previous:** [Part 04 — Layout System](04-layout-system.md) · **Next:** [Part 06 — setState & Local State](06-setstate-and-local-state.md)
