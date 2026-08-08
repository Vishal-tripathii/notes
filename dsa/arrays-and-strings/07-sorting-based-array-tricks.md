# DSA Notes — Arrays & Strings, Sub-Part 01.7

## Sorting-Based Array Tricks

**Recognize this bucket:** either the problem explicitly wants a sorted/partitioned result, or **sorting first is a legitimate move that unlocks an otherwise-hard problem** — a very common, underused first step. Also covers JS's specific sorting gotcha (`Array.prototype.sort()`'s default behavior) that trips people up regardless of algorithmic skill.

> **The JS-specific trap every problem here can hit:** `[10, 2, 1].sort()` returns `[1, 10, 2]`, **not** `[1, 2, 10]` — `sort()` with no comparator converts elements to **strings** and sorts lexicographically. Every numeric sort in this file uses an explicit comparator (`(a, b) => a - b`) specifically to avoid this — leaving it off is one of the most common silent correctness bugs in JS coding interviews.

---

### 1. Sort Colors (Dutch National Flag) — Medium

**Recognize it:** "sort an array of only 0s, 1s, and 2s, in one pass, in place" — the single-pass, O(1)-space constraint rules out a normal sort call and points to the three-way partitioning technique.

**Approach:** three pointers — `low` (boundary of the 0-region), `mid` (current element being examined), `high` (boundary of the 2-region). Swap 0s to the front, 2s to the back, and 1s stay put, advancing `mid` appropriately based on what's found.

**Complexity:** O(n) time, single pass, O(1) space — versus O(n log n) for a generic sort, which doesn't exploit the "only 3 distinct values" constraint at all.

```js
function sortColors(nums) {
  let low = 0, mid = 0, high = nums.length - 1;
  while (mid <= high) {
    if (nums[mid] === 0) {
      [nums[low], nums[mid]] = [nums[mid], nums[low]];
      low++; mid++; // both boundaries advance — the swapped-in value at mid is now KNOWN to be
    } else if (nums[mid] === 1) {   // correctly placed (from the already-processed low region)
      mid++;
    } else { // nums[mid] === 2
      [nums[mid], nums[high]] = [nums[high], nums[mid]];
      high--; // do NOT advance mid — the swapped-in value from high hasn't been examined yet
    }
  }
  return nums;
}
```
**Why the 2-swap doesn't advance `mid` but the 0-swap does:** swapping in from `low` is safe to trust immediately, since everything to the left of `mid` in the 0/1 region has already been fully classified — the value that moves into `mid`'s position from `low` is always a 1 (by invariant) or the region is empty. Swapping in from `high` is different — that value has **never been examined**, so `mid` must stay put and re-check it on the next loop iteration.

**Follow-up:** generalize to **k distinct values** instead of exactly 3 — the three-pointer trick doesn't directly extend; the practical answer becomes a counting sort (tally each value's frequency, then overwrite the array in sorted order) for O(n + k) time.

---

### 2. Merge Sorted Array — Easy

**Recognize it:** "merge two sorted arrays into the first one, which has extra trailing space" — the specific twist (extra space already at the end of the first array) is what makes an elegant in-place, backward-merge solution possible.

**Approach:** merge **from the back**, comparing the largest remaining elements of each array and placing the bigger one at the current end of the combined space — working backward avoids overwriting elements in the first array before they've been compared.

**Complexity:** O(m + n) time, O(1) extra space.

```js
function merge(nums1, m, nums2, n) {
  let i = m - 1, j = n - 1, write = m + n - 1;
  while (j >= 0) { // once j is exhausted, remaining nums1 elements are ALREADY in the right place
    if (i >= 0 && nums1[i] > nums2[j]) {
      nums1[write--] = nums1[i--];
    } else {
      nums1[write--] = nums2[j--];
    }
  }
}
```
**Why merging backward (not forward) is the key insight:** merging forward would require shifting already-placed elements in `nums1` out of the way every time a `nums2` element needs to be inserted earlier — expensive. Merging from the largest values down into the already-available trailing space means every write lands in a slot that's guaranteed not to be needed again, with zero shifting.

