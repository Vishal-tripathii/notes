# Flutter Study Notes — Part 10

## BLoC / Cubit ⭐⭐⭐⭐⭐

**Topics:** the BLoC pattern's core idea · `Cubit` vs full `Bloc` · `BlocProvider`/`BlocBuilder`/`BlocListener`/`BlocConsumer` · stream transformations for events · why BLoC is popular for testability.

---

## 1. The BLoC Pattern's Core Idea

> **Definition:** BLoC (**B**usiness **Lo**gic **C**omponent) enforces a strict, one-directional flow — the UI sends **events** (or, for `Cubit`, calls methods directly) into a business-logic object, which processes them and **emits states**; the UI only ever renders based on the latest emitted state, and never talks to business logic any other way. Business logic never imports Flutter/widget code at all — it's pure Dart, built on [Streams](../dart/10-streams.md).

```
UI event (button tap) → Bloc/Cubit (business logic) → new State emitted → UI rebuilds from State
        ↑_________________________________________________________________________|
                    (strictly one-directional — UI never mutates state directly)
```

## 2. `Cubit` vs Full `Bloc`

> **Definition — `Cubit`:** the simplified variant — state changes happen via direct method calls that call `emit(newState)`, no separate event type needed.
> **Definition — `Bloc`:** the full, event-driven variant — the UI dispatches typed **event** objects via `add(event)`, and `on<EventType>((event, emit) { ... })` handlers process them and `emit()` new states — an explicit extra layer between "something happened" (the event) and "how we respond" (the handler).

```dart
// CUBIT — simpler, direct method calls
class CounterCubit extends Cubit<int> {
  CounterCubit() : super(0);
  void increment() => emit(state + 1); // direct method, emits immediately
}
// usage: context.read<CounterCubit>().increment();

// BLOC — event-driven, more ceremony, more structure
abstract class CounterEvent {}
class IncrementPressed extends CounterEvent {}

class CounterBloc extends Bloc<CounterEvent, int> {
  CounterBloc() : super(0) {
    on<IncrementPressed>((event, emit) => emit(state + 1)); // HANDLER responds to the event
  }
}
// usage: context.read<CounterBloc>().add(IncrementPressed());
```
**Cubit vs full Bloc, concretely, and when the extra ceremony earns its keep:** `Cubit` is simpler and sufficient for straightforward state changes with no need to distinguish *why* a change happened. Full `Bloc`'s event layer earns its keep when you need to **log/replay every user action** for debugging or analytics (events are a clean, serializable record of "what happened," decoupled from "how the app reacted"), when multiple distinct events should map to the same handler logic, or when you want to apply stream transformations to the event stream itself (§4) — none of which a `Cubit`'s direct method calls naturally support, since there's no intermediate event stream to transform.

## 3. `BlocProvider` / `BlocBuilder` / `BlocListener` / `BlocConsumer`

