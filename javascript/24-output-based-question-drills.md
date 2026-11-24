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
> `'V'`, then it **depends on where the code runs**: in an ES module it **throws** (outer `this` is `undefined`); in an old browser script it's `''` (`window.name`); in a Node CommonJS file it's `undefined`. The key idea: the arrow captured `this` from *outside* the object literal, never `obj`. Full table: [Part 03](03-this-call-apply-bind.md).

---

## D. Coercion & Equality ([Part 00](00-js-fundamentals.md))

**9.**
```js
console.log([] + []);
console.log([] + {});
console.log({} + []);
console.log(1 + '1' - 1);
```
> `''`, `'[object Object]'`, `'[object Object]'`, `10`. Inside `console.log(...)` the `{}` is always an object (it's an argument, so an expression). The famous `{} + [] → 0` only happens when you type it **alone** at the start of a line in a console: then `{}` is read as an empty *block*, and what's left is `+[]` → `0`. And `1 + '1'` is `'11'` (string concat), then `'11' - 1` is `10` (numeric).

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
> Non-strict script: `1 99` — the write to `a` is silently ignored; freeze is shallow, so `nested.b` changes. **Strict mode** (ES modules, classes): `obj.a = 99` throws a `TypeError` and nothing is logged.

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

---

## I. Promises — the details ([Part 11](11-promises.md))

**26.**
```js
console.log('A');
new Promise(res => { console.log('B'); res(); console.log('C'); })
  .then(() => console.log('D'));
console.log('E');
```
> `A, B, C, E, D` — the executor runs **synchronously** during `new Promise`, and `res()` doesn't stop it (`C` still prints). Only `.then` is async.

**27.**
```js
Promise.resolve(1).finally(() => 2).then(v => console.log(v));
```
> `1` — `finally` passes the original value through; its own return value is ignored.

**28.**
```js
Promise.resolve(1).then(2).then(v => console.log(v));
```
> `1` — `.then()` with something that isn't a function is ignored; the value passes straight through.

**29.**
```js
const p = new Promise((res, rej) => { res('first'); rej('second'); res('third'); });
p.then(console.log, console.log);
```
> `'first'` — a promise settles once; later `resolve`/`reject` calls are ignored.

**30.**
```js
async function f() { return 1; }
console.log(f());
```
> A **promise**, not `1` — browser console shows `Promise {<fulfilled>: 1}`, Node shows `Promise { 1 }`. An `async` function always returns a promise.

**31.**
```js
Promise.any([Promise.reject(1), Promise.reject(2)])
  .catch(e => console.log(e.constructor.name, e.errors));
```
> `AggregateError [1, 2]` — `any` only rejects when **all** reject, collecting every reason.

**32.**
```js
Promise.race([
  new Promise(r => setTimeout(() => r('slow'), 100)),
  Promise.resolve('fast'),
]).then(console.log);
```
> `'fast'` — `race` takes the first to settle. (The slow timer still runs; `race` doesn't cancel it.)

---

## J. Event loop — harder ones ([Part 10](10-event-loop-and-concurrency-model.md), [Part 12](12-async-await.md))

**33.**
```js
setTimeout(() => console.log('t1'), 0);
setTimeout(() => {
  console.log('t2');
  Promise.resolve().then(() => console.log('p inside t2'));
}, 0);
setTimeout(() => console.log('t3'), 0);
```
> `t1, t2, p inside t2, t3` — after **each** macrotask, the microtask queue is drained before the next one. (Same in browsers and Node 11+.)

**34.**
```js
async function a() { console.log(1); await Promise.resolve(); console.log(2); }
async function b() { console.log(3); await a(); console.log(4); }
b();
console.log(5);
```
> `3, 1, 5, 2, 4` — `b` runs until it calls `a`; `a` runs until its `await`; both pause; `5` is sync. Then `a` resumes (`2`) and finishes, which lets `b` resume (`4`).

**35.**
```js
try {
  setTimeout(() => { throw new Error('boom'); }, 0);
} catch (e) {
  console.log('caught');
}
console.log('after');
```
> `after`, then an **uncaught** `Error: boom` — the `try` finished long before the timer fires. `catch` only catches errors thrown while the `try` block is running.

**36.**
```js
const results = [];
[1, 2, 3].forEach(async (n) => { await null; results.push(n); });
console.log(results);
```
> `[]` — `forEach` doesn't wait for async callbacks; the pushes happen later as microtasks. Use `for...of` with `await`, or `await Promise.all(arr.map(...))`.

**37.**
```js
for (var i = 0; i < 3; i++) setTimeout(console.log, 0, i);
```
> `0, 1, 2` — trick question! The extra arguments to `setTimeout` are evaluated **when `setTimeout` is called**, so each timer gets the value of `i` at that moment. No closure is involved.

---

## K. `this`, scope & hoisting — harder ones ([Parts 00, 01, 03](03-this-call-apply-bind.md))

**38.**
```js
const obj = {
  count: 10,
  start()      { setTimeout(function () { console.log(this.count); }, 0); },
  startArrow() { setTimeout(() => console.log(this.count), 0); },
};
obj.start();
obj.startArrow();
```
> `undefined`, then `10` — a regular function callback gets the timer's own `this` (`window` in browsers, a `Timeout` object in Node), neither has `count`. The arrow keeps `obj` from `startArrow`.

**39.**
```js
function f() { return this.x; }
const g = f.bind({ x: 1 }).bind({ x: 2 });
console.log(g());
```
> `1` — a bound function's `this` is fixed forever; binding it again can't change it.

**40.**
```js
class A {
  name = 'A';
  arrow = () => this.name;
  method() { return this.name; }
}
const { arrow, method } = new A();
console.log(arrow());
console.log(method());
```
> `'A'`, then **`TypeError`** — the arrow class field captured `this` when the instance was created. `method` lives on the prototype; detached, it's called with no receiver, and class code is strict, so `this` is `undefined`.

**41.**
```js
let x = 1;
{
  console.log(x);
  let x = 2;
}
```
> `ReferenceError` — the inner `let x` exists for the whole block (hoisted) but is in the TDZ at the `console.log`. It does **not** fall back to the outer `x = 1`.

**42.**
```js
var a = 1;
function f() {
  console.log(a);
  var a = 2;
}
f();
```
> `undefined` — the inner `var a` is hoisted to the top of `f`, shadowing the outer `a`, but its value isn't assigned yet.

---

## L. Numbers & coercion ([Parts 28–29](28-numbers-and-dates.md))

**43.**
```js
console.log([10, 1, 2].sort());
```
> `[1, 10, 2]` — default `sort` compares as **strings**. Use `(a, b) => a - b`.

**44.**
```js
console.log(['1', '2', '3'].map(parseInt));
```
> `[1, NaN, NaN]` — `map` passes `(value, index)`, so it's `parseInt('2', 1)` and `parseInt('3', 2)`.

**45.**
```js
console.log(0.1 + 0.2 === 0.3, 0.1 + 0.2);
```
> `false 0.30000000000000004` — binary floating point.

**46.**
```js
console.log([] == ![], null == 0, null >= 0);
```
> `true false true` — `![]` is `false` → `[] == false` → `'' == 0` → true. `null` only `==` `undefined`. But `>=` converts `null` to `0`.

**47.**
```js
console.log(typeof NaN, NaN === NaN, Number.isNaN('abc'), isNaN('abc'));
```
> `'number' false false true` — global `isNaN` converts first; `Number.isNaN` doesn't.

**48.**
```js
console.log('5' + 3, '5' - 3, '5' * '2', true + 1, [1, 2] + [3]);
```
> `'53' 2 10 2 '1,23'` — `+` with a string joins; other maths operators convert to numbers; arrays become strings.

---

## M. Objects & references ([Part 04](04-objects.md))

**49.**
```js
const a = { x: 1 };
const b = { ...a, nested: { y: 1 } };
const c = { ...b };
c.nested.y = 2;
c.x = 3;
console.log(a.x, b.x, b.nested.y);
```
> `1 1 2` — spread is shallow: `c.x` is its own copy, but `c.nested` is the *same* object as `b.nested`.

**50.**
```js
const k1 = { id: 1 }, k2 = { id: 2 };
const obj = {};
obj[k1] = 'a';
obj[k2] = 'b';
console.log(obj[k1], Object.keys(obj));
```
> `'b' ['[object Object]']` — plain-object keys are strings, so both objects become the key `'[object Object]'`. Use a `Map` for object keys ([Part 15](15-map-set-weakmap-weakset.md)).

**51.**
```js
const arr = [1, 2, 3];
arr.length = 1;
console.log(arr, arr[2]);
```
> `[1] undefined` — setting `length` smaller deletes the extra elements.

---

## N. Generators ([Part 14](14-generators-and-iterators.md))

**52.**
```js
function* g() {
  const x = yield 1;
  console.log('got', x);
  yield x * 2;
}
const it = g();
console.log(it.next().value);
console.log(it.next(5).value);
```
> `1`, then `got 5`, then `10` — the value passed to `next(5)` becomes the result of the paused `yield` expression. (The first `next()`'s argument is always ignored.)

---

*(52 questions — target reached. Keep adding real ones from interviews, especially for Parts 10–12.)*

---

**Previous:** [Part 23 — Modern JavaScript Features](23-modern-javascript-features.md) · **Next:** [Part 25 — Coding & Machine Coding Round](25-coding-and-machine-coding-round.md)
