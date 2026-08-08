# Flutter Study Notes — Part 15

## Forms & Validation ⭐⭐⭐☆☆

**Topics:** `Form` + `GlobalKey<FormState>` · `TextFormField`/`validator` · `FormState` methods · `TextEditingController` disposal · `FocusNode` · cross-field & debounced async validation.

---

## 1. `Form` + `GlobalKey<FormState>`

> **Definition:** `Form` is a container widget that groups multiple `FormField`-based widgets (`TextFormField`, etc.) so they can be validated/saved/reset together as one unit, coordinated via a `GlobalKey<FormState>` — the legitimate, textbook use case for `GlobalKey` flagged in [Part 05](05-keys.md#3-globalkey).

```dart
class _SignupFormState extends State<SignupForm> {
  final _formKey = GlobalKey<FormState>(); // held stably as a field — NOT recreated per build

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(children: [
        TextFormField(validator: (value) => value!.isEmpty ? 'Required' : null),
        ElevatedButton(
          onPressed: () {
            if (_formKey.currentState!.validate()) { /* all fields passed */ }
          },
          child: const Text('Submit'),
        ),
      ]),
    );
  }
}
```

## 2. `TextFormField` and `validator`

> **Definition:** `TextFormField` wraps a `TextField` with `FormField` integration — its `validator` callback receives the field's current value and returns an error message `String` (shown beneath the field) or `null` (valid).

```dart
TextFormField(
  decoration: const InputDecoration(labelText: 'Email'),
  validator: (value) {
    if (value == null || value.isEmpty) return 'Email is required';
    if (!value.contains('@')) return 'Enter a valid email';
    return null; // null = valid
  },
);
```

## 3. `FormState.validate()` / `.save()` / `.reset()`

> **Definition:** `validate()` runs **every** child field's `validator` and returns `true` only if all pass, additionally triggering each field to visually display its error message if invalid — this is what actually cascades a single "check the whole form" call down to every individual field.

```dart
if (_formKey.currentState!.validate()) {
  _formKey.currentState!.save();  // triggers each field's onSaved callback, if provided
}
_formKey.currentState!.reset();     // clears all fields back to their initial values/state
```
**How `Form`/`GlobalKey<FormState>` cascades a single `validate()` call down to every child field:** each `TextFormField` registers itself with the enclosing `Form` via `Form.of(context)` (an `InheritedWidget`-based lookup, same [Part 07](07-inheritedwidget-and-inheritedmodel.md) mechanism) when it's built. Calling `validate()` on the `FormState` walks its list of registered field states and calls each one's own `validate()` in turn, aggregating the overall result — the `GlobalKey` is what gives code *outside* the `Form`'s own `build()` (e.g. a submit button's `onPressed`) a handle to trigger this cascade.

## 4. `TextEditingController` and Its Manual Disposal

