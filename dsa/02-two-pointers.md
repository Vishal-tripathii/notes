# DSA Notes — Part 02

## Two Pointers

**Recognize it:** a sorted array (or one that can be usefully sorted) plus a target sum/condition, or a need to compare/consume from both ends inward — the signal is that a nested-loop O(n²) brute force is checking pairs that a single coordinated pass could eliminate using the array's order.

---

### 1. Two Sum II (Sorted Input) — Easy

**Recognize it:** Two Sum, but the array is **sorted** — that sortedness is precisely what makes two pointers strictly better than the hashmap approach ([Part 04](04-hashing.md)'s opening problem) for this specific variant.

**Approach:** pointers at both ends; if the sum is too small, the left pointer must move right (to increase the sum); if too large, the right pointer must move left. Sortedness guarantees this is always the correct direction to move.

**Complexity:** O(n) time, O(1) space — beats the hashmap approach's O(n) *space*, which matters when space is the constraint being optimized.

```js
function twoSum(numbers, target) {
  let left = 0, right = numbers.length - 1;
  while (left < right) {
    const sum = numbers[left] + numbers[right];
    if (sum === target) return [left + 1, right + 1]; // 1-indexed per the problem's convention
    if (sum < target) left++;
    else right--;
  }
  return [];
}
```
**Why moving the correct pointer is always safe (never needs backtracking):** if the current sum is too small, the *only* way to increase it is a bigger left value — and since the array is sorted, moving `left` forward is the only direction that can produce a bigger value; every pairing of the current `left` with any `right` value smaller than the current one has already been implicitly ruled out as "even smaller sum," so nothing is lost by advancing.

**Follow-up:** the unsorted version (original Two Sum) needs O(n) space via a hashmap instead — being able to articulate *why* sortedness specifically enables the O(1)-space two-pointer approach is the actual signal an interviewer is checking.

---

### 2. Valid Palindrome — Easy

Covered in full in [01.6 — String Manipulation](arrays-and-strings/06-string-manipulation-and-pattern-matching.md#4-valid-palindrome--easy) — included here only as a cross-reference, since it's the canonical "compare from both ends inward" two-pointer example applied to a string specifically. Not duplicated.

---

### 3. Container With Most Water — Medium

**Recognize it:** "maximize the area between two lines" — a classic two-pointer optimization where the greedy pointer-movement rule isn't immediately obvious and is worth deriving, not memorizing.

**Approach:** start with pointers at both ends (the widest possible container). At each step, move the pointer at the **shorter** line inward — since width can only decrease as pointers move inward, keeping the shorter line can never improve the area (it's already the limiting factor), so it's the only pointer worth advancing.

**Complexity:** O(n) time, O(1) space — versus O(n²) checking every pair.

```js
function maxArea(height) {
  let left = 0, right = height.length - 1;
  let maxWater = 0;
  while (left < right) {
    const width = right - left;
    const area = width * Math.min(height[left], height[right]);
    maxWater = Math.max(maxWater, area);
    if (height[left] < height[right]) left++; // the SHORTER line is the bottleneck — move it
    else right--;
  }
  return maxWater;
}
```
**Why moving the shorter line's pointer is provably safe:** the container's height is capped by the shorter of the two lines. Keeping the shorter line in place and moving the *taller* line's pointer inward can only ever decrease the width while the height cap stays the same or gets worse (since the new line might be even shorter) — there is no scenario where keeping the current shorter line and shrinking width produces a better answer than trying a taller replacement for it. Moving the shorter line's pointer is the only move that has any chance of improving the area.

**Follow-up:** Trapping Rain Water (Problem 7) escalates this exact two-pointer, "the smaller side is the bottleneck" intuition to a harder, related problem.

---

### 4. 3Sum — Medium

**Recognize it:** Two Sum's target-sum idea, extended to three numbers — sorting plus a fixed outer element plus an inner two-pointer sweep is the standard reduction.

**Approach:** sort the array. Fix one element at a time (outer loop); for the remaining two, run the exact two-pointer technique from Problem 1 to find pairs summing to `-fixed`. Skip duplicate values at every level to avoid duplicate triplets in the output.

**Complexity:** O(n²) time (n outer iterations × O(n) inner two-pointer sweep), O(1) extra space beyond the sort and output.

```js
function threeSum(nums) {
  nums.sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < nums.length - 2; i++) {
    if (i > 0 && nums[i] === nums[i - 1]) continue; // skip duplicate FIXED values
    let left = i + 1, right = nums.length - 1;
    while (left < right) {
      const sum = nums[i] + nums[left] + nums[right];
      if (sum === 0) {
        result.push([nums[i], nums[left], nums[right]]);
        while (left < right && nums[left] === nums[left + 1]) left++; // skip duplicate LEFT values
        while (left < right && nums[right] === nums[right - 1]) right--; // skip duplicate RIGHT values
        left++; right--;
      } else if (sum < 0) {
        left++;
      } else {
        right--;
      }
    }
  }
  return result;
}
```
**Why sorting first is what makes this reduction to Two Pointers possible at all:** without sorting, there's no reliable "which direction to move" signal — sorting is precisely what turns the inner two-value search into the exact same provably-correct two-pointer sweep as Problem 1, just with a fixed offset (`-nums[i]`) as the target instead of a literal input target.

**Follow-up:** 4Sum — the same reduction applied one level deeper (fix two elements, two-pointer sweep the remaining two) — recognizing the generalization is the actual point, not memorizing a separate 4Sum algorithm.

---

### 5. Remove Duplicates from Sorted Array — Easy

Covered in full in [01.1 — Basics & In-Place Manipulation](arrays-and-strings/01-basics-and-in-place-manipulation.md#3-remove-duplicates-from-sorted-array--easy) — included here as a cross-reference, since it's the slow/fast pointer variant of the two-pointer family. Not duplicated.

---

### 6. Trapping Rain Water — Hard

**Recognize it:** the classic escalation of Problem 3 (Container With Most Water) — same "the shorter/limiting side determines the outcome" intuition, applied to summing trapped water across an entire elevation map instead of finding one maximum container.

**Approach:** two pointers from both ends, tracking the running maximum height seen from the left and from the right. At each step, process whichever side currently has the smaller running max — the trapped water at that position is `(that side's running max) - (current height)`, since the smaller-side running max is the true limiting boundary for that specific position.

**Complexity:** O(n) time, O(1) space — versus O(n) space for a simpler (but less elegant) precomputed-left-max/right-max-arrays approach, which is a perfectly reasonable first-pass answer before optimizing further.

```js
function trap(height) {
  let left = 0, right = height.length - 1;
  let leftMax = 0, rightMax = 0;
  let water = 0;
  while (left < right) {
    if (height[left] < height[right]) {
      leftMax = Math.max(leftMax, height[left]);
      water += leftMax - height[left]; // leftMax is GUARANTEED the limiting bound here — see below
      left++;
    } else {
      rightMax = Math.max(rightMax, height[right]);
      water += rightMax - height[right];
      right--;
    }
  }
  return water;
}
```
**Why processing the smaller-running-max side is provably correct, precisely:** water trapped at any position is bounded by `min(maxHeightToTheLeft, maxHeightToTheRight)`. When `height[left] < height[right]`, we know `rightMax >= height[right] > height[left]` — so `rightMax` is *definitely* not the binding constraint at the left pointer's position, regardless of its exact value; `leftMax` (whatever it is) is guaranteed to be the true limiting bound there. This lets the algorithm safely compute trapped water at the left position using only `leftMax`, without ever needing to know the *exact* value of `rightMax` beyond "it's bigger than what matters here."

**Follow-up:** solve it first with the simpler O(n) space, precomputed-arrays version (a `leftMax[]` and `rightMax[]` array, then a final pass computing `min(leftMax[i], rightMax[i]) - height[i]` per position) — a completely valid first answer, with the two-pointer version above as the natural "can you do it in O(1) space" escalation.

---

## Cross-links

- Sort Colors' three-way partition ([01.7](arrays-and-strings/07-sorting-based-array-tricks.md#1-sort-colors-dutch-national-flag--medium)) is the same pointer discipline generalized to three value-buckets instead of a comparison-based sweep.
- Interval List Intersections ([01.5](arrays-and-strings/05-intervals.md#6-interval-list-intersections--medium)) applies this same two-pointer sweep across two separate sorted lists rather than one array.

---

**Previous:** [Part 01 — Arrays & Strings](arrays-and-strings/00-index.md) · **Next:** [Part 03 — Sliding Window](03-sliding-window.md)
