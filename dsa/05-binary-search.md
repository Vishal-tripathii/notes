# DSA Notes — Part 05

## Binary Search

**Recognize it:** a sorted array, OR — the escalation most candidates miss — a **monotonic "yes/no" answer space** you can binary-search over even without an explicitly sorted array ("search on the answer," not the input). Both variants share the same core loop shape; the difference is *what* you're narrowing down.

**The invariant that makes binary search correct, stated precisely:** at every step, the search space must be **monotonic** with respect to the condition being tested — everything on one side of the true answer fails the condition, everything on the other side passes it, with no interleaving. Sortedness is the most common way to get this guarantee, but it's not the only way (see Problems 6–7).

---

### 1. Classic Binary Search — Easy

**Recognize it:** the textbook case — find a target's index in a sorted array.

**Approach:** repeatedly halve the search range by comparing the midpoint to the target.

**Complexity:** O(log n) time, O(1) space.

```js
function search(nums, target) {
  let left = 0, right = nums.length - 1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2); // avoids overflow in languages with fixed-width
    if (nums[mid] === target) return mid;                 // ints; not a JS concern but a habit worth having
    if (nums[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}
```
**Why `left + Math.floor((right - left) / 2)` instead of `Math.floor((left + right) / 2)`:** in a language with fixed-width integers, `left + right` can overflow for very large indices even when the true midpoint wouldn't — the subtraction form avoids that by never summing two potentially-large values directly. Not a real risk in JS's number type, but worth knowing as the reason this form is the conventional default across languages.

**Follow-up:** the array contains duplicates and you need the **leftmost** or **rightmost** occurrence — Problem 4 is exactly this escalation.

---

### 2. Search Insert Position — Easy

**Recognize it:** "find the index where target is, or where it would be inserted to keep the array sorted" — the same loop as Problem 1, but the "not found" case needs a meaningful answer instead of `-1`.

**Approach:** identical binary search loop; the key realization is that when the loop ends without finding the target, `left` has naturally converged to exactly the correct insertion index.

**Complexity:** O(log n) time, O(1) space.

```js
function searchInsert(nums, target) {
  let left = 0, right = nums.length - 1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    if (nums[mid] === target) return mid;
    if (nums[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return left; // converges to the correct insertion point — no extra logic needed
}
```
**Why `left` is guaranteed to be the correct insertion point:** by the time the loop exits, everything before `left` is `< target` and everything from `left` onward (that was checked) is `> target` — `left` sits exactly at the boundary where `target` would need to go to preserve sorted order, which is precisely the insertion position definition.

**Follow-up:** this exact "left converges to a boundary" property is the mechanism every problem in this part relies on — internalizing it here pays off directly in Problems 4, 6, and 7.

---

### 3. Search in Rotated Sorted Array — Medium

**Recognize it:** "sorted array, rotated at an unknown pivot, find target" — the array *isn't* fully sorted anymore, but **one half of any given split is always still sorted**, which is the property that keeps binary search viable.

**Approach:** at each midpoint, determine which half (left or right of mid) is the properly-sorted one by comparing `nums[left]` to `nums[mid]`. Then check whether the target falls within that sorted half's range — if so, search there; if not, search the other half.

**Complexity:** O(log n) time, O(1) space.

```js
function search(nums, target) {
  let left = 0, right = nums.length - 1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    if (nums[mid] === target) return mid;

    if (nums[left] <= nums[mid]) { // LEFT half is sorted
      if (nums[left] <= target && target < nums[mid]) {
        right = mid - 1; // target is within the sorted left half's range
      } else {
        left = mid + 1;
      }
    } else { // RIGHT half is sorted
      if (nums[mid] < target && target <= nums[right]) {
        left = mid + 1; // target is within the sorted right half's range
      } else {
        right = mid - 1;
      }
    }
  }
  return -1;
}
```
**Why "one half is always sorted" is the key insight that preserves binary search's O(log n) guarantee:** a rotation only introduces *one* discontinuity point in the whole array — splitting at any midpoint means that discontinuity can only exist in one of the two halves, so the other half is guaranteed fully sorted and can be range-checked with an ordinary comparison, letting the algorithm always correctly decide which half to discard.

