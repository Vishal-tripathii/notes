# Flutter Study Notes — Part 13

## Networking & JSON Serialization ⭐⭐⭐⭐☆

**Topics:** `http` vs `dio` · manual vs code-generated JSON serialization · error handling for network vs non-2xx failures · the repository pattern.

---

## 1. `http` Package vs `dio`

> **Definition — `http`:** the official, minimal Dart package for making HTTP requests — a thin, low-level wrapper.
> **Definition — `dio`:** a popular third-party HTTP client with substantially more built-in functionality — **interceptors** (transform every request/response centrally, e.g. attaching an auth header), **cancellation tokens** (abort an in-flight request), and generally friendlier error handling with more structured exception types.

```dart
// http — minimal
final response = await http.get(Uri.parse('https://api.example.com/users'));
if (response.statusCode == 200) {
  final data = jsonDecode(response.body);
}

// dio — interceptors, the actual value-add over http
final dio = Dio();
dio.interceptors.add(InterceptorsWrapper(
  onRequest: (options, handler) {
    options.headers['Authorization'] = 'Bearer $token'; // applied to EVERY request automatically,
    handler.next(options);                                   // centrally — no repeating this per call site
  },
  onError: (error, handler) {
    if (error.response?.statusCode == 401) { /* trigger token refresh */ }
    handler.next(error);
  },
));

final cancelToken = CancelToken();
dio.get('/search', queryParameters: {'q': query}, cancelToken: cancelToken);
cancelToken.cancel(); // abort the in-flight request — no direct equivalent in plain http
```
**`dio`'s actual value-add, precisely:** interceptors solve the exact same "attach an auth header/log/handle errors in exactly one place instead of at every single call site" problem [Angular's `HttpInterceptor`](../Angular/13-httpclient-and-interceptors.md) solves — without it, every individual `http.get()` call site would need to manually attach auth headers and duplicate error-handling logic. Cancellation tokens solve the same problem [`AbortController` solves in JS](../javascript/20-browser-apis.md#4-abortcontroller) — cancelling a stale in-flight request (e.g. a superseded search-as-you-type call).

## 2. Manual vs Code-Generated JSON Serialization

> **Definition:** manually writing `fromJson`/`toJson` methods on every model class works for a handful of simple models, but doesn't scale — code generation (`json_serializable`, or `freezed` which additionally generates immutable data classes with `copyWith`/equality) produces this boilerplate automatically from annotated class definitions, run via `build_runner`.

```dart
// manual — fine for one or two simple models, painful at scale
class User {
  final String id;
  final String name;
  User({required this.id, required this.name});
  factory User.fromJson(Map<String, dynamic> json) => User(id: json['id'], name: json['name']);
  // — every field needs its own line here, every model needs this repeated, and a forgotten
  //   field or a typo'd JSON key is a RUNTIME bug, not caught until that field is actually missing

  Map<String, dynamic> toJson() => {'id': id, 'name': name};
}

// code-generated (json_serializable) — the annotated class, source of truth
@JsonSerializable()
class User {
  final String id;
  final String name;
  User({required this.id, required this.name});
  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json); // GENERATED function
  Map<String, dynamic> toJson() => _$UserToJson(this);                          // GENERATED function
}
```
**Why hand-writing doesn't scale, precisely:** for a real app with dozens of models, each with several fields, hand-written `fromJson`/`toJson` is a meaningful volume of repetitive, error-prone code — a missing field, a typo'd JSON key string, or a forgotten null check is easy to introduce and often only surfaces as a runtime crash/silently-wrong-data bug when that specific field is actually exercised, rather than being caught earlier. Generated code is produced mechanically from the class's own field declarations, eliminating that entire class of hand-transcription error.

## 3. Error Handling — Network Failure vs Non-2xx Response

> **Definition:** same fundamental gotcha as [JS's `fetch` not rejecting on a 404](../javascript/20-browser-apis.md#3-fetch-vs-xmlhttprequest) — a **network failure** (no connection, DNS failure, timeout) is one distinct failure mode; a **non-2xx HTTP response** (a 404, 500, etc. that the server successfully returned) is a completely different one, and conflating them is a real, common bug.

```dart
// http — does NOT throw on a 404/500, you must check statusCode yourself
try {
  final response = await http.get(Uri.parse(url)); // only throws on genuine network failure
  if (response.statusCode != 200) {
    throw HttpException('Server returned ${response.statusCode}'); // YOU must raise this yourself
  }
} on SocketException {
  // genuine network failure — no connection at all
} on HttpException {
  // non-2xx response, handled explicitly above
}

// dio — DOES throw a DioException for non-2xx by default, a friendlier default than plain http
try {
  final response = await dio.get(url);
} on DioException catch (e) {
  if (e.type == DioExceptionType.connectionError) { /* network failure */ }
  if (e.response?.statusCode == 404) { /* non-2xx, dio already threw for you */ }
}
```

## 4. The Repository Pattern

> **Definition:** a layer that sits between the rest of the app and the actual data source (an HTTP client, a local database, a cache) — exposing a clean, data-source-agnostic API (`Future<User> getUser(String id)`) so the rest of the app never directly depends on *how* that data is fetched, only *that* it can be fetched.

```dart
abstract class UserRepository {
  Future<User> getUser(String id);
}

class ApiUserRepository implements UserRepository {
  final Dio _dio;
  ApiUserRepository(this._dio);
  @override
  Future<User> getUser(String id) async {
    final response = await _dio.get('/users/$id');
    return User.fromJson(response.data);
  }
}
// a test, or a future caching layer, or an offline-first version, can swap in a
// DIFFERENT UserRepository implementation WITHOUT any calling code changing at all
```
**What the repository pattern actually decouples, concretely:** the rest of the app (widgets, BLoCs/Cubits, ViewModels — [Part 20](20-app-architecture.md)) depends only on the abstract `UserRepository` interface, never on `Dio`/`http`/a specific database directly. This means the actual data source can change (switching HTTP clients, adding a caching layer, going fully offline-first with a local database) without touching any of the code that *consumes* user data — and it makes testing trivial, since a test can inject a fake `UserRepository` with canned responses instead of needing to mock the underlying HTTP client's exact call signatures.

---

## Interview Q&A

**Q: Why doesn't hand-written JSON parsing scale, and what do `json_serializable`/`freezed` actually generate for you?**
> Hand-writing `fromJson`/`toJson` for every model is repetitive and error-prone at any real scale — a missing field or a typo'd JSON key string is easy to introduce and typically only surfaces as a runtime bug when that specific field is exercised. `json_serializable` generates the `fromJson`/`toJson` implementations mechanically from a class's own annotated field declarations via `build_runner`; `freezed` additionally generates a fully immutable data class with `copyWith`, structural equality, and a `toString`, on top of the same JSON generation.

**Q: What's the repository pattern's job, concretely — what does it decouple the rest of the app from?**
> It decouples the rest of the app from *how* data is actually fetched — the specific HTTP client, database, or caching strategy in use — by exposing a clean, data-source-agnostic interface. Consuming code depends only on that interface, so the underlying data source can change entirely (switching HTTP libraries, adding caching, going offline-first) without touching any calling code, and tests can substitute a fake implementation instead of mocking HTTP call signatures directly.

**Q: Does `http.get()` throw an exception for a 404 response?**
> No — same gotcha as JavaScript's `fetch`. The plain `http` package only throws on a genuine network-level failure (no connection, DNS failure); a successfully-received 404 or 500 response is still a "successful" HTTP call as far as the package is concerned, and you must check `response.statusCode` yourself and raise your own exception if it's not in the success range. `dio`, by contrast, throws a `DioException` for non-2xx responses by default, which is a friendlier baseline behavior.

---

## Follow-ups (challenge questions)

- *Failure mode:* a repository's `getUser` method uses plain `http` and only handles the "success" path (`statusCode == 200`), with no explicit handling for other status codes — walk through what actually happens (and what exception, if any, propagates up) when the server returns a 500, versus what happens on a genuine network failure like the device being offline.
- *Scale:* an app repository layer has zero caching — every screen visit re-fetches the same rarely-changing data (e.g. a user's profile) from the network. Where would a caching layer fit into the repository pattern shown above without changing any calling code, and what's the actual trade-off of caching (staleness risk) versus always fetching fresh?
- *Consistency:* two different screens both call `dio.get('/users/123')` around the same time (e.g. both mounting simultaneously) — does this result in two separate, duplicate network requests, and how would you design the repository layer to deduplicate concurrent requests for the same resource?

---

**Previous:** [Part 12 — Navigation & Routing](12-navigation-and-routing.md) · **Next:** [Part 14 — FutureBuilder & StreamBuilder](14-futurebuilder-and-streambuilder.md)
