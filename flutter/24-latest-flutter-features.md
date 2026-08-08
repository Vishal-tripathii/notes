# Flutter Study Notes — Part 24

## Latest Flutter Features ⭐⭐⭐☆☆

> For anyone who learned Flutter before Impeller/Material 3 landed and hasn't tracked what shipped since — the same role [Angular Part 27](../Angular/27-latest-angular-features.md) plays for that track.

**Topics:** Impeller as stable default · Material 3 · modern Riverpod code-gen · Dart 3 features in idiomatic Flutter code · Flutter web/desktop maturity.

---

## 1. Impeller as the Stable Default Rendering Engine

Full mechanism covered in [Part 21](21-flutter-internals.md#2-skia-vs-impeller) — worth restating here just as a "what shipped" marker: Impeller is now the default rendering engine on iOS and Android (with continued work on other platforms), specifically fixing shader-compilation jank by pre-compiling shaders ahead of time rather than lazily at runtime. If you learned Flutter when Skia was the only option, the practical takeaway is that a documented, well-known historical pain point (first-use-of-an-effect stutter) is substantially resolved by default now, not something you need to work around anymore.

## 2. Material 3 (`useMaterial3`)

> **Definition:** Material 3 (Material You) is the current default design system, superseding Material 2 — dynamic color theming, updated component shapes/elevation/typography defaults. Now **enabled by default** for new Flutter projects.

```dart
MaterialApp(
  theme: ThemeData(
    useMaterial3: true, // default in current Flutter SDK versions for new projects
    colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple), // dynamic, generated palette
  ),
);
```
**What Material 3 changed at a practical level for existing apps migrating to it:** many built-in Material widgets (`Card`, `Button` variants, `AppBar`) shifted their default visual appearance (shape, elevation behavior, color application) — an app migrating from Material 2 to `useMaterial3: true` should expect visible, if generally subtle, appearance changes across nearly every standard component even with zero other code changes, since the defaults themselves moved. `ColorScheme.fromSeed` is the practical entry point for Material 3's dynamic-color-generation approach, replacing hand-picking every individual color role manually.

## 3. Modern Riverpod Code Generation (`@riverpod`)

Covered in [Part 09 §5](09-riverpod.md#5-code-generation-riverpod) — the current idiomatic Riverpod style favors `@riverpod`-annotated functions/classes with `build_runner` generating the provider boilerplate, reducing manual verbosity and improving compile-time inference over hand-declared `Provider`/`StateNotifierProvider` definitions.

## 4. Dart 3 Features in Idiomatic Flutter Code

Records ([Dart Part 13](../dart/13-records.md)) and pattern matching ([Dart Part 12](../dart/12-enums-and-pattern-matching.md)) increasingly show up in modern Flutter code — e.g. a `switch` expression over a sealed-class state hierarchy in a BLoC's `builder`, or a `StateNotifier`'s selector returning a record of multiple derived values in one call instead of several separate `select()` calls.

```dart
// modern idiomatic style, combining sealed classes + pattern matching in UI code
Widget build(BuildContext context, WidgetRef ref) {
  final state = ref.watch(orderProvider);
  return switch (state) {
    OrderLoading() => const CircularProgressIndicator(),
    OrderLoaded(:final items, :final total) => OrderSummary(items: items, total: total),
    OrderError(:final message) => Text('Error: $message'),
  };
}
```

## 5. Flutter Web/Desktop Maturity

> **Definition:** Flutter's mobile (iOS/Android) support remains the most mature and battle-tested target; web and desktop (Windows/macOS/Linux) support has matured substantially but historically lagged in specific areas — text-rendering fidelity on web, certain plugin ecosystem gaps on desktop, and (pre-Impeller-on-web) some performance characteristics differing from mobile.

**The practical, current-state takeaway:** web and desktop are genuinely production-viable for many app categories today, but a team targeting them alongside mobile should still budget explicit testing time on those specific platforms rather than assuming perfect parity with the mobile experience — plugin availability specifically is worth checking per-platform before committing to a package for a multi-platform app, since not every plugin supports every platform target equally.

---

## Interview Q&A

**Q: What problem did Impeller fix that Skia struggled with?**
> Skia compiled shaders lazily, the first time a visual effect was actually used at runtime, producing a real, visible stutter exactly on that first occurrence — often mid-animation, the worst possible moment. Impeller pre-compiles shaders ahead of time at build time, eliminating that specific, well-documented category of runtime jank by construction, and is now the stable default on iOS/Android.

**Q: What changed practically for an app migrating from Material 2 to Material 3?**
> Many built-in Material widgets shifted their default visual appearance — shape, elevation behavior, color application — so an app enabling `useMaterial3: true` should expect visible appearance changes across most standard components even without any other code changes, since the defaults themselves moved, not just an opt-in new look reachable only via new widgets.

---

## Follow-ups (challenge questions)

- *Consistency:* a team migrates an existing, mature app from Material 2 to Material 3 — walk through a sensible testing/rollout strategy given that the visual change touches nearly every screen simultaneously (a single global flag flip) rather than being isolatable component-by-component.
- *Scale:* a team is deciding whether to target Flutter web for a new feature versus building a separate web app — given the maturity caveats above, what specific questions would you want answered (plugin dependencies, expected traffic/performance requirements, SEO needs) before committing either direction?

---

**Previous:** [Part 23 — Machine Coding Projects](23-machine-coding-projects.md) · **Back to:** [00 — Roadmap](00-ROADMAP.md)