**Follow-up:** what if `nums1` did **not** have extra trailing space (i.e. a genuinely separate output array is required)? Falls back to a standard forward two-pointer merge (the merge step of merge sort) into a new array — O(m+n) time, O(m+n) space.

---

### 3. Majority Element — Easy

**Recognize it:** "element appearing more than n/2 times" — several valid approaches exist; the sorting one is the simplest to state, the optimal one (Boyer-Moore) is the classic follow-up.

**Approach (sorting-based):** after sorting, the majority element (since it occupies more than half the array) is guaranteed to occupy the middle index.

**Complexity:** O(n log n) time (dominated by the sort), O(1) extra space (or O(log n)–O(n) depending on the sort implementation's internals).

```js
function majorityElement(nums) {
  nums.sort((a, b) => a - b); // remember the comparator! (see the file-level warning above)
  return nums[Math.floor(nums.length / 2)];
}
```
**Why the middle index is guaranteed correct:** an element appearing more than `n/2` times, once the array is sorted, must span across the middle index no matter where its run starts — there's no way to fit more than half the array's worth of one value into a sorted arrangement without that run crossing the midpoint.

**Follow-up — Boyer-Moore Voting (the O(n) time, O(1) space optimal answer, worth naming even if the sort-based version is your first pass):**
```js
function majorityElementOptimal(nums) {
  let candidate = null, count = 0;
  for (const num of nums) {
    if (count === 0) candidate = num;
    count += (num === candidate) ? 1 : -1;
  }
  return candidate; // guaranteed correct GIVEN a majority element is guaranteed to exist
}
```

---

### 4. Kth Largest Element in an Array — Medium

**Recognize it:** "kth largest," not "kth largest distinct" or "sorted output" — a full sort is correct but does more work than necessary; naming and reasoning about the better options is what separates a good answer here.

**Approach (sorting-based, simplest to state):** sort descending, return index `k - 1`.

**Complexity:** O(n log n) time, O(1)–O(n) space depending on sort implementation.

```js
function findKthLargest(nums, k) {
  return [...nums].sort((a, b) => b - a)[k - 1]; // descending sort, comparator again matters
}
```
**Why this does more work than necessary:** fully sorting the array does O(n log n) work to answer a question that only needs the *k*-th position, not a complete ordering of every element — the better-known optimal answer is **Quickselect** (a partition-based selection algorithm, average O(n), worst-case O(n²)) or a min-heap of size k (O(n log k)) — both worth naming explicitly as the "can you do better than a full sort" follow-up, even if a from-scratch Quickselect implementation is a stretch to produce live.

**Follow-up:** name the average-case complexity of Quickselect and explain, at a high level, why it beats a full sort (it only recurses into the *one* partition that could contain the k-th element, rather than fully sorting both partitions the way quicksort would).

---

### 5. Largest Number — Medium

**Recognize it:** "arrange numbers to form the largest possible concatenated number" — a **custom comparator** problem; the comparison isn't numeric at all, it's "which concatenation order produces a bigger result."

**Approach:** sort using a comparator that compares two candidate concatenation orders directly — for numbers `a` and `b`, compare `"" + a + b` against `"" + b + a` as strings/numbers.

**Complexity:** O(n log n · k) time where k is the average digit-length (string concatenation cost per comparison), O(n) space.

```js
function largestNumber(nums) {
  const strs = nums.map(String);
  strs.sort((a, b) => (b + a).localeCompare(a + b)); // compare BOTH possible concatenation orders
  const result = strs.join('');
  return result[0] === '0' ? '0' : result; // all-zero edge case: "000" should become "0", not stay "000"
}
```
**Why comparing `a+b` vs `b+a` (not just `a` vs `b`) is the correct comparator:** the goal isn't numeric ordering of the individual numbers — it's finding the arrangement that produces the largest *concatenated string*. For `a = "9"` and `b = "30"`, numerically `30 > 9`, but `"930" > "309"` — the concatenation-order comparison directly encodes the actual objective the sort needs to optimize for, which plain numeric comparison does not.

**Follow-up:** trace through `["3", "30", "34", "5", "9"]` by hand using the comparator to confirm it produces `"9534330"` — a genuinely non-obvious result worth verifying rather than trusting blindly.

---

### 6. Wiggle Sort — Medium

**Recognize it:** "rearrange so `nums[0] < nums[1] > nums[2] < nums[3]...`" — a sorting-adjacent rearrangement problem where a full sort is a valid (if not optimal) first step.

**Approach (sort-based, simplest correct answer):** sort the array, then swap every adjacent pair starting from index 1 — this guarantees the alternating pattern because after sorting, any adjacent swap creates a local peak/valley relative to its neighbors.

**Complexity:** O(n log n) time (dominated by the sort), O(1) extra space beyond the sort itself.

```js
function wiggleSort(nums) {
  nums.sort((a, b) => a - b);
  for (let i = 1; i < nums.length - 1; i += 2) {
    [nums[i], nums[i + 1]] = [nums[i + 1], nums[i]]; // swap each pair AFTER the first element
  }
}
```
**Why this works:** after sorting, `nums[i] <= nums[i+1] <= nums[i+2]` for every consecutive triple — swapping `nums[i]` and `nums[i+1]` (for odd `i`) makes that position a local peak relative to both neighbors, and the alternating swap pattern propagates that peak/valley structure across the whole array.

**Follow-up:** solve it in **O(n) time, O(1) space**, without sorting — a one-pass greedy swap-when-violated approach (compare each adjacent pair against the required `<`/`>` direction for that position, swap immediately if violated) achieves this without ever fully sorting; worth naming as the optimal answer even if the sort-based version is the practical first-pass solution.

---

### 7. Sort Array By Parity — Easy

**Recognize it:** "move all even numbers before all odd numbers, order within each group doesn't matter" — a simplified, single-condition version of the Dutch National Flag partitioning idea from Problem 1.

**Approach:** two pointers from both ends; swap whenever the left pointer finds an odd number and the right pointer finds an even number (each swap correctly places one element on each side).

**Complexity:** O(n) time, single pass, O(1) space.

```js
function sortArrayByParity(nums) {
  let left = 0, right = nums.length - 1;
  while (left < right) {
    if (nums[left] % 2 === 0) {
      left++; // already even, correctly placed, move on
    } else if (nums[right] % 2 === 1) {
      right--; // already odd, correctly placed, move on
    } else {
      [nums[left], nums[right]] = [nums[right], nums[left]]; // left is odd, right is even — swap
    }
  }
  return nums;
}
```
**Why this is "Dutch flag with 2 buckets instead of 3":** the exact same two/three-pointer partitioning idea from Problem 1, simplified — with only two categories instead of three, a single pair of pointers (no middle `mid` pointer needed) suffices, since there's no third "unknown, needs classification" region to track separately.

**Follow-up:** preserve the **relative order** within each group (a stable partition) — the in-place two-pointer swap above does NOT guarantee this; a stable version requires either extra space (build two separate arrays, concatenate) or an in-place stable-partition algorithm, which is meaningfully harder to do in O(1) space.

---

## Cross-links

- Problem 1's three-way partition is the direct precursor to [Part 02 — Two Pointers](../02-two-pointers.md)'s techniques — same pointer discipline, applied to a fixed small value-set instead of a general comparison.
- "Sort first, then solve" as a general strategy also appears throughout [01.5 — Intervals](05-intervals.md).

---

**Previous:** [01.6 — String Manipulation & Pattern Matching](06-string-manipulation-and-pattern-matching.md) · **Next:** [01.8 — Greedy & Simulation on Arrays](08-greedy-and-simulation-on-arrays.md)
