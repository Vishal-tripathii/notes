# DSA Notes — Arrays & Strings, Sub-Part 01.1

## Basics & In-Place Manipulation

**Recognize this bucket:** "modify the array in place," "O(1) extra space," rotation/reversal/rearrangement problems with no sorting or hashing angle — the warm-up tier that establishes array-index discipline before the more pattern-heavy sub-parts.

---

### 1. Reverse an Array In-Place — Easy

**Recognize it:** the simplest possible "in-place, O(1) space" signal — reverse without a new array.

**Approach:** two pointers starting at both ends, swap and move inward until they cross. The foundational move every later two-pointer problem ([Part 02](../02-two-pointers.md)) builds on.

**Complexity:** O(n) time, O(1) space.

```js
function reverseInPlace(arr) {
  let left = 0, right = arr.length - 1;
  while (left < right) {
    [arr[left], arr[right]] = [arr[right], arr[left]];
    left++;
    right--;
  }
  return arr;
}
```

**Follow-up:** reverse only a sub-range `[i, j]` in place — same logic, just start `left = i, right = j`.

---

### 2. Rotate Array by K — Medium

**Recognize it:** "rotate," combined with an O(1)-space follow-up constraint — the naive approach (shift one at a time, k times) is O(n·k); a new array is O(n) space.

**Approach:** the **three-reversal trick** — reverse the whole array, then reverse the first `k` elements, then reverse the rest. This achieves an in-place rotation with no extra array.

**Complexity:** O(n) time, O(1) space.

```js
function rotate(nums, k) {
  k %= nums.length; // handle k > length
  reverseRange(nums, 0, nums.length - 1);
  reverseRange(nums, 0, k - 1);
  reverseRange(nums, k, nums.length - 1);
}
function reverseRange(arr, left, right) {
  while (left < right) {
    [arr[left], arr[right]] = [arr[right], arr[left]];
    left++; right--;
  }
}
```
**Why the three-reversal trick works, intuitively:** reversing the whole array puts every element in reverse order, including flipping which "half" the last-k elements now occupy at the front — reversing each half back individually then un-does the internal reversal within each segment while leaving the segments themselves correctly swapped in position.

**Follow-up:** rotate in the other direction (left rotate) — same trick, just reverse the two segments in the opposite order.

---

### 3. Remove Duplicates from Sorted Array — Easy

**Recognize it:** "sorted array" + "remove duplicates in place, return new length" — sortedness means duplicates are always adjacent, which is what makes an O(1)-space in-place solution possible at all.

**Approach:** a slow pointer tracks the last confirmed-unique position; a fast pointer scans ahead. When the fast pointer finds a new distinct value, write it just after the slow pointer and advance both.

**Complexity:** O(n) time, O(1) space.

```js
function removeDuplicates(nums) {
  if (nums.length === 0) return 0;
  let slow = 0;
  for (let fast = 1; fast < nums.length; fast++) {
    if (nums[fast] !== nums[slow]) {
      slow++;
      nums[slow] = nums[fast];
    }
  }
  return slow + 1; // new length
}
```

**Follow-up:** allow each value to appear at most **twice** (LeetCode 80) — same slow/fast structure, but compare `nums[fast]` against `nums[slow - 1]` instead of `nums[slow]` to allow one duplicate through.

---

### 4. Move Zeroes — Easy

**Recognize it:** "move all zeroes to the end, maintain relative order of non-zero elements, in place."

**Approach:** same slow/fast pointer shape as Problem 3 — slow pointer marks where the next non-zero element should go; fast pointer scans for non-zero values and swaps them into place.

**Complexity:** O(n) time, O(1) space.

```js
function moveZeroes(nums) {
  let slow = 0;
  for (let fast = 0; fast < nums.length; fast++) {
    if (nums[fast] !== 0) {
      [nums[slow], nums[fast]] = [nums[fast], nums[slow]];
      slow++;
    }
  }
}
```
**Note the recurring shape:** this is the *same* slow/fast in-place-partitioning skeleton as Problem 3 — recognizing "in-place rearrangement preserving relative order" as one reusable template, not two separate tricks, is the actual transferable skill here.

