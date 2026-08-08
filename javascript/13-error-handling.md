# JavaScript Study Notes — Part 13

## Error Handling ⭐⭐⭐☆☆

**Topics:** `try`/`catch`/`finally` · `throw` · custom `Error` subclasses · catching async errors.

---

## 1. `try`/`catch`/`finally`

> **Definition:** `try` wraps a block of code to be monitored for exceptions; `catch(err)` runs if an exception is thrown anywhere inside the `try` block, receiving the thrown value; `finally` runs **unconditionally** after `try`/`catch`, whether an exception occurred or not, and even if `try`/`catch` contains a `return`.

```js
try {
  JSON.parse('{invalid json');
} catch (err) {
  console.error('Parse failed:', err.message);
} finally {
  console.log('cleanup runs either way');
}
```

## 2. `throw`

> **Definition:** the `throw` statement immediately halts normal execution and hands a value up to the nearest enclosing `catch` — JS places no restriction on what can be thrown, though throwing anything other than an `Error` instance is considered bad practice.

```js
throw new Error('Something broke');   // idiomatic — carries a message, a stack trace
throw 'a plain string';                  // legal, but loses .stack, .name, and confuses catch blocks
                                             // that assume err.message exists
```
**Why you shouldn't throw non-`Error` values:** an `Error` object captures a stack trace at the point of `throw`, has a consistent `.message`/`.name` shape, and is what every logging/monitoring tool expects. Throwing a plain string or object means anything catching it has to guess at its shape, and you lose the stack trace entirely.

## 3. Custom `Error` Subclasses

> **Definition:** a class that `extends Error`, inheriting `.message`/`.stack`, typically adding a distinguishing `.name` and extra structured fields — used so calling code can distinguish error *types* (e.g. with `instanceof` or `error.name`) rather than parsing message strings.

```js
class ValidationError extends Error {
  constructor(message, field) {
    super(message);              // sets this.message, captures the stack trace
    this.name = 'ValidationError'; // overrides the default 'Error' name
    this.field = field;             // extra structured data specific to this error type
  }
}

function validateAge(age) {
  if (age < 0) throw new ValidationError('Age cannot be negative', 'age');
}

try {
  validateAge(-5);
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(`Validation failed on ${err.field}: ${err.message}`);
  } else {
    throw err; // re-throw anything we don't specifically know how to handle
  }
}
```

## 4. Catching Async Errors

> **Definition:** a synchronous `try`/`catch` only intercepts exceptions thrown **synchronously** within its block — it cannot catch a promise's rejection unless that promise is actually `await`ed inside the `try`, because a rejection happens on a later microtask turn, after the `try` block has already finished running.

```js
// BROKEN — catches nothing
function fetchDataBroken() {
  try {
    fetchData(); // returns a promise, doesn't await it
  } catch (err) {
    console.log('never runs'); // fetchData rejecting happens LATER, try already exited
  }
}

// CORRECT — await inside try
async function fetchDataFixed() {
  try {
    await fetchData(); // now a rejection becomes a synchronous-looking throw HERE
  } catch (err) {
    console.log('caught:', err.message); // this actually runs
  }
}

// CORRECT (promise-chain style) — .catch() instead of try/catch
function fetchDataPromiseStyle() {
  fetchData().catch(err => console.log('caught:', err.message));
}
```

---

## Interview Q&A

**Q: Why shouldn't you throw a plain string or object?**
> `Error` instances capture a stack trace at the throw site and have a predictable shape (`.message`, `.name`, `.stack`) that logging/monitoring tools and calling code expect. Throwing a bare string loses the stack trace and forces every catch site to guess at what it received.

**Q: Why does `try { fetchData(); } catch(err) {}` (without `await`) catch nothing?**
> Because `try`/`catch` only catches synchronous exceptions. `fetchData()` returns immediately with a pending promise — the `try` block finishes executing before the promise ever settles. The eventual rejection happens on a microtask turn well after `catch` has already been "exited," so it becomes an unhandled rejection instead of being caught.

**Q: Why build a custom `Error` subclass instead of just throwing `new Error('...')` everywhere?**
> It lets calling code distinguish error *types* programmatically — `err instanceof ValidationError` — instead of fragile string-matching on `.message`. It also lets you attach structured extra data (like which field failed validation) that a plain `Error` has no place for.

**Q: Predict:**
```js
function test() {
  try {
    return 'try';
  } finally {
    console.log('finally runs');
  }
}
console.log(test());
```
> `finally runs`, then `try` — `finally` always runs before the function actually returns, even though a `return` was already "in flight" inside the `try` block; it just can't stop that return from eventually happening (unless `finally` itself returns/throws, which would override it).

---

## Follow-ups (challenge questions)

- *Failure mode:* an Express-style route handler is `async` and throws inside it without a surrounding `try`/`catch` — does the request hang, crash the process, or send an error response? Depends on the framework — what's the actual mechanism, and why do many frameworks need an explicit async-error-catching wrapper?
- *Consistency:* two different subsystems each define their own `NotFoundError` class with the same name but different modules — `instanceof` checks across module boundaries (e.g. after a bundler duplicates a dependency) can silently fail. What's a more robust check than `instanceof` for that scenario?
- *Observability:* a custom `Error` subclass swallows the original error by not passing it to `super()` or attaching it anywhere — what breaks in production debugging when the *real* underlying cause never reaches your logs?

---

**Previous:** [Part 12 — async/await](12-async-await.md) · **Next:** [Part 14 — Generators & Iterators](14-generators-and-iterators.md)
