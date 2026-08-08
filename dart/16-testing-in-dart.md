# Dart Study Notes — Part 16

## Testing in Dart ⭐⭐⭐☆☆

**Topics:** the `test` package · `expect()` and matchers · testing async code · mocking (`mockito`/`mocktail`) · pure-Dart unit tests vs Flutter widget tests.

---

## 1. The `test` Package — `test()`, `group()`, `setUp`/`tearDown`

> **Definition:** `test(description, body)` declares a single test case. `group(description, body)` organizes related tests together (and can nest). `setUp`/`tearDown` run before/after **every** test in their enclosing group — the shared-fixture pattern for avoiding repeated boilerplate.

```dart
import 'package:test/test.dart';

void main() {
  group('Calculator', () {
    late Calculator calculator;

    setUp(() { calculator = Calculator(); }); // fresh instance before EACH test — avoids
                                                  // one test's leftover state leaking into another
    tearDown(() { calculator.dispose(); });

    test('adds two numbers', () {
      expect(calculator.add(2, 3), equals(5));
    });

    test('throws on division by zero', () {
      expect(() => calculator.divide(5, 0), throwsA(isA<ArgumentError>()));
    });
  });
}
```

## 2. `expect()` and Matchers

> **Definition:** `expect(actual, matcher)` asserts a value meets some condition — `matcher` can be a plain value (implicit equality), or one of many composable matcher functions (`equals`, `isA<T>()`, `throwsA(...)`, `contains`, `isNull`, `greaterThan`, etc.) for more expressive assertions than raw equality alone.

```dart
expect(5, equals(5));
expect([1, 2, 3], contains(2));
expect('hello world', contains('world'));
expect(null, isNull);
expect(() => throw Exception('x'), throwsException);
expect(3.14159, closeTo(3.14, 0.01)); // approximate equality — useful for floating point
```

## 3. Testing Async Code

> **Definition:** `test()` bodies can themselves be `async`, and `expect()` has async-aware variants (`expectLater`) for asserting against a `Future` or `Stream` rather than an already-resolved value.

```dart
test('fetchUser returns expected data', () async {
  final user = await fetchUser('123'); // await directly inside the test body
  expect(user.name, equals('V'));
});

test('stream emits expected sequence', () {
  final stream = countStream(3);
  expect(stream, emitsInOrder([1, 2, 3, emitsDone])); // asserts the exact sequence a Stream emits
});
```

## 4. Mocking with `mockito`/`mocktail`

> **Definition:** a mock is a fake, controllable stand-in for a real dependency (an API client, a database), letting a test verify behavior in isolation without hitting the real network/disk — `mockito` uses code generation (or manual subclassing) to create mocks; `mocktail` achieves the same without any code generation step, at the cost of slightly less compile-time safety on stubbed calls.

```dart
class MockApiClient extends Mock implements ApiClient {}

test('UserRepository returns parsed user from API', () async {
  final mockClient = MockApiClient();
  when(() => mockClient.get('/user/1'))
      .thenAnswer((_) async => {'id': '1', 'name': 'V'}); // stub the fake response

  final repository = UserRepository(mockClient);
  final user = await repository.getUser('1');

  expect(user.name, equals('V'));
  verify(() => mockClient.get('/user/1')).called(1); // assert the dependency was actually called
});
```

## 5. Pure-Dart Unit Test vs Flutter Widget Test

> **Definition:** a **unit test** exercises pure Dart logic (a class, a function) with no widget tree or rendering involved at all — fast, no Flutter test framework needed, just the plain `test` package. A **widget test** (`flutter_test`'s `testWidgets`) actually builds and interacts with a widget tree in a simulated environment — slower, but verifies real UI behavior. Full depth on the widget/integration test tiers is [flutter Part 19](../flutter/19-testing.md), not duplicated here — the boundary worth internalizing now: **business logic belongs in classes with pure-Dart unit tests**, keeping the Flutter-dependent widget test surface as small and fast as possible.

```dart
// pure-Dart unit test — no Flutter dependency, fast
test('OrderCalculator computes total with tax', () {
  final calculator = OrderCalculator(taxRate: 0.08);
  expect(calculator.total(100), closeTo(108.0, 0.01));
});

// (contrast, covered fully in flutter Part 19) a widget test would instead build an actual
// widget tree and assert on RENDERED output — a fundamentally heavier kind of test
```

---

## Interview Q&A

**Q: What do `setUp`/`tearDown` actually solve, and why run before/after *every* test rather than once per group?**
> They eliminate repeated fixture-creation boilerplate across tests while guaranteeing test isolation — running before/after every individual test (not just once for the whole group) ensures one test's leftover state can never leak into and silently affect the next test's outcome, which would make failures hard to reproduce and dependent on test execution order.

**Q: How would you test a class with an async dependency without hitting the real network?**
> Inject the dependency (an API client) rather than constructing it internally, then substitute a mock in the test that stubs the specific calls the code under test will make, returning controlled fake data instead of making a real network request. This lets the test run fast, deterministically, and offline, while still verifying the class under test correctly calls and reacts to its dependency.

**Q: Why should business logic live in plain Dart classes rather than directly inside widget code, from a testing perspective?**
> Pure-Dart classes can be unit tested with the lightweight `test` package alone — no widget tree, no simulated rendering environment, dramatically faster and simpler than a widget test. Business logic embedded directly in widget `build()` methods or `State` classes can only be verified via the heavier widget-testing machinery, which is slower to run and harder to isolate from rendering concerns entirely unrelated to the logic actually being tested.

---

## Follow-ups (challenge questions)

- *Scale:* a test suite of 2,000 tests takes 20 minutes to run because a large fraction are widget tests exercising business logic that has nothing to do with rendering — what's the actual argument for extracting that logic into plain Dart classes purely for the test-suite speed benefit, beyond "it's good practice"?
- *Consistency:* a mocked dependency is stubbed to always return success, but the real dependency occasionally times out or returns malformed data in production — what class of bug does over-mocking risk hiding, and how would you decide which interactions deserve an integration test against something closer to the real dependency instead?

---

**Previous:** [Part 15 — Packages, pubspec.yaml & Tooling](15-packages-pubspec-and-tooling.md) · **Back to:** [00 — Roadmap](00-ROADMAP.md)
