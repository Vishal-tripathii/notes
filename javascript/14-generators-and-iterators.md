# JavaScript Study Notes — Part 14

## Generators & Iterators ⭐⭐☆☆☆

**Topics:** the iterator protocol (`next()`, `{value, done}`) · `Symbol.iterator` and what makes something "iterable" · `function*` and `yield` · lazy evaluation via generators · a generator-based custom iterable.

---

## 1. The Iterator Protocol

> **Definition:** an object follows the **iterator protocol** if it has a `.next()` method that returns an object of the shape `{ value, done }` — `value` is the next produced value, and `done` is `true` once the sequence is exhausted.

```js
function makeRangeIterator(start, end) {
  let current = start;
  return {
    next() {
      if (current < end) return { value: current++, done: false };
      return { value: undefined, done: true };
    },
  };
}
const it = makeRangeIterator(1, 4);
it.next(); // { value: 1, done: false }
it.next(); // { value: 2, done: false }
it.next(); // { value: 3, done: false }
it.next(); // { value: undefined, done: true }
```

## 2. `Symbol.iterator` — What Makes Something Iterable

> **Definition:** an object is **iterable** if it implements a method keyed by the well-known symbol `Symbol.iterator`, which returns an iterator (per §1) — this is the single contract that lets `for...of`, spread (`...`), destructuring, and `Array.from` all work generically over arrays, strings, `Map`s, `Set`s, and any custom object that implements it.

```js
const range = {
  from: 1, to: 4,
  [Symbol.iterator]() {
    let current = this.from, last = this.to;
    return {
      next() {
        return current <= last ? { value: current++, done: false } : { value: undefined, done: true };
      },
    };
  },
};
for (const num of range) console.log(num); // 1, 2, 3, 4 — works because range is now iterable
[...range];                                    // [1, 2, 3, 4] — spread also relies on Symbol.iterator
```
**Iterable vs iterator, precisely:** an *iterable* has a `Symbol.iterator` method that *produces* an iterator; an *iterator* is the object with `.next()` actually doing the stepping. Arrays are iterable (`arr[Symbol.iterator]()` gives you an iterator); a plain array is not itself an iterator.

## 3. `function*` and `yield`

> **Definition:** a **generator function**, declared with `function*`, is a function that can be paused and resumed — calling it doesn't run its body immediately but returns a **generator object** (which is both iterable and an iterator). Each `yield` expression pauses execution and hands a value out to whoever called `.next()`; execution resumes from that exact point on the next `.next()` call.

```js
function* numberGenerator() {
  console.log('start');
  yield 1;
  console.log('resumed after first yield');
  yield 2;
  console.log('resumed after second yield');
  yield 3;
}
const gen = numberGenerator();     // nothing runs yet — body hasn't executed
gen.next(); // logs 'start', returns { value: 1, done: false }
gen.next(); // logs 'resumed after first yield', returns { value: 2, done: false }
gen.next(); // logs 'resumed after second yield', returns { value: 3, done: false }
gen.next(); // returns { value: undefined, done: true } — function body has fully run
```
A generator object automatically implements the iterator protocol *and* is iterable (has its own `Symbol.iterator` returning itself), so `for (const n of numberGenerator()) {}` and `[...numberGenerator()]` both just work — no manual `Symbol.iterator` boilerplate needed, unlike §2's `range` object.

## 4. Lazy Evaluation via Generators

> **Definition:** lazy evaluation means values are computed **only when actually requested** (each `.next()` call), rather than all at once up front — generators make this natural, since the body only advances as far as the next `yield` on demand.

```js
function* infiniteCounter() {
  let n = 0;
  while (true) yield n++; // would be an infinite loop / infinite array if eager — fine here
}
const counter = infiniteCounter();
counter.next().value; // 0
counter.next().value; // 1
counter.next().value; // 2 — only ever computes as many values as actually requested
```
This is impossible to represent as a plain array (`[0, 1, 2, ...]` forever would exhaust memory) — the generator only ever holds "where it currently is," not the whole sequence.

## 5. A Generator-Based Custom Iterable

```js
class LinkedList {
  #head = null;
  add(value) {
    const node = { value, next: null };
    if (!this.#head) this.#head = node;
    else {
      let cur = this.#head;
      while (cur.next) cur = cur.next;
      cur.next = node;
    }
    return this;
  }
  *[Symbol.iterator]() {           // generator method AS the Symbol.iterator implementation
    let cur = this.#head;
    while (cur) { yield cur.value; cur = cur.next; }
  }
}
const list = new LinkedList().add(1).add(2).add(3);
[...list];                          // [1, 2, 3] — for...of and spread now just work
for (const v of list) console.log(v);
```
Using a `*[Symbol.iterator]()` generator method is the idiomatic, low-boilerplate way to make a custom class iterable — no manual `{value, done}` object bookkeeping needed, `yield` handles it.

---

## Interview Q&A

**Q: What makes something "iterable" in JS?**
> Implementing a method under the well-known symbol `Symbol.iterator` that returns an object following the iterator protocol — a `.next()` method returning `{value, done}`. That single contract is what `for...of`, spread, destructuring, and `Array.from` all rely on, generically, across arrays, strings, Maps, Sets, and any custom object that implements it.

**Q: What's the difference between an iterable and an iterator?**
> An iterable *produces* iterators via `Symbol.iterator`. An iterator is the object actually doing the stepping via `.next()`. Confusingly, a generator object is both at once — it has its own `Symbol.iterator` that just returns itself.

**Q: Why are generators good for lazy evaluation?**
> A generator's body only advances to the next `yield` when `.next()` is actually called — nothing is computed ahead of time. That makes it possible to represent conceptually infinite or expensive-to-fully-compute sequences (an infinite counter, a stream of paginated API results) without ever materializing the whole thing in memory.

**Q: Predict:**
```js
function* gen() { yield 1; yield 2; return 3; yield 4; }
console.log([...gen()]);
for (const v of gen()) console.log(v);
```
> `[1, 2]` — spread stops collecting once `done: true`, and the `return 3` sets the *final* `{value: 3, done: true}`, which spread and `for...of` both discard (spread only gathers non-`done` values); `4` is unreachable code, never yielded. The `for...of` loop logs `1` then `2`, same reasoning.

---

## Follow-ups (challenge questions)

- *Scale:* processing a 10GB CSV file line by line — how does a generator-based line reader avoid loading the whole file into memory, compared to `file.split('\n')`?
- *Consistency:* a generator function is called twice (`const g1 = gen(); const g2 = gen();`) — do they share state, or does each call create an independent generator instance? What does that imply about using a single shared generator across multiple consumers?
- *Failure mode:* an infinite generator (`infiniteCounter` above) is accidentally spread with `[...infiniteCounter()]` instead of `.next()`-ed manually — what actually happens to the process?

---

**Previous:** [Part 13 — Error Handling](13-error-handling.md) · **Next:** [Part 15 — Map / Set / WeakMap / WeakSet](15-map-set-weakmap-weakset.md)
