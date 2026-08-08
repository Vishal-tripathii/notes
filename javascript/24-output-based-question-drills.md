# JavaScript Study Notes — Part 24

## Output-Based Question Drills ⭐⭐⭐⭐⭐

> A **running file** — add to it after every part that produces a good output-prediction question, rather than treating this as finished. Weighted heavily toward the Event Loop/Promises/async-await cluster and closures-in-loops, since real interview output questions cluster there hardest. **Predict before revealing the answer** — that's the entire point of this drill format.

---

## A. Closures & Scope ([Part 01](01-scope-and-closures.md))

**1.**
```js
for (var i = 0; i < 3; i++) { setTimeout(() => console.log(i), 0); }
for (let j = 0; j < 3; j++) { setTimeout(() => console.log(j), 0); }
```
> `3 3 3` then `0 1 2` — `var` shares one binding across the whole loop; `let` creates a fresh binding per iteration.

**2.**
```js
function outer() {
  let x = 10;
  return function inner() { x++; return x; };
}
const f1 = outer(), f2 = outer();
console.log(f1(), f1(), f2());
```
> `11 12 11` — `f1`/`f2` are independent closures over separate `x` variables.

**3.**
```js
const funcs = [];
for (let i = 0; i < 3; i++) { funcs.push(() => i); }
console.log(funcs.map(f => f()));
```
> `[0, 1, 2]` — same fresh-binding-per-iteration reasoning as #1, just collected instead of timed.

---

## B. Hoisting & TDZ ([Part 00](00-js-fundamentals.md))

**4.**
```js
console.log(a);
var a = 1;
console.log(b);
let b = 2;
```
> `undefined`, then `ReferenceError: Cannot access 'b' before initialization` — `var` hoists initialized to `undefined`; `let` hoists uninitialized (TDZ).

**5.**
```js
function test() {
  console.log(x);
  if (true) { var x = 'inner'; }
}
test();
```
> `undefined` — `var` is function-scoped, so the declaration hoists to the top of `test()`, not just the `if` block; the assignment hasn't run yet at the `console.log`.

**6.**
```js
foo();
function foo() { console.log('a'); }
var foo = function () { console.log('b'); };
```
> `'a'` — the function *declaration* fully hoists first; the later `var foo = ...` assignment only overwrites `foo` once execution actually reaches that line, which is after the call.

---

## C. `this` & Binding ([Part 03](03-this-call-apply-bind.md))

**7.**
```js
const obj = {
  name: 'V',
  greet() { return `Hi, ${this.name}`; },
};
const greetFn = obj.greet;
console.log(obj.greet());
console.log(greetFn());
```
> `'Hi, V'`, then throws (or `'Hi, undefined'` non-strict) — detached from `obj`, `greetFn()` has no receiver at the call site.

**8.**
```js
const obj = {
  name: 'V',
  regular: function () { return this.name; },
  arrow: () => this.name,
};
console.log(obj.regular(), obj.arrow());
```
> `'V' undefined` — the arrow captured `this` from outside the object literal entirely, never `obj`.

---

## D. Coercion & Equality ([Part 00](00-js-fundamentals.md))

**9.**
```js
console.log([] + []);
console.log([] + {});
console.log({} + []);
console.log(1 + '1' - 1);
```
> `''`, `'[object Object]'`, `0` or `'[object Object]'` (depends on statement-vs-expression parsing of the leading `{}`), `10` — `1 + '1'` is `'11'` (string concat), then `'11' - 1` is `10` (numeric).

**10.**
```js
console.log(null == undefined);
console.log(null === undefined);
console.log(NaN === NaN);
console.log([1,2] == '1,2');
```
> `true`, `false`, `false`, `true` — arrays coerce to strings via `toString()` for `==`, and `[1,2].toString()` is `'1,2'`.

---

## E. Event Loop, Promises, async/await ([Parts 10–12](10-event-loop-and-concurrency-model.md)) — the highest-yield cluster

**11.**
```js
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
console.log('4');
```
> `1, 4, 3, 2` — sync first, then the microtask queue drains completely, then the macrotask.

**12.**
```js
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3')).then(() => console.log('4'));
Promise.resolve().then(() => console.log('5'));
console.log('6');
```
> `1, 6, 3, 5, 4` — sync first; the FIRST `.then()` off each of the two promise chains runs before either chain's SECOND `.then()`, because each `.then()` call only schedules the *next* microtask once the current one actually runs.

**13.**
```js
async function a() {
  console.log('a1');
  await null;
  console.log('a2');
}
console.log('start');
a();
console.log('end');
```
> `start, a1, end, a2` — `a()` runs synchronously up to `await`, then yields control back to the caller; `a2` becomes a microtask that runs after the synchronous `end`.

