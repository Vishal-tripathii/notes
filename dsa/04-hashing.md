# DSA Notes — Part 04

## Hashing

**Recognize it:** needing O(1) average-case lookup/existence-check, counting frequencies, or finding a "complement" of something already seen — the signal is usually a brute force with a nested loop whose inner loop is *searching* for something, which a hashmap/hashset can turn into a single lookup.

**The core trade:** O(n) extra space in exchange for collapsing an O(n) (or worse) search into O(1) average time — almost every problem in this part is that exact trade, applied to a different specific question ("have I seen this value," "how many times has this occurred," "what's the complement I need").

---

### 1. Two Sum — Easy

**Recognize it:** the canonical hashing problem — "find two numbers that sum to a target," unsorted, any indices. (The sorted-input variant belongs to [Part 02 — Two Pointers](02-two-pointers.md#1-two-sum-ii-sorted-input--easy) instead — same problem family, different optimal tool depending on whether sortedness is available.)

**Approach:** for each number, compute its **complement** (`target - current`) and check whether that complement has already been seen — a single pass, storing each value's index as you go.

**Complexity:** O(n) time, O(n) space — versus O(n²) for the brute-force nested-loop check.

```js
function twoSum(nums, target) {
  const seen = new Map(); // value -> index
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (seen.has(complement)) return [seen.get(complement), i];
    seen.set(nums[i], i);
  }
  return [];
}
```
**Why storing *after* checking (not before) matters:** checking for the complement before inserting the current value prevents a number from being paired with itself when `target === 2 * nums[i]` — inserting first would let `nums[i]` find itself as a false "complement" on the same iteration.

**Follow-up:** return **all** pairs summing to target (not just one), handling duplicate values correctly without double-counting the same pair — needs storing a list of indices per value, not just one, and careful dedup logic.

---

### 2. Contains Duplicate II — Easy

**Recognize it:** "duplicate value within index distance k" — combines a hashmap lookup with a sliding window-like "forget values that are too far back" constraint.

**Approach:** maintain a hashmap of value → most recent index seen; for each new element, check if its value was seen within the last `k` indices, and update the stored index either way.

**Complexity:** O(n) time, O(min(n, k)) space (values farther back than k can conceptually be "forgotten," though a plain Map with an index check achieves the same result more simply).

```js
function containsNearbyDuplicate(nums, k) {
  const lastIndex = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (lastIndex.has(nums[i]) && i - lastIndex.get(nums[i]) <= k) {
      return true;
    }
    lastIndex.set(nums[i], i); // always update to the MOST RECENT occurrence
  }
  return false;
}
```
**Why storing the most recent index (not the first) is correct:** for a future duplicate check, the closest prior occurrence is always at least as likely to fall within the `k` window as an earlier one — keeping the most recent index maximizes the chance of a valid match being detected, and never causes a false negative, since any earlier occurrence within range implies the most recent one is too.

**Follow-up:** the "II" hints at Contains Duplicate III existing — "duplicate within index distance k AND value distance t" — that variant needs a different structure (a sorted "bucket" approach or a balanced tree) since a plain hashmap alone can't efficiently answer "is there a value within t of this one," only exact-match lookups.

---

### 3. Top K Frequent Elements — Medium

**Recognize it:** "k most frequent elements" — a two-stage problem: count frequencies (hashmap), then select the top k (several valid approaches, with bucket sort being the clean O(n) answer given the specific structure of "frequency" as a bounded value).

**Approach:** count frequencies with a hashmap. Then, since frequency is bounded by the array's length, use **bucket sort** — an array of buckets indexed by frequency, each holding the values with that frequency — and read off the top k by scanning buckets from highest frequency downward.

**Complexity:** O(n) time (bucket sort avoids the O(n log n) of a full frequency-sort), O(n) space.

```js
function topKFrequent(nums, k) {
  const freq = new Map();
  for (const num of nums) freq.set(num, (freq.get(num) || 0) + 1);

  const buckets = Array.from({ length: nums.length + 1 }, () => []); // index = frequency
  for (const [num, count] of freq) {
    buckets[count].push(num);
  }

  const result = [];
  for (let count = buckets.length - 1; count >= 0 && result.length < k; count--) {
    for (const num of buckets[count]) {
      result.push(num);
      if (result.length === k) break;
    }
  }
  return result;
}
```
**Why bucket sort beats a full sort-by-frequency here specifically:** frequency is bounded by `nums.length` — a value can appear at most `n` times — so unlike a general sort where the range of possible values is unbounded, bucketing by frequency directly gives an O(n) approach instead of paying an O(n log n) comparison-sort cost for a value with a known, small range.

**Follow-up:** a min-heap of size k is the other standard answer here (push each `[value, count]`, pop when size exceeds k) — O(n log k), worth naming as an alternative even without a dedicated heap sub-part in this track, since interviewers frequently ask for it as a comparison point against bucket sort.

---

### 4. Longest Consecutive Sequence — Medium

**Recognize it:** "length of the longest run of consecutive integers," **unsorted** input, with an O(n) time requirement explicitly stated — the O(n) constraint rules out sorting first (which would be O(n log n)) and is the signal to reach for a hashset-based approach instead.

**Approach:** put every value into a hashset. For each value, only start counting a sequence if it's the **start** of one (i.e. `value - 1` is not in the set) — then count forward from there. This ensures every consecutive run is only ever fully counted once, from its true start, rather than being re-counted from every one of its members.

**Complexity:** O(n) time — even though there's a nested-looking loop, the inner "count forward" loop only ever runs for true sequence starts, so every element is visited a bounded number of times in total across the whole algorithm. O(n) space.

```js
function longestConsecutive(nums) {
  const numSet = new Set(nums);
  let longest = 0;
  for (const num of numSet) {
    if (!numSet.has(num - 1)) { // only start counting from the BEGINNING of a run
      let length = 1;
      let current = num;
      while (numSet.has(current + 1)) {
        current++;
        length++;
      }
      longest = Math.max(longest, length);
    }
  }
  return longest;
}
```
**Why the `!numSet.has(num - 1)` check is what makes this O(n) instead of O(n²):** without it, the algorithm would attempt to count forward starting from *every* element, including ones in the middle of a run — for a single long run of length L, that would redundantly re-scan the same run up to L times. Restricting the forward count to only true run-starts guarantees each run is counted exactly once, in total work proportional to its own length — summed across all runs, that's O(n) overall, not O(n²).

**Follow-up:** return the actual sequence (not just its length) — track the best `current`/`length` pair found and reconstruct the range at the end, same underlying logic.

---

### 5. Valid Sudoku — Medium

**Recognize it:** "validate rows, columns, and 3×3 boxes each contain no duplicate digits" — a hashing problem in disguise: three separate uniqueness checks, each naturally expressed as "have I seen this digit before, in this row/column/box."

**Approach:** maintain a Set (or a hashmap of Sets) per row, per column, and per 3×3 box; for each filled cell, check and record its digit against the relevant three sets simultaneously.

**Complexity:** O(1) time technically (a Sudoku board is always 9×9, a fixed size) — more usefully described as O(81) = O(n²) for an n×n board in general terms; O(n) space for the tracking sets.

```js
function isValidSudoku(board) {
  const rows = Array.from({ length: 9 }, () => new Set());
  const cols = Array.from({ length: 9 }, () => new Set());
  const boxes = Array.from({ length: 9 }, () => new Set());

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = board[r][c];
      if (val === '.') continue;
      const boxIndex = Math.floor(r / 3) * 3 + Math.floor(c / 3); // maps (r,c) to one of 9 box IDs

      if (rows[r].has(val) || cols[c].has(val) || boxes[boxIndex].has(val)) {
        return false;
      }
      rows[r].add(val);
      cols[c].add(val);
      boxes[boxIndex].add(val);
    }
  }
  return true;
}
```
**Why the box-index formula works:** `Math.floor(r / 3)` groups rows into 3 bands (0-2, 3-5, 6-8), `Math.floor(c / 3)` groups columns the same way, and combining them (`band * 3 + column-group`) maps every cell to exactly one of the 9 non-overlapping 3×3 boxes — a standard "flatten a 2D grouping into a 1D index" technique worth recognizing beyond just this specific problem.

**Follow-up:** actually **solve** a Sudoku board (not just validate one) requires backtracking — explicitly out of scope for this track by design, but worth naming as the natural next step if this problem is enjoyed.

---

### 6. Isomorphic Strings — Easy

**Recognize it:** "characters in `s` can be consistently mapped to characters in `t`, one-to-one" — a hashmap problem checking a **bijection** (both directions of the mapping must be consistent), not just a one-directional mapping.

**Approach:** maintain two hashmaps, one for `s → t` and one for `t → s`; for each character pair, verify the mapping is consistent in both directions.

**Complexity:** O(n) time, O(1) space (bounded alphabet).

```js
function isIsomorphic(s, t) {
  if (s.length !== t.length) return false;
  const mapST = new Map(), mapTS = new Map();
  for (let i = 0; i < s.length; i++) {
    const a = s[i], b = t[i];
    if (mapST.has(a) && mapST.get(a) !== b) return false;
    if (mapTS.has(b) && mapTS.get(b) !== a) return false;
    mapST.set(a, b);
    mapTS.set(b, a);
  }
  return true;
}
```
**Why a single one-directional map isn't enough:** checking only `s → t` would incorrectly accept a case like `s = "ab"`, `t = "aa"` — both `a` and `b` in `s` could map to `a` in `t` under a one-directional check, but that's not a true bijection since two different source characters collapse onto the same target character. The second map (`t → s`) specifically catches this "two sources, one target" violation.

**Follow-up:** Word Pattern (matching a pattern string like `"abba"` against a sequence of words) is the same bijection-checking idea, just operating on whole words instead of individual characters — recognizing the structural equivalence is the point.

---

### 7. First Unique Character in a String — Easy

**Recognize it:** "index of the first character that appears exactly once" — a two-pass hashmap problem: count frequencies first, then scan again to find the first count-of-1.

**Approach:** build a frequency map in one pass; scan the string again (preserving original order) and return the first character whose count is exactly 1.

**Complexity:** O(n) time (two linear passes), O(1) space (bounded alphabet).

```js
function firstUniqChar(s) {
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
  for (let i = 0; i < s.length; i++) {
    if (freq.get(s[i]) === 1) return i;
  }
  return -1;
}
```
**Why two passes are needed (a single pass can't work):** determining whether a character is "unique" requires knowing its *total* count across the whole string — a single left-to-right pass can't know if a character seen early will reappear later, so the frequency count must be fully built before the order-preserving search for the first unique one can begin.

**Follow-up:** what if the input were a **stream** of characters (unbounded, arriving one at a time) instead of a fixed string? The two-pass approach breaks down since "the whole string" is never fully available — this variant needs an ordered data structure (e.g. a queue of candidate unique characters, evicting from the front when a character is seen again) to maintain the answer incrementally.

---

## Cross-links

- **Subarray Sum Equals K** and **Subarrays Divisible by K** ([01.3](arrays-and-strings/03-subarray-and-subsequence.md)) apply this exact "have I seen this value before, in O(1)" idea to running prefix sums instead of raw array values — study those alongside this part.
- **Group Anagrams** ([01.6](arrays-and-strings/06-string-manipulation-and-pattern-matching.md)) is a hashmap-grouping problem included in the string sub-part for its signature-construction aspect — the grouping mechanism itself is this part's core pattern.

---

**Previous:** [Part 03 — Sliding Window](03-sliding-window.md) · **Next:** [Part 05 — Binary Search](05-binary-search.md)
