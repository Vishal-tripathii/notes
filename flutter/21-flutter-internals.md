# Flutter Study Notes — Part 21

## Flutter Internals ⭐⭐⭐⭐☆

**Topics:** the full rendering pipeline in depth · Skia vs Impeller · why Flutter draws every pixel itself · the engine/framework/embedder split · frame timing and the 16ms/8ms budget.

---

## 1. The Full Rendering Pipeline, in Depth

> **Definition:** the sequence a frame goes through from a state change to actual pixels — **build** (widgets describe desired UI) → **layout** (RenderObjects compute size/position, [Part 04](04-layout-system.md)'s constraints-down rule) → **paint** (RenderObjects record drawing instructions into `Layer`s, not pixels yet) → **composite** (layers are combined by the engine into a final bitmap, handed to the GPU).

```
BUILD                LAYOUT                PAINT                 COMPOSITE
build() methods  →   constraints down,  →  RenderObjects       →  Layers combined,
produce new           sizes up, single       record paint            rasterized,
Widget config         layout pass             instructions           sent to GPU
```
**What each phase actually does:**
- **Build** — runs Dart code (`build()` methods), produces new immutable Widget configuration, reconciled against the persistent Element tree ([Part 01](01-flutter-architecture-and-the-three-trees.md)).
- **Layout** — a single, top-down pass (constraints down) followed by children reporting sizes back up ([Part 04](04-layout-system.md)) — deliberately single-pass for performance, which is exactly why some layouts (needing a child's size to inform a sibling) require special widgets like `IntrinsicHeight` that break the single-pass assumption at a real cost.
- **Paint** — RenderObjects don't draw pixels directly; they record a sequence of drawing *instructions* (draw this rectangle, this text, at this offset) into `Layer` objects — deferred, structured drawing commands, not immediate pixel writes.
- **Composite** — the engine combines all the recorded layers (potentially many, especially where `RepaintBoundary` (Part 16) created separate ones) into the final image and hands it off to be rasterized and displayed.

## 2. Skia vs Impeller

> **Definition — Skia:** Flutter's original 2D graphics rendering engine (also used by Chrome/Android) — a mature, general-purpose graphics library, but one whose **shader compilation happens lazily, at runtime**, the first time a given visual effect is actually used.
> **Definition — Impeller:** Flutter's newer rendering engine (now the stable default on iOS and Android), designed specifically to **pre-compile shaders ahead of time**, at build time, eliminating a specific class of runtime stutter Skia was prone to.

**Why Impeller replaced Skia as the default — the actual problem it fixes:** with Skia, the *first* time the app needed a particular shader (a specific blend mode, a particular visual effect combination) during actual runtime, it had to compile that shader on the spot — a real, user-visible frame-time spike (jank) precisely on the first occurrence of that visual effect, often mid-animation, which is exactly when it's most noticeable. This was a well-known, documented Flutter pain point ("shader compilation jank"). Impeller's design compiles shaders ahead of time during the build process instead, so that specific category of runtime stutter is eliminated by construction — the tradeoff being more work at build time in exchange for more predictable, consistent frame timing at runtime.

## 3. Why Flutter Renders Its Own Pixels Instead of Wrapping Native Widgets

> **The core architectural decision:** unlike frameworks that bridge to and render actual native platform widgets (a real `UIButton` on iOS, a real `android.widget.Button` on Android), Flutter draws **every single pixel itself**, via its own rendering engine (Skia/Impeller), onto a canvas it fully controls — native platform widgets are used only at the very outer edge (the window/surface itself), not for individual UI elements.

**What this trades away and buys, precisely:** the direct payoff is **visual and behavioral consistency** — a Flutter app looks and behaves pixel-identically across iOS/Android/web/desktop, since it's never actually deferring to each platform's own, subtly-different native widget rendering and interaction quirks. It also means Flutter isn't limited to whatever visual effects/animations native widget toolkits happen to support — arbitrary custom painting (`CustomPainter`) works identically everywhere. The cost: Flutter apps don't automatically pick up platform-specific look-and-feel changes for free the way a native-widget-bridging approach would (an OS-level design refresh doesn't automatically propagate to Flutter's own from-scratch widget implementations), and this is the direct architectural fact underlying the comparison in [Part 22](22-flutter-vs-react-native-vs-native.md).

## 4. The Engine/Framework/Embedder Split

> **Definition — Engine:** the C++ core (Skia/Impeller, Dart runtime, text layout) — does the actual heavy lifting of rendering and running Dart code, largely platform-independent.
> **Definition — Framework:** the Dart-language layer you actually write code against — `Widget`/`Element`/`RenderObject`, Material/Cupertino widgets, the entire API surface covered throughout this track.
> **Definition — Embedder:** the thin, platform-specific glue that hosts the engine on a given OS — providing the actual window/surface, input events, and platform channel plumbing ([Part 18](18-platform-channels-and-native-integration.md)) per platform (Android, iOS, web, desktop).

```
Framework (Dart)  — Widget/Element/RenderObject, Material/Cupertino — what you write
        ↓
Engine (C++)       — Skia/Impeller, Dart VM, text layout — the heavy lifting
        ↓
Embedder            — platform-specific window/surface/input glue, per OS
```

## 5. Frame Timing — the 16ms/8ms Budget

> **Definition:** to render smoothly at 60fps, every phase of the pipeline (build → layout → paint → composite) for a given frame must complete within **~16.6ms**; for a 120Hz display, that budget halves to **~8.3ms**. Exceeding the budget on a given frame is **jank** — a visibly dropped or delayed frame.

```
flutter run --profile   # profile mode — closer to real release performance than debug mode,
                            # required for trustworthy frame-timing measurements (debug mode
                            # includes extra assertion/instrumentation overhead that skews timing)
```
DevTools' frame-timeline view directly shows, per frame, how much time was spent in each pipeline phase — the standard tool for identifying *which* phase (a slow `build()`, an expensive layout, an over-large paint/composite from too many layers) is actually blowing the budget on a janky frame, feeding directly back into the targeted fixes from [Part 16](16-performance-optimization.md).

---

## Interview Q&A

**Q: Walk through the build→layout→paint→composite pipeline, in order, and what each phase actually does.**
> Build runs `build()` methods, producing new immutable widget configuration reconciled against the Element tree. Layout is a single top-down pass — constraints flow down, each RenderObject computes its own size within them and reports it back up, followed by the parent positioning children. Paint doesn't draw pixels directly — RenderObjects record a sequence of drawing instructions into Layer objects. Composite is the engine combining all recorded layers into a final rasterized image handed to the GPU.

**Q: Why does Flutter render its own pixels instead of wrapping native platform widgets, and what does that trade away?**
> It buys pixel-perfect visual and behavioral consistency across every platform, since Flutter never defers to each platform's own subtly different native widget rendering — and it means arbitrary custom painting/animation works identically everywhere, unconstrained by what native toolkits happen to support. It trades away automatically picking up platform-level design refreshes for free, since Flutter's widgets are its own from-scratch implementations, not the real native ones.

**Q: Skia vs Impeller — why does this distinction matter at a "why does this matter" level, not just trivia?**
> Skia compiled shaders lazily, the first time a given visual effect was actually used at runtime — producing a real, user-visible stutter (shader compilation jank) exactly the first time that effect appeared, often mid-animation, which is the worst possible moment for it to happen. Impeller pre-compiles shaders ahead of time at build time instead, eliminating that specific, well-documented category of runtime jank by construction, at the cost of more build-time work.

---

## Follow-ups (challenge questions)

- *Scale:* a complex screen consistently takes 25ms per frame (well over the 16.6ms budget for 60fps) — using DevTools' frame-timeline breakdown, walk through how you'd distinguish whether the bottleneck is in build (too much `build()` work per frame), layout (an expensive layout pass, e.g. unnecessary `IntrinsicHeight`), or paint/composite (too many separate `RepaintBoundary` layers, or an expensive custom paint operation) — and how the fix differs meaningfully depending on which phase is actually the culprit.
- *Consistency:* an app targets both a 60Hz and a 120Hz display simultaneously (a foldable/multi-window scenario) — does the same amount of per-frame work automatically stay within budget on both, or does the halved 8.3ms budget on the 120Hz surface expose jank that was invisible at 60Hz for identical app code?
- *Failure mode:* a team migrates from Skia to Impeller and observes one specific custom `CustomPainter`-heavy screen now behaves subtly differently (a slightly different anti-aliasing result) — reason through why a rendering-engine swap, even one designed to preserve behavior, can still surface small visual differences for edge-case custom painting code, connecting back to the engine being what actually executes those painting instructions.

---

**Previous:** [Part 20 — App Architecture](20-app-architecture.md) · **Next:** [Part 22 — Flutter vs React Native vs Native](22-flutter-vs-react-native-vs-native.md)
