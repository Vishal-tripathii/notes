# Flutter Study Notes — Part 17

## Animations ⭐⭐⭐☆☆

**Topics:** implicit animations · explicit animations (`AnimationController`/`Tween`/`CurvedAnimation`/`AnimatedBuilder`) · `vsync` · `Hero` animations.

---

## 1. Implicit Animations

> **Definition:** widgets prefixed `Animated*` (`AnimatedContainer`, `AnimatedOpacity`, `AnimatedSwitcher`, `AnimatedPositioned`) that automatically animate a transition **whenever their property values change** between rebuilds — you declare the *end state*, and Flutter handles interpolating from the previous state to it internally, with no manual controller/timing code.

```dart
class _MyWidgetState extends State<MyWidget> {
  bool _expanded = false;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        width: _expanded ? 200 : 100,      // just the END VALUE — Flutter animates the transition
        height: _expanded ? 200 : 100,        // TO this value automatically on every change
        color: _expanded ? Colors.blue : Colors.red,
      ),
    );
  }
}
```

## 2. Explicit Animations

> **Definition:** built from lower-level pieces you assemble and control directly — `AnimationController` (drives a value from 0.0 to 1.0 over a duration, playable/reversible/repeatable), `Tween` (maps that 0.0–1.0 range onto an actual value range, e.g. a specific color or size), `CurvedAnimation` (applies an easing curve to the controller's linear progress), and `AnimatedBuilder`/`AnimatedWidget` (rebuilds only the animated part in response to the controller's ticks).

```dart
class _MyWidgetState extends State<MyWidget> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 1));
    _animation = CurvedAnimation(parent: _controller, curve: Curves.bounceOut);
    _controller.forward(); // starts playing 0.0 -> 1.0
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,                                        // rebuilds ONLY this subtree
      builder: (context, child) => Opacity(opacity: _animation.value, child: child),
      child: const ExpensiveStaticContent(), // passed via `child`, NOT rebuilt on every tick —
    );                                          // a real optimization AnimatedBuilder specifically enables
  }

  @override
  void dispose() {
    _controller.dispose(); // MANDATORY — an AnimationController holds real ticker resources
    super.dispose();
  }
}
```
**Implicit vs explicit, and when the extra control of explicit is actually necessary:** implicit animations are simpler and sufficient for "animate this property to a new value whenever it changes" — the vast majority of everyday UI transitions. Explicit animations are necessary when you need direct control over *playback* itself — pausing, reversing, repeating, chaining multiple animations together with precise sequencing, or driving several different widgets/properties off one shared, synchronized `AnimationController`, none of which an implicit `Animated*` widget's fire-and-forget model supports.

## 3. `vsync` — Why It's Required

> **Definition:** `vsync` ties an `AnimationController`'s ticking to the actual **screen refresh signal** (the same underlying "don't do work faster than the display can show it" concept as [`requestAnimationFrame`](../javascript/10-event-loop-and-concurrency-model.md#4-requestanimationframe-vs-settimeoutfn-16)) — required so the animation doesn't keep consuming CPU ticking in the background when its owning widget isn't even visible on screen (e.g. a different tab). `TickerProviderStateMixin` (for a `State` driving multiple simultaneous controllers) or `SingleTickerProviderStateMixin` (exactly one) supplies this.

```dart
class _MyWidgetState extends State<MyWidget> with SingleTickerProviderStateMixin { // provides vsync
  late final AnimationController _controller = AnimationController(vsync: this, duration: /* ... */);
}
```
**What forgetting `vsync` (or disposing the controller late) costs:** without the mixin providing a `vsync`, `AnimationController` simply won't compile as written (it's a required constructor parameter) — but the deeper reason it exists is that a `Ticker` not tied to `vsync`/screen visibility, or a controller left un-disposed after its widget is gone, keeps firing on every frame indefinitely, burning CPU (and, on a real device, battery) for animation work nobody can see, until it's cleaned up — the animation-specific instance of the same "undisposed resource keeps running after its owner is gone" leak pattern seen with `TextEditingController` ([Part 15](15-forms-and-validation.md#4-texteditingcontroller-and-its-manual-disposal)) and `StreamSubscription` ([Dart Part 10](../dart/10-streams.md#6-streamsubscription-and-cancellation)).

