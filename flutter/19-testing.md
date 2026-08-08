# Flutter Study Notes — Part 19

## Testing ⭐⭐⭐☆☆

**Topics:** the three-tier testing pyramid · unit tests · widget tests (`WidgetTester`) · integration tests · mocking · golden tests · testing state management.

---

## 1. The Testing Pyramid, Flutter-Specific

> **Definition:** three tiers, increasing in realism and cost — **unit tests** (pure Dart logic, no widgets, fastest, most numerous), **widget tests** (`WidgetTester`, a simulated widget tree, no real device needed, moderate cost), **integration tests** (`integration_test` package, a real device/emulator, full user flows end-to-end, slowest, fewest).

```
        /\
       /  \      integration tests — few, slow, highest confidence, real device
      /----\
     /      \    widget tests — moderate count, simulated tree, no real device
    /--------\
   /          \  unit tests — many, fast, pure Dart logic only
  /____________\
```

## 2. Unit Tests

Covered in depth in [Dart Part 16](../dart/16-testing-in-dart.md) — pure Dart logic, the `test` package, no Flutter dependency at all. Not duplicated here; the key Flutter-specific point is that **business logic extracted into plain Dart classes/BLoCs/Cubits/ViewModels** is what makes this tier possible at all for anything beyond trivial widgets — see [Part 20 — App Architecture](20-app-architecture.md).

## 3. Widget Tests

> **Definition:** uses `flutter_test`'s `testWidgets()` and `WidgetTester` to build an actual (simulated, headless) widget tree, interact with it (`tester.tap()`, `tester.enterText()`), advance frames (`tester.pump()`), and assert on rendered output (`find.byType()`, `find.text()`) — verifies real widget behavior without needing an actual device/emulator.

```dart
testWidgets('tapping + increments the counter', (WidgetTester tester) async {
  await tester.pumpWidget(const MyApp());                 // builds the widget tree
  expect(find.text('0'), findsOneWidget);                     // asserts initial state

  await tester.tap(find.byIcon(Icons.add));                     // simulates a tap
  await tester.pump();                                             // rebuilds after the tap's setState

  expect(find.text('1'), findsOneWidget);                            // asserts the resulting state
});
```
**`tester.pump()` vs `tester.pumpAndSettle()`:** `pump()` advances exactly one frame — necessary after triggering a state change, but insufficient for something mid-animation. `pumpAndSettle()` repeatedly pumps until no more frames are scheduled (an animation has fully finished) — necessary when testing UI that involves an animated transition, but it will hang/time out if something schedules frames indefinitely (an infinite animation), which is itself a useful diagnostic signal.

## 4. Integration Tests

> **Definition:** the `integration_test` package runs the actual, real, compiled app on a real device or emulator, driving it through complete user flows exactly as a real user would — the highest-fidelity tier, but also the slowest and most expensive to run, typically reserved for critical end-to-end paths (login, checkout) rather than exhaustive coverage.

```dart
// runs on a REAL device/emulator, the full compiled app
testWidgets('complete login flow', (WidgetTester tester) async {
  app.main(); // launches the ACTUAL app
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('email')), 'test@example.com');
  await tester.enterText(find.byKey(const Key('password')), 'password123');
  await tester.tap(find.byKey(const Key('login-button')));
  await tester.pumpAndSettle();
  expect(find.text('Welcome'), findsOneWidget); // verifies the ACTUAL end-to-end flow worked
});
```

## 5. Mocking Dependencies