**Follow-up:** minimize the total number of swaps (the version above already does — verify why: it only swaps when `fast` finds a non-zero, never on a no-op).

---

### 5. Remove Element — Easy

**Recognize it:** "remove all instances of a given value in place, return new length" — order doesn't need to be preserved, which changes the optimal approach versus Problem 3.

**Approach:** since order doesn't matter, a more efficient variant than slow/fast is possible — swap a matching element with the **last** element and shrink the effective array size, avoiding shifting every subsequent element.

**Complexity:** O(n) time, O(1) space.

```js
function removeElement(nums, val) {
  let end = nums.length;
  let i = 0;
  while (i < end) {
    if (nums[i] === val) {
      nums[i] = nums[end - 1]; // swap with the last valid element
      end--;                      // shrink the effective range, DON'T advance i —
    } else {                        // the swapped-in value still needs to be checked
      i++;
    }
  }
  return end;
}
```
**Why not advance `i` after a swap:** the element just swapped into position `i` hasn't been checked yet — it could itself equal `val` (if it was originally near the end), so re-examining the same index on the next iteration is required for correctness.

**Follow-up:** what if order *did* need to be preserved? Falls back to the slower slow/fast shift pattern from Problems 3–4.

---

### 6. Plus One — Easy

**Recognize it:** an array represents a number's digits, most-significant digit first — "add one" is really "simulate elementary-school carrying."

**Approach:** start from the last digit, increment, propagate a carry leftward while a digit overflows past 9.

**Complexity:** O(n) time, O(1) extra space (ignoring the potential need to grow the array by one digit).

```js
function plusOne(digits) {
  for (let i = digits.length - 1; i >= 0; i--) {
    if (digits[i] < 9) {
      digits[i]++;
      return digits; // no carry needed, done
    }
    digits[i] = 0; // this digit overflowed, carry to the next
  }
  return [1, ...digits]; // every digit was a 9 (e.g. 999 -> 1000) — needs a new leading digit
}
```

**Follow-up:** implement "add two numbers represented as digit arrays" — the general version of the same carry-propagation logic, applied to two inputs instead of "add one."

---

### 7. Find the Missing Number — Easy/Medium

**Recognize it:** "array of n distinct numbers from 0 to n, one is missing" — a classic setup for either the sum-formula trick or XOR, both O(1) extra space.

**Approach (sum formula):** the sum of `0..n` has a closed form (`n*(n+1)/2`); subtract the actual array sum from that expected sum — the difference is the missing number.

**Complexity:** O(n) time, O(1) space.

```js
function missingNumber(nums) {
  const n = nums.length;
  const expectedSum = (n * (n + 1)) / 2;
  const actualSum = nums.reduce((sum, num) => sum + num, 0);
  return expectedSum - actualSum;
}
```
**Alternative (XOR):** XOR every index `0..n` and every array value together — every present number cancels with its own index-XOR pairing except the missing one, which survives. Preferred when the sum approach risks integer overflow in a language with fixed-width integers (not a practical concern in JS's number type, but a common interviewer follow-up).

```js
function missingNumberXOR(nums) {
  let result = nums.length; // start with n itself
  for (let i = 0; i < nums.length; i++) {
    result ^= i ^ nums[i];
  }
  return result;
}
```

**Follow-up:** two numbers are missing instead of one — the sum trick alone under-determines the answer; needs a second equation (e.g. sum of squares, or partitioning by a differing bit) to solve for both.

---

## Cross-links

- Problems 3/4's slow/fast in-place partitioning shape reappears, generalized, in [Part 02 — Two Pointers](../02-two-pointers.md).
- "Sorted array" as a setup signal (Problem 3) is the same signal that motivates [Part 05 — Binary Search](../05-binary-search.md) when the question shifts from "modify" to "search."

---

**Previous:** [Arrays & Strings Index](00-index.md) · **Next:** [01.2 — Prefix Sum & Difference Arrays](02-prefix-sum-and-difference-arrays.md)
