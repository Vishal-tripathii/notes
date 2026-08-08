# JavaScript Study Notes — Part 03

## `this`, `call`/`apply`/`bind` ⭐⭐⭐⭐⭐

**Topics:** `this` in global/plain function/method/arrow/constructor/event listener · `call`/`apply`/`bind` · why arrows don't have their own `this`.

---

## 1. The Core Rule

> **Definition:** `this` is a keyword that refers to the object which is currently executing the function — its value is determined **dynamically, at the call site**, by how the function was invoked, not by where the function was defined (arrow functions are the sole exception, §3).

```js
function whoAmI() { console.log(this); }
const obj = { whoAmI };
obj.whoAmI();          // this = obj — called as a method, via the dot
const fn = obj.whoAmI;
fn();                    // this = undefined (strict) — same function, different call site
```

## 2. The Four Binding Rules, Priority Order

> **Definitions:** **default binding** — a plain, undecorated function call, where `this` falls back to `undefined` (strict mode) or the global object (non-strict). **implicit binding** — a function called as a property of an object (`obj.method()`), where `this` becomes that object. **explicit binding** — `this` set directly via `call`/`apply`/`bind`, overriding the call-site rule. **`new` binding** — `this` becomes the brand-new object constructed by a `new` call.

| Priority | Rule | Example | `this` |
|---|---|---|---|
| 1 highest | `new` | `new Foo()` | the new object |
| 2 | Explicit | `fn.call(obj)` / `.apply(obj)` / `.bind(obj)()` | whatever you passed |
| 3 | Implicit | `obj.method()` | left of the dot |
| 4 lowest | Default | `fn()` | `undefined` (strict) / global (non-strict) |

```js
function show() { console.log(this.name); }
show();                          // Rule 4: undefined
const user = { name: 'V', show };
user.show();                       // Rule 3: 'V'
user.show.call({ name: 'Other' }); // Rule 2, beats Rule 3: 'Other'
function Foo(n) { this.name = n; }
new Foo('New');                     // Rule 1, beats everything
```

**The detachment trap** — the most common real bug:
```js
class Timer {
  constructor() { this.seconds = 0; }
  tick() { this.seconds++; console.log(this.seconds); }
}
const t = new Timer();
setTimeout(t.tick, 1000); // breaks — passed as a bare reference, no receiver at call time,
                            // so Rule 4 applies: this is NOT t
// fix: setTimeout(() => t.tick(), 1000)  or  setTimeout(t.tick.bind(t), 1000)
```

## 3. Arrow Functions & Lexical `this`

> **Definition:** unlike all other functions, an arrow function has no `this` binding of its own — it inherits `this` from its enclosing lexical scope at the moment it is *defined*, permanently, immune to how it's later called.

```js
const obj = {
  name: 'V',
  regular() { setTimeout(function () { console.log(this.name); }, 100); }, // undefined
  arrowFix() { setTimeout(() => { console.log(this.name); }, 100); },       // 'V'
};
```
This is exactly why arrows are the standard fix for `this`-inside-a-callback bugs. **Don't use an arrow as the object method itself** — it'd capture `this` from outside the object literal, not the object.

## 4. `call` vs `apply` vs `bind`

> **Definitions:** `call(thisArg, a, b, ...)` — invokes the function immediately with `this` set to `thisArg` and arguments passed individually. `apply(thisArg, [a, b, ...])` — identical to `call`, but arguments are passed as a single array. `bind(thisArg, a, ...)` — does **not** invoke the function; returns a **new function** with `this` (and optionally some leading arguments) permanently bound, to be called later.

| | Invokes now? | Args | Returns |
|---|---|---|---|
| `call(thisArg, a, b)` | yes | individually | return value |
| `apply(thisArg, [a,b])` | yes | as array | return value |
| `bind(thisArg, a)` | no | individually (partial) | new bound function |

```js
function intro(greeting) { console.log(`${greeting}, ${this.name}`); }
intro.call({ name: 'V' }, 'Hi');
intro.apply({ name: 'V' }, ['Hi']);
const bound = intro.bind({ name: 'V' }); bound('Hi');
```
Use cases: `call`/`apply` — invoke now with a known `this` (array-like borrowing: `Array.prototype.slice.call(arguments)`); `apply` specifically when args already exist as an array (mostly superseded by spread); `bind` — lock `this` for later, e.g. `button.addEventListener('click', this.handleClick.bind(this))`.

## 5. Implement `bind()` From Scratch

```js
Function.prototype.myBind = function (thisArg, ...boundArgs) {
  const originalFn = this; // whatever myBind was called ON
  return function (...callArgs) {
    return originalFn.apply(thisArg, [...boundArgs, ...callArgs]);
  };
};
```
Checks: `this` inside `myBind` is the function being bound (called as a method on it, Rule 3); the returned closure captures `thisArg`/`boundArgs` for later use via `apply`.

---

## Interview Q&A

**Q: How is `this` determined?**
> By how the function is called, not where it's defined. Four rules in priority: `new` wins, then explicit (`call`/`apply`/`bind`), then implicit (dot on the call site), then default (`undefined`/global). Arrows are the exception — no own `this`, inherited lexically from where they were defined.

**Q: Why does `this` break in a `setTimeout` callback, and why do arrows fix it?**
> `setTimeout` calls the callback as a plain detached function — no receiver at the call site, so default binding kicks in. Arrows never re-derive `this` from the call site; they inherit it from the surrounding method, which had the right `this`.

**Q: `call` vs `apply` vs `bind`, one differentiator + one use case each?**
> `call`/`apply` invoke immediately, differing only in args-as-list vs args-as-array. `bind` doesn't invoke — returns a new function with `this` locked in, for calling later, e.g. passing a class method to an event listener.

**Q: Predict:**
```js
const obj = { name: 'A', regular: function () { return this.name; }, arrow: () => this.name };
console.log(obj.regular(), obj.arrow());
const { regular } = obj;
console.log(regular());
```
> `'A' undefined`, then `undefined` — arrow captured `this` from outside the object literal; destructuring `regular` detaches it from `obj`, so the bare call hits default binding.

---

## Follow-ups (challenge questions)

- *Failure mode:* a React-style class component does `<button onClick={this.handleClick}>` without binding — what actually happens inside `handleClick` when it fires, and why does `onClick={() => this.handleClick()}` or binding in the constructor fix it?
- *Consistency:* `array.forEach(this.processItem)` inside a class method — same detachment bug. What are the three idiomatic fixes, and which one avoids creating a new function on every single call?
- *Scale:* if `.bind()` creates a brand-new function object every time it's called, what's the cost of doing `onClick={this.handleClick.bind(this)}` inline inside a frequently-re-rendering component, and how would you avoid it?

---

**Previous:** [Part 02 — Functions](02-functions.md) · **Next:** [Part 04 — Objects](04-objects.md)
