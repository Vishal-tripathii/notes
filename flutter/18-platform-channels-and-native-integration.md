# Flutter Study Notes — Part 18

## Platform Channels & Native Integration ⭐⭐⭐☆☆

**Topics:** why Flutter needs native interop at all · `MethodChannel` · `EventChannel` · the serialization boundary · plugin vs package · async nature of every channel call.

---

## 1. Why Flutter Sometimes Needs to Talk to Native Code

> **Definition:** Flutter ships with a large set of Dart-accessible APIs, but a device capability with no existing Dart-side wrapper — a newly-released OS API, a vendor-specific SDK, low-level hardware access — requires bridging out to the actual native Android (Kotlin/Java) or iOS (Swift/Objective-C) platform code that can call it directly.

## 2. `MethodChannel`

> **Definition:** a named channel over which Dart code can invoke a single, one-off native method and `await` its return value — request/response, conceptually similar to a normal async function call, just crossing the Dart-to-native boundary.

```dart
// Dart side
class BatteryLevel {
  static const _channel = MethodChannel('com.example.app/battery');
  static Future<int> get level async {
    final int result = await _channel.invokeMethod('getBatteryLevel'); // crosses to native, awaits reply
    return result;
  }
}
```
```kotlin
// Android (Kotlin) side, conceptually
MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.example.app/battery")
    .setMethodCallHandler { call, result ->
        if (call.method == "getBatteryLevel") {
            result.success(getBatteryLevelNative()) // sends the value back across the channel
        }
    }
```

## 3. `EventChannel`

> **Definition:** unlike `MethodChannel`'s single request/response, `EventChannel` establishes a **continuous stream** of events from native code into Dart — exposed on the Dart side as a genuine [`Stream`](../dart/10-streams.md), appropriate for ongoing native events like sensor readings, battery-state-change notifications, or native location updates.

```dart
// Dart side — exposed as a real Stream
static const _eventChannel = EventChannel('com.example.app/battery_stream');
Stream<int> get batteryLevelStream => _eventChannel.receiveBroadcastStream().cast<int>();

batteryLevelStream.listen((level) => print('Battery: $level%')); // ongoing, same as any Stream
```
**`MethodChannel` vs `EventChannel`, with a use case each:** `MethodChannel` for a one-off request needing a single answer — "what's the current battery level right now." `EventChannel` for an ongoing sequence of native-originated events over time — "notify me every time the battery level changes" — mapping naturally onto Dart's existing `Stream` abstraction rather than requiring a separate polling mechanism.

## 4. The Serialization Boundary

> **Definition:** values crossing a platform channel must be encoded into a **standard, limited set of types** (`bool`, `int`, `double`, `String`, `Uint8List`/byte arrays, `List`, `Map` of the above) via a `MessageCodec` — arbitrary Dart objects (a custom class instance, a `Function`) cannot cross the boundary directly and must be manually serialized (e.g. to a `Map`) on one side and reconstructed on the other.

```dart
// crossing the boundary — only channel-codec-compatible types allowed directly
await _channel.invokeMethod('saveUser', {'id': user.id, 'name': user.name}); // Map<String, dynamic> — OK
// await _channel.invokeMethod('saveUser', user);  // a raw custom User object — NOT directly supported,
                                                        // must be manually converted to a Map first
```

## 5. Plugin vs Package

> **Definition — Package:** a pure-Dart library — no platform channel, no native code, works identically everywhere Dart runs.
> **Definition — Plugin:** a package that **wraps one or more platform channels**, bridging to actual native (Android/iOS/web/desktop) implementations underneath a unified Dart API — from the calling code's perspective it looks like a normal package, but internally it's doing exactly the `MethodChannel`/`EventChannel` work described above, often per-platform.

```yaml
dependencies:
  intl: ^0.19.0            # a PACKAGE — pure Dart, no native code, works everywhere
  camera: ^0.10.0            # a PLUGIN — wraps native camera APIs on each platform via channels
```

## 6. Every Platform Channel Call Is Async

> **Definition:** crossing to native code and back inherently involves an asynchronous round-trip (a message send + a native-side response), so `MethodChannel.invokeMethod` always returns a `Future`, never a synchronous value — even for something conceptually "instant" on the native side.

```dart
final level = await BatteryLevel.level; // always await — there's no synchronous variant, by design,
                                            // because the underlying channel communication is inherently async
```

---

## Interview Q&A

**Q: `MethodChannel` vs `EventChannel`, with a use case each?**
> `MethodChannel` is for a single request/response — invoking one native method and awaiting one reply, like reading the current battery level once. `EventChannel` is for an ongoing stream of native-originated events over time, exposed as a genuine Dart `Stream` — like subscribing to battery-level-change notifications as they happen, rather than polling `MethodChannel` repeatedly.

**Q: Plugin vs package, precisely?**
> A package is pure Dart code with no native dependency, working identically on every platform Dart runs on. A plugin wraps one or more platform channels, bridging to real native (Android/iOS/etc.) implementations underneath a unified Dart-facing API — it looks like a normal package to calling code, but internally does the `MethodChannel`/`EventChannel` communication described above, typically with separate native implementations per platform.

**Q: Why can't you pass an arbitrary Dart object directly across a platform channel?**
> Values crossing the channel must be encoded via a standard message codec supporting only a limited set of primitive/collection types — a custom class instance has no defined native-side representation the codec understands. It has to be manually converted to a supported type (typically a `Map`) before crossing, and reconstructed back into the richer Dart type on the receiving side.

---

## Follow-ups (challenge questions)

- *Failure mode:* a `MethodChannel` call to native code hangs indefinitely because the native-side implementation was never actually registered (a common setup mistake, especially after adding a new platform target) — what does the calling Dart code actually experience (does `await` ever resolve, does it throw, does it hang forever), and how would you add a timeout to guard against this?
- *Scale:* an `EventChannel`-based sensor stream emits events at a very high frequency (e.g. hundreds of times per second from an accelerometer) — what's the actual cost of crossing the platform-channel serialization boundary that often, and how would you mitigate it (e.g. batching events on the native side before sending, or throttling on the Dart side per [Part 22 — Performance Patterns of the JS track's analogous problem](../javascript/22-performance-patterns.md))?

---

**Previous:** [Part 17 — Animations](17-animations.md) · **Next:** [Part 19 — Testing](19-testing.md)
