# JavaScript Study Notes — Part 05

## Arrays ⭐⭐⭐⭐⭐

**Topics:** `map`/`filter`/`reduce`/`find`/`some`/`every`/`sort`/`slice`/`splice`/`flat`/`flatMap` — which mutate vs return new.

---

## 1. Mutating vs Non-Mutating — the table that matters most

> **Definition:** an array method is **mutating** if it modifies the original array in place (and typically returns something other than a full new array — a length, a removed element, or the same array reference); it is **non-mutating** if it leaves the original untouched and returns a brand-new array or value.

| Method | Mutates original? | Returns |
|---|---|---|
| `push` / `pop` / `shift` / `unshift` | ✅ | new length / removed element |
| `splice` | ✅ | removed elements array |
| `sort` / `reverse` | ✅ | the same array, sorted/reversed in place |
| `map` / `filter` / `slice` / `concat` / `flat` / `flatMap` | ❌ | new array |
| `reduce` | ❌ (unless you mutate the accumulator yourself) | accumulated value |
| `forEach` | ❌ (but the callback can mutate elements) | `undefined` |

```js
const arr = [3, 1, 2];
arr.sort();               // mutates! arr is now [1, 2, 3] — also the return value
const arr2 = [3, 1, 2];
[...arr2].sort();          // copy first if you need the original untouched
```
**Why `sort()` mutating matters:** forgetting this is a very common real bug — passing an array you don't own into `.sort()` (e.g. a prop, a cached reference) silently changes it for every other holder of that reference.

### ⚠️ The #1 `sort()` gotcha: it compares as **strings** by default

```js
[10, 1, 2, 25].sort();          // [1, 10, 2, 25]  ❌ — "10" comes before "2" alphabetically
[10, 1, 2, 25].sort((a, b) => a - b);   // [1, 2, 10, 25] ✅ ascending
[10, 1, 2, 25].sort((a, b) => b - a);   // [25, 10, 2, 1] ✅ descending
```

Without a comparator, `sort()` turns every element into a string and sorts alphabetically — like a dictionary. So **always pass a comparator for numbers.**

The comparator rule: return **negative** → `a` first, **positive** → `b` first, **0** → keep their order. `a - b` does exactly that for numbers.

```js
users.sort((a, b) => a.age - b.age);                    // by number
users.sort((a, b) => a.name.localeCompare(b.name));     // by text, handles accents / languages properly
users.sort((a, b) => a.city.localeCompare(b.city) || a.age - b.age);   // city, then age
```

`sort` is **stable** (since ES2019): items that compare equal keep their original order — that's what makes the "city, then age" trick reliable.

> 🧠 **Remember:** `sort()` with no comparator = **dictionary order.** Numbers need `(a, b) => a - b`.

### The copying versions (ES2023) — no more `[...arr].sort()`

| Mutates the original | Returns a new array instead |
|---|---|
| `arr.sort(fn)` | `arr.toSorted(fn)` |
| `arr.reverse()` | `arr.toReversed()` |
| `arr.splice(i, n, ...items)` | `arr.toSpliced(i, n, ...items)` |
| `arr[i] = x` | `arr.with(i, x)` |

```js
const prices = [30, 10, 20];
const sorted = prices.toSorted((a, b) => a - b);   // [10, 20, 30]
prices;                                             // [30, 10, 20] — untouched ✅
const updated = prices.with(0, 99);                 // [99, 10, 20]
```

These are perfect for React/Angular state, where you must never mutate the old array.

### More useful modern methods

```js
[5, 12, 8, 130].findLast(n => n > 10);        // 130 — search from the end
[5, 12, 8, 130].findLastIndex(n => n > 10);   // 3
Object.groupBy(users, u => u.city);           // { Pune: [...], Delhi: [...] } (ES2024)
Map.groupBy(users, u => u.city);              // same, but a Map
Array.from({ length: 3 }, (_, i) => i * 2);   // [0, 2, 4] — build an array from a length
Array.from(new Set([1, 1, 2]));               // [1, 2]
arr.includes(NaN);                            // true — unlike indexOf(NaN), which is -1
```

## 2. `map` vs `forEach`

> **Definition — `map`:** creates and returns a **new array** by calling a provided function on every element of the original array, collecting the return values.
> **Definition — `forEach`:** executes a provided function once for every array element for the sake of its **side effects**, and always returns `undefined`.

Using `map` and throwing away the result (or using `forEach` and expecting a transformed array back) are both code smells that signal confusion between the two.

## 3. `reduce` — the one that can implement everything else

> **Definition:** executes a "reducer" callback on each element of the array, in order, passing the running result (the accumulator) from one call to the next, and returns the single final accumulated value.

```js
const myMap = (arr, fn) => arr.reduce((acc, el, i) => [...acc, fn(el, i)], []);
const myFilter = (arr, fn) => arr.reduce((acc, el, i) => fn(el, i) ? [...acc, el] : acc, []);
```
`reduce`'s signature: `(accumulator, currentValue, index, array) => newAccumulator`, plus an optional initial value. **Omitting the initial value** uses the array's first element as the starting accumulator and starts iterating from index 1 — and throws `TypeError` on an empty array, whereas providing an initial value handles empty arrays gracefully (returns the initial value untouched).

