# Dart Study Notes — Part 10

## Streams ⭐⭐⭐⭐⭐

> No direct equivalent in the base JS language — RxJS Observables (from the Angular track) are the closest real analogue, if that's a useful bridge. This is where a JS-only background has to build genuinely new intuition, not just map a familiar concept onto new syntax.

**Topics:** `Stream<T>` as many async events over time · single-subscription vs broadcast · `StreamController` · listening · transforming · `async*`/`yield` · `StreamSubscription` and cancellation · combining streams · `StreamBuilder` (cross-ref Flutter).

---

## 1. `Stream<T>` — Many Values Over Time

> **Definition:** where a `Future<T>` represents exactly **one** eventual value (or error), a `Stream<T>` represents a **sequence of zero or more async events over time** — each event is a value, an error, or a "done" signal, delivered to listeners as they occur.

```dart
Stream<int> countStream() async* {  // async* — a generator function that produces a Stream (§5)
  for (int i = 1; i <= 3; i++) {
    await Future.delayed(Duration(seconds: 1));
    yield i;                          // emits a value into the stream
  }
}

countStream().listen((value) => print('Got: $value')); // Got: 1 (after 1s), Got: 2 (after 2s), Got: 3 (after 3s)
```
**`Future` vs `Stream`, precisely:** a `Future` settles exactly once, permanently. A `Stream` can emit any number of values over its lifetime before eventually (optionally) closing — think a single HTTP response (`Future`) vs a live WebSocket connection or a sequence of user taps (`Stream`).

## 2. Single-Subscription vs Broadcast Streams

> **Definition — Single-subscription:** the default stream type — allows **exactly one** `.listen()` call over its lifetime; a second `.listen()` throws a `StateError`. Events are buffered until a listener attaches, and typically represent a sequence tied to one specific operation (reading a file, one HTTP response body).
> **Definition — Broadcast:** created via `.asBroadcastStream()` or `StreamController.broadcast()` — allows **multiple simultaneous listeners**, but events emitted **before** a listener attaches are lost to that listener (no buffering per-listener) — modeling something like live sensor data or app-wide events, where late subscribers just start receiving from "now."

```dart
final controller = StreamController<int>(); // single-subscription by default
controller.stream.listen((v) => print('Listener A: $v'));
// controller.stream.listen((v) => print('Listener B: $v')); // throws — already has a listener

final broadcastController = StreamController<int>.broadcast();
broadcastController.stream.listen((v) => print('A: $v'));
broadcastController.stream.listen((v) => print('B: $v')); // fine — BOTH receive every future event
```
**What breaks if you try to `.listen()` twice on a single-subscription stream:** `Bad state: Stream has already been listened to.` — a `StateError` thrown immediately. This is a deliberate design constraint, not an oversight — single-subscription streams model a one-shot sequence tightly coupled to one consumer's lifecycle (closing the underlying resource when that one listener cancels), which multiple independent listeners would make ambiguous (who "owns" cancellation?).

## 3. `StreamController`

> **Definition:** the object that lets you manually create and populate a `Stream` — `.add(value)` emits a value, `.addError(e)` emits an error, `.close()` signals completion — exposing the actual `.stream` for consumers to listen to.

```dart
final controller = StreamController<String>();
controller.stream.listen(
  (data) => print('Data: $data'),
  onError: (e) => print('Error: $e'),
  onDone: () => print('Stream closed'),
);
controller.add('hello');
controller.add('world');
controller.close(); // triggers onDone
```

## 4. Transforming — `.map`, `.where`, `.transform`

```dart
Stream<int> numbers = Stream.fromIterable([1, 2, 3, 4, 5]);
numbers
  .where((n) => n.isEven)    // stream transformation, same lazy-pipeline idea as Iterable (Part 06)
  .map((n) => n * 10)
  .listen(print);              // 20, 40
```

## 5. `async*` Generator Functions and `yield`

