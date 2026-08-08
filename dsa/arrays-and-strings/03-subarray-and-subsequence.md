# DSA Notes — Arrays & Strings, Sub-Part 01.3

## Subarray & Subsequence Problems

**Recognize this bucket:** "contiguous subarray" + an aggregate condition (max sum, max product, sum equals a target) where the window size itself is **not** fixed or simply bounded (that would point to [Sliding Window](../03-sliding-window.md) instead) — here the signal is needing a running aggregate (sum/product) combined with either a greedy running-best (Kadane's family) or a hashmap of previously-seen prefix aggregates.

> **Subarray vs subsequence, precisely:** a *subarray* is contiguous; a *subsequence* preserves relative order but need not be contiguous. This sub-part is almost entirely subarray problems — true subsequence problems (Longest Increasing Subsequence, etc.) drift into DP territory, out of scope here by design.

---

### 1. Maximum Subarray (Kadane's Algorithm) — Medium

**Recognize it:** "contiguous subarray with the largest sum" — the canonical problem this technique is named after.

**Approach:** at each position, decide whether extending the previous subarray is still beneficial, or whether starting fresh from the current element would do better — if the running sum ever drops below the current element's own value, the running sum is actively hurting and should reset.

**Complexity:** O(n) time, O(1) space.

```js
function maxSubArray(nums) {
  let currentSum = nums[0];
  let maxSum = nums[0];
  for (let i = 1; i < nums.length; i++) {
    currentSum = Math.max(nums[i], currentSum + nums[i]); // extend, or restart here
    maxSum = Math.max(maxSum, currentSum);
  }
  return maxSum;
}
```
**Why the "extend or restart" comparison is the whole algorithm:** `currentSum + nums[i]` represents extending the best subarray ending at the previous position; `nums[i]` alone represents abandoning everything before and starting fresh at the current element. Kadane's insight is that you never need to consider "extend but drop some earlier elements from an already-contiguous run" — if the running sum went negative, *everything* before the current element is dead weight, not just part of it.

**Follow-up:** return the actual subarray (indices), not just the sum — track a `start`/`tempStart` index alongside the running sum, updating `start = tempStart` only when a genuine reset happens.

---

### 2. Maximum Product Subarray — Medium

**Recognize it:** same shape as Problem 1, but **product** instead of sum — the complication that breaks a naive Kadane's port directly: a large negative running product can become the new maximum if multiplied by another negative number.

**Approach:** track **both** a running max *and* running min at each step — a negative number can flip the current min into the new max, so both must be carried forward.

**Complexity:** O(n) time, O(1) space.

```js
function maxProduct(nums) {
  let maxSoFar = nums[0], minSoFar = nums[0], result = nums[0];
  for (let i = 1; i < nums.length; i++) {
    const num = nums[i];
    if (num < 0) [maxSoFar, minSoFar] = [minSoFar, maxSoFar]; // a negative number SWAPS which
                                                                    // running value could become the new max
    maxSoFar = Math.max(num, maxSoFar * num);
    minSoFar = Math.min(num, minSoFar * num);
    result = Math.max(result, maxSoFar);
  }
  return result;
}
```
**Why tracking only a running max (Kadane's-style) isn't enough here:** with addition, a very negative running sum is never secretly valuable — it's just bad. With multiplication, a very negative running product is one sign-flip away from becoming the biggest positive product seen — throwing away that information (by only tracking a max) loses exactly the case that makes this problem harder than Problem 1.

**Follow-up:** the array contains zeroes — verify the algorithm handles this correctly (a zero resets both running max/min to `num` itself via the `Math.max(num, ...)`/`Math.min(num, ...)` comparisons, correctly "restarting" the product tracking after a zero, the same restart logic as Kadane's).

---

### 3. Subarray Sum Equals K — Medium

**Recognize it:** "number of contiguous subarrays that sum to exactly `k`" — the array can contain **negative numbers**, which rules out a sliding-window approach (window sum isn't monotonic when negatives are allowed) and points instead to prefix sum + hashmap.

**Approach:** if `prefixSum[j] - prefixSum[i] = k` for some `i < j`, then the subarray `(i, j]` sums to `k`. Rearranged: `prefixSum[i] = prefixSum[j] - k`. Walk the array maintaining a running prefix sum and a hashmap of **how many times each prefix sum value has occurred so far** — at each step, look up `runningSum - k` in that hashmap to count how many earlier prefixes would complete a valid subarray ending here.

**Complexity:** O(n) time, O(n) space — versus O(n²) for the brute-force "check every subarray" approach.

```js
function subarraySum(nums, k) {
  const prefixCount = new Map([[0, 1]]); // empty prefix (sum 0) has occurred once, by definition
  let runningSum = 0, count = 0;
  for (const num of nums) {
    runningSum += num;
    count += prefixCount.get(runningSum - k) || 0; // how many earlier prefixes complete a sum-k subarray
    prefixCount.set(runningSum, (prefixCount.get(runningSum) || 0) + 1);
  }
  return count;
}
```
**Why the `[0, 1]` initial entry matters:** it accounts for a subarray starting at index 0 itself — if `runningSum === k` at some point, `runningSum - k === 0`, and without the seeded `0 → 1` entry, that valid subarray (the entire prefix from the start) would never be counted.

**Follow-up:** return the actual **longest** such subarray's length instead of the count — store the **first** occurrence index of each prefix sum (not a count) in the map, and compute length as `currentIndex - firstOccurrenceIndex` when a match is found.

---

### 4. Subarrays Divisible by K — Medium

**Recognize it:** the exact same prefix-sum-plus-hashmap shape as Problem 3, generalized from "sum equals k" to "sum is divisible by k" — recognizing this as the *same pattern* rather than a new one is the actual point of this problem.

**Approach:** two prefix sums with the **same remainder mod k** mean the subarray between them is divisible by k. Track counts of each remainder seen so far (handling JS's negative-modulo behavior carefully).

**Complexity:** O(n) time, O(k) space (at most k distinct remainders).

```js
function subarraysDivByK(nums, k) {
  const remainderCount = new Map([[0, 1]]);
  let runningSum = 0, count = 0;
  for (const num of nums) {
    runningSum += num;
    let remainder = runningSum % k;
    if (remainder < 0) remainder += k; // JS % can return negative — normalize to [0, k)
    count += remainderCount.get(remainder) || 0;
    remainderCount.set(remainder, (remainderCount.get(remainder) || 0) + 1);
  }
  return count;
}
```
**Why JS's `%` needs the normalization:** `-3 % 5` evaluates to `-3` in JavaScript, not `2` as a mathematical "true modulo" would give — a genuinely common source of off-by-wrong-bucket bugs in exactly this pattern, worth calling out explicitly rather than discovering it via a failing test.

**Follow-up:** Problem 3 (exact sum) and this problem (divisibility) are literally the same template with a different "bucketing" function applied to the running sum before the hashmap lookup — a good sign you've internalized the pattern rather than memorized two separate solutions.

---

### 5. Maximum Size Subarray Sum Equals K — Medium

**Recognize it:** a direct variant of Problem 3 — "longest" instead of "count" is the tell, which changes what the hashmap should store.

**Approach:** as flagged in Problem 3's follow-up — store the **first occurrence index** of each prefix sum (never overwrite it once set), and at each step check whether `runningSum - k` has been seen before to compute a candidate length.

**Complexity:** O(n) time, O(n) space.

```js
function maxSubArrayLen(nums, k) {
  const firstIndexOfSum = new Map([[0, -1]]); // sum 0 "occurs" before index 0
  let runningSum = 0, maxLen = 0;
  for (let i = 0; i < nums.length; i++) {
    runningSum += nums[i];
    if (firstIndexOfSum.has(runningSum - k)) {
      maxLen = Math.max(maxLen, i - firstIndexOfSum.get(runningSum - k));
    }
    if (!firstIndexOfSum.has(runningSum)) { // only store the FIRST occurrence — a later, shorter
      firstIndexOfSum.set(runningSum, i);      // candidate would never beat an earlier one
    }
  }
  return maxLen;
}
```

**Follow-up:** what if the array is guaranteed to contain only **non-negative** numbers? Then a sliding window ([Part 03](../03-sliding-window.md)) becomes viable too, since the running sum is now monotonic as the window grows — worth being able to name both approaches and explain why negatives rule one of them out.

---

### 6. Longest Turbulent Subarray — Medium

**Recognize it:** "subarray that alternates strictly increasing/decreasing at every step" — a single-pass, state-tracking problem rather than a prefix-sum one; included here as the "track a running streak with a reset condition" sibling to Kadane's.

**Approach:** walk the array tracking the current turbulent run's length, resetting (or adjusting) whenever the comparison direction fails to alternate.

**Complexity:** O(n) time, O(1) space.

```js
function maxTurbulenceSize(arr) {
  let maxLen = 1, currentLen = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === arr[i - 1]) {
      currentLen = 1; // equal values break turbulence entirely
    } else {
      const isIncreasing = arr[i] > arr[i - 1];
      // turbulence requires the comparison DIRECTION to flip each step
      const previousWasIncreasing = i >= 2 && arr[i - 1] > arr[i - 2];
      if (i === 1 || isIncreasing !== previousWasIncreasing) {
        currentLen++;
      } else {
        currentLen = 2; // direction repeated — the run restarts from THESE two elements, not 1
      }
    }
    maxLen = Math.max(maxLen, currentLen);
  }
  return maxLen;
}
```

**Follow-up:** trace through `[9,4,2,10,7,8,8,1,9]` by hand before trusting the code — the equal-values case (`8,8`) is the easiest part of this problem to get subtly wrong.

---

### 7. Maximum Circular Subarray Sum — Medium

**Recognize it:** Kadane's (Problem 1), but the subarray is allowed to **wrap around** the end of the array back to the beginning — the escalation that tests whether you understand *why* Kadane's works, not just its code.

**Approach:** the maximum circular-sum subarray is either **(a)** a normal non-wrapping subarray (plain Kadane's), or **(b)** a wrapping one — and a wrapping subarray's sum equals `totalSum - (minimum non-wrapping subarray sum)`, since excluding the minimum contiguous "dip" from the total is equivalent to keeping everything else, which is exactly the wrapped-around portion.

**Complexity:** O(n) time, O(1) space.

```js
function maxSubarraySumCircular(nums) {
  let totalSum = 0, currentMax = 0, maxSum = -Infinity, currentMin = 0, minSum = Infinity;
  for (const num of nums) {
    totalSum += num;
    currentMax = Math.max(num, currentMax + num);
    maxSum = Math.max(maxSum, currentMax);
    currentMin = Math.min(num, currentMin + num);
    minSum = Math.min(minSum, currentMin);
  }
  if (maxSum < 0) return maxSum; // ALL numbers are negative — the "exclude the min" trick would
                                    // incorrectly return an empty subarray (sum 0); guard against it
  return Math.max(maxSum, totalSum - minSum);
}
```
**Why the all-negative guard is necessary:** if every element is negative, `totalSum - minSum` would compute as if excluding the "worst" (most negative, i.e. the whole array) subarray, leaving an empty selection worth 0 — but an empty subarray isn't a valid answer here, and 0 would incorrectly beat every genuinely negative real answer. The guard falls back to plain Kadane's result in that case, which correctly returns the least-negative single element.

**Follow-up:** state out loud *why* `totalSum - minSum` computes the best wrapping subarray, don't just recite it — this is a favorite "explain your own solution" follow-up precisely because the trick isn't obviously correct on first glance.

---

## Cross-links

- Problems 3–5's prefix-sum-plus-hashmap shape is a direct application of [Part 04 — Hashing](../04-hashing.md)'s "have I seen a specific value before, in O(1)" pattern — worth studying that part's recognition heuristic alongside these.
- Problem 5's non-negative follow-up bridges directly into [Part 03 — Sliding Window](../03-sliding-window.md).

---

**Previous:** [01.2 — Prefix Sum & Difference Arrays](02-prefix-sum-and-difference-arrays.md) · **Next:** [01.4 — 2D Arrays & Matrix](04-2d-arrays-and-matrix.md)
