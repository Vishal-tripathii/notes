# DSA Notes — Arrays & Strings, Sub-Part 01.2

## Prefix Sum & Difference Arrays

**Recognize this bucket:** repeated **range** queries (sum/product of a sub-range) on a **static or update-then-query** array — the signal is needing the same kind of range computation more than once, which makes precomputing worthwhile.

**The core idea:** a prefix-sum array `P` where `P[i]` = sum of `arr[0..i-1]` turns any range-sum query `[i, j]` into a single subtraction, `P[j+1] - P[i]`, instead of re-summing the range from scratch every time — trading O(n) preprocessing once for O(1) per query afterward.

---

### 1. Range Sum Query — Immutable — Easy

**Recognize it:** "many `sumRange(i, j)` calls on a fixed array" — the textbook prefix-sum setup.

**Approach:** precompute prefix sums once at construction; answer each query with one subtraction.

**Complexity:** O(n) to build, O(1) per query — versus O(n) per query with no precomputation, which matters a lot if there are many queries.

```js
class NumArray {
  constructor(nums) {
    this.prefix = [0]; // prefix[i] = sum of nums[0..i-1]
    for (const num of nums) {
      this.prefix.push(this.prefix[this.prefix.length - 1] + num);
    }
  }
  sumRange(i, j) {
    return this.prefix[j + 1] - this.prefix[i]; // O(1) — the entire point of precomputing
  }
}
```

**Follow-up:** the array is now **mutable** (`update(i, val)` can change a value) — a plain prefix-sum array breaks (every update would need an O(n) rebuild); the standard fix is a **Fenwick tree / Binary Indexed Tree** for O(log n) update and query, worth naming even if not implementing.

---

### 2. Find Pivot Index — Easy

**Recognize it:** "index where left sum equals right sum" — a direct prefix-sum application once you see it as comparing two range sums.

**Approach:** total sum minus prefix-so-far minus current element gives the right-side sum at each index; compare against the running left-side sum.

**Complexity:** O(n) time, O(1) space (running sums, no stored array needed).

```js
function pivotIndex(nums) {
  const total = nums.reduce((a, b) => a + b, 0);
  let leftSum = 0;
  for (let i = 0; i < nums.length; i++) {
    const rightSum = total - leftSum - nums[i];
    if (leftSum === rightSum) return i;
    leftSum += nums[i];
  }
  return -1;
}
```

**Follow-up:** find ALL pivot indices, not just the first — trivial extension, collect into an array instead of early-returning.

---

### 3. Product of Array Except Self — Medium

**Recognize it:** "product of everything except index i, in O(n), no division" — the no-division constraint rules out the obvious "total product / nums[i]" shortcut (which also breaks on zeroes), pushing toward a prefix/suffix product approach.

**Approach:** for each index, the answer is (product of everything to its left) × (product of everything to its right) — compute left-products and right-products as two passes, or one pass each direction accumulated into the output array directly.

