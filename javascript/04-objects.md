# JavaScript Study Notes — Part 04

## Objects ⭐⭐⭐⭐⭐

**Topics:** object creation · `Object.freeze()` vs `Object.seal()` · `Object.assign()` · property descriptors · `?.` / `??` · shallow vs deep copy.

---

## 1. Creating Objects

> **Definition:** an object is an unordered collection of key-value pairs (properties), where keys are strings or symbols and values can be any type, including other objects or functions.

```js
const literal = { name: 'V' };
function Person(name) { this.name = name; }
const p1 = new Person('V');
const proto = { greet() { return `Hi, ${this.name}`; } };
const p2 = Object.create(proto); p2.name = 'V'; p2.greet(); // resolved via prototype chain
const bare = Object.create(null); bare.toString; // undefined — no inherited prototype at all
```

## 2. `Object.freeze()` vs `Object.seal()`

> **Definition — `Object.seal()`:** prevents new properties from being added and marks all existing properties non-configurable (can't delete/reconfigure), but existing values remain writable.
> **Definition — `Object.freeze()`:** does everything `seal()` does, and additionally makes every existing property non-writable — the object becomes fully immutable at the top level.

| | Add props? | Delete props? | Modify values? |
|---|---|---|---|
| `seal()` | ❌ | ❌ | ✅ |
| `freeze()` | ❌ | ❌ | ❌ |

**Both are shallow** — `Object.freeze({nested:{a:1}})` still lets `obj.nested.a = 2` through; freeze only locks the outer object's own property slots.

## 3. `Object.assign()`

> **Definition:** a method that copies all enumerable own properties from one or more source objects to a target object, left to right, and returns the mutated target.

```js
const merged = Object.assign({}, obj1, obj2); // safe pattern — empty target avoids mutating obj1
// equivalent to { ...obj1, ...obj2 } — also shallow, see §6
```

## 4. Property Descriptors

> **Definition:** the metadata associated with an object property beyond its value — the flags `writable` (can the value change), `enumerable` (does it appear in enumeration like `for...in`/`Object.keys`), and `configurable` (can it be deleted or have its descriptor changed).

```js
Object.defineProperty(obj, 'id', { value: 42, writable: false, enumerable: false, configurable: false });
```
Literal properties default all three flags to `true`. `Object.freeze()` is implemented by setting `writable:false, configurable:false` on every own property via this mechanism.

## 5. `?.` and `??`

> **Definition — Optional chaining (`?.`):** short-circuits and evaluates to `undefined` instead of throwing when it encounters a `null`/`undefined` reference partway through a property/method access chain.
> **Definition — Nullish coalescing (`??`):** returns its right-hand operand only when the left-hand operand is `null` or `undefined`; otherwise returns the left-hand operand unchanged.

```js
user.address?.city;      // undefined instead of throwing, if address is null/undefined
user.greet?.();            // calls only if it exists
const volume = level ?? 10; // fallback ONLY on null/undefined — unlike ||, 0 stays 0
```
**The `||` bug `??` fixes:** `level || 10` incorrectly replaces a legitimate `0` (e.g. "muted") with `10`.

## 6. Shallow vs Deep Copy

> **Definition — Shallow copy:** a new object whose top-level properties are copied, but any nested object/array values still point to the exact same referenced objects as the original.
> **Definition — Deep copy:** a fully independent copy where every level of nested object/array is recursively duplicated, sharing no references with the original.

```js
const shallow = { ...original };
shallow.nested.b = 99; // MUTATES original.nested.b too — nested objects are still shared refs

const deep = structuredClone(original); // modern, handles Dates/Maps/Sets/circular refs
const deepOld = JSON.parse(JSON.stringify(original)); // loses functions/undefined/Symbol,
                                                          // Dates→strings, Map/Set→{}
```

## Hands-on

```js
function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value); // circular refs
  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);
  for (const key in value) if (Object.hasOwn(value, key)) clone[key] = deepClone(value[key], seen);
  return clone;
}

function flattenObject(obj, prefix = '') {
  return Object.keys(obj).reduce((acc, key) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      Object.assign(acc, flattenObject(obj[key], path));
    } else acc[path] = obj[key];
    return acc;
  }, {});
}
// flattenObject({a:1, b:{c:2, d:{e:3}}}) → {'a':1, 'b.c':2, 'b.d.e':3}
```

---

## Interview Q&A

**Q: `freeze` vs `seal`, precisely?**
> Both block add/delete. `seal` still allows modifying existing values; `freeze` locks those too. Both shallow — nested objects stay fully mutable.

**Q: Why is `{...obj}` a shallow copy, and where does it bite you?**
> Only top-level own enumerable props are copied; nested objects/arrays are shared references. Bites you when you mutate a nested field on what you thought was independent state — common in state-management bugs.

**Q: `??` vs `||`, what bug does `??` fix?**
> `||` falls back on any falsy value, including legitimate `0`/`''`/`false`. `??` only falls back on `null`/`undefined`, which is usually what "give me a default if not provided" actually means.

**Q: Predict:**
```js
const obj = Object.freeze({ a: 1, nested: { b: 2 } });
obj.a = 100; obj.nested.b = 200;
console.log(obj.a, obj.nested.b);
```
> `1 200` — `a` protected by freeze; `nested`'s own properties are untouched by a shallow freeze.

---

## Follow-ups (challenge questions)

- *Failure mode:* a Redux-style reducer does `return {...state, user: {...state.user, name}}` — why does this pattern exist at all, and what breaks if a deeply nested field is updated without spreading every level in between?
- *Scale:* `structuredClone` on a 50MB object graph — what's actually expensive about it compared to just copying a reference, and when would you deliberately avoid deep-cloning at all?
- *Consistency:* two parts of an app both hold `{...sharedConfig}` copies taken at different times — what happens when the original `sharedConfig` object is later mutated in place rather than reassigned?

---

**Previous:** [Part 03 — `this`, `call`/`apply`/`bind`](03-this-call-apply-bind.md) · **Next:** [Part 05 — Arrays](05-arrays.md)
