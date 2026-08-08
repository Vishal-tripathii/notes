# JavaScript Study Notes — Part 02

## Functions ⭐⭐⭐⭐⭐

**Topics:** Declaration vs Expression · Arrow Functions · IIFE · Higher-Order Functions · Callbacks · Pure Functions · Rest/Spread in params. (`this` inside functions is deferred to [Part 03](03-this-call-apply-bind.md).)

---

## 1. Declaration vs Expression

> **Definition:** a **function declaration** (`function foo(){}`) is a standalone statement that defines a named function and is hoisted in full. A **function expression** (`const foo = function(){}`) defines a function as part of a larger expression, assigned to a variable, and is not itself hoisted with the rest of the assignment.

```js
sayHi(); function sayHi() { console.log('hi'); }         // works — full hoisting
sayBye(); var sayBye = function () { console.log('bye'); }; // TypeError: not a function
```
Declaration hoists with its full body; expression only hoists the `var`/`let` binding, not the function itself.

## 2. Arrow Functions

> **Definition:** a compact function syntax (`(...) => ...`) that lexically binds `this`, `arguments`, and `super` from its enclosing scope instead of defining its own, and cannot be used as a constructor.

```js
const add = (a, b) => a + b;
const makeObj = () => ({ x: 1 }); // MUST wrap in () — bare {} parses as a function BODY
```
Real differences from regular functions (full `this` depth in [Part 03](03-this-call-apply-bind.md)):
- No own `this` — lexically inherits from enclosing scope at definition time.
- No `arguments` object — use rest params.
- Can't be used with `new` — throws `TypeError`.
- No `.prototype`; can't be a generator.

## 3. IIFE

> **Definition:** an Immediately Invoked Function Expression — a function expression that is defined and executed in the same statement, creating an isolated scope that runs exactly once.

```js
(function () { console.log('runs once, immediately'); })();
```
`()` forces the parser to treat `function` as an expression. Historically used to avoid polluting global scope pre-ES-modules/block-scope — now mostly seen in the [module pattern](01-scope-and-closures.md#4-the-module-pattern) and bundler output.

## 4. Higher-Order Functions & Callbacks

> **Definition — Higher-Order Function:** a function that takes one or more functions as arguments, returns a function, or both.
> **Definition — Callback:** a function passed as an argument to another function, to be invoked by that function at a later point, synchronously or asynchronously.

A function is higher-order if it takes a function, returns a function, or both (`map`, `debounce`, `compose`, `addEventListener`). A callback is just a function passed in to be invoked later, sync (`array.map(fn)`) or async (`setTimeout(fn, 1000)`). Deeply nested async callbacks ("callback hell") is the historical motivation for Promises ([Part 11](11-promises.md)).

```js
function withLogging(fn) {
  return (...args) => { console.log('calling with', args); return fn(...args); };
}
```

## 5. Pure Functions

> **Definition:** a function that, given the same input, always returns the same output, and produces no observable side effects — it doesn't mutate external state or depend on anything outside its own arguments.

Same input → always same output, **and** no side effects (no mutation, no I/O, no dependency on external state).

```js
// impure — mutates caller's array, depends on external taxRate
let taxRate = 0.1;
function addTax(price, cart) { cart.push(price * taxRate); return price * (1 + taxRate); }
// pure
function addTaxPure(price, rate) { return price * (1 + rate); }
```
Why it matters: trivially testable (no mocking), safely memoizable, order-independent — the whole premise behind Redux/NgRx-style reducers.

## 6. Rest & Spread in Parameters

> **Definition — Rest parameter:** `...` syntax in a function's parameter list that collects any remaining arguments into a single real `Array`.
> **Definition — Spread (in a call):** `...` syntax that expands an iterable into individual arguments at a function call site.

```js
function sum(...nums) { return nums.reduce((a, b) => a + b, 0); } // REST → real Array
multiply(...[2, 3, 4]);                                              // SPREAD → expands into args
```
`...rest` must be the last parameter.

## Hands-on — first pass (polished versions in [Part 18](18-advanced-functional-patterns.md))

```js
const compose = (...fns) => (x) => fns.reduceRight((acc, fn) => fn(acc), x); // right-to-left
const pipe    = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);       // left-to-right

const curry = (fn) => function curried(...args) {
  return args.length >= fn.length ? fn(...args) : (...next) => curried(...args, ...next);
};

const once = (fn) => {
  let called = false, result;
  return (...args) => { if (!called) { result = fn(...args); called = true; } return result; };
};

const debounce = (fn, wait) => {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
};

const throttle = (fn, wait) => {
  let last = 0;
  return (...args) => { const now = Date.now(); if (now - last >= wait) { last = now; fn(...args); } };
};
```

---

## Interview Q&A

**Q: Declaration vs expression, concretely?**
> Declaration hoists with its full body, callable before its line. Expression only hoists the binding — with `var` that's `undefined` until assigned (calling it early throws `TypeError`); with `let`/`const` you'd hit the TDZ.

**Q: Why is a pure function easier to test?**
> No hidden inputs, no side effects — same args always give the same result, so a test is just "call it, assert the return." Also safe to memoize and safe to run in any order.

**Q: What makes a function higher-order?**
> It takes a function as an argument, returns one, or both — `map` takes a callback, `debounce` returns a wrapped function, `compose` is both.

**Q: Predict:**
```js
const makeObj = () => { x: 1 };
console.log(makeObj());
```
> `undefined` — `{x:1}` without wrapping parens parses as a function body containing a label and expression statement, not an object literal. Fix: `() => ({x:1})`.

**Q: debounce vs throttle, quick gut check?**
> Debounce waits for a pause, fires once things go quiet (search-as-you-type). Throttle fires at a steady max rate regardless of event frequency (scroll handler).

---

## Follow-ups (challenge questions)

- *Failure mode:* `debounce` above never fires if the triggering event never stops (e.g. continuous `mousemove` for 10 minutes) — is that ever a real production problem, and how would `leading`/`trailing` options ([Part 18](18-advanced-functional-patterns.md)) change the answer?
- *Scale:* `curry` as written uses `fn.length` to know when enough args have arrived — what breaks it if `fn` has a default parameter or a rest parameter, and why?
- *Consistency:* `once` caches the *first* call's result forever, including if that first call threw — is silently caching a thrown error the right default, or would you want `once` to retry after a failure?

---

**Previous:** [Part 01 — Scope & Closures](01-scope-and-closures.md) · **Next:** [Part 03 — `this`, `call`/`apply`/`bind`](03-this-call-apply-bind.md)