**14.**
```js
async function foo() {
  console.log('foo start');
  await bar();
  console.log('foo end');
}
async function bar() { console.log('bar'); }
foo();
console.log('sync end');
```
> `foo start, bar, sync end, foo end` — `bar()` runs fully synchronously (no `await` inside it); `await` on its resolved-promise return value still defers `foo end` to a microtask.

**15.**
```js
setTimeout(() => console.log('timeout'), 0);
Promise.resolve().then(() => {
  console.log('promise 1');
  Promise.resolve().then(() => console.log('promise 2 (nested)'));
});
console.log('sync');
```
> `sync, promise 1, promise 2 (nested), timeout` — a microtask scheduling ANOTHER microtask still drains before the macrotask, since the queue is drained completely, not just one level.

**16.**
```js
async function process(items) {
  for (const item of items) {
    await new Promise(res => setTimeout(res, 10));
    console.log(item);
  }
}
process(['a', 'b', 'c']);
console.log('started');
```
> `started, a, b, c` (each ~10ms apart) — the classic sequential-`await`-in-a-loop pattern; each iteration fully waits for the previous one's timer.

**17.**
```js
Promise.all([
  Promise.resolve(1),
  new Promise((res) => setTimeout(() => res(2), 100)),
  Promise.reject('error'),
]).then(console.log).catch(console.log);
```
> `'error'` — `Promise.all` rejects as soon as the FIRST rejection occurs (the synchronous rejection here beats even the resolved-immediately promise's ordering in terms of final outcome), regardless of the still-pending 100ms timer.

**18.**
```js
console.log('1');
queueMicrotask(() => console.log('2'));
setTimeout(() => console.log('3'), 0);
Promise.resolve().then(() => console.log('4'));
console.log('5');
```
> `1, 5, 2, 4, 3` — `queueMicrotask` and `.then()` both go on the microtask queue, in the order they were *scheduled* (FIFO within the microtask queue), both ahead of the macrotask.

---

## F. Arrays & Objects ([Parts 04–05](04-objects.md))

**19.**
```js
console.log([1, 2, 3].reduce((a, b) => a + b));
console.log([].reduce((a, b) => a + b, 0));
```
> `6`, then `0` — no initial value uses the first element as the seed; an initial value handles the empty-array case gracefully.

**20.**
```js
const obj = Object.freeze({ a: 1, nested: { b: 2 } });
obj.a = 99;
obj.nested.b = 99;
console.log(obj.a, obj.nested.b);
```
> `1 99` — freeze is shallow; the nested object's own properties are untouched.

**21.**
```js
const arr = [1, 2, 3];
const arr2 = arr;
arr2.push(4);
console.log(arr);
const arr3 = [...arr];
arr3.push(5);
console.log(arr, arr3);
```
> `[1,2,3,4]`, then `[1,2,3,4] [1,2,3,4,5]` — `arr2 = arr` is the same reference; spreading creates a genuinely new (shallow) array.

**22.**
```js
console.log(typeof null);
console.log(typeof undefined);
console.log(typeof NaN);
console.log(typeof []);
console.log(typeof function(){});
```
> `'object'`, `'undefined'`, `'number'`, `'object'`, `'function'`.

---

## G. Classes & Prototypes ([Parts 08–09](08-prototype-and-inheritance.md))

**23.**
```js
function Foo() {}
Foo.prototype.greet = function () { return 'hi'; };
const f1 = new Foo();
Foo.prototype.greet = function () { return 'bye'; };
console.log(f1.greet());
```
> `'bye'` — `f1` doesn't hold its own copy of `greet`; it looks it up on `Foo.prototype` fresh every call, and that prototype object was mutated.

**24.**
```js
class Counter {
  #count = 0;
  increment() { return ++this.#count; }
}
const c = new Counter();
console.log(c.increment(), c.increment());
console.log(Object.keys(c));
```
> `1 2`, then `[]` — `#count` is a private field, entirely invisible to `Object.keys()`.

---

## H. Generators ([Part 14](14-generators-and-iterators.md))

**25.**
```js
function* gen() { yield 1; yield 2; return 3; }
const it = gen();
console.log(it.next());
console.log(it.next());
console.log(it.next());
console.log(it.next());
```
> `{value:1,done:false}`, `{value:2,done:false}`, `{value:3,done:true}`, `{value:undefined,done:true}` — the `return` value is delivered once with `done:true`; calling `.next()` again afterward just keeps returning the exhausted state.

---

*(Target: 50+. Currently 25 — add more as each part surfaces a good candidate, prioritizing Parts 10–12 and Part 01 per the roadmap's guidance.)*

---

**Previous:** [Part 23 — Modern JavaScript Features](23-modern-javascript-features.md) · **Next:** [Part 25 — Coding & Machine Coding Round](25-coding-and-machine-coding-round.md)