> **Definition:** a `TextEditingController` holds a `TextField`/`TextFormField`'s current text value and selection, and can be read/modified imperatively (`controller.text`, `controller.clear()`) — it must be explicitly disposed, same as any resource-holding object, following [Part 02's lifecycle discipline](02-stateless-vs-stateful-and-lifecycle.md#4-what-belongs-in-initstate-vs-build).

```dart
class _MyFormState extends State<MyForm> {
  late final TextEditingController _emailController;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController();
  }

  @override
  void dispose() {
    _emailController.dispose(); // MUST dispose — leaks listeners/native text-editing resources otherwise
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextFormField(controller: _emailController);
  }
}
```
**What leaks if you forget:** a `TextEditingController` internally maintains a `ChangeNotifier`-style listener list and holds onto platform text-input-related resources — an undisposed controller keeps those alive indefinitely after the widget is gone, the same category of leak as [an uncancelled `StreamSubscription`](../dart/10-streams.md#6-streamsubscription-and-cancellation) or an undisposed `AnimationController` ([Part 17](17-animations.md)).

## 5. `FocusNode` and Manual Focus Management

> **Definition:** a `FocusNode` represents a widget's ability to hold keyboard focus — used to programmatically move focus between fields (e.g. auto-advancing to the next field on submit), and, like `TextEditingController`, must be disposed manually.

```dart
final _emailFocus = FocusNode();
final _passwordFocus = FocusNode();
// ...
TextFormField(
  focusNode: _emailFocus,
  textInputAction: TextInputAction.next,
  onFieldSubmitted: (_) => FocusScope.of(context).requestFocus(_passwordFocus), // advance focus
);
```

## 6. Cross-Field Validation

> **Definition:** validating one field's value against another's — e.g. a "confirm password" field checked against the original password field — requires access to both fields' current values at validation time, typically via their `TextEditingController`s rather than each field's isolated `validator` callback alone.

```dart
TextFormField(
  controller: _confirmPasswordController,
  validator: (value) {
    if (value != _passwordController.text) return 'Passwords do not match'; // reads a SIBLING
    return null;                                                                 // field's controller
  },
);
```

## 7. Debounced Async Validation

> **Definition:** validating against a remote check (e.g. "is this username available?") on every keystroke would fire a network request per character — debouncing (same [debounce pattern as the JS/Dart tracks](../javascript/18-advanced-functional-patterns.md#1-debounce--with-leadingtrailing-options)) waits for a pause in typing before firing the check, mirroring [Angular's own async-validator debouncing pattern](../Angular/15-forms.md).

```dart
Timer? _debounce;
void _onUsernameChanged(String value) {
  _debounce?.cancel();
  _debounce = Timer(const Duration(milliseconds: 500), () async {
    final isAvailable = await checkUsernameAvailability(value);
    setState(() => _usernameError = isAvailable ? null : 'Username taken');
  });
}
```

---

## Interview Q&A

**Q: Why does `TextEditingController` need manual disposal, and what leaks if you forget?**
> It internally maintains a listener list and holds platform text-editing-related resources — forgetting to dispose it leaves those alive indefinitely after the widget using it has been removed from the tree, the same category of leak as an uncancelled stream subscription or an undisposed `AnimationController`. It follows the exact same "anything acquired in `initState`, released in `dispose`" discipline as any other resource-holding object in Flutter.

**Q: How does `Form`/`GlobalKey<FormState>` cascade a single `validate()` call down to every child `TextFormField`?**
> Each `TextFormField` registers itself with its enclosing `Form` (via an `InheritedWidget`-based lookup) when built. The `GlobalKey<FormState>` gives external code — like a submit button's `onPressed`, outside the `Form`'s own `build()` — a handle to call `validate()` on the `FormState`, which then walks its registered list of field states and invokes each one's own validation in turn, aggregating whether all of them passed.

**Q: Why would you need a field's `TextEditingController` for cross-field validation instead of just its `validator` callback?**
> A field's `validator` only receives *that* field's own current value as its argument — it has no direct access to a sibling field's value. Cross-field validation (like confirming two password fields match) needs to compare against another field's current value, which requires reading that other field's `TextEditingController.text` directly, rather than relying on the isolated single-value `validator` signature alone.

---

## Follow-ups (challenge questions)

- *Failure mode:* a form has 8 `TextEditingController`s declared as fields but only half of them are actually disposed in `dispose()` (an easy oversight when a form grows over time) — walk through how this specific kind of partial leak would actually show up in a memory profiler across many form-screen visits, and why it's easy to miss in code review since the form still "works" correctly from a functional standpoint.
- *Consistency:* a debounced async username-availability check is in flight when the user submits the form anyway (tapping submit before the debounce timer fires) — walk through the race: does the form's synchronous `validate()` know about the still-pending async check's eventual result, and how would you prevent a form submission while an async validation is genuinely still unresolved?
- *Scale:* a form with 20 fields validates all of them synchronously and instantly on every keystroke in any single field (each field's `validator` re-runs on every `Form` rebuild) — what's the actual performance concern here for a form with expensive validators (e.g. regex-heavy ones), and how would `autovalidateMode` settings change when validation actually runs?

---

**Previous:** [Part 14 — FutureBuilder & StreamBuilder](14-futurebuilder-and-streambuilder.md) · **Next:** [Part 16 — Performance Optimization](16-performance-optimization.md)
