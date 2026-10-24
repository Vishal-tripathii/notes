# 🟨 JavaScript Interview Question Bank — Answered

> **How to use:** cover the answer, say yours out loud, then compare. Speaking finds gaps that reading hides.
>
> Answers are the *spoken* version, not the essay. Sections link to the note that explains them properly.
>
> **~194 questions · 25 sections**

---

## Sections

| | Topic | Note |
|---|---|---|
| 1 | [JS Fundamentals & Language Basics](#s1) | [Part 00](00-js-fundamentals.md) |
| 2 | [Scope & Closures](#s2) ⭐ | [Part 01](01-scope-and-closures.md) |
| 3 | [Functions](#s3) | [Part 02](02-functions.md) |
| 4 | [`this`, `call`/`apply`/`bind`](#s4) ⭐ | [Part 03](03-this-call-apply-bind.md) |
| 5 | [Objects](#s5) | [Part 04](04-objects.md) |
| 6 | [Arrays](#s6) | [Part 05](05-arrays.md) |
| 7 | [Strings & Regex](#s7) | [Part 06](06-strings-and-regex.md) |
| 8 | [Destructuring & Spread/Rest](#s8) | [Part 07](07-destructuring-and-spread-rest.md) |
| 9 | [Prototype & Inheritance](#s9) ⭐ | [Part 08](08-prototype-and-inheritance.md) |
| 10 | [Classes](#s10) | [Part 09](09-classes.md) |
| 11 | [Event Loop & Concurrency Model](#s11) ⭐ | [Part 10](10-event-loop-and-concurrency-model.md) |
| 12 | [Promises](#s12) ⭐ | [Part 11](11-promises.md) |
| 13 | [async/await](#s13) | [Part 12](12-async-await.md) |
| 14 | [Error Handling](#s14) | [Part 13](13-error-handling.md) |
| 15 | [Generators & Iterators](#s15) | [Part 14](14-generators-and-iterators.md) |
| 16 | [Map / Set / WeakMap / WeakSet](#s16) | [Part 15](15-map-set-weakmap-weakset.md) |
| 17 | [Modules (CommonJS vs ESM)](#s17) | [Part 16](16-modules-commonjs-vs-esm.md) |
| 18 | [Memory Management](#s18) | [Part 17](17-memory-management.md) |
| 19 | [Advanced Functional Patterns](#s19) | [Part 18](18-advanced-functional-patterns.md) |
| 20 | [Polyfills](#s20) ⭐ | [Part 19](19-polyfills.md) |
| 21 | [Browser APIs](#s21) | [Part 20](20-browser-apis.md) |
| 22 | [DOM Manipulation & Event Delegation](#s22) | [Part 21](21-dom-manipulation-and-event-delegation.md) |
| 23 | [Performance Patterns](#s23) | [Part 22](22-performance-patterns.md) |
| 24 | [Modern JavaScript Features (ES2020+)](#s24) | [Part 23](23-modern-javascript-features.md) |
| 25 | [Workers & Parallelism](#s25) ⭐ | [Part 27](27-workers-and-parallelism.md) |

---

<a name="s1"></a>
# 1. JS Fundamentals & Language Basics

### What is an execution context?

The internal record the engine builds before running any code in a scope — what variables and functions exist, what `this` is, and a link to the outer scope. It's built in two passes: a creation phase that scans and hoists without running anything, then an execution phase that runs line by line with real values.

### What is the call stack, and why does deep recursion overflow it?

A LIFO stack of execution contexts — calling a function pushes a frame, returning pops it. One stack means one thing runs at a time. Each unfinished recursive call keeps its frame on the stack, and past a few thousand levels there's no more room, throwing `RangeError: Maximum call stack size exceeded`.

### What is hoisting, precisely?

The engine learns every declaration in a scope before running the first line of it — but only the declaration, never the assignment. "Hoisting" is a teaching word for that; nothing physically moves. It's the creation phase, described from the outside.

### Why does calling a function *expression* before its line throw `TypeError`, not `ReferenceError`?

```js
bar(); var bar = function () {};   // TypeError: bar is not a function
```
The creation phase only sees `var bar` and sets it to `undefined` — the function value on the right is part of an assignment, which doesn't run early. So `bar` exists (no `ReferenceError`), it just isn't callable yet (hence `TypeError`). A full function *declaration*, by contrast, hoists with its entire body and is callable immediately.

### What is the Temporal Dead Zone, and why does it exist?

The window between a block starting and a `let`/`const`/`class` declaration actually running, during which the binding exists but is uninitialized — touching it throws `ReferenceError` instead of silently returning `undefined`. It exists to turn a silent bug into a loud one exactly where the misuse happens.

### `var` vs `let` vs `const`?

`var` is function-scoped, hoisted to `undefined`, redeclarable, and attaches to the global object. `let`/`const` are block-scoped and land in the TDZ until their line runs; `const` additionally can't be reassigned. Default to `const`, reach for `let` only when reassignment is needed, and avoid `var`.

### Are objects passed by reference in JS?

Not exactly — JS is always pass-by-value; for an object, the value copied is the reference itself. Mutating through that reference is visible to the caller, but reassigning the parameter to a new object is not.
```js
function reassign(o) { o = { x: 'new' }; }  // caller's object is untouched
```

### What is type coercion, and what's an example that trips people up?

The automatic or explicit conversion of a value from one type to another. `[] + []` gives `''` because both sides call `toString()` and concatenate — surprising because you'd expect array addition to mean something numeric, and it means nothing of the sort.

### `==` vs `===` — is there ever a reason to use `==`?

`===` compares value and type with no conversion; `==` converts operands to a common type first. The one accepted exception to defaulting to `===` is `x == null`, which catches both `null` and `undefined` in a single check since they're special-cased equal to each other under `==` and nothing else.

### Why does `typeof null` return `'object'`?

A preserved bug from the original engine's type-tagging system — `null`'s all-zero pointer accidentally matched the tag used for objects. It's permanent; fixing it would break the web.

### `Object.is()` vs `===`?

Identical except for two cases: `Object.is(NaN, NaN)` is `true` (`===` says `false`), and `Object.is(0, -0)` is `false` (`===` says `true`). Mostly relevant internally, like React's bail-out equality check.

### `null` vs `undefined`?

`undefined` is what the engine sets automatically — an unassigned variable, a missing argument, no `return`. `null` is what a developer explicitly assigns to mean "intentionally empty." One is silence from the engine, the other is a deliberate statement.

### What's `Symbol` actually for?

A guaranteed-unique primitive, even between two symbols with identical descriptions — used as collision-proof object keys. Symbol-keyed properties are hidden from `Object.keys()`, `for...in`, and `JSON.stringify()`, which is exactly why `Symbol.iterator` can sit on any object without polluting its normal enumeration.

---

<a name="s2"></a>
# 2. ⭐ Scope & Closures

### What is lexical scope?

A function's access to variables is determined by where it was *written* in the source, not by where or how it's *called*. JS resolves a name by walking outward through the scope chain — current scope, then enclosing scope, then global — and stops at the first match.

### Does scope lookup ever go inward?

No — a nested function can see its enclosing function's variables, but the outer function can never reach into the inner one's scope. Same reasoning blocks sibling functions from seeing each other's locals.

### If `bar()` calls `foo()`, and `foo` was defined in the global scope, whose `x` does `foo` use — its own caller's, or the global one?

The global one. JS is lexically scoped, not dynamically scoped — `foo` resolves `x` by where *it* was written, never by asking "who called me." The call site is irrelevant; only the source-code nesting matters.

### What is a closure, precisely?

A function bundled with a live reference to the variables of the scope it was declared in, so it keeps accessing them even after that enclosing function has already returned.
One cashier's till stays open for them specifically, even after the manager who set it up has gone home.

### `makeCounter()` returns and its frame is popped — why does the counter it returned keep counting?

Because the returned function is lexically wired to `makeCounter`'s scope, the engine can't garbage-collect that scope while something still references it. The scope survives on the heap, reachable only through the closure — it isn't a copy of `count`, it *is* `count`.

### Is a closure a snapshot of a variable's value, or a live reference?

Live, always. Two functions declared in the same scope share the *same* live variable, not two frozen copies — which is the entire mechanism behind the classic `var`-loop bug below.

### Why does `for (var i...) setTimeout(() => console.log(i), 0)` print the same value three times, and how does `let` fix it with zero other changes?

`var` is function-scoped, so the whole loop shares one `i` — every callback closes over that single variable and sees whatever it ended at (`3`) once the loop actually finishes, milliseconds before any callback runs. `let` makes the spec create a fresh binding *per iteration*, so each callback closes over its own separate `i`.

### Without switching to `let`, how do you fix the `var`-loop bug?

Wrap the body in an IIFE that takes the current value as a parameter — each call manufactures its own fresh variable, the same trick `let` now does natively.
```js
for (var i = 0; i < 3; i++) (function (captured) { setTimeout(() => console.log(captured), 100); })(i);
```

### When does a closure become a memory leak?

When it outlives its usefulness but is still reachable — an event listener that's never removed, or a timer that's never cleared, keeps everything it closed over alive indefinitely, even data nobody will ever use again.

### What problem did the module pattern solve, and how?

Private state before `#`-private class fields existed. An IIFE returns an object exposing only a deliberate public API, while local variables inside stay unreachable from outside — closures simulating access control the language didn't have yet.

### Give a real production use of closures beyond a counter toy example.

Memoization — caching results in a variable only the returned function can see. Debounce and throttle hold a timer id or last-call timestamp the same way, persisted between calls without polluting any outer scope.

---

<a name="s3"></a>
# 3. Functions

### Declaration vs expression, concretely?

A declaration (`function foo(){}`) hoists with its entire body and is callable before its own line. An expression (`const foo = function(){}`) only hoists the binding — with `var` that's `undefined` until the assignment runs (calling it early throws `TypeError`), with `let`/`const` you'd hit the TDZ instead.

### What real differences does an arrow function have from a regular function?

No own `this` — it lexically inherits from the enclosing scope at definition time. No `arguments` object. Can't be called with `new` — throws `TypeError`. And no `.prototype`, so it can't be a generator either.

### What was an IIFE historically used for?

Creating an isolated scope that runs exactly once, mainly to avoid polluting the global scope before block scoping and ES modules existed. It survives today mostly inside the module pattern and in bundler output.

### What makes a function "higher-order"?

Taking a function as an argument, returning one, or both — `map` takes a callback, `debounce` returns a wrapped function, `compose` does both. It's a shape, not a special keyword.

### What's a pure function, and why does it matter?

Same input always gives the same output, with no side effects — no mutation, no I/O, no reading anything outside its own arguments. It matters because it's trivially testable with no mocking, safe to memoize, and safe to run in any order — the whole premise behind reducer-style state management.

### Rest parameters vs spread — one quick differentiator?

Rest collects arguments *into* a real array inside a function's parameter list; spread expands an array *out* into individual arguments at a call site. Same token, opposite direction — `function sum(...nums)` gathers, `multiply(...arr)` expands.

### debounce vs throttle — quick gut check?

Debounce waits for a pause and fires once things go quiet — search-as-you-type. Throttle fires at a steady maximum rate the whole time something's happening — a scroll handler.

### What is curry, and what determines when "enough" arguments have arrived?

Transforms a function that takes multiple arguments into a chain of functions each taking a subset, until enough have accumulated to actually call the original. A typical implementation compares accumulated argument count against `fn.length`, the function's declared parameter count, to know when to stop collecting and invoke.

### What breaks `curry`'s reliance on `fn.length`?

Default parameters and rest parameters don't count toward `fn.length` at all — a function like `(a, b = 1, ...rest) => {}` reports a `length` of `1`, so a naive curry implementation would invoke it far too early, before all the arguments a caller actually intended to supply have arrived.

---

<a name="s4"></a>
# 4. ⭐ `this`, `call`/`apply`/`bind`

### How is `this` determined?

Dynamically, at the call site — by *how* the function was invoked, not by where it was defined. Arrow functions are the sole exception: they have no `this` of their own and inherit it lexically from the enclosing scope.

### What are the four binding rules, in priority order?

`new` binding wins over everything (`this` = the newly constructed object). Then explicit binding (`call`/`apply`/`bind`). Then implicit binding (`obj.method()` — `this` is whatever's left of the dot). Lowest priority is default binding — a bare `fn()` call gives `undefined` in strict mode, the global object otherwise.

### Why does `this` break inside a plain, detached function call?

Because there's no receiver at the call site — `const fn = obj.method; fn()` calls `fn` with nothing left of a dot, so default binding applies and `this` is `undefined` (strict) or global, not `obj`. The function is identical; only how it was called changed.

### Why does `this` break inside a `setTimeout` callback, and why do arrows fix it?

`setTimeout` invokes the callback as a bare detached function — no receiver, so default binding kicks in and `this` isn't what you expected. An arrow never re-derives `this` from its own call site; it inherits it from the surrounding method, which already had the correct `this`.

### `call` vs `apply` vs `bind` — one differentiator plus one use case each?

`call(thisArg, a, b)` invokes immediately with arguments listed individually — useful for array-like borrowing. `apply(thisArg, [a, b])` is identical but takes arguments as an array — mostly superseded by spread now. `bind(thisArg, a)` doesn't invoke at all; it returns a new function with `this` locked in for later, e.g. passing a class method to an event listener.

### Why shouldn't you use an arrow function as an object's own method?

An arrow captures `this` from the scope it was *written* in, which for an object literal method is whatever surrounds the object literal — not the object itself. `const obj = { name: 'V', greet: () => this.name }` reads `this` from outside `obj` entirely, defeating the point of a method.

### How would you implement `bind` from scratch, and what's the key trick?

Capture `this` (the function being bound) in a closure, and return a new function that calls the original via `apply(thisArg, [...boundArgs, ...callArgs])` — merging the arguments bound at creation time with whatever's passed at call time.
```js
Function.prototype.myBind = function (thisArg, ...bound) {
  const fn = this;
  return (...args) => fn.apply(thisArg, [...bound, ...args]);
};
```

### A class method is passed as a bare reference — `setTimeout(t.tick, 1000)` — and breaks. Why, and what are the fixes?

`t.tick` detaches the function from `t` before it's ever called, so when `setTimeout` invokes it, there's no receiver and default binding applies — `this` inside `tick` is not `t`. Fix with an arrow wrapper (`() => t.tick()`), or `t.tick.bind(t)` to lock `this` permanently before handing the reference off.

---

<a name="s5"></a>
# 5. Objects

### What are the ways to create an object, and how do they differ?

A literal (`{}`), a constructor function with `new`, `Object.create(proto)` (explicitly setting the new object's prototype), and `Object.create(null)` (no prototype at all — not even `Object.prototype`). The last one is the one interviewers probe: it has zero inherited baggage, not even `toString`.

### `freeze` vs `seal`, precisely?

Both block adding or deleting properties. `seal` still allows modifying existing values; `freeze` additionally locks those too, making the object immutable at the top level. Both are shallow.

### Why is `Object.freeze()` shallow, and where does that bite you?

Freeze only sets `writable: false` and `configurable: false` on the frozen object's *own* property slots — it never recurses into nested objects. `Object.freeze({nested: {a: 1}})` still lets `obj.nested.a = 2` go through untouched, which surprises people expecting "frozen" to mean fully immutable.

### What does `Object.assign()` do, and what's the safe merge pattern?

Copies all enumerable own properties from one or more sources onto a target, left to right, mutating and returning the target. The safe pattern is an empty object as the target — `Object.assign({}, obj1, obj2)` — so neither source gets mutated; this is what `{...obj1, ...obj2}` does too, and it's just as shallow.

### What are the three property descriptor flags?

`writable` — can the value change. `enumerable` — does it show up in `for...in`/`Object.keys`. `configurable` — can it be deleted or have its descriptor changed. Literal properties default all three to `true`; `Object.freeze()` is implemented by flipping `writable` and `configurable` to `false` on every own property.

### `?.` and `??` — what bug does `??` fix that `||` has?

`level || 10` incorrectly replaces a legitimate falsy value like `0` (say, "muted") with the fallback. `??` only falls back on `null`/`undefined`, leaving `0`, `''`, and `false` untouched — usually what "use a default if not provided" actually means.

### Shallow copy vs deep copy — what breaks in a Redux-style state update if you spread only the top level?

A shallow copy (`{...state}`) still shares every nested object with the original — mutating a nested field on what looks like independent state silently mutates the original too. That's exactly why Redux-style updates spread at *every* level being changed: `{...state, user: {...state.user, name}}`, not just the top.

### `structuredClone()` vs `JSON.parse(JSON.stringify())` for deep cloning?

`structuredClone` correctly handles `Date`, `Map`, `Set`, typed arrays, and circular references. The JSON round-trip loses functions and `Symbol`s, turns `Date`s into strings, turns `Map`/`Set` into plain `{}`, and throws outright on a circular reference — a "deep clone" hack with real, silent data-corrupting gaps.

---

<a name="s6"></a>
# 6. Arrays

### Which array methods mutate, and how do you keep that straight?

`push`/`pop`/`shift`/`unshift`, `splice`, and `sort`/`reverse` all mutate in place. `map`/`filter`/`slice`/`concat`/`flat`/`flatMap` all return a brand-new array, untouched original. `reduce` doesn't mutate unless you deliberately mutate the accumulator yourself.

### Why does `sort()` mutating matter as a real production bug?

Passing a shared array reference — a prop, a cached value — into `.sort()` silently changes it for every other place holding that same reference, since `sort` mutates in place and also returns the same array. Copy first with `[...arr].sort()` if the original needs to stay untouched.

### `map` vs `forEach`?

`map` returns a new transformed array and exists for building data. `forEach` always returns `undefined` and exists purely for side effects. Using `map` and discarding the result, or expecting `forEach` to hand back a transformed array, are both signs of confusing the two.

### Why can `reduce` implement every other array method?

Every array operation is fundamentally "start with something, fold each element into it" — `map` folds by transforming into a new array, `filter` folds by conditionally including, `find` folds by short-circuiting on a match. `reduce` just exposes that general shape directly instead of hiding it inside a specialized method.

### What does omitting `reduce`'s initial value actually do, and why does it throw on an empty array?

Without an initial value, the array's first element becomes the starting accumulator and iteration begins from index 1 instead of 0 — which means an empty array has nothing to seed with, so it throws `TypeError: Reduce of empty array with no initial value`. Passing an explicit initial value sidesteps both issues and just returns that value untouched on an empty array.

### `slice` vs `splice`?

`slice(start, end)` returns a new array, non-mutating, `end` exclusive. `splice(start, deleteCount, ...items)` mutates the original in place, removing and/or inserting elements, and returns the removed elements. Mnemonic: **s**lice is **s**afe, s**p**lice **p**unches a hole in the original.

### `flat` vs `flatMap`, and why is `flatMap` more efficient than `.map().flat()`?

`flat(depth)` recursively flattens nested arrays up to `depth` (default 1). `flatMap` maps each element then flattens one level, in a single pass — `.map().flat(1)` walks the array twice, once to transform and once to flatten, where `flatMap` does both in one traversal.

### Predict:
```js
console.log([1,2,3].reduce((a,b) => a+b));
console.log([].reduce((a,b) => a+b, 0));
console.log([].reduce((a,b) => a+b));
```
`6` (no initial value — `1` seeds the accumulator, iteration starts from index 1), `0` (initial value provided, empty array just returns it untouched), then `TypeError: Reduce of empty array with no initial value`.

---

<a name="s7"></a>
# 7. Strings & Regex

### Are strings mutable in JS?

No — every string method returns a brand-new string. `str[0] = 'x'` silently does nothing (or throws in strict mode), which is proof the original string itself never changes underneath you.

### `match` vs `test` vs `matchAll`?

`test()` on a regex returns a plain boolean — cheapest check when you just need yes/no. `match()` on a string returns match details, but its shape *changes* with the `g` flag: without it you get capture groups and index, with it you get a flat array of matches and lose the group info entirely. `matchAll()` returns an iterator of full match objects — including groups — even with `g`, fixing that exact limitation.

### What's a tagged template literal actually for?

It's a function call in disguise — the function receives the literal's string pieces and the interpolated values as separate arguments, letting it control how they combine instead of just concatenating blindly. That's the exact mechanism `styled-components` and safe SQL-templating libraries use to process or escape interpolated values.

### What is catastrophic backtracking, and why does it matter in production?

A regex like `/^(a+)+$/` against a long string of near-matches can cause the engine to try an exponential number of ways to backtrack through nested repetition, effectively hanging the process. It shows up as a mysterious production timeout that looks like "something's just slow" rather than an obvious crash, since the regex itself never errors.

### Why is `new RegExp(userInput)` risky?

Building a regex directly from untrusted input hands an attacker control over the pattern itself — they can craft input specifically shaped to trigger catastrophic backtracking (ReDoS), turning a single request into a thread-blocking denial of service. Never construct a regex from unvalidated user input without strict length/pattern limits.

### What do template literals give you besides interpolation?

Multi-line strings with no escape characters needed — a backtick string can span lines literally, where a regular quoted string would need explicit `\n`. That, plus `${...}` interpolation, is most of why they replaced manual string concatenation.

### `replace` vs `replaceAll`?

`replace('World', 'JS')` only touches the *first* match. `replaceAll('l', 'L')` touches every match. Reaching for `replace` when you actually meant every occurrence is a common silent bug — the first replacement "worked" and nobody checked the rest of the string.

---

<a name="s8"></a>
# 8. Destructuring & Spread/Rest

### Spread vs rest — same syntax, how do you tell them apart?

By direction and position. Spread expands a collection into individual values — array/object literals, function calls. Rest gathers individual values into a collection — destructuring patterns, function parameter lists. If it's on the receiving/left side, it's rest; if it's expanding into a new context, it's spread.

### When do destructuring defaults kick in, and when do they not?

Only when the corresponding property or element is `undefined` — missing entirely, or explicitly `undefined`. A value of `null` does **not** trigger the default; `const {name = 'Anon'} = {name: null}` gives `null`, not `'Anon'` — same rule as `??`.

### Why does `function greet({name} = {})` need the outer `= {}`?

Destructuring a parameter still needs *something* to destructure from. If `greet()` is called with no argument at all, the parameter is `undefined`, and destructuring `undefined` throws immediately — before the inner `name` default ever gets a chance to apply. The outer `= {}` guarantees there's always an object to destructure, even an empty one.

### In `const {address: {city, zip}} = user`, is `address` itself bound as a variable?

No — only `city` and `zip` end up bound. Nested destructuring reaches through `address` to grab its properties, but never creates a local binding named `address` along the way.

### How do you skip elements when destructuring an array?

Leave an empty slot where the position would be — `const [, , third] = [1, 2, 3]` skips the first two and binds only `third`. The comma still counts as a position; it's just not given a name.

### How do you rename a variable while destructuring an object?

`const { name: userName } = obj` — the left side of the colon is the property key being read, the right side is the local variable name it's bound to. Useful for avoiding a naming collision, or for giving a clearer local name than the source data uses.

### Why must `...rest` be the last parameter in a function's parameter list?

Because rest greedily collects *everything remaining* into an array — anything declared after it would have no arguments left to bind to, since rest has already claimed the rest of the argument list by definition.

---

<a name="s9"></a>
# 9. ⭐ Prototype & Inheritance

### What is the prototype, precisely?

An internal `[[Prototype]]` reference every object holds to another object, from which it inherits properties and methods. JS's inheritance model is entirely object-to-object linking — not classes copying a blueprint — and it's exposed (but shouldn't be touched directly) as `__proto__`.

### Walk through the prototype chain lookup algorithm, step by step.

Check if the object has the property as its *own*. If not, follow `[[Prototype]]` to the next object up and check there — own property first, every time. Repeat until either something matches, or the chain reaches `null` (past `Object.prototype`), at which point the result is `undefined`.

### What does `new Foo()` actually do, in order?

Creates a brand-new empty object; sets that object's `[[Prototype]]` to `Foo.prototype`; calls `Foo` with `this` bound to the new object; returns the object, unless `Foo` explicitly returns a different object itself.

### Why do methods belong on the prototype rather than inside the constructor?

Putting `this.speak = function(){}` inside the constructor gives every single instance its own copy of that function — wasteful at scale. Putting it on `Animal.prototype` means all 10,000 instances share exactly one copy, found via the chain on each lookup.

### How do you set up manual prototypal inheritance between two constructor functions, and why `Object.create`, not `new Parent()`?

Call the parent constructor against the child's `this` for property inheritance (`Animal.call(this, name)`), then link `Dog.prototype = Object.create(Animal.prototype)` for method inheritance, then restore `Dog.prototype.constructor = Dog` since step two overwrote it. `new Animal()` would actually *run* the parent constructor with no arguments and pollute `Dog.prototype` with real instance data it has no business holding — `Object.create` just wires up the chain without executing anything.

### Why is `class` "just" syntax over what constructor functions already did?

Because it compiles down to exactly the same mechanism — methods still land on `.prototype`, `extends` still sets up an `Object.create`-style chain, `super()` is still literally calling the parent constructor against the new `this`. `class` doesn't introduce a new inheritance model; it standardizes the syntax and adds guardrails: TDZ for the class binding, can't call without `new`, methods non-enumerable by default.

### What is `Object.create(null)` for?

An object with no prototype chain at all — not even `Object.prototype` — so there's zero risk of a data key colliding with an inherited method name like `toString` or `constructor`. Useful for objects used strictly as dictionaries, though `Map` is usually the better modern tool for that job.

### `for...in` walks inherited enumerable properties too — what breaks if you don't guard it?

Iterating an object built with `Object.create(somePrototype)` via bare `for...in` pulls in every enumerable property up the chain, not just the object's own — silently processing inherited methods or data as if they belonged to the object itself. Guard with `Object.hasOwn(obj, key)` (or the older `hasOwnProperty`) inside the loop.

---

<a name="s10"></a>
# 10. Classes

### What does `class` desugar to?

Exactly the constructor-function pattern: methods declared in the class body land on the prototype, `extends` sets up an `Object.create`-based chain, and `super(...)` is mechanically `Parent.call(this, ...)`. `class` bodies also run in strict mode implicitly, and methods are non-enumerable by default — neither of which the old pattern gave you for free.

### `#field` vs the `_field` convention vs the closure/module pattern — what's actually enforced?

`_field` is a pure social convention — nothing stops external code from reading or writing it. The closure/module pattern genuinely enforces privacy but requires manual boilerplate. `#field` is enforced by the engine itself: accessing or even *mentioning* it from outside the declaring class is a `SyntaxError`, and it's not even visible to subclasses.

### What does `super()` actually do under the hood?

Calls the parent class's constructor with `this` bound to the instance currently being built — the class-syntax equivalent of `Parent.call(this, ...args)` in the constructor-function pattern.

### Why does referencing `this` before `super()` in a derived class throw?

Because `this` genuinely doesn't exist yet — it isn't initialized until `super()` runs and constructs the instance. Any reference before that line is a `ReferenceError`, which is why `super()` must be the first statement touching `this` in a subclass constructor.

### Getters/setters — why use them instead of a plain property?

They let you run logic — validation, a computed value, lazy calculation — while the call site still looks like an ordinary property access (`acc.balance` instead of `acc.getBalance()`). Common uses: rejecting an invalid write in a setter, or exposing a private field read-only via a getter with no matching setter.

### Are `#private` fields accessible from a subclass?

No — a `#field` is genuinely private to the class that declared it, and even a subclass instance can't read it directly. It's only reachable through methods the parent class itself exposes.

### What does `static` do, and why call a static method on the class rather than an instance?

A `static` member attaches to the class/constructor itself, not to individual instances — it exists once, not once per instance. It's the right place for things conceptually tied to the *type*, not any one object: a factory method, a shared counter of how many instances exist, a utility that doesn't need `this`.

### Are class methods enumerable by default, and how does that differ from a plain object literal?

No — methods declared in a `class` body are non-enumerable by default, so they don't show up in `for...in` or `Object.keys()` on an instance. A method added the same way to a plain object literal *is* enumerable. This is one of the "guardrails" `class` syntax adds silently over the old constructor-function pattern.

---

<a name="s11"></a>
# 11. ⭐ Event Loop & Concurrency Model

### What is the event loop, in one sentence?

The mechanism that continuously checks whether the call stack is empty and, if so, pushes the next queued callback onto it — the thing that lets a single-threaded language handle async work without ever blocking that thread.

### What's actually different about the event loop in the browser vs Node?

The core mechanism is identical: one call stack, a microtask queue, a macrotask queue, drained in that priority order. What differs is who *provides* the async work — in Node it's libuv plus the OS, in the browser it's the browser's own Web APIs (`setTimeout`, `fetch`, DOM events). Node also has `process.nextTick`, a queue with even higher priority than microtasks, which browsers have no equivalent of; browsers add `requestAnimationFrame`, a per-frame queue Node has no reason to need since it doesn't render anything.

### Microtask vs macrotask?

A microtask (promise callbacks, `queueMicrotask`) runs immediately after the current synchronous code finishes, and the *entire* microtask queue drains completely before the loop moves on. A macrotask (`setTimeout`, a DOM event, `postMessage`) runs on a later, separate turn — only one macrotask runs per loop iteration.

### Why does draining the entire microtask queue before the next macrotask matter, and what can go wrong?

If a microtask schedules another microtask, that one runs too — before any macrotask or repaint ever gets a turn. A runaway promise chain (one `.then()` that keeps scheduling more) can therefore starve timers and rendering entirely, even though nothing is technically "blocking" in the traditional synchronous sense.

### Why is `requestAnimationFrame` better than `setTimeout` for animation?

It's synced to the display's actual refresh rate instead of guessing a fixed interval, so it never drifts under load and never schedules a frame the screen can't show. It also automatically pauses in a backgrounded tab, where a `setInterval` loop just keeps firing and burning battery for nothing visible.

### Predict:
```js
console.log('start');
setTimeout(() => console.log('timeout'), 0);
Promise.resolve().then(() => console.log('promise 1')).then(() => console.log('promise 2'));
console.log('end');
```
`start, end, promise 1, promise 2, timeout` — synchronous code runs first, then the entire microtask chain drains completely, and only then does the engine even look at the macrotask queue.

### Are two `setTimeout(fn, 0)` calls, scheduled from two different user interactions, guaranteed to run in the order they were scheduled?

Generally yes for timers registered in the same relative order — the timer queue is roughly FIFO for equal delays. What's *not* guaranteed the same way is exact wall-clock timing across separate event-triggered interactions, since each interaction's own synchronous code and microtasks run to completion first, which can shift things slightly depending on when each interaction actually happened.

---

<a name="s12"></a>
# 12. ⭐ Promises

### What are the three states of a promise, and why does "settles once" matter?

Pending, fulfilled, or rejected — and once it moves out of pending, it's **settled permanently** and can never change state again. Calling `resolve()` twice, or `resolve()` then `reject()`, is silently a no-op after the first call. That guarantee is what makes `.then()` reliable — a callback attached to a promise fires exactly once, ever, with a value that can't be swapped out from under it later.

### How does `.then()` chaining actually work, and why does each call return a *new* promise?

`.then()` can't reuse the original promise, because it's already settled and immutable — its job is to produce the *next* value in the chain, which depends entirely on what the callback returns: a plain value, a thrown error, or another promise to wait on. A fresh promise represents that next step; if the callback returns another promise, the chain "flattens" and waits for it too, turning nested async steps into a flat sequence instead of a callback pyramid.

### Why can an error "swallow" its way silently down a promise chain until `.catch()`?

A rejection converts the entire rest of the chain into rejected promises, one after another — every `.then()` with only a fulfillment handler just passes the rejection along unchanged — until something with an actual rejection handler catches it. `.catch()` at the *end* of a chain reliably catches a failure from any earlier step for exactly this reason.

### What does `.finally()` do, and what does it receive?

Runs when the promise settles regardless of whether it fulfilled or rejected, and receives no argument at all — purely for cleanup that must happen either way, like hiding a spinner.

### `all` vs `allSettled` vs `race` vs `any` — one use case each?

`all` — need every result, fail fast on the first rejection (loading required page data). `allSettled` — want every outcome regardless of individual failures, never itself rejects (independent dashboard widgets). `race` — first to *settle* wins, fulfilled or rejected (a timeout wrapper around a slow request). `any` — first to *fulfill* wins, rejects only if everything fails with an `AggregateError` (querying redundant CDN mirrors).

### How would you implement `Promise.all()` from scratch, and what's the ordering trick?

Track a `results` array and a completed count; for each input promise, on fulfillment write into `results[i]` by *index*, not push order, since promises can settle out of order but `Promise.all`'s contract guarantees output order matches input order. Any single rejection calls `reject` immediately, matching the real fail-fast semantics.
```js
promises.forEach((p, i) => Promise.resolve(p).then(v => { results[i] = v; if (++done === promises.length) resolve(results); }).catch(reject));
```

### `Promise.all` is used on 5 API calls and one server hangs, never resolving and never rejecting — what happens?

The whole `.then()` chain waits forever, since `Promise.all` only settles once every input has settled — one that never settles at all means the combined promise never does either. Wrap the hanging call in `Promise.race([call, timeoutPromise])` so a timeout can force a rejection instead of an indefinite hang.

---

<a name="s13"></a>
# 13. async/await

### Is `async`/`await` a new concurrency mechanism?

No — it's sugar over the same promises and microtask queue. `async` only changes syntax: the function returns a promise, and if it throws, that promise rejects. There's no new runtime machinery underneath.

### How does `await` actually suspend a function without blocking the thread?

It pauses only the current `async` function, registers the rest of it as a continuation on the microtask queue tied to when the awaited promise settles, and immediately returns control to the caller. Other synchronous code and other microtasks are free to run while that function sits "paused."

### What's the `await`-in-a-loop bug, and how do you fix it?

Awaiting inside a loop makes each iteration wait for the previous one to *finish* before it even starts — turning N independent operations into N sequential ones and multiplying total latency by N. Fix: kick off every promise first (`items.map(fetchOne)`), then `await Promise.all(...)` on the resulting array, so they run concurrently instead.

### Why does `try { fetchData(); } catch (err) {}` (no `await`) catch nothing?

`try`/`catch` only intercepts *synchronous* throws. `fetchData()` returns immediately with a pending promise, and the `try` block has already finished executing by the time that promise actually rejects — the rejection happens on a later microtask turn, well outside the `try`'s lifetime, so it becomes an unhandled rejection instead.

### What is top-level `await`, and where can you actually use it?

`await` used directly at an ES module's top level, outside any function — the module's execution (and anything importing it) pauses until the awaited promise settles. Only valid in genuine ES modules, not in CommonJS or a plain script.

### Predict:
```js
async function a() { console.log('a start'); await b(); console.log('a end'); }
async function b() { console.log('b start'); }
console.log('script start'); a(); console.log('script end');
```
`script start, a start, b start, script end, a end` — `a()` runs synchronously up to its `await`; `b()` has no `await` of its own so it runs fully synchronously and returns an already-resolved promise; even so, `await` always defers the rest of `a` to a microtask, so the synchronous `script end` runs before `a end`.

### When is sequential `await` actually correct, rather than a bug to fix with `Promise.all`?

Only when a later step genuinely depends on an earlier step's *result* — fetch a user, then fetch that user's orders using the user's id. If the steps are independent, sequential `await` is pure wasted latency; if one needs the other's output, sequential is the only option and `Promise.all` wouldn't even be meaningful there.

### A caller does `save();` (an `async` function) without awaiting it, and `db.write` inside rejects — what happens?

Nothing visible, at least not immediately — the caller moved on without ever attaching a `.catch()` or `await`ing the result, so the rejection has nobody listening for it. It becomes an unhandled promise rejection: a silent production bug rather than a crash, often only surfacing later as a global `unhandledrejection` warning or missing data nobody connects back to that call.

---

<a name="s14"></a>
# 14. Error Handling

### Does `finally` always run, even if `try` contains a `return`?

Yes — `finally` runs unconditionally before the function actually returns, even though the `return` inside `try` was already "in flight." It just can't stop that return from eventually happening, unless `finally` itself returns or throws, which overrides it.

### Why shouldn't you throw a plain string instead of an `Error`?

An `Error` instance captures a stack trace at the point of `throw` and has a predictable shape (`.message`, `.name`, `.stack`) that logging/monitoring tools and catch blocks all expect. Throwing a bare string loses the stack trace entirely and forces every catch site to guess at what it actually received.

### Why build a custom `Error` subclass instead of just throwing `new Error('...')` everywhere?

It lets calling code distinguish error *types* programmatically with `instanceof` instead of fragile string-matching on `.message`, and it lets you attach structured extra data — like which field failed validation — that a plain `Error` has no place for.

### Why does `try { fetchData(); } catch (err) {}` (without `await`) catch nothing?

Same root cause as the `async`/`await` version: `try`/`catch` only catches synchronous exceptions, and a promise rejects asynchronously, after the `try` block has already exited. Nothing is left listening by the time the rejection actually happens.

### What are the two correct ways to catch an async rejection?

`await` the promise inside a `try`/`catch` — a rejection then behaves like a synchronous throw right at that `await` line. Or stay in promise-chain style and attach a `.catch()` directly to the promise. Either way, something has to actually be attached to the promise at the moment it settles.

### Why re-throw an error inside a `catch` block instead of just swallowing it?

Because a `catch` block that doesn't know how to actually handle a given error type shouldn't pretend it did — re-throwing (`if (err instanceof KnownError) {...} else { throw err; }`) lets an outer handler, or the platform's own crash reporting, deal with the error properly. Silently swallowing an error you didn't recognize just hides a real bug from everything downstream that could have caught it.

### What breaks if a custom `Error` subclass doesn't call `super(message)`?

`Error`'s own constructor is what sets `.message` and captures the stack trace at the throw site — skip `super(...)` and the subclass instance is missing both, so `err.message` is `undefined` and `err.stack` never points at where the error actually happened, making it far harder to debug in production logs.

---

<a name="s15"></a>
# 15. Generators & Iterators

### What is the iterator protocol?

An object follows it if it has a `.next()` method returning `{ value, done }` — `value` is the next produced item, `done` becomes `true` once the sequence is exhausted. Anything implementing exactly this shape can be stepped through one call at a time.

### What makes something "iterable," and how is that different from being an iterator?

An iterable implements a method under the well-known symbol `Symbol.iterator` that *produces* an iterator. An iterator is the object actually doing the stepping via `.next()`. That single `Symbol.iterator` contract is what `for...of`, spread, destructuring, and `Array.from` all rely on generically across arrays, strings, `Map`s, `Set`s, and any custom object implementing it.

### Does calling a generator function run its body immediately?

No — calling `function*` returns a generator object, but nothing inside the body executes until `.next()` is actually called. Each `yield` then pauses execution and hands a value out, resuming from exactly that point on the next `.next()` call.

### Why are generators good for lazy evaluation, with a concrete case where a plain array can't work?

A generator's body only advances to the next `yield` when `.next()` is actually called — nothing is computed ahead of time. An infinite counter (`while (true) yield n++`) is representable as a generator but impossible as a plain array, since materializing `[0, 1, 2, ...]` forever would exhaust memory before the loop even started.

### What's the idiomatic way to make a custom class iterable?

Implement `*[Symbol.iterator]()` as a generator method directly on the class — `yield`ing values as you walk the internal structure handles all the `{value, done}` bookkeeping for you, so `for...of` and spread just work with zero manual iterator-object boilerplate.

### Predict:
```js
function* gen() { yield 1; yield 2; return 3; yield 4; }
console.log([...gen()]);
```
`[1, 2]` — spread only collects values while `done` is `false`; `return 3` sets the *final* `{value: 3, done: true}`, which spread discards, and the `yield 4` after a `return` is unreachable code that never runs at all.

### If a generator function is called twice, do both calls share state?

No — each call to `numberGenerator()` creates a completely independent generator object with its own execution position and its own local variables. They don't share anything; it's the same relationship a regular function has to its separate invocations, just with a pause/resume lifecycle layered on top.

---

<a name="s16"></a>
# 16. Map / Set / WeakMap / WeakSet

### `Map` vs plain object — when does each win?

`Map` wins when keys aren't simple strings — objects as keys, guaranteed insertion order on iteration, frequent add/remove with accurate `.size` tracking, or when key names might collide with an inherited property like `toString`. Plain objects still win for simple known-shape data, JSON serialization, and destructuring ergonomics.

### What does `Set` give you besides uniqueness?

Same-value-zero comparison — essentially `===`, but treating `NaN` as equal to itself, unlike `===`. Adding a duplicate is silently a no-op, which is the entire mechanism behind `[...new Set(arr)]` as a one-liner for removing duplicates.

### What does "weak" actually buy you in `WeakMap`/`WeakSet`?

Keys are held with a weak reference, so attaching data to an object via a `WeakMap` doesn't keep that object alive — once nothing else references it, both the object and its `WeakMap` entry become eligible for garbage collection automatically. Classic use: caching metadata against DOM nodes without writing manual cleanup code and without the cache itself becoming a memory leak.

### Why is `WeakMap` not iterable and has no `.size`?

Because entries can be silently removed by garbage collection at any unpredictable moment — exposing iteration or a size count would make that result observably different from one instant to the next for reasons entirely outside the program's control. Restricting the API to just `get`/`set`/`has`/`delete` avoids ever surfacing that non-determinism.

### Why can't a `WeakMap` use a plain string as a key?

`WeakMap` keys must be objects specifically, because the entire mechanism depends on garbage collection reclaiming the key — primitives like strings aren't garbage-collected the same way (they're not unique heap references), so there'd be nothing for the "weak" part to actually hook into.

### Why is a plain object's iteration order not fully reliable, and how does `Map` avoid that gotcha?

Plain objects mostly preserve insertion order, but integer-like keys are special-cased to sort numerically *first*, ahead of everything else — a real, surprising gotcha if you're relying on `Object.keys()` order matching insertion order. `Map` has no such special case; it's **always** insertion order, for every key type, with no exceptions.

### How do you deduplicate an array in one line using `Set`?

`[...new Set(arr)]` — the `Set` constructor collapses duplicates on construction (comparing via same-value-zero), and the spread immediately unpacks it back into a plain array.

---

<a name="s17"></a>
# 17. Modules (CommonJS vs ESM)

### CommonJS vs ESM — the core difference?

CommonJS resolves modules synchronously at runtime via `require()`, and exports are just a regular mutable object assigned at some point during execution. ESM resolves imports/exports statically at *parse time*, before any code runs, with live read-only bindings to the source module.

### Why does ESM's static analyzability matter for tree shaking?

A bundler can know exactly what a module exports just by parsing its `import`/`export` statements, without ever executing the code — which is what lets it safely drop unused exports. CommonJS's exports object can only be known by actually *running* the module, since it's just a runtime value like any other, so a bundler can't confidently tree-shake it.

### Named vs default exports — when do you reach for each?

Named exports for a module offering multiple independent, equally-important utilities — explicit at the import site, with IDE auto-import/rename support. Default export for a module whose entire purpose is one thing — a single class or component — though the importer can then name it anything, which can hurt consistency across a codebase.

### What does dynamic `import()` unlock that static `import` can't?

It can be called conditionally, inside a function, in response to an event — anywhere ordinary code runs — and returns a promise. That's the mechanism behind code-splitting and lazy-loading: a module only downloads and executes when it's actually needed, e.g. behind a route or a button click.

### Why can't you `require()` a genuine ESM module synchronously?

`require()`'s contract is synchronous — call it, get the exports back immediately. ESM loading is inherently asynchronous by design, so a genuine ES module simply can't be squeezed through a synchronous API; Node lets ESM `import` a CommonJS module in many cases, but not cleanly the other way around.

### ESM exports are live bindings — if module A exports a `let count` and increments it internally, does an importing module B see the update automatically?

Yes — B sees the live, current value on every access, because ESM imports are bindings to the source, not copied snapshots. CommonJS's `module.exports = { count }` would instead hand B a copy of whatever `count` was at the moment of export, frozen at that value regardless of what A does afterward.

### What is `this` at a module's top level — CommonJS vs ESM?

In CommonJS, top-level `this` is `module.exports` itself. In an ES module, top-level `this` is `undefined`. It's a small but real tell for which system you're actually in when reading unfamiliar code.

---

<a name="s18"></a>
# 18. Memory Management

### Stack vs heap, and why does it matter for how JS copies values?

The stack holds fixed-size data — primitives and references — managed automatically as functions are called and return. The heap holds everything of dynamic size — objects, arrays, functions — and a stack variable pointing at one only stores a reference into the heap. That's exactly why primitives copy by value (the actual bits duplicate) and objects copy by reference (only the pointer duplicates, so both variables end up aimed at the same object).

### Why doesn't reference counting handle circular references, and how does mark-and-sweep fix it?

Two objects referencing only each other never hit a reference count of zero under pure reference counting, even once nothing external can reach either — a permanent leak. Mark-and-sweep instead starts from actual roots (globals, the active call stack) and marks everything reachable by walking outward; an isolated cycle with no path from any root is simply never marked, and gets correctly swept regardless of how many references exist *within* the cycle.

### Name a few common real sources of JS memory leaks.

Event listeners or timers set up but never torn down; closures capturing large data that outlives its usefulness; detached DOM nodes still referenced by a variable after being removed from the document; and a cache (a plain `Map`, not a `WeakMap`) that grows with no eviction policy.

### Is returning a cleanup function that calls `controller.abort()` on an `AbortController` an actual leak?

No — that's the correct modern pattern for exactly this problem. `controller.abort()` automatically removes any listener registered with that `signal`, so calling the returned cleanup function detaches the listener properly, letting anything it closed over be garbage collected normally.

### Why can a memory leak still occur in a garbage-collected language?

Because GC frees *unreachable* objects, not *unused* ones. If anything still references an object — a module-level cache, an uncleaned timer, a forgotten listener — the collector correctly, by its own rules, keeps it alive, even though the program will never touch it again.

### Why are detached DOM references a leak?

A variable that keeps pointing at a DOM node *after* that node has been removed from the document keeps the entire node — and its whole subtree — reachable and therefore alive in memory, even though it's no longer visible or usable on the page. The fix is simply not holding onto a reference longer than the node's actual on-page lifetime, or nulling it out once it's removed.

### Why is an accidental global variable a leak risk?

Forgetting `let`/`const`/`var` (`function leaky() { oops = 'x'; }`) silently attaches the value to the global object instead of a local scope — and anything on `global`/`window` lives for the entire process or page lifetime, never eligible for collection until the whole page or process ends.

---

<a name="s19"></a>
# 19. Advanced Functional Patterns

### debounce vs throttle, precisely, with a UI scenario each?

Debounce delays until a burst of calls goes quiet, then fires exactly once — a search-as-you-type box, so the API is only hit after the user stops typing. Throttle fires at a steady maximum rate throughout continuous activity — a scroll handler, which needs regular position updates *during* scrolling, not just once at the end.

### What do `leading`/`trailing` options actually change in `debounce`?

`trailing` (the default) fires after the burst goes quiet — normal debounce behavior. `leading: true` fires instantly on the very first call of a burst instead — useful for "prevent double submit," firing once immediately and ignoring the rest of the burst.

### Why does naive `memoize` break on multi-argument or object-argument functions?

A cache keyed by only the first argument silently ignores the rest, treating calls that differ only in later arguments as identical. The common fix, `JSON.stringify(args)`, has its own gaps — it's order-sensitive for object properties (two deeply-equal objects with differently-ordered keys produce different cache keys), and it can't serialize functions or handle circular references.

### Why does `retry` use exponential backoff instead of a fixed delay?

A fixed short delay on every retry can hammer an already-struggling dependency at a constant rate, making an outage worse. Exponential backoff spaces retries increasingly further apart, giving the failing dependency room to recover, and spreads load out across clients that started failing at slightly different times.

### `compose` vs `pipe` — what's the direction difference?

`compose(f, g, h)(x)` applies right to left — `f(g(h(x)))`, mirroring mathematical composition notation. `pipe(f, g, h)(x)` applies left to right — `h(g(f(x)))`, mirroring the visual reading order of a pipeline.

### Why does `curry` rely on `fn.length`, and what breaks it?

It compares accumulated argument count against `fn.length` — the function's declared parameter count — to know when enough arguments have arrived to actually invoke it. Default parameters and rest parameters don't count toward `fn.length` at all, so a curried function with either invokes far too early, before the caller has actually supplied everything intended.

### Two components independently wrap the same underlying async function with `once()` — do they share the cached result?

No — each call to `once(fn)` creates its own closure with its own `called`/`result` variables, so two separate `once()`-wrapped versions of the same function are two independent caches, each firing the real function once. To actually share one cached result across the app, the `once()`-wrapped function itself needs to be a single module-level singleton that both components import, not something each of them builds separately.

---

<a name="s20"></a>
# 20. ⭐ Polyfills

### What's the trickiest part of polyfilling `reduce`?

Correctly handling the omitted-initial-value case — you have to check `arguments.length`, not just truthiness of the initial-value parameter, since a real initial value of `0` or `undefined` must still count as "provided." When it's genuinely omitted, the first array element becomes the seed and iteration starts from index 1, and it must throw on an empty array with no initial value, matching the real method's contract exactly.

### Why does a correct `bind` polyfill need to special-case being called with `new`?

Because the real `Function.prototype.bind` still allows the bound function to be used as a constructor, and in that case the constructed instance — not the bound `thisArg` — must become `this` inside the function. A naive polyfill that always forces `thisArg` breaks `new BoundFn()`, which is a real, if rare, part of the contract tested at the senior level.
```js
const isNewCall = this instanceof bound;
return originalFn.apply(isNewCall ? this : thisArg, [...boundArgs, ...callArgs]);
```

### How does a from-scratch `call` implementation guarantee `this` is set correctly, without using the real `call`/`apply`/`bind`?

By temporarily attaching the function as a property of the target object under a unique `Symbol` key, then invoking it *as a method of that object* — implicit binding then naturally sets `this` to that object, exactly as if you'd written `obj.method()` directly. The property is deleted immediately after, so it never leaks into the object's real shape.

### Why does `myMap`'s polyfill check `i in this` before calling the callback?

To correctly skip holes in a sparse array (`[1, , 3]`) — the real `Array.prototype.map` doesn't invoke the callback on indices that were never actually assigned a value, only ones genuinely present. Removing that check would call the callback with `undefined` for every hole, producing a result that diverges from the real method's documented behavior.

### How would you polyfill `Array.prototype.flat(depth)`?

Recurse: for each element, if it's an array and remaining `depth > 0`, spread in its own flattened result with `depth - 1`; otherwise push it as-is. `myFlat(Infinity)` fully flattens simply because the recursion never hits the depth-zero base case.

### Would you ever ship a hand-rolled polyfill to production instead of `core-js`?

Rarely for genuinely broad browser compatibility — a battle-tested library has already handled edge cases (sparse arrays, `this`-with-`new`, spec-exact error messages) that are easy to get subtly wrong. Writing them yourself is mainly about proving the contract is understood, not a real production recommendation over a maintained library.

### How is `myApply` implemented in terms of `myCall`?

`apply` is just `call` with its arguments pre-spread from an array instead of listed individually — `myApply(thisArg, argsArray) { return this.myCall(thisArg, ...argsArray); }`. Once `call` correctly sets `this`, `apply` adds nothing new except unpacking the array first.

---

<a name="s21"></a>
# 21. Browser APIs

### `localStorage` vs `sessionStorage`, precisely?

Both are synchronous, string-only Web Storage scoped to the page's origin. `localStorage` has no expiration and persists across tab closes and browser restarts, shared across every tab of the same origin. `sessionStorage` is scoped to one tab's lifetime — cleared the moment that tab closes, invisible to other tabs even of the same origin.

### Why do cookies exist as a distinct mechanism when `localStorage` can also store data?

Cookies are attached automatically to every matching HTTP request by the browser itself, which is exactly what makes them viable for session authentication — the server sees them on requests it never got a JavaScript chance to touch, like a plain page load or an `<img>` tag. `localStorage` is never sent over the network on its own; only explicit JS code reads and attaches it, so it can't authenticate anything the browser does automatically.

### `fetch` vs `XMLHttpRequest`, and what's the classic `fetch` gotcha?

`fetch` is promise-based and composes naturally with `async`/`await`; `XHR` is older, event/callback-based, more verbose, though it does support upload progress events `fetch` historically lacked. The gotcha: `fetch`'s promise only rejects on an actual network failure — a `404` or `500` still resolves "successfully," so you must check `response.ok` yourself or a real server error silently passes through as if it succeeded.

### What does `AbortController` solve?

A way to cancel an in-flight `fetch` (or a registered listener) programmatically — calling `.abort()` rejects the pending fetch with an `AbortError` and immediately removes any listener registered with that signal. The classic use: a search box cancelling the previous request the instant a new keystroke fires a newer one, so a slow stale response can't overwrite fresher results.

### What is `URLSearchParams` for?

Reading and constructing URL query-string parameters without manual string concatenation and encoding — `new URLSearchParams({q: 'x'}).toString()` handles the encoding for you, and `url.searchParams.get/set/has` gives structured access instead of parsing a raw string by hand.

### Why is storing a JWT in `localStorage` riskier than an `HttpOnly` cookie?

`localStorage` is fully readable by any JavaScript running on the page, so a single XSS vulnerability anywhere in the app can read the token directly and exfiltrate it — full account takeover. An `HttpOnly` cookie can't be read by JavaScript at all, so the exact same XSS bug can't reach the token that way; the cookie is still automatically sent by the browser, but never exposed to a script.

### Two tabs write to the same `localStorage` key at nearly the same moment — is that a race condition, and how do you react to another tab's write?

Each write is atomic and last-write-wins, so there's no corruption, but there is a genuine race over *which* tab's value survives if both write around the same instant. The `storage` event fires in every *other* tab (never the tab that made the write) whenever a key changes, which is the mechanism for reacting to cross-tab writes and keeping multiple open tabs in sync.

---

<a name="s22"></a>
# 22. DOM Manipulation & Event Delegation

### `textContent` vs `innerHTML` — when does the difference actually matter?

`textContent` always treats its argument as literal text; `innerHTML` parses it as HTML markup. It matters the moment untrusted content is involved — assigning user input directly to `innerHTML` is a classic XSS vector, since any embedded `<script>` or event-handler attribute gets parsed and can execute. `textContent` is the safe default unless markup is genuinely needed, and even then it should go through a sanitizer first.

### Bubbling vs capturing, and what's `addEventListener`'s third argument for?

An event travels down from the document to the target first (capturing), then back up from the target to the document (bubbling) — most listeners run in the default bubble phase. The third argument (a boolean, or an options object with `capture`) lets a listener opt into the capture phase instead, occasionally needed to intercept an event before a descendant's own handler runs.

### Why does event delegation beat a listener per list item?

Memory — one listener on a parent instead of one per child, which matters a lot at scale with thousands of items. And it "just works" for elements added later, since the listener already lives on a stable ancestor and relies on bubbling plus `event.target`/`closest()` to identify which child fired it — no fresh listener needed for every new element.

### What's the role of `event.target.closest()` in a delegated handler?

The actual clicked element might be a nested `<span>` or icon *inside* the real target, not the target itself — `closest(selector)` walks up from wherever the click actually landed to find the nearest ancestor (or self) matching the selector, correctly identifying which list item was interacted with regardless of nested markup.

### A delegated handler uses `event.target.classList.contains('list-item')` instead of `closest()` — what breaks?

The moment a list item contains any nested markup — an icon, a badge span — and the user clicks directly on that nested element, `event.target` is the nested element itself, not the list item, so `classList.contains` returns `false` and the handler silently does nothing. `closest()` avoids this entirely by walking up the tree until it finds a genuine match.

### What do the `once`, `passive`, and `signal` options on `addEventListener` do?

`{ once: true }` auto-removes the listener the moment it fires once. `{ passive: true }` is a promise to the browser that the handler will never call `preventDefault()`, letting it optimize scroll performance without waiting on the handler first. `{ signal: controller.signal }` ties the listener's removal to an `AbortController` — calling `.abort()` detaches it, a clean alternative to manually tracking and calling `removeEventListener`.

### `event.stopPropagation()` is called inside a capture-phase listener on a parent — does that stop the target's own listener from running too?

Yes — `stopPropagation()` halts the event from continuing *further along its path*, and during the capture phase that path still has to travel down through the parent to reach the target. Calling it on the parent stops the event from ever reaching the target (or bubbling afterward), so the target's own listener never fires at all.

---

<a name="s23"></a>
# 23. Performance Patterns

### How do you decide between debounce and throttle for a given DOM event handler?

Whether the handler only cares about the *final* state once activity settles — debounce (a resize-triggered layout recalculation, a search input). Or needs to track state *throughout* continuous activity — throttle (a scroll-driven sticky header, a live progress readout). Get it backwards and you either get a laggy UI that only updates once scrolling stops, or a handler that over-fires and never lets a burst settle.

### What is lazy loading, and how does `IntersectionObserver` help?

Deferring a resource's load — an image, a route bundle — until it's actually needed, instead of loading everything upfront. `IntersectionObserver` fires a callback the moment an element enters the viewport, letting you swap in a real image `src` only when it's actually about to be seen, rather than downloading every image on the page immediately.

### Why is `requestAnimationFrame` the right tool for animation instead of `setTimeout`?

It's synced to the browser's actual repaint cycle, so it never schedules work the screen can't display and doesn't drift under load the way a fixed interval does. It also automatically pauses in a backgrounded tab, saving CPU and battery for animation nobody can see — none of which a `setInterval` guess gets for free.

### How does event delegation function as a performance pattern, not just cleaner code?

Fewer listeners means less memory overhead and less setup/teardown cost, which is concretely measurable when a large or frequently-changing list would otherwise attach and remove a listener per row on every re-render. Delegation collapses that to one stable listener regardless of how many rows exist or how often they change.

### Native `loading="lazy"` on an `<img>` vs `IntersectionObserver` — when do you actually need the latter?

Native lazy loading is the right default for plain images — zero JS, browser-managed, done. `IntersectionObserver` earns its keep when you need custom logic beyond images: lazy-loading a whole component, triggering an animation on scroll-into-view, infinite-scroll pagination, or anything needing a callback the moment an element becomes visible rather than just deferring a `src`.

### Why does an `IntersectionObserver`-based lazy-load need to call `observer.unobserve()` after swapping in the real image?

Without it, the observer keeps watching an element that's already done its job — on a long infinite-scroll page, thousands of resolved-but-still-observed elements accumulate, each one costing the browser continued intersection-tracking work for no further benefit. `unobserve()` releases that element the moment it's no longer needed.

### A debounced search handler and an un-debounced "clear results" button both touch the same results array — what race can happen, and how do you guard against it?

The user types, triggering a debounced search that's still in flight, then immediately clicks "clear" — the clear runs first, emptying the array, but the *stale* debounced search response can still land afterward and repopulate it with results the user already dismissed. Guard with `AbortController`: cancel the in-flight request the moment "clear" (or a newer search) fires, so a stale response never resolves into stale UI state at all.

---

<a name="s24"></a>
# 24. Modern JavaScript Features (ES2020+)

### Default parameters — what value actually triggers the fallback?

Only `undefined` — either the argument is omitted entirely, or explicitly passed as `undefined`. `greet(null)` does **not** trigger a default; it's the same "only `undefined` counts" rule as destructuring defaults and `??`.

### Can a default parameter reference an earlier parameter in the same signature?

Yes — `function f(a, b = a * 2) {}` is valid; default expressions can read parameters declared before them, evaluated left to right at call time. A later parameter can't be referenced from an earlier one's default, since it wouldn't exist yet.

### What are computed property names for?

Using a dynamically-evaluated expression as an object key at the point of literal creation — `{[key]: value}` — instead of a separate `obj[key] = value` line afterward. Handy for building an object keyed by a variable, or generating a lookup table programmatically.

### `Array.prototype.at()` vs bracket notation?

`at()` supports negative indices counted from the end — `arr.at(-1)` for the last element — where bracket notation has no negative-index support at all and you'd otherwise write the awkward `arr[arr.length - 1]`. It works on strings too.

### `Object.hasOwn()` vs `obj.hasOwnProperty()` — why does the newer one exist?

`obj.hasOwnProperty(key)` breaks entirely on an object with no prototype (`Object.create(null)`), since there's no inherited `hasOwnProperty` to call in the first place. `Object.hasOwn(obj, key)` is a static method that doesn't depend on `obj` having any particular prototype at all, replacing the older, awkward `Object.prototype.hasOwnProperty.call(obj, key)` workaround.

### `structuredClone()` vs `JSON.parse(JSON.stringify())`?

`structuredClone` performs a true deep clone handling `Date`, `Map`, `Set`, typed arrays, and circular references correctly. The JSON round-trip turns `Date`s into strings, can't handle functions/`undefined`/`Symbol`, and throws outright on a circular reference.

### `||=` vs `??=` vs `&&=` — what's the actual behavioral difference, and why does the short-circuiting matter?

`||=` assigns whenever the current value is *any* falsy value — `0`, `''`, `false`, `null`, `undefined`. `??=` assigns only when it's specifically `null`/`undefined`, leaving a legitimate `0` or `false` untouched. The short-circuiting matters beyond brevity: `cache.user ||= fetchUser()` doesn't just skip the assignment when `cache.user` is already set — it skips *calling* `fetchUser()` at all, which is real if that expression has side effects or cost.

---

<a name="s25"></a>
# 25. ⭐ Workers & Parallelism

### What's the actual difference between a Web Worker and a Service Worker?

They solve unrelated problems that just happen to share the word "worker." A Web Worker is about **compute** — moving CPU-heavy JS off the main thread so the UI doesn't freeze. A Service Worker is about **network** — sitting between the page and the network to enable caching, offline support, and push notifications. A Web Worker dies with the tab; a Service Worker persists at the origin level independent of any open tab.

### Why can't a Web Worker touch the DOM?

DOM objects aren't thread-safe. If a worker could mutate the DOM directly, you'd get exactly the race conditions threading in JS is designed to avoid — two threads racing to update the same node. Everything instead goes through `postMessage`, forcing communication through a safe, serialized channel.

### Data sent via `postMessage` is copied by default — what are the two escape hatches, and what do they trade off?

`SharedArrayBuffer` gives true shared memory between main thread and worker with zero copying, at the cost of needing `Atomics` to coordinate safely — it reintroduces the race conditions message-passing was designed to avoid. Transferable objects (like an `ArrayBuffer` passed in the transfer list) move ownership with zero copy, but the sender permanently loses access to it afterward.

### Users report seeing an old version of the app after a deploy — what's happening, and what's the fix?

A stale Service Worker cache. The old Service Worker is still active and answering `fetch` from its cached `index.html`/bundle instead of ever asking the network, because the cache name wasn't versioned on deploy so the browser has no reason to treat it as stale. Fix: bump the cache name each deploy, delete old cache keys in `activate`, and use `skipWaiting()`/`clients.claim()` if the new version should take over immediately instead of waiting for every open tab to close.

### What's the Service Worker lifecycle, and what do `skipWaiting`/`clients.claim` change?

`install → activate → fetch (repeats)`. By default a newly-installed Service Worker sits *waiting* until every open tab of the old version closes before taking over. `skipWaiting()` activates it immediately instead of waiting; `clients.claim()` takes control of already-open pages right away rather than only new ones.

### Is a Web Worker the same underlying mechanism as Node's `worker_threads`?

Same idea — an OS thread with its own isolated JS engine instance, communicating by message passing instead of shared memory — but different runtimes and different APIs (`self.postMessage` vs `parentPort.postMessage`). Both platforms hit the identical problem (one JS thread freezing under CPU work) and solved it the same way: give JS a thread that starts with nothing shared.

### `worker_threads` vs `cluster` vs `child_process` — what question actually decides between them?

Not "is this CPU-heavy" — that's true of all three scenarios. The real split is: does the work need a program that isn't JS? CPU-heavy, pure JS, stays inside Node → `worker_threads`. CPU-heavy, needs an external binary (ffmpeg, a Python script) → `child_process`. Not one heavy task at all, but low throughput across an idle multi-core box → `cluster`.

### Why is `cluster` process-based rather than thread-based, and what does that break?

Each `cluster` worker is a full separate OS process — genuinely full core utilization, but zero shared memory between workers. That means in-memory sessions and caches break outright, since a user's requests can land on a different worker each time; state has to move to Redis, and WebSockets need sticky sessions or a Redis adapter to keep working correctly.

---

## Before an interview

```
1. Cover the answers. Say yours ALOUD. Section 11 (event loop) and 12 (promises) first —
   they're the ones that fall apart under pressure if only half-understood.
2. Stumble → open the linked Part, reread that section only.
3. Highest yield: 2 (closures), 4 (this), 9 (prototypes), 11 (event loop),
   12 (promises), 20 (polyfills), 25 (workers).
4. If you have one hour: closures + the var-loop bug, the four this-binding rules,
   microtask-vs-macrotask ordering, and why Promise.all fails fast. Those four
   carry most JS interviews.
```

*— End of question bank —*