> **Definition:** `BlocProvider` provides a `Bloc`/`Cubit` to the tree (built on `InheritedWidget`/Provider under the hood — same foundational mechanism as [Part 07](07-inheritedwidget-and-inheritedmodel.md)/[Part 08](08-provider.md)). `BlocBuilder` rebuilds UI in response to new states — the "build from state" half. `BlocListener` runs side effects (navigation, `SnackBar`s) in response to state changes without rebuilding — the same role as [Riverpod's `ref.listen()`](09-riverpod.md#3-refwatch-vs-refread-vs-reflisten). `BlocConsumer` combines both in one widget.

```dart
BlocProvider(
  create: (context) => CounterCubit(),
  child: BlocConsumer<CounterCubit, int>(
    listener: (context, state) {
      if (state > 10) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('High!')));
    },
    builder: (context, state) => Text('Count: $state'),
  ),
);
```

## 4. Stream Transformations for Events

> **Definition:** because `Bloc`'s events flow through a real [Dart `Stream`](../dart/10-streams.md), `Bloc` lets you apply standard stream-transformation operators to that event stream before handling — most commonly `debounce`/`restartable` transformers for something like search-as-you-type, avoiding a network call per keystroke.

```dart
class SearchBloc extends Bloc<SearchQueryChanged, SearchState> {
  SearchBloc() : super(SearchInitial()) {
    on<SearchQueryChanged>(
      _onSearchQueryChanged,
      transformer: (events, mapper) => events
          .debounceTime(const Duration(milliseconds: 300)) // only process after 300ms of silence,
          .switchMap(mapper),                                 // same debounce concept as JS Part 18/
    );                                                            // Angular's switchMap, Part 12
  }
  Future<void> _onSearchQueryChanged(SearchQueryChanged event, Emitter<SearchState> emit) async {
    emit(SearchLoading());
    final results = await searchApi(event.query);
    emit(SearchLoaded(results));
  }
}
```

## 5. Why BLoC Makes Business Logic Trivially Testable

```dart
// pure-Dart unit test — NO widget tree needed at all, using the bloc_test package
blocTest<CounterCubit, int>(
  'emits [1] when increment() is called',
  build: () => CounterCubit(),
  act: (cubit) => cubit.increment(),
  expect: () => [1], // asserts the exact sequence of emitted states
);
```
**Why this level of testability is a real, concrete win, not just a talking point:** because business logic is entirely decoupled from any widget/`BuildContext`, a test can construct a `Bloc`/`Cubit` directly, feed it events/method calls, and assert on the exact sequence of states it emits — no `pumpWidget`, no simulated rendering, no async frame-pumping. This is dramatically faster and more precise than testing the same logic indirectly through widget interactions, and it's the same [pure-Dart-unit-test argument from the Dart track's testing part](../dart/16-testing-in-dart.md#5-pure-dart-unit-test-vs-flutter-widget-test), applied specifically to state-management logic.

---

## Interview Q&A

**Q: Cubit vs full Bloc — when does the extra event-driven ceremony of Bloc earn its keep?**
> When you need a clean, serializable, replayable record of *what happened* (events) decoupled from *how the app reacted* — valuable for debugging, analytics, or time-travel-style tooling. Also when the event stream itself benefits from stream transformations (debouncing rapid input, switching to the latest request and cancelling stale ones), which requires an actual event stream to transform — something `Cubit`'s direct method calls don't provide, since there's no intermediate stream. For simple, direct state changes with no need to distinguish the "why," `Cubit` is simpler and sufficient.

**Q: Why does BLoC-style architecture make business logic trivially unit-testable without a widget tree?**
> Because the business logic is a pure Dart object built on Streams, entirely decoupled from `BuildContext`/widgets — a test can construct the Bloc/Cubit directly, dispatch events or call methods, and assert on the exact sequence of emitted states, with no simulated rendering environment needed at all. That's dramatically faster and more precise than verifying the same logic indirectly through widget interaction tests.

**Q: What's the actual difference between `BlocBuilder` and `BlocListener`, and why do you need both in some cases?**
> `BlocBuilder` rebuilds the UI in response to state changes — it's for what gets *rendered*. `BlocListener` runs one-off side effects (navigation, showing a `SnackBar`) in reaction to a state change without itself causing or being part of a rebuild — necessary because things like navigation or a `SnackBar` shouldn't be triggered as a side effect of `build()` re-running for unrelated reasons; they need to fire exactly once per genuine state transition, which is what a listener (not a rebuild-driving builder) provides. `BlocConsumer` combines both when a widget genuinely needs both behaviors.

---

## Follow-ups (challenge questions)

- *Failure mode:* a `Bloc`'s `on<Event>` handler is `async` and performs two sequential `await`ed API calls before emitting a final state — if the widget using this `Bloc` is disposed (user navigated away) while the handler is still awaiting, what happens to the eventual `emit()` call, and does `Bloc` itself guard against emitting into a closed/disposed bloc the way a Flutter `State` needs the `mounted` check?
- *Scale:* a search feature debounces its event stream with `debounceTime(300ms).switchMap(mapper)` — walk through exactly what `switchMap` (vs `concatMap`/`mergeMap`, cross-referencing [Angular's RxJS flattening operators](../Angular/12-rxjs.md)) buys here specifically: what happens to an in-flight search request if the user types more characters before it completes?
- *Consistency:* two different `BlocBuilder`s in the same screen both listen to the same `Bloc` but display different projections of its state (e.g. one shows `state.items.length`, another shows `state.isLoading`) — does each `BlocBuilder` rebuild on every single state emission regardless of whether ITS specific projection changed, or does `Bloc` offer something like Provider's `Selector`/Riverpod's granular providers to narrow this (hint: `buildWhen`)?

---

**Previous:** [Part 09 — Riverpod](09-riverpod.md) · **Next:** [Part 11 — State Management Comparison](11-state-management-comparison.md)
