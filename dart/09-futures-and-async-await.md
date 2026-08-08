# Dart Study Notes — Part 09

## Futures & async/await ⭐⭐⭐⭐⭐

> Worth actively contrasting against [javascript Part 11 — Promises](../javascript/11-promises.md) throughout this part — same problem, deliberately similar solution, with real differences worth knowing precisely.

**Topics:** `Future<T>` · `async`/`await` · `Future.value`/`Future.error`/`Future.delayed` · chaining · `Future.wait` · sequential vs parallel awaiting · Dart's microtask/event queue model.

---

## 1. `Future<T>`

> **Definition:** a `Future<T>` represents a value (or error) that will be available **at some point in the future**, not immediately — Dart's direct analogue of a JS `Promise<T>`. A `Future` is either **uncompleted** or **completed** (with a value, or with an error) — and like a Promise, once completed, it stays that way permanently.

```dart
Future<String> fetchUsername() {
  return Future.delayed(Duration(seconds: 1), () => 'V'); // completes with 'V' after 1 second
}

fetchUsername().then((username) => print('Got: $username'));
```

## 2. `async`/`await`

> **Definition:** identical role to [JS's `async`/`await`](../javascript/12-async-await.md) — an `async` function always returns a `Future`, and `await` suspends execution of that function (without blocking the isolate/thread) until the awaited `Future` completes, then yields its value or throws its error.

```dart
Future<String> fetchUsername() async {
  await Future.delayed(Duration(seconds: 1));
  return 'V'; // an async function's return value is automatically wrapped in a Future<String>
}

Future<void> greet() async {
  final username = await fetchUsername(); // suspends here, doesn't block the isolate
  print('Hello, $username');
}
```

## 3. `Future.value` / `Future.error` / `Future.delayed`

```dart
Future.value(42);                          // immediately-completed Future<int>, resolves to 42
Future.error(Exception('failed'));            // immediately-completed Future in the error state
Future.delayed(Duration(seconds: 2), () => 'done'); // completes after a delay, running the callback then
```

## 4. Chaining — `.then()`/`.catchError()`/`.whenComplete()`

```dart
fetchUsername()
  .then((username) => fetchOrders(username))  // chains — waits for the returned Future too,
  .then((orders) => print(orders))               // same flattening behavior as JS .then()
  .catchError((e) => print('Error: $e'))
  .whenComplete(() => print('done, success or failure')); // Dart's .finally() equivalent
```

## 5. `Future.wait` — Dart's `Promise.all`

> **Definition:** `Future.wait(futures)` runs a list of Futures **concurrently** (in the sense that they're all already in-flight, not sequentially awaited one at a time) and completes with a `List` of their results, in the same order as the input — direct parallel to [JS's `Promise.all`](../javascript/11-promises.md#5-promiseall-vs-allsettled-vs-race-vs-any). Like `Promise.all`, it **fails fast** — completing with an error the moment any one Future errors, by default.

```dart
final results = await Future.wait([
  fetchUser(),
  fetchOrders(),
  fetchSettings(),
]); // waits for all three, results[0]/[1]/[2] in input order

// eagerErrors: false (default true) changes fail-fast behavior — lets all futures finish
// before surfacing the FIRST error, rather than surfacing it the instant it occurs
```

## 6. Sequential vs Parallel Awaiting

Same performance trap as [JS's `await`-in-a-loop bug](../javascript/12-async-await.md#4-sequential-vs-parallel-await):

```dart
// SEQUENTIAL — BAD for independent operations. Total time = sum of all delays.
Future<List<String>> fetchAllSlow(List<String> ids) async {
  final results = <String>[];
  for (final id in ids) {
    results.add(await fetchUser(id)); // each iteration waits for the PREVIOUS one to finish
  }
  return results;
}

// PARALLEL — total time = the SLOWEST single fetch, not the sum
Future<List<String>> fetchAllFast(List<String> ids) async {
  return Future.wait(ids.map((id) => fetchUser(id)));
}
```

## 7. Dart's Microtask/Event Queue Model

> **Definition:** Dart's event loop has two queues, structurally similar to JS's — the **microtask queue** (fully drained before the next event-queue item, used for `Future` callback scheduling in most cases) and the **event queue** (timers, I/O, UI events) — but Dart's queue priority and exact draining rules are Dart's own, not identical to the browser/Node model, so don't assume 1:1 output ordering with equivalent JS code without verifying.

```dart
print('1');
Future(() => print('2'));                 // scheduled on the EVENT queue
scheduleMicrotask(() => print('3'));         // scheduled on the MICROTASK queue
Future.microtask(() => print('4'));            // also microtask queue
print('5');
// 1, 5, 3, 4, 2 — sync first, then BOTH microtasks (in scheduling order), then the event-queue Future
```

---

## Interview Q&A

**Q: `Future` vs `Promise` — what's the same, what's actually different?**
> Conceptually near-identical: both represent an eventually-available value or error, both are single-settle, both compose via `async`/`await`. What genuinely differs: Dart's concurrency model is per-isolate (no shared-memory threads at all, [Part 11](11-isolates-and-concurrency.md)), so there's no cross-thread race-condition concern the way there arguably still is at the edges of JS's model; Dart's `Future.wait` maps to `Promise.all` but Dart's queue draining rules are its own implementation, not literally the same algorithm as a browser/Node event loop — output ordering for mixed microtask/event-queue code shouldn't be assumed identical without checking.

**Q: Why is awaiting inside a loop the same performance trap in Dart as in JS, and what's the fix?**
> Each `await` inside a loop iteration blocks that iteration from even starting the next one until the current async operation completes, turning N independent operations into N sequential ones and multiplying total latency by N — identical root cause to the JS version. The fix is identical too: build the list of Futures first (e.g. via `.map()`, which starts every Future immediately since Futures begin running the moment they're created, not when awaited), then `await Future.wait(...)` on all of them together.

**Q: What does `Future.wait`'s `eagerErrors` parameter control?**
> By default (`eagerErrors: true`), `Future.wait` completes with an error the instant any one of the futures errors, without waiting for the others — fail-fast, same as `Promise.all`. Setting it to `false` lets every future finish (successfully or not) before surfacing the *first* error that occurred, which can matter if some of those futures have side effects you want to complete regardless of one failure elsewhere.

**Q: Predict:**
```dart
Future<void> main() async {
  print('start');
  await Future.delayed(Duration.zero);
  print('after await');
}
```
> `start`, then `after await` — printed on separate turns of the event loop; even a zero-duration delay still defers to at least the next event-queue turn, it's never truly synchronous despite the `Duration.zero`.

---

## Follow-ups (challenge questions)

- *Failure mode:* an `async` function's `Future` is never `await`ed by its caller (`someAsyncFunction();` with no `await` and no `.catchError()`), and it eventually completes with an error — what happens to that unhandled error in Dart, and how does the runtime surface it (compare to a JS unhandled promise rejection)?
- *Scale:* `Future.wait` on a list of 10,000 independent network-fetching Futures fires all 10,000 requests essentially simultaneously — same concurrency-limiting problem as [JS's `Promise.all`](../javascript/11-promises.md#follow-ups-challenge-questions) at scale — how would you bound concurrency in Dart, conceptually, without a built-in `Promise`-pool-equivalent in the core library?
- *Consistency:* two `await`ed database writes happen inside the same `async` function, no explicit transaction, and the second one throws — is the first write already committed? Same question as the JS track, worth answering for Dart specifically in terms of what `await` actually guarantees (or doesn't) about atomicity.

---

**Previous:** [Part 08 — Exception Handling](08-exception-handling.md) · **Next:** [Part 10 — Streams](10-streams.md)