Covered in depth in [Dart Part 16 §4](../dart/16-testing-in-dart.md#4-mocking-with-mockitomocktail) — the same `mockito`/`mocktail` approach applies identically for widget tests, typically substituting a fake repository/service so a widget test doesn't hit a real network.

## 6. Golden Tests

> **Definition:** a golden test renders a widget and compares the resulting **pixel output** against a previously-saved reference image (the "golden" file) — catches visual regressions (a layout shift, a color change, a font-rendering difference) that a normal widget test's `find.text()`-style assertions would completely miss, since those only check for the *presence* of content, not its actual visual appearance.

```dart
testWidgets('ProfileCard matches golden file', (WidgetTester tester) async {
  await tester.pumpWidget(const MaterialApp(home: ProfileCard(name: 'V', avatarUrl: '...')));
  await expectLater(find.byType(ProfileCard), matchesGoldenFile('profile_card.png'));
});
// flutter test --update-goldens   regenerates the reference image after an INTENTIONAL visual change
```
**What a golden test catches that a normal widget test wouldn't:** a normal widget test can confirm "the text 'V' is present somewhere in the tree" without ever checking *how* it's actually rendered — a golden test would catch a regression where that text suddenly renders in the wrong color, wrong font size, or with broken layout/overflow, none of which a `find.text()`-style assertion is sensitive to at all.

## 7. Testing State Management

> **Definition:** BLoC/Cubit's `bloc_test` package (referenced in [Part 10](10-bloc-and-cubit.md#5-why-bloc-makes-business-logic-trivially-testable)) and Riverpod's `ProviderContainer` both let you test state-management logic in complete isolation from any widget tree — asserting on the exact sequence of emitted states/provider values directly.

```dart
// Riverpod — ProviderContainer, no widget tree
test('counterProvider increments correctly', () {
  final container = ProviderContainer();
  addTearDown(container.dispose); // MUST dispose, same discipline as any resource
  expect(container.read(counterProvider), 0);
  container.read(counterProvider.notifier).state++;
  expect(container.read(counterProvider), 1);
});
```

---

## Interview Q&A

**Q: The three testing tiers — what does each actually verify, and what doesn't it verify?**
> Unit tests verify pure Dart logic in complete isolation — fast, but say nothing about whether the UI actually renders or responds to interaction correctly. Widget tests verify a widget's behavior and rendered output in a simulated tree — real UI logic verification, but without a real device/platform, so platform-specific behavior isn't covered. Integration tests verify complete, real user flows on an actual device/emulator — the highest confidence, but slow and expensive, so reserved for critical paths rather than exhaustive coverage.

**Q: What does a golden test catch that a normal widget test wouldn't?**
> A normal widget test's assertions (`find.text()`, `find.byType()`) only confirm the *presence* of expected content in the tree — they say nothing about actual visual appearance. A golden test compares the rendered pixel output against a saved reference image, catching regressions like a broken layout, wrong color, or overflow that would be invisible to a presence-only assertion but immediately visible to a user.

**Q: How would you test a `Cubit`/`Bloc` in isolation, without a widget tree?**
> Using `bloc_test`'s `blocTest()` (or manually constructing the Cubit/Bloc directly, since it's plain Dart), dispatch events or call methods, and assert on the exact ordered sequence of states it emits — no `pumpWidget`, no simulated rendering, entirely decoupled from any widget concern, which is exactly the testability payoff of BLoC's architecture discussed in Part 10.

---

## Follow-ups (challenge questions)

- *Scale:* a team's widget-test suite takes 15 minutes to run because a large fraction of tests exercise business logic indirectly through full widget interaction (tapping buttons, entering text) rather than testing that logic directly as unit tests — connect this back to the "extract logic into pure Dart classes" argument from [Dart Part 16](../dart/16-testing-in-dart.md) and reason through the actual speed difference achievable by moving that coverage down a tier.
- *Failure mode:* a golden test fails after a completely unrelated Flutter SDK upgrade changed default font rendering/anti-aliasing very slightly, with no actual code change on the team's part — walk through why golden tests can be more brittle across platform/SDK-version differences than logic-based assertions, and how teams typically manage that (platform-specific goldens, tolerance thresholds).
- *Consistency:* a widget test mocks a repository to always return successful, instant data — the real production repository can be slow or occasionally fail. What class of bug does this specific test suite structurally fail to catch, and where would that gap need to be covered instead (a slower-but-higher-fidelity integration test, or a dedicated failure-path widget test with a mock configured to actually fail)?

---

**Previous:** [Part 18 — Platform Channels & Native Integration](18-platform-channels-and-native-integration.md) · **Next:** [Part 20 — App Architecture](20-app-architecture.md)