**Follow-up:** duplicates are allowed (`nums[left] === nums[mid]` no longer reliably indicates which half is sorted) — the fix is falling back to a linear step (`left++`) when `nums[left] === nums[mid]` and they provide no useful information, which degrades worst-case complexity to O(n) but preserves correctness.

---

### 4. Find First and Last Position of Element in Sorted Array — Medium

**Recognize it:** the duplicates escalation flagged in Problem 1 — "find the range `[first, last]` of a target's occurrences" needs two separate, slightly-modified binary searches, not one.

**Approach:** run binary search twice with a tie-breaking modification — once biased to keep searching **left** even after finding a match (to find the first occurrence), once biased to keep searching **right** (to find the last).

**Complexity:** O(log n) time (two binary searches, still logarithmic overall), O(1) space.

```js
function searchRange(nums, target) {
  const findBound = (isFirst) => {
    let left = 0, right = nums.length - 1, result = -1;
    while (left <= right) {
      const mid = left + Math.floor((right - left) / 2);
      if (nums[mid] === target) {
        result = mid;
        if (isFirst) right = mid - 1; // found a match, but keep searching LEFT for an earlier one
        else left = mid + 1;             // found a match, but keep searching RIGHT for a later one
      } else if (nums[mid] < target) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return result;
  };
  return [findBound(true), findBound(false)];
}
```
**Why finding a match doesn't immediately return:** a plain binary search stops the instant it finds any occurrence, with no guarantee it's the first or last one — deliberately continuing to narrow the range *past* a found match (in the direction of interest) is what turns "find *a* match" into "find the *boundary* match."

**Follow-up:** implement this using JS's own binary-search-adjacent primitives conceptually (there's no built-in, but many languages/libraries expose a `lowerBound`/`upperBound` function) — knowing that "first occurrence" and "last occurrence" map to `lowerBound(target)` and `upperBound(target) - 1` respectively is useful vocabulary even when implementing by hand.

---

### 5. Find Peak Element — Medium

**Recognize it:** "find any local peak (element greater than both neighbors), array not necessarily sorted, O(log n) required" — the O(log n) requirement on an *unsorted* array is the strong signal this is binary-search-on-a-property, not on raw values.

**Approach:** at each midpoint, compare against its right neighbor — if `nums[mid] < nums[mid+1]`, a peak must exist somewhere to the right (the sequence is "trending upward" at this point); otherwise, a peak must exist at `mid` or to its left.

**Complexity:** O(log n) time, O(1) space.

```js
function findPeakElement(nums) {
  let left = 0, right = nums.length - 1;
  while (left < right) {
    const mid = left + Math.floor((right - left) / 2);
    if (nums[mid] < nums[mid + 1]) {
      left = mid + 1; // trending up — a peak is guaranteed somewhere to the right
    } else {
      right = mid; // trending down (or at a peak) — a peak is guaranteed at mid or to its left
    }
  }
  return left; // left === right at convergence, guaranteed to be a peak
}
```
**Why a peak is *guaranteed* to exist in the chosen direction, making this correct despite the array being unsorted:** treating the array's boundaries as `-Infinity` (a common convention for this problem), any strictly increasing run must eventually stop increasing — either it peaks internally, or it keeps rising all the way to the boundary, which itself then qualifies as a peak relative to the implicit `-Infinity` beyond it. This guarantees a peak exists on whichever side the comparison points toward, which is the monotonicity property (§ intro) that makes binary search valid here even without a sorted array.

**Follow-up:** find **all** peaks, not just one — binary search's O(log n) guarantee no longer applies (there could be O(n) peaks), falling back to a single O(n) linear scan comparing each element to both neighbors.

---

### 6. Koko Eating Bananas — Medium

**Recognize it:** "minimum eating speed to finish all bananas within h hours" — no sorted array in sight; the signal is a **monotonic yes/no question**: "can Koko finish in time at speed k?" is `false` for every speed below some threshold and `true` for every speed at or above it — exactly the monotonicity property that makes binary search valid, applied to the space of possible *answers* rather than array indices.

**Approach:** binary search over possible eating speeds (`1` to `max(piles)`); for each candidate speed, check in O(n) whether Koko can finish in time, narrowing toward the minimum speed where the check first succeeds.

