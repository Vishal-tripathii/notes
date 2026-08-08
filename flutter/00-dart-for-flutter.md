# Flutter Study Notes — Part 00

## Dart for Flutter ⭐⭐⭐⭐⭐

> This part is a pointer, not a rewrite — same role [Angular's TypeScript Part 00](../Angular/00-ROADMAP.md#part-00--typescript-for-angular-) plays for that track.

---

## Why This Comes First

Flutter is not usable without Dart the way Angular isn't usable without TypeScript — every widget constructor leans on named/positional parameters, every `State` field leans on null safety, every async data load leans on `Future`/`Stream`, and every mixin-based utility class leans on Dart's mixin model. Trying to learn Flutter's APIs before Dart's fundamentals means constantly stumbling on the *language* while trying to learn the *framework* — two different classes of confusion tangled together.

**Work through the full [Dart track](../dart/00-ROADMAP.md) first** — all 17 parts, same interview-grade format as this track. Come back here once it's done.

---

## What to Have Cold Before Continuing

Pulled directly from the Dart track's own priority list — these are the parts that show up **constantly** in Flutter code, not occasionally:

| Dart part | Where it shows up immediately in Flutter |
|---|---|
| [Null Safety](../dart/02-null-safety.md) | Every widget constructor's optional vs required parameters; every `State` field |
| [Classes & Constructors](../dart/03-classes-and-constructors.md) | Every widget IS a class; `const` constructors are the backbone of [performance optimization](16-performance-optimization.md) |
| [Inheritance & Abstract Classes](../dart/04-inheritance-interfaces-and-abstract-classes.md) | `StatelessWidget`/`StatefulWidget` are abstract classes you extend; `implements` shows up in custom `Listenable`s |
| [Mixins](../dart/05-mixins.md) | `TickerProviderStateMixin` for animations ([Part 17](17-animations.md)), `AutomaticKeepAliveClientMixin` for list performance |
| [Collections](../dart/06-collections.md) | `ListView.builder`, widget lists, `.map()` to build widget trees from data |
| [Futures & async/await](../dart/09-futures-and-async-await.md) | Every network call, [`FutureBuilder`](14-futurebuilder-and-streambuilder.md), `initState`'s async patterns |
| [Streams](../dart/10-streams.md) | [`StreamBuilder`](14-futurebuilder-and-streambuilder.md), BLoC's entire model ([Part 10](10-bloc-and-cubit.md)), real-time data |
| [Records](../dart/13-records.md) | Modern state-management patterns increasingly return records from selectors/computed values |

---

## Must Be Able to Answer Before Continuing

- Sound null safety, precisely — and why `late`/`required` matter for widget field design.
- `Future` vs `Stream` — one value vs many over time.
- Mixins vs interfaces — what a mixin gives you that `implements` doesn't.
- What `const` constructors actually guarantee, and why that guarantee matters for performance (full payoff in [Part 16](16-performance-optimization.md)).

---

**Next:** [Part 01 — Flutter Architecture & the Three Trees](01-flutter-architecture-and-the-three-trees.md)
