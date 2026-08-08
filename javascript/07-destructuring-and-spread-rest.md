# JavaScript Study Notes — Part 07

## Destructuring & Spread/Rest ⭐⭐⭐☆☆

**Topics:** array/object destructuring · defaults · nested destructuring · destructuring params · spread (literals) vs rest (params) — same `...`, opposite direction.

---

## 1. Array & Object Destructuring

> **Definition:** a syntax that unpacks values from arrays, or properties from objects, into distinct variables in a single expression, by mirroring the shape of the source on the left-hand side of an assignment.

```js
const [first, second] = [1, 2, 3];         // first=1, second=2, 3 ignored
const [, , third] = [1, 2, 3];               // skip with empty slots → third=3
const [a, b, ...rest] = [1, 2, 3, 4];         // rest = [3, 4]

const { name, age } = { name: 'V', age: 30 };
const { name: userName } = { name: 'V' };       // rename while destructuring
```

## 2. Default Values

> **Definition:** a fallback value supplied in a destructuring pattern, used **only** when the corresponding property or element being unpacked is `undefined`.

```js
const { name = 'Anonymous' } = {};    // 'Anonymous' — only kicks in if the key is undefined
const { name = 'Anonymous' } = { name: null }; // null — default does NOT apply to null,
                                                  // only undefined (same rule as ??, Part 04)
```

## 3. Nested Destructuring

```js
const { address: { city, zip } } = { address: { city: 'SF', zip: '94103' } };
// note: `address` itself is NOT bound as a variable here, only city/zip are
```

## 4. Destructuring Function Parameters

```js
function greet({ name, greeting = 'Hello' } = {}) {  // ={} guards against calling greet()
  console.log(`${greeting}, ${name}`);                 // with no argument at all
}
greet({ name: 'V' }); // 'Hello, V'
greet();                // wouldn't throw — the ={} default kicks in before destructuring undefined
```
Without the `= {}` fallback, calling `greet()` throws `TypeError: Cannot destructure property 'name' of 'undefined'`.

## 5. Spread (Literals) vs Rest (Parameters)

> **Definition — Spread:** `...` syntax that **expands** an iterable or object's own enumerable properties into individual elements — used inside array/object literals or function call arguments.
> **Definition — Rest:** `...` syntax that **collects** the remaining elements/properties into a single new array or object — used in destructuring patterns or a function's parameter list. Same token, opposite direction.

```js
// SPREAD — expands a collection into individual elements/properties
const arr2 = [...arr1, 4, 5];
const obj2 = { ...obj1, extra: true };
fn(...argsArray);

// REST — gathers individual elements/properties into a collection
function f(...args) {}                 // params: gathers remaining args into an Array
const [first, ...others] = arr;          // destructuring: gathers remaining elements
const { id, ...otherProps } = obj;         // destructuring: gathers remaining properties
```
**The rule of thumb:** on the right-hand side / in a call, `...` spreads out. On the left-hand side / in a parameter list, `...` gathers in.

---

## Interview Q&A

**Q: Spread vs rest — same syntax, how do you tell them apart?**
> By direction and position. Spread expands a collection into individual values — used in array/object literals or function calls. Rest gathers individual values into a collection — used in destructuring patterns or function parameter lists. If it's on the receiving/left side, it's rest; if it's expanding something into a new context, it's spread.

**Q: Predict:**
```js
const { a = 10 } = { a: null };
const { b = 10 } = {};
const { c = 10 } = { c: undefined };
console.log(a, b, c);
```
> `null 10 10` — defaults only apply when the property is missing or explicitly `undefined`, never for `null`.

**Q: Why does `function greet({name} = {})` need the `= {}`?**
> Destructuring a parameter still requires *something* to destructure from. If `greet()` is called with no arguments, the parameter is `undefined`, and destructuring `undefined` throws immediately, before the inner `name` default ever gets a chance to apply. The outer `= {}` guarantees there's always an object to destructure, even an empty one.

---

## Follow-ups (challenge questions)

- *Consistency:* an API response sometimes sends `{ status: null }` and sometimes omits `status` entirely to mean "no status yet" — given destructuring defaults only catch `undefined`, what bug does that inconsistency cause downstream, and whose responsibility is it to normalize it?
- *Failure mode:* `const { data } = await fetchUser()` — what happens at the destructuring line specifically if the fetch fails and the function's catch block returns nothing (`undefined`)?

---

**Previous:** [Part 06 — Strings & Regex](06-strings-and-regex.md) · **Next:** [Part 08 — Prototype & Inheritance](08-prototype-and-inheritance.md)
