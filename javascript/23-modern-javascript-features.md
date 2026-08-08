# JavaScript Study Notes — Part 23

## Modern JavaScript Features ⭐⭐⭐☆☆

**Topics:** default parameters · computed property names · tagged template literals (cross-ref) · `Array.prototype.at()` · `Object.hasOwn()` · `structuredClone()` · logical assignment operators · top-level `await` (cross-ref).

---

## 1. Default Parameters

> **Definition:** a function parameter can specify a fallback value, used only when the corresponding argument is `undefined` (either omitted entirely, or explicitly passed as `undefined`) — the same "only `undefined` triggers it" rule as destructuring defaults ([Part 07](07-destructuring-and-spread-rest.md#2-default-values)).

```js
function greet(name = 'Guest', greeting = 'Hello') { return `${greeting}, ${name}`; }
greet();                 // 'Hello, Guest'
greet('V');                // 'Hello, V'
greet(undefined, 'Hi');      // 'Hi, Guest' — undefined explicitly triggers the default
greet(null);                  // 'Hello, null' — null does NOT trigger it, same rule as ??/destructuring
```
Default expressions can reference earlier parameters: `function f(a, b = a * 2) {}`.

## 2. Computed Property Names

> **Definition:** syntax (`[expression]: value`) for using a dynamically-evaluated expression as an object's property key at the point of literal creation, instead of only a static identifier or string.

```js
const key = 'role';
const dynamicSuffix = 'Count';
const obj = {
  [key]: 'admin',                    // key evaluated: { role: 'admin' }
  [`click${dynamicSuffix}`]: 0,        // { clickCount: 0 }
};
```
Common use: building an object keyed by a variable without a separate `obj[key] = value` assignment line afterward, or generating a lookup table programmatically.

## 3. Tagged Template Literals (cross-ref)

Fully covered in [Part 06 §2](06-strings-and-regex.md#2-template-literals) — a function called with a template literal receives the literal's string pieces and interpolated values as separate arguments, letting it control how they combine (used by `styled-components`, safe SQL templating).

## 4. `Array.prototype.at()`

> **Definition:** returns the element at a given index, supporting **negative indices** counted from the end of the array — unlike bracket notation, which has no negative-index support at all.

```js
const arr = [10, 20, 30, 40];
arr[arr.length - 1]; // 40 — the old way, awkward
arr.at(-1);            // 40 — direct, readable
arr.at(-2);             // 30
'hello'.at(-1);           // 'o' — also works on strings
```

## 5. `Object.hasOwn()`

> **Definition:** a static method returning whether an object has the given property as an **own** property (not inherited via the prototype chain) — a safer, more direct replacement for `Object.prototype.hasOwnProperty.call(obj, key)`.

```js
const obj = { a: 1 };
Object.hasOwn(obj, 'a');          // true
Object.hasOwn(obj, 'toString');    // false — toString is inherited, not own

// the old, awkward way this replaces:
Object.prototype.hasOwnProperty.call(obj, 'a'); // needed .call() because obj might be
                                                    // Object.create(null) (Part 08), with
                                                    // no hasOwnProperty of its own to call directly
obj.hasOwnProperty('a'); // breaks entirely on Object.create(null) objects — no method to call
```

## 6. `structuredClone()`

> **Definition:** a built-in global function performing a true **deep clone** of most JS values (objects, arrays, `Date`, `Map`, `Set`, typed arrays, and correctly handling circular references) — see [Part 04 §6](04-objects.md#6-shallow-vs-deep-copy) for the full shallow-vs-deep treatment.

```js
const original = { date: new Date(), nested: { a: 1 } };
const clone = structuredClone(original);
// vs JSON.parse(JSON.stringify(original)) — loses Date (becomes a string), can't
// handle functions/undefined/Symbol, and throws on circular references entirely
```

## 7. Logical Assignment Operators (`||=`, `&&=`, `??=`)

> **Definition:** compound assignment operators combining a logical operator with assignment, only performing the assignment when the logical condition is met — shorthand for the equivalent `if` check, and crucially **short-circuiting**, meaning the right-hand side isn't even evaluated when the assignment doesn't happen.

```js
let count;
count ??= 0;              // assign 0 ONLY if count is null/undefined — same rule as ?? (Part 04)
// equivalent to: count = count ?? 0;

let cache = {};
cache.user ||= fetchUser(); // assign ONLY if cache.user is currently falsy — and since ||= short-
                               // circuits, fetchUser() isn't even CALLED if cache.user is already truthy

let isValid = true;
isValid &&= checkExtra();   // assign ONLY if isValid is currently truthy — skips checkExtra()
                               // entirely (never calls it) if isValid is already false
```
**Why the short-circuiting matters, concretely:** `cache.user ||= expensiveFetch()` doesn't just skip the *assignment* when `cache.user` is already set — it skips *calling* `expensiveFetch()` at all, which matters a great deal if that expression has side effects or real cost.

## 8. Top-Level `await` (cross-ref)

Fully covered in [Part 12 §5](12-async-await.md#5-top-level-await) — `await` usable directly at an ES module's top level (not inside any function), pausing that module's (and its importers') execution until the promise settles.

---

## Interview Q&A

**Q: `Object.hasOwn(obj, key)` vs `obj.hasOwnProperty(key)` — why does the newer one exist?**
> `obj.hasOwnProperty(key)` breaks entirely on an object with no prototype (`Object.create(null)`), since there's no inherited `hasOwnProperty` method to call in the first place. The old workaround was the awkward `Object.prototype.hasOwnProperty.call(obj, key)`. `Object.hasOwn(obj, key)` is a static method that doesn't rely on `obj` having any particular prototype at all, making it the safe default going forward.

**Q: What's the actual behavioral difference `??=` has over `||=`, and when does it matter?**
> `||=` assigns whenever the current value is *any* falsy value — `0`, `''`, `false`, `null`, `undefined`. `??=` assigns only when the current value is specifically `null` or `undefined`. It matters whenever `0`, `''`, or `false` is a legitimate value you don't want silently overwritten — the same `??` vs `||` distinction from [Part 04](04-objects.md#5--and-).

**Q: Why is `cache.user ||= fetchUser()` more than just a shorter `if` statement?**
> Because the right-hand side is short-circuited — `fetchUser()` is only actually *called* if the assignment is going to happen at all. If `cache.user` is already truthy, `fetchUser()` never executes, which matters if it's expensive or has side effects, not just for brevity.

**Q: Predict:**
```js
let x = 0;
x ||= 99;
let y = 0;
y ??= 99;
console.log(x, y);
```
> `99 0` — `0` is falsy, so `||=` assigns; `0` is not `null`/`undefined`, so `??=` leaves it untouched.

---

## Follow-ups (challenge questions)

- *Failure mode:* `config.retries ||= 3` is used to set a default retry count, but a caller explicitly passes `retries: 0` (meaning "no retries") — walk through why this silently becomes `3` instead, and how `??=` fixes it.
- *Consistency:* `structuredClone()` throws on values containing functions or DOM nodes — what's the actual reasoning behind that restriction (hint: think about what "structured" in the name refers to, and how it relates to what `postMessage` can transfer between contexts)?

---

**Previous:** [Part 22 — Performance Patterns](22-performance-patterns.md) · **Next:** [Part 24 — Output-Based Question Drills](24-output-based-question-drills.md)