**Complexity:** O(n log m) time, where n is the number of piles and m is the maximum pile size (the search space range); O(1) space.

```js
function minEatingSpeed(piles, h) {
  const canFinish = (speed) => {
    let hours = 0;
    for (const pile of piles) {
      hours += Math.ceil(pile / speed); // hours needed to finish THIS pile at this speed
    }
    return hours <= h;
  };

  let left = 1, right = Math.max(...piles);
  while (left < right) {
    const mid = left + Math.floor((right - left) / 2);
    if (canFinish(mid)) {
      right = mid; // this speed works — try to find an even SLOWER speed that still works
    } else {
      left = mid + 1; // too slow, need to speed up
    }
  }
  return left;
}
```
**Why "binary search on the answer" is the correct framing here, precisely:** the input array (`piles`) is never sorted or binary-searched directly at all — what's being binary-searched is the space of *candidate answers* (possible eating speeds), using the monotonic `canFinish(speed)` check as the comparison function in place of a direct value comparison. This is the exact escalation flagged in this part's intro as "most candidates miss" — recognizing that binary search applies whenever *any* monotonic yes/no condition exists over an ordered range, not only when the input itself is sorted.

**Follow-up:** minimize the **maximum** load in "Split Array Largest Sum" / "Capacity To Ship Packages" (Problem 7) is the exact same template — binary search over a candidate capacity/sum, with a greedy O(n) feasibility check playing the same role as `canFinish` here.

---

### 7. Capacity To Ship Packages Within D Days — Medium

**Recognize it:** the direct sibling of Problem 6 — "minimum ship capacity to deliver all packages within D days" is structurally identical: binary search over candidate capacities, with a greedy feasibility check.

**Approach:** binary search over possible capacities (`max(weights)` to `sum(weights)`); for each candidate capacity, greedily simulate loading packages day by day, checking whether the required number of days is ≤ D.

**Complexity:** O(n log(sum - max)) time, O(1) space.

```js
function shipWithinDays(weights, days) {
  const canShip = (capacity) => {
    let daysNeeded = 1, currentLoad = 0;
    for (const weight of weights) {
      if (currentLoad + weight > capacity) {
        daysNeeded++;
        currentLoad = 0;
      }
      currentLoad += weight;
    }
    return daysNeeded <= days;
  };

  let left = Math.max(...weights);        // capacity must be at least the heaviest single package
  let right = weights.reduce((a, b) => a + b, 0); // or at most shipping everything in one day
  while (left < right) {
    const mid = left + Math.floor((right - left) / 2);
    if (canShip(mid)) {
      right = mid; // this capacity works — try a smaller one
    } else {
      left = mid + 1;
    }
  }
  return left;
}
```
**Why the search bounds (`max(weights)` to `sum(weights)`) are chosen precisely, not arbitrarily:** the lower bound must be at least the single heaviest package (a smaller capacity could never ship that one package at all, an immediate infeasibility); the upper bound is the total weight (a capacity that large trivially ships everything in exactly one day). Every genuinely feasible capacity lies within this range, and — critically — feasibility is monotonic across it (any capacity larger than a working one also works), which is what licenses binary search over this specific range.

**Follow-up:** state explicitly, out loud, why Problems 6 and 7 are "the same problem" wearing different framing — a strong interviewer signal is recognizing "binary search on a monotonic feasibility check" as one reusable template rather than solving each from first principles.

---

## Cross-links

- **Search a 2D Matrix** ([01.4](arrays-and-strings/04-2d-arrays-and-matrix.md#5-search-a-2d-matrix--medium)) applies Problem 1's classic binary search to a matrix reinterpreted as one sorted 1D sequence.
- The "binary search on the answer" framing (Problems 6–7) is worth actively contrasting with [Part 00 — Foundations](00-foundations.md#4-what-input-size-tells-you-about-required-complexity)'s constraint-reading heuristic — an `O(n log(max value))` expected complexity in a problem's constraints is itself a strong hint toward this exact technique.

---

**Previous:** [Part 04 — Hashing](04-hashing.md) · **Next:** [Part 06 — Linked Lists](06-linked-lists.md)
