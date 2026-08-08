# Dart Study Notes — Part 11

## Isolates & Concurrency ⭐⭐⭐⭐☆

**Topics:** Dart's single-threaded-per-isolate model · no shared memory, message passing only · `Isolate.spawn` · Flutter's `compute()` helper · when isolates are actually worth the overhead.

---

## 1. Single-Threaded Per Isolate

> **Definition:** an **isolate** is Dart's unit of concurrency — each isolate has its **own memory heap** and runs on a **single thread**, with its own event loop, completely isolated from every other isolate's memory. This is the direct structural parallel to [JS's single-threaded execution model](../javascript/10-event-loop-and-concurrency-model.md) — one call stack, no data races possible *within* an isolate — but Dart's answer to "how do you use multiple CPU cores" is spawning **additional isolates**, not Web Workers, though the underlying goal is identical.

```dart
void main() {
  // this is the "main isolate" — everything you write without explicitly spawning
  // an isolate runs here, single-threaded, exactly like a normal JS/Dart script
  heavyComputation(); // if this takes 3 seconds, the UI (in a Flutter app) FREEZES for 3 seconds —
}                        // there's no other thread doing anything else in the meantime
```

## 2. No Shared Memory — Message Passing Only

> **Definition:** isolates share **zero memory** by default — there is no such thing as a variable visible to two isolates simultaneously. Communication happens exclusively via **message passing** through `SendPort`/`ReceivePort`, and messages are **copied** (deep-copied for most data, with some types transferable without copying) when sent between isolates — conceptually the same isolation guarantee as [JS Web Workers' structured-clone message passing](../javascript/10-event-loop-and-concurrency-model.md), just Dart's own implementation of the idea.

```dart
import 'dart:isolate';

void isolateEntryPoint(SendPort mainSendPort) {
  final receivePort = ReceivePort();
  mainSendPort.send(receivePort.sendPort); // hand back a way for main to send US messages
  receivePort.listen((message) {
    final result = message * 2;               // do some work
    mainSendPort.send(result);                   // send the result BACK — copied, not shared
  });
}

void main() async {
  final mainReceivePort = ReceivePort();
  await Isolate.spawn(isolateEntryPoint, mainReceivePort.sendPort);
  // ... exchange messages via the ports
}
```
**Why Dart chose isolates (no shared memory) over OS threads with shared memory:** shared-memory concurrency requires locks/mutexes to prevent race conditions on data multiple threads can touch simultaneously — a whole category of notoriously hard bugs (deadlocks, subtle data races). By making memory sharing *impossible* rather than merely discouraged, Dart eliminates that entire bug class by construction — the same "no locks needed" argument [JS's single-threaded model](../javascript/10-event-loop-and-concurrency-model.md) makes for synchronous code, just extended to genuine multi-core parallelism via isolation instead of shared state.

## 3. `Isolate.spawn`

> **Definition:** `Isolate.spawn(entryPoint, message)` creates a new isolate running the given top-level (or static) function, passing one initial message — the low-level API underlying higher-level helpers like Flutter's `compute()`.

```dart
Future<int> heavyCalculation(int input) async {
  final receivePort = ReceivePort();
  await Isolate.spawn(_isolateFunction, [receivePort.sendPort, input]);
  return await receivePort.first as int; // wait for the isolate's single result message
}
void _isolateFunction(List<dynamic> args) {
  SendPort sendPort = args[0];
  int input = args[1];
  final result = _expensiveSyncWork(input); // runs on the SPAWNED isolate's own thread
  sendPort.send(result);
}
```

## 4. Flutter's `compute()` Helper

> **Definition:** `compute(callback, message)` is Flutter's convenience wrapper around spawning an isolate for a single, one-shot computation — handles the spawn/message/cleanup boilerplate `Isolate.spawn` requires manually.

```dart
import 'package:flutter/foundation.dart';

Future<List<Item>> parseJsonInBackground(String jsonString) {
  return compute(_parseJson, jsonString); // runs _parseJson on a SEPARATE isolate,
}                                            // keeping the UI isolate free to keep rendering frames
List<Item> _parseJson(String jsonString) {
  final data = jsonDecode(jsonString) as List;
  return data.map((e) => Item.fromJson(e)).toList();
}
```

## 5. When Isolates Are Worth the Overhead

> **Definition:** spawning an isolate has real cost — memory for a new heap, time to start up, and the serialization cost of copying messages across the boundary — so it's worth it specifically for **CPU-bound** work substantial enough that the cost of isolation is smaller than the cost of janking the UI thread. It is **not** worth it for I/O-bound work, which is already non-blocking via `Future`/`async`/`await` and doesn't need a second isolate at all.

```dart
// GOOD use of compute() — genuinely CPU-heavy, blocks the UI thread if done inline
compute(_parseHugeJsonFile, rawJsonString);
compute(_resizeAndCompressImage, imageBytes);

// BAD use of compute() — this is I/O, already async, wrapping it in an isolate just adds
// serialization overhead for zero benefit — the UI thread was never going to block on this anyway
// compute(_fetchFromNetwork, url); // WRONG — http.get() is already non-blocking via Future
```
**When you'd actually reach for `compute()` in a Flutter app, concretely:** parsing a multi-megabyte JSON API response, decoding/resizing a large image, running an on-device ML inference pass, or any tight synchronous loop over a large dataset — anything that would otherwise make the app visibly freeze (dropped frames, an unresponsive UI) for the duration of the computation.

---

## Interview Q&A

**Q: Why did Dart choose isolates (no shared memory) instead of OS threads with shared memory and locks?**
> Shared-memory concurrency requires manual synchronization (locks, mutexes) to prevent race conditions, and getting that wrong produces some of the hardest bugs to find and reproduce — deadlocks, subtle data corruption from a missed lock. By making memory sharing structurally impossible between isolates — communication only via copied messages — Dart eliminates that entire bug category outright, rather than just discouraging it through convention or tooling.

**Q: When would you actually reach for `compute()`/spawn an isolate in a real Flutter app?**
> For genuinely CPU-bound work substantial enough to visibly block the UI thread if run inline — parsing a large JSON payload, image processing, heavy on-device computation. Not for I/O-bound work like a network request, which is already non-blocking via `Future`/`async`/`await` on the main isolate and gains nothing from isolation — just the added overhead of spawning and message-copying.

**Q: Is Dart "single-threaded" the same claim as JavaScript being single-threaded — same nuance and same caveat?**
> The claim and its nuance are structurally the same: a single isolate/JS environment runs on one thread with one call stack, so there are no data races *within* it. And both languages have an escape hatch for genuine parallelism — Web Workers in JS, isolates in Dart — that don't violate the single-threaded guarantee of the main context, because they're fully separate, memory-isolated execution contexts communicating only via message passing, not shared-memory threads bolted onto the same context.

**Q: Predict — what happens here, conceptually?**
```dart
// inside a Flutter app's build/UI code
final result = _synchronousExpensiveLoop(); // a tight, CPU-heavy synchronous loop, no await anywhere
```
> The UI freezes for the entire duration of `_synchronousExpensiveLoop()` — no frames render, no touch input is processed, because this is all running synchronously on the single UI isolate with nothing yielding control back to the event loop. `async`/`await` alone doesn't help here either, since the loop itself has no `await` points to yield at — the fix requires actually moving the work to a different isolate via `compute()`/`Isolate.spawn`.

---

## Follow-ups (challenge questions)

- *Failure mode:* a Flutter app wraps a network call (already async via `http.get()`) in `compute()`, "to be safe" — walk through what this actually costs (isolate spawn time, message serialization of the response) for zero real benefit, and why the intuition "isolate = always safer/faster" is wrong here.
- *Scale:* an app needs to process 50 independent CPU-heavy image transformations — spawning 50 isolates simultaneously vs a small pool of long-lived isolates that process a work queue — what's the actual resource tradeoff (memory per isolate, spawn overhead) between the two approaches?
- *Consistency:* two isolates each hold what looks like "the same" data (e.g. both parsed the same JSON independently) — since there's no shared memory, are these ever the same object in any meaningful sense, and what does that imply about caching strategies that assume a single shared in-memory cache across isolates?

---

**Previous:** [Part 10 — Streams](10-streams.md) · **Next:** [Part 12 — Enums & Pattern Matching](12-enums-and-pattern-matching.md)