## 4. `Hero` Animations

> **Definition:** an automatic shared-element transition — wrapping a widget in `Hero` with a matching `tag` on **both** the source screen and the destination screen makes Flutter automatically animate that widget flying/morphing from its position on the first screen to its position on the second, during the route transition.

```dart
// on the list screen
Hero(tag: 'product-${product.id}', child: Image.network(product.imageUrl));

// on the detail screen — SAME tag
Hero(tag: 'product-${product.id}', child: Image.network(product.imageUrl));
// Navigator.push between these two screens automatically animates the image
// morphing from its list position/size to its detail-screen position/size
```

---

## Interview Q&A

**Q: Implicit vs explicit animation — when is the extra control of explicit actually necessary?**
> Implicit `Animated*` widgets handle the common case well: declare a new end-value for a property, Flutter interpolates the transition automatically. Explicit animations become necessary when you need direct playback control — pausing, reversing, repeating, precisely sequencing multiple animations, or synchronizing several different widgets off one shared controller — none of which the implicit, fire-and-forget model exposes any hooks for.

**Q: What does `vsync` do, and why does forgetting to dispose the controller matter?**
> `vsync` ties an `AnimationController`'s ticking to the actual screen refresh signal, so it doesn't keep firing (and burning CPU/battery) when its widget isn't visible. A `TickerProviderStateMixin`/`SingleTickerProviderStateMixin` supplies it. Forgetting to `dispose()` the controller leaves its underlying ticker resources — and any listeners still attached — alive and potentially still firing after the widget itself is gone, the exact same leak pattern as an undisposed `TextEditingController` or uncancelled `StreamSubscription`.

**Q: Why does `AnimatedBuilder` accept a separate `child` parameter instead of just building everything inside `builder`?**
> Anything passed as `child` is built exactly once and reused across every single animation tick, rather than being rebuilt on every tick the way content constructed directly inside `builder` would be. For an animation ticking many times per second, this matters a lot when part of the animated composition (like a large static background image) is expensive to build and doesn't itself need to change — it's conceptually the same "avoid unnecessary rebuild" argument as `const` widgets ([Part 16](16-performance-optimization.md#1-const-constructors)), applied specifically to the high-frequency context of a running animation.

---

## Follow-ups (challenge questions)

- *Failure mode:* a `State` creates an `AnimationController` in `initState()` but the widget is disposed while the animation is still mid-flight (the user navigates away quickly) — walk through why calling `dispose()` on the controller doesn't retroactively "cancel cleanly" any pending callback still trying to call `setState()` afterward, and how the [`mounted` guard from Part 02](02-stateless-vs-stateful-and-lifecycle.md#6-mounted-and-the-async-gap-bug) still applies here even though this isn't strictly an `async`/`await` gap.
- *Scale:* a screen has 20 simultaneously-running implicit `AnimatedContainer`s, each independently triggered by different pieces of local state changing — contrast the actual resource cost of this against a single explicit `AnimationController` driving all 20 via `Tween`s and `AnimatedBuilder`, in terms of how many separate tickers/vsync callbacks are actually active.
- *Consistency:* two screens both use `Hero` with the same `tag` value by coincidence, unrelated to each other (e.g. both happen to use `'image-1'`) — what actually happens during a navigation between two *unrelated* screens that accidentally share a Hero tag, and how would you structure tag naming to avoid this class of bug at scale?

---

**Previous:** [Part 16 — Performance Optimization](16-performance-optimization.md) · **Next:** [Part 18 — Platform Channels & Native Integration](18-platform-channels-and-native-integration.md)