**Complexity:** O(n) time, O(1) extra space (excluding the output array, which the problem doesn't count against you).

```js
function productExceptSelf(nums) {
  const n = nums.length;
  const result = new Array(n).fill(1);

  let leftProduct = 1;
  for (let i = 0; i < n; i++) {
    result[i] = leftProduct;      // everything to the LEFT of i, so far
    leftProduct *= nums[i];
  }

  let rightProduct = 1;
  for (let i = n - 1; i >= 0; i--) {
    result[i] *= rightProduct;    // multiply in everything to the RIGHT of i
    rightProduct *= nums[i];
  }

  return result;
}
```
**Why this is the prefix-sum pattern in disguise:** it's a "prefix product" and "suffix product" combined — structurally identical to prefix-sum range queries, just with multiplication instead of addition, and computed on the fly instead of stored as a separate array.

**Follow-up:** the array **can** contain zeroes — verify the solution above still works (it does: a single zero makes every OTHER index's left-or-right product include it and go to zero, while the zero's own index gets the product of everything else — trace through `[1,2,0,4]` to confirm).

---

### 4. Range Addition (Difference Array) — Medium

**Recognize it:** "apply many range UPDATES (add a value to every element in `[i,j]`), then read the final array" — the difference-array pattern's signature use case, the mirror image of prefix sum (prefix sum precomputes for fast range *reads*; a difference array enables fast range *writes*).

**Approach:** instead of updating every element in `[i, j]` directly (O(range length) per update), maintain a difference array `D` where `D[i] += val` and `D[j+1] -= val` — O(1) per update. Taking the prefix sum of `D` at the end reconstructs the fully-updated array in one O(n) pass.

**Complexity:** O(1) per update, O(n) to reconstruct the final array — versus O(range length) per update with the naive approach.

```js
function getModifiedArray(length, updates) {
  const diff = new Array(length + 1).fill(0);
  for (const [start, end, val] of updates) {
    diff[start] += val;         // "start adding val from here"
    diff[end + 1] -= val;         // "stop adding val after here"
  }
  // reconstruct via prefix sum of the difference array
  const result = [];
  let running = 0;
  for (let i = 0; i < length; i++) {
    running += diff[i];
    result.push(running);
  }
  return result;
}
```
**Why this works, intuitively:** `D[i] += val` and `D[j+1] -= val` encode "a +val boost starts at i and cancels out right after j" — taking the running (prefix) sum of `D` naturally accumulates that boost across the whole `[i, j]` range and correctly drops back down afterward, without ever touching each individual element during the update itself.

**Follow-up:** Corporate Flight Bookings (Problem 5) is this exact pattern applied to a named, realistic scenario — recognizing it as "just Range Addition again" is the actual skill.

---

### 5. Corporate Flight Bookings — Medium

**Recognize it:** "for each booking `[first, last, seats]`, add `seats` to every flight from `first` to `last`, return the final seat count per flight" — literally Problem 4's difference-array pattern with different variable names.

**Approach:** identical to Range Addition — a difference array where each booking contributes `+seats` at `first` and `-seats` just after `last`, then a final prefix-sum pass reconstructs the answer.

**Complexity:** O(n + bookings) time, O(n) space.

```js
function corpFlightBookings(bookings, n) {
  const diff = new Array(n + 1).fill(0);
  for (const [first, last, seats] of bookings) {
    diff[first - 1] += seats;    // 1-indexed in the problem, adjust to 0-indexed
    diff[last] -= seats;
  }
  const result = [];
  let running = 0;
  for (let i = 0; i < n; i++) {
    running += diff[i];
    result.push(running);
  }
  return result;
}
```

**Follow-up:** what if a booking could also be **cancelled** later (a fourth operation type)? Same difference-array structure — a cancellation is just applying the negated version of the original booking's diff update.

---

### 6. Number of Ways to Split Array — Medium

**Recognize it:** "split into two parts, compare aggregate properties (sum ≥, sum ==) of each side" — prefix sum turns "sum of the left part up to index i" into an O(1) lookup instead of re-summing for every candidate split point.

**Approach:** precompute the total sum, then walk the array once maintaining a running left-sum; at each candidate split point, the right-sum is `total - leftSum`, letting you check the split condition in O(1) per index.

**Complexity:** O(n) time, O(1) extra space.

```js
function waysToSplitArray(nums) {
  const total = nums.reduce((a, b) => a + b, 0);
  let leftSum = 0, count = 0;
  for (let i = 0; i < nums.length - 1; i++) { // can't split after the LAST element
    leftSum += nums[i];
    const rightSum = total - leftSum;
    if (leftSum >= rightSum) count++;
  }
  return count;
}
```

**Follow-up:** generalize to splitting into **three** parts with a sum condition between adjacent parts — same running-sum idea, tracked with two boundaries instead of one.

---

## Cross-links

- Prefix sum combined with a **hashmap** (to find a target sum in O(1) instead of scanning) is its own escalation — see **Subarray Sum Equals K** in [01.3 — Subarray & Subsequence](03-subarray-and-subsequence.md), and the general hashing pattern in [Part 04 — Hashing](../04-hashing.md).

---

**Previous:** [01.1 — Basics & In-Place Manipulation](01-basics-and-in-place-manipulation.md) · **Next:** [01.3 — Subarray & Subsequence Problems](03-subarray-and-subsequence.md)
