# JavaScript Study Notes — Part 19

## Polyfills ⭐⭐⭐⭐⭐

> The point isn't "memorize the polyfill" — it's proving you understand the *contract* well enough to reimplement it (what `reduce`'s initial-value-omitted behavior actually does, why `bind` needs to handle being called with `new`, etc.).

**Implement from scratch:** `Array.prototype.map` · `filter` · `reduce` · `Function.prototype.bind` · `call` · `apply` · `Promise.all` · `debounce` · `throttle` · `Array.prototype.flat`.

---

## 1. `Array.prototype.map`

> **Definition:** a polyfill is a from-scratch reimplementation of a built-in method's exact contract, usually attached to the relevant prototype, proving the underlying behavior is understood well enough to reproduce — not just used.

```js
Array.prototype.myMap = function (callback, thisArg) {
  const result = [];
  for (let i = 0; i < this.length; i++) {
    if (i in this) result[i] = callback.call(thisArg, this[i], i, this); // `i in this` skips
  }                                                                        // holes in sparse arrays
  return result;
};
```

## 2. `Array.prototype.filter`

```js
Array.prototype.myFilter = function (callback, thisArg) {
  const result = [];
  for (let i = 0; i < this.length; i++) {
    if (i in this && callback.call(thisArg, this[i], i, this)) result.push(this[i]);
  }
  return result;
};
```

## 3. `Array.prototype.reduce`

```js
Array.prototype.myReduce = function (callback, initialValue) {
  let acc = initialValue, startIndex = 0;
  const hasInitial = arguments.length >= 2;
  if (!hasInitial) {
    if (this.length === 0) throw new TypeError('Reduce of empty array with no initial value');
    acc = this[0];       // no initial value → first element becomes the seed
    startIndex = 1;         // and iteration starts from index 1, not 0
  }
  for (let i = startIndex; i < this.length; i++) {
    if (i in this) acc = callback(acc, this[i], i, this);
  }
  return acc;
};
```
**The contract detail that matters:** distinguishing "no initial value passed" from "initial value passed as `undefined`" requires checking `arguments.length`, not just `if (initialValue)` — the latter would incorrectly treat an explicitly-passed `0` or `undefined` initial value as "not provided."

## 4. `Function.prototype.myCall` and `myApply`

```js
Function.prototype.myCall = function (thisArg, ...args) {
  thisArg = thisArg ?? globalThis;              // null/undefined thisArg → global object
  const fnKey = Symbol('fn');                     // unique key avoids clobbering a real property
  thisArg[fnKey] = this;                            // `this` here is the function myCall was called ON
  const result = thisArg[fnKey](...args);           // invoking AS A METHOD sets `this` correctly (Part 03)
  delete thisArg[fnKey];
  return result;
};

Function.prototype.myApply = function (thisArg, argsArray = []) {
  return this.myCall(thisArg, ...argsArray);      // apply is just call with args pre-spread
};
```

## 5. `Function.prototype.myBind`

```js
Function.prototype.myBind = function (thisArg, ...boundArgs) {
  const originalFn = this;
  function bound(...callArgs) {
    // if called with `new`, `this` here is the new instance — ignore thisArg, honor `new`
    const isNewCall = this instanceof bound;
    return originalFn.apply(isNewCall ? this : thisArg, [...boundArgs, ...callArgs]);
  }
  bound.prototype = Object.create(originalFn.prototype || Object.prototype); // preserve `new` behavior
  return bound;
};
```
**Why `bind` needs to handle being called with `new`:** the real `Function.prototype.bind` allows the bound function to still be used as a constructor (`new BoundFn()`), in which case the bound `thisArg` should be **ignored** in favor of the newly constructed instance — a naive `bind` polyfill that always forces `thisArg` breaks this edge case, which is genuinely tested in senior-level interviews.

## 6. `Promise.all` (recap from [Part 11](11-promises.md#hands-on--implement-promiseall-from-scratch))

```js
function myPromiseAll(promises) {
  return new Promise((resolve, reject) => {
    const results = [];
    let completed = 0;
    if (promises.length === 0) return resolve([]);
    promises.forEach((p, i) => {
      Promise.resolve(p).then(value => {
        results[i] = value;
        if (++completed === promises.length) resolve(results);
      }).catch(reject);
    });
  });
}
```

## 7. `debounce` / `throttle` (recap from [Part 18](18-advanced-functional-patterns.md))

```js
function debounce(fn, wait) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}
function throttle(fn, wait) {
  let last = 0;
  return (...args) => { const now = Date.now(); if (now - last >= wait) { last = now; fn(...args); } };
}
```

## 8. `Array.prototype.flat`

```js
Array.prototype.myFlat = function (depth = 1) {
  const result = [];
  for (const item of this) {
    if (Array.isArray(item) && depth > 0) {
      result.push(...item.myFlat(depth - 1)); // recurse, decrementing remaining depth
    } else {
      result.push(item);
    }
  }
  return result;
};
// myFlat(Infinity) fully flattens — recursion just never hits the depth-0 base case
```

---

## Interview Q&A

**Q: What's the trickiest part of polyfilling `reduce`?**
> Correctly handling the omitted-initial-value case: you have to check `arguments.length`, not just truthiness of the initial value parameter, since a real initial value of `0` or `undefined` must still count as "provided." When omitted, the first array element becomes the seed and iteration starts from index 1 — and it must throw on an empty array with no initial value, matching the real method's contract exactly.

**Q: Why does a correct `bind` polyfill need to special-case being called with `new`?**
> Because the real `bind` still allows the returned function to be used as a constructor, and in that case the constructed instance — not the bound `thisArg` — must become `this` inside the function. A naive polyfill that always forces `thisArg` breaks `new BoundFn()`, which is a real, if rare, part of the contract.

**Q: How does `call` internally guarantee `this` is set correctly, without using the built-in `call`/`apply`/`bind` (which would be cheating)?**
> By temporarily attaching the function as a property of the target object under a unique key, then invoking it *as a method of that object* — implicit binding (Part 03) then naturally sets `this` to that object, exactly as if you'd written `obj.method()` directly. The property is deleted immediately after, so it doesn't leak into the object's real shape.

---

## Follow-ups (challenge questions)

- *Correctness:* `myMap`'s `i in this` check exists to skip holes in a sparse array (`[1, , 3]`) — what would go wrong (what would `myMap` produce) if that check were removed, versus the real `Array.prototype.map`'s actual documented behavior on sparse arrays?
- *Failure mode:* the `myCall` implementation above mutates `thisArg` temporarily (even though it deletes the key right after) — in a single-threaded language, is that actually unsafe, or is there a scenario (a getter/proxy on `thisArg`, or a thrown error inside the called function skipping the `delete`) where it could leak or misbehave?
- *Scale:* would you ever ship a hand-rolled polyfill like these to production instead of a library like `core-js`? What's the actual argument for "write it yourself" vs "depend on a battle-tested polyfill," beyond interview prep?

---

**Previous:** [Part 18 — Advanced Functional Patterns](18-advanced-functional-patterns.md) · **Next:** [Part 20 — Browser APIs](20-browser-apis.md)