## 4. `slice` vs `splice`

> **Definition — `slice(start, end)`:** returns a shallow copy of a portion of an array into a new array, without modifying the original; `end` is exclusive.
> **Definition — `splice(start, deleteCount, ...items)`:** changes the contents of an array **in place** by removing, replacing, or adding elements, and returns an array of the removed elements.

```js
const a = [1, 2, 3, 4, 5];
a.slice(1, 3);     // [2, 3] — NEW array, original untouched, end index exclusive
a.splice(1, 2);      // [2, 3] removed, ORIGINAL MUTATED to [1, 4, 5]
a.splice(1, 0, 'x'); // insert without removing: [1, 'x', 4, 5]
```
Mnemonic: **s**lice is **s**afe (non-mutating); s**p**lice **p**unches a hole in the original.

## 5. `flat` / `flatMap`

> **Definition — `flat(depth)`:** returns a new array with all sub-array elements concatenated into it, recursively, up to the specified depth (default `1`).
> **Definition — `flatMap`:** maps each element using a callback, then flattens the result into a new array by one level — equivalent to `.map().flat(1)` but done in a single pass.

```js
[1, [2, [3, [4]]]].flat();      // [1, 2, [3, [4]]] — default depth 1
[1, [2, [3, [4]]]].flat(Infinity); // [1, 2, 3, 4] — fully flattened
[1, 2, 3].flatMap(n => [n, n * 2]); // [1, 2, 2, 4, 3, 6] — map then flatten one level,
                                       // more efficient than .map().flat() (one pass)
```

## Hands-on

```js
const removeDuplicates = (arr) => [...new Set(arr)];

const groupBy = (arr, keyFn) => arr.reduce((acc, item) => {
  const key = keyFn(item);
  (acc[key] ??= []).push(item);
  return acc;
}, {});

const frequencyCounter = (arr) => arr.reduce((acc, item) => {
  acc[item] = (acc[item] || 0) + 1;
  return acc;
}, {});

const chunkArray = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

const rotateArray = (arr, k) => {
  const n = arr.length; k = ((k % n) + n) % n; // handle negative/oversized k
  return [...arr.slice(-k), ...arr.slice(0, n - k)];
};
```

---

## Interview Q&A

**Q: `map` vs `forEach`?**
> `map` returns a new transformed array and is for building data; `forEach` returns `undefined` and is purely for side effects. Using one where the other belongs is a readability smell.

**Q: Why can `reduce` implement every other array method?**
> Every array operation is fundamentally "start with something, fold each element into it" — `map` folds into a new array with each element transformed, `filter` folds by conditionally including, `find` folds by short-circuiting on match. `reduce` exposes that general shape directly.

**Q: `slice` vs `splice`?**
> `slice(start, end)` returns a new array, non-mutating, end exclusive. `splice(start, deleteCount, ...items)` mutates the original in place, removing and/or inserting, and returns the removed elements.

**Q: Why does `sort()` mutating matter, concretely?**
> If you pass a shared array reference into `.sort()` without copying first, you silently mutate it for every other place holding that same reference — a very real bug with props/cached data/references passed around a codebase.

**Q: What does `[10, 1, 2].sort()` return, and why?**
> `[1, 10, 2]`. Without a comparator, `sort` converts elements to strings and compares them alphabetically, and `"10"` comes before `"2"`. For numbers, pass `(a, b) => a - b`. It also sorts in place — use `toSorted()` if the original must stay unchanged.

**Q: How do you sort without mutating the original array?**
> `arr.toSorted(compareFn)` (ES2023), or in older code `[...arr].sort(compareFn)`. Same family: `toReversed()`, `toSpliced()`, `with(index, value)` — each returns a new array. Important for UI state, where mutation breaks change detection.

**Q: Predict:**
```js
console.log([1,2,3].reduce((a,b) => a+b));
console.log([].reduce((a,b) => a+b, 0));
console.log([].reduce((a,b) => a+b));
```
> `6` (no initial → first element `1` is the start, iterates from index 1) · `0` (initial value, empty array just returns it) · `TypeError: Reduce of empty array with no initial value`.

---

## Follow-ups (challenge questions)

- *Failure mode:* a component does `props.items.sort(compareFn)` directly inside a render function — what breaks, and why might it only show up intermittently depending on render order/caching?
- *Scale:* `groupBy` above rebuilds a new array reference (`acc[key] ??= []`) — for a 1M-row dataset, would you reach for this `reduce` pattern or something else, and why?
- *Consistency:* `arr.flatMap(x => x > 0 ? [x] : [])` is a common trick to filter+map in one pass — walk through why it works, and when the extra pass of a plain `.filter().map()` chain is actually the clearer choice despite being "less clever."

---

**Previous:** [Part 04 — Objects](04-objects.md) · **Next:** [Part 06 — Strings & Regex](06-strings-and-regex.md)
