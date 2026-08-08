# Flutter Study Notes — Part 23

## Machine Coding — Projects ⭐⭐⭐⭐☆

> Two projects, mirroring [the Angular track's approach](../Angular/00-ROADMAP.md#phase-5--machine-coding) — a second CRUD app teaches nothing the first didn't. These live in `flutter/Projects/`.

---

## Project 1 — E-Commerce / Product Catalog App *(covers Parts 1–15)*

```
Splash → Auth (login/register)
         └── Home (product grid, ListView.builder/GridView.builder)
             ├── Product Detail (route args, image, add-to-cart)
             ├── Cart (state shared across screens, quantity updates)
             ├── Checkout (form + validation)
             └── Order History (repository pattern + FutureBuilder or a provider-backed list)
```

**What each screen exercises:**

| Screen | Parts exercised |
|---|---|
| Auth | [Forms & Validation](15-forms-and-validation.md), [Navigation](12-navigation-and-routing.md) (`pushAndRemoveUntil` after login) |
| Home | [Layout](04-layout-system.md), [Keys](05-keys.md) (product cards in a grid), lazy `.builder` construction ([Performance](16-performance-optimization.md)) |
| Product Detail | [Navigation](12-navigation-and-routing.md) (passing/returning arguments), [BuildContext](03-buildcontext.md) (`Scaffold.of`-style lookups for a "added to cart" `SnackBar`) |
| Cart | A committed state-management choice ([Provider](08-provider.md)/[Riverpod](09-riverpod.md)/[BLoC](10-bloc-and-cubit.md)) shared across Home/Detail/Cart/Checkout |
| Checkout | [Forms & Validation](15-forms-and-validation.md) end-to-end — address form, cross-field validation, submit |
| Order History | [Networking & JSON](13-networking-and-json-serialization.md), the repository pattern, [FutureBuilder](14-futurebuilder-and-streambuilder.md) or a provider-backed async list |

**The point of this project:** committing to **one real state-management solution end-to-end**, not toy-switching between them per screen — the cart specifically needs to be readable/writable from Home (badge count), Detail (add), Cart (edit quantities), and Checkout (read-only summary), which is exactly the "genuinely shared, multi-screen state" scenario [Part 11's decision framework](11-state-management-comparison.md) is calibrated around, not an ephemeral, single-widget case.

---

## Project 2 — Chat / Real-Time Feed App *(covers Parts 09–10, 14, 16–17)*

> Deliberately not another CRUD app — the point is async and performance, the areas a pure-CRUD project doesn't exercise deeply.

```
Conversation List (search, debounced filter)
    └── Chat Screen
        ├── Live message feed (StreamBuilder-driven)
        ├── Optimistic send (message appears instantly, rolls back on failure)
        ├── Typing indicator (implicit animation)
        └── Long, smooth-scrolling message history (ListView.builder + const + RepaintBoundary discipline)
```

**What each piece exercises:**

| Feature | Parts exercised |
|---|---|
| Live message feed | [Streams](../dart/10-streams.md)/[StreamBuilder](14-futurebuilder-and-streambuilder.md) — a genuinely ongoing data source, not a one-shot fetch |
| Optimistic send + rollback | State-management error handling — emit an optimistic state immediately, then a corrected/rolled-back state if the send actually fails |
| Typing indicator | [Implicit animation](17-animations.md#1-implicit-animations) — `AnimatedOpacity`/`AnimatedSwitcher` |
| Smooth long-scrolling history | [`ListView.builder`, `const`, `RepaintBoundary` discipline](16-performance-optimization.md) — this is the screen where getting performance wrong is immediately, viscerally obvious (janky scrolling) |
| Debounced conversation search | [Debounce pattern](15-forms-and-validation.md#7-debounced-async-validation), same technique as async form validation |

**The point of this project:** async correctness and performance under genuinely continuous, high-frequency data — a live feed, not a static list fetched once — which surfaces an entirely different class of bug (a stale optimistic-send rollback racing a real server confirmation, a `StreamBuilder` re-subscribing on every rebuild per [Part 14's bug](14-futurebuilder-and-streambuilder.md#2-the-future-created-inside-build-bug)) than Project 1's CRUD flows do.

---

## Suggested Build Order

1. **Project 1, without state management first** — build the screens with plain `setState`/lifted state, feel exactly where it starts hurting (per [Part 06](06-setstate-and-local-state.md#4-where-setstate-stops-scaling)), *then* refactor to a real solution — this sequencing makes the *reason* for reaching for Provider/Riverpod/BLoC concrete rather than assumed.
2. **Project 1, complete, with a committed state-management choice.**
3. **Project 2** — apply everything from Project 1 plus the async/performance-specific pieces.
4. **Revisit Project 1 with a second state-management library**, reimplementing just the cart — this is the fastest way to genuinely internalize [Part 11's comparison](11-state-management-comparison.md) as lived experience rather than a memorized table.

---

**Previous:** [Part 22 — Flutter vs React Native vs Native](22-flutter-vs-react-native-vs-native.md) · **Next:** [Part 24 — Latest Flutter Features](24-latest-flutter-features.md)