> **Definition:** an `async*` function is a generator that returns a `Stream<T>` instead of computing one value — `yield value` emits a single value into the stream (analogous to a synchronous [Dart `sync*` generator's `yield`](../javascript/14-generators-and-iterators.md), or a JS async generator); `yield*` emits every value from another stream/iterable in sequence.

```dart
Stream<int> countUpTo(int max) async* {
  for (int i = 1; i <= max; i++) {
    await Future.delayed(Duration(milliseconds: 500));
    yield i;
  }
}
Stream<int> combined() async* {
  yield* countUpTo(3);   // emits 1, 2, 3
  yield* countUpTo(2);     // then 1, 2 again
}
```

## 6. `StreamSubscription` and Cancellation

> **Definition:** `.listen()` returns a `StreamSubscription`, which can `.cancel()` (stop receiving events and release any underlying resources), `.pause()`, and `.resume()` — the disposal mechanism that must be explicitly managed to avoid leaking, the direct analogue of [removing a JS event listener](../javascript/17-memory-management.md#3-common-memory-leak-sources).

```dart
final subscription = someStream.listen((data) => print(data));
// ... later, e.g. in a Flutter State's dispose():
subscription.cancel(); // stops listening, releases resources — forgetting this is a real leak source
```

## 7. Combining Streams

```dart
Stream<int> a = Stream.periodic(Duration(seconds: 1), (i) => i);
Stream<int> b = Stream.periodic(Duration(seconds: 2), (i) => i * 10);

StreamGroup.merge([a, b]).listen(print); // interleaves events from both — requires the async package
```

## 8. `StreamBuilder` (Cross-Reference)

Streams are the mechanism a Flutter `StreamBuilder` widget consumes to rebuild UI as new events arrive — full depth in [flutter Part 14](../flutter/14-futurebuilder-and-streambuilder.md), not duplicated here.

---

## Interview Q&A

**Q: `Future` vs `Stream`, precisely?**
> A `Future` represents exactly one eventual value or error, settling permanently once. A `Stream` represents a sequence of async events — zero, one, or many values over time, plus an optional error or completion signal — modeling something ongoing, like a live data feed, rather than a single request/response.

**Q: Single-subscription vs broadcast streams — what breaks if you try to `.listen()` twice on a single-subscription stream?**
> A single-subscription stream throws a `StateError` on a second `.listen()` call — it's designed for exactly one consumer tightly coupled to that stream's lifecycle. A broadcast stream explicitly supports multiple simultaneous listeners, but at the cost of not buffering past events for a listener that subscribes late — it only receives events emitted from the moment it attaches onward.

**Q: Why does forgetting to cancel a `StreamSubscription` matter?**
> The subscription keeps the stream (and anything the stream's producer holds onto — an open socket, a Firestore listener, a timer) alive and active as long as it's not cancelled, even after the code that created it no longer needs it — the same category of leak as a JS event listener that's never removed, and in a Flutter `State` object specifically, an uncancelled subscription can try to call `setState()` after the widget's been disposed, crashing with a very common real-world error.

**Q: Predict:**
```dart
final controller = StreamController<int>.broadcast();
controller.stream.listen((v) => print('Early: $v'));
controller.add(1);
controller.stream.listen((v) => print('Late: $v'));
controller.add(2);
```
> `Early: 1`, then `Early: 2` and `Late: 2` (in some interleaved but both-present order) — the late listener misses event `1` entirely since it subscribed after that event was already emitted; broadcast streams don't buffer for late subscribers.

---

## Follow-ups (challenge questions)

- *Failure mode:* a Flutter `State`'s `initState()` subscribes to a stream but the subscription is never stored/cancelled in `dispose()` — walk through the exact crash that occurs when the stream emits an event after the widget has been removed from the tree, and why it's a `setState() called after dispose()` error specifically.
- *Scale:* a live chat feature uses a broadcast stream for incoming messages, and a user navigates away and back to the chat screen — what happens to messages sent while they were away, and how would you redesign the data flow (e.g. combining a `Future` for history + a `Stream` for live updates) to avoid losing them?
- *Consistency:* two widgets both listen to the same broadcast stream and both call `setState()` in their listener — is there any risk of them seeing the events in a different order from each other, or reacting to a race condition, given Dart's single-threaded-per-isolate execution model ([Part 11](11-isolates-and-concurrency.md))?

---

**Previous:** [Part 09 — Futures & async/await](09-futures-and-async-await.md) · **Next:** [Part 11 — Isolates & Concurrency](11-isolates-and-concurrency.md)
