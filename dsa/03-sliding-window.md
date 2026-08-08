# DSA Notes — Part 03

## Sliding Window

**Recognize it:** "subarray"/"substring" + "contiguous" + a size, sum, or uniqueness constraint. The signal that separates this from [Two Pointers](02-two-pointers.md): the two pointers here define a **window** whose contents you're tracking incrementally (a running sum, a character-frequency map), rather than just comparing two individual elements.

**The core idea:** instead of recomputing an aggregate (sum, character counts) from scratch for every candidate window — an O(n·k) or O(n²) brute force — maintain the aggregate incrementally as the window's edges move: adding the element the right edge just included, removing the element the left edge just excluded.

---

### 1. Minimum Size Subarray Sum — Medium

**Recognize it:** "smallest contiguous subarray with sum ≥ target" — a **variable-size** window (grows and shrinks) is the fundamental sliding-window shape, and this is its cleanest introduction.

**Approach:** expand the window (move `right`) while accumulating the sum. Once the sum meets the target, shrink the window from the left as much as possible while it still meets the target, recording the minimum length at each valid point.

**Complexity:** O(n) time — each element is added once (by `right`) and removed at most once (by `left`), so the total work is linear despite the nested-looking loops. O(1) space.

```js
function minSubArrayLen(target, nums) {
  let left = 0, sum = 0, minLen = Infinity;
  for (let right = 0; right < nums.length; right++) {
    sum += nums[right]; // expand
    while (sum >= target) { // shrink as much as possible while still valid
      minLen = Math.min(minLen, right - left + 1);
      sum -= nums[left];
      left++;
    }
  }
  return minLen === Infinity ? 0 : minLen;
}
```
**Why this is O(n), not O(n²), despite the nested loop:** `left` only ever moves forward, and across the *entire* run of the algorithm it can advance at most `n` times total, regardless of how many times the outer `right` loop triggers the inner `while` — the two pointers together sweep the array once each, not once per combination.

**Follow-up:** requires **non-negative** numbers to work correctly (as stated here) — if negative numbers were allowed, the sum would no longer be monotonic as the window grows, and this specific shrink logic would break; that variant needs the prefix-sum-plus-hashmap approach from [01.3](arrays-and-strings/03-subarray-and-subsequence.md#5-maximum-size-subarray-sum-equals-k--medium) instead.

---

### 2. Longest Substring Without Repeating Characters — Medium

**Recognize it:** "longest substring" + "without repeating characters" — a variable-size window where the shrink condition is a **uniqueness violation**, tracked via a hashmap/set of characters currently in the window.

**Approach:** expand the window, tracking the last-seen index of each character. If the newly-included character was already in the current window, jump `left` forward past its previous occurrence (not just by one) rather than shrinking one step at a time.

**Complexity:** O(n) time — with the "jump left directly" optimization, each character is visited a bounded number of times; O(min(n, charset size)) space for the tracking map.

```js
function lengthOfLongestSubstring(s) {
  const lastSeen = new Map();
  let left = 0, maxLen = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    if (lastSeen.has(ch) && lastSeen.get(ch) >= left) {
      left = lastSeen.get(ch) + 1; // jump left PAST the previous occurrence directly
    }
    lastSeen.set(ch, right);
    maxLen = Math.max(maxLen, right - left + 1);
  }
  return maxLen;
}
```
**Why jumping `left` directly (instead of shrinking one character at a time) is a real optimization, not just style:** a one-step-at-a-time shrink would work correctly too, but re-checks characters that are already known to be fine — jumping straight past the duplicate's previous position avoids that redundant re-scanning, and is what keeps this a clean single pass rather than an amortized-but-messier one.

**Follow-up:** return the actual longest substring (not just its length) — track a `start` index alongside `maxLen`, updated whenever a new maximum is found, then slice at the end.

---

### 3. Longest Repeating Character Replacement — Medium

**Recognize it:** "longest substring where you can replace at most k characters to make all characters the same" — the window-validity condition is a count-based one (`window length - count of the most frequent character in the window ≤ k`), not a simple uniqueness check.

**Approach:** expand the window, tracking character frequencies within it and the count of the single most frequent character seen so far in *any* window (this running max frequency never needs to decrease, even as the window later shrinks — see below). Shrink from the left only when the number of "characters that would need replacing" exceeds `k`.

**Complexity:** O(n) time (or O(26n) accounting for the frequency-map scan, still linear), O(1) space (bounded alphabet).

```js
function characterReplacement(s, k) {
  const counts = new Map();
  let left = 0, maxFreq = 0, maxLen = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    counts.set(ch, (counts.get(ch) || 0) + 1);
    maxFreq = Math.max(maxFreq, counts.get(ch));

    if ((right - left + 1) - maxFreq > k) { // more than k characters would need replacing
      counts.set(s[left], counts.get(s[left]) - 1);
      left++;
    }
    maxLen = Math.max(maxLen, right - left + 1); // window length AFTER any needed shrink
  }
  return maxLen;
}
```
**Why `maxFreq` is allowed to become "stale" (never decremented) without breaking correctness:** `maxFreq` only needs to represent a frequency that was *achievable* by some window during the scan — since the algorithm is only ever looking for the longest valid window, an outdated (too-high) `maxFreq` can only make the shrink condition falsely trigger a shrink slightly later than strictly necessary, which can never produce an *incorrect* (too-large) answer, only, at worst, fail to find a marginally longer valid window that a fully-accurate `maxFreq` might have caught — and it's a provable fact of this specific problem that this never actually costs the final correct answer, only simplifies the bookkeeping. This is a subtle, genuinely good "explain why an apparent shortcut is actually still correct" interview moment.

**Follow-up:** what if `k` could be larger than the string length? The loop condition naturally handles it (never triggers a shrink), returning the full string length — worth confirming rather than assuming.

---

### 4. Minimum Window Substring — Hard

**Recognize it:** "smallest window in `s` containing all characters of `t` (with correct frequency)" — the classic hard escalation in this pattern family; combines a variable-size window with a **multi-character frequency-matching** validity condition.

**Approach:** track required character counts (from `t`) and current window counts; track how many *distinct required characters* currently have their frequency fully satisfied within the window. Expand until all required characters are satisfied, then shrink from the left as far as possible while remaining valid, recording the minimum window at each valid point.

**Complexity:** O(|s| + |t|) time, O(|t|) space for the tracking maps.

```js
function minWindow(s, t) {
  if (t.length === 0 || s.length === 0) return '';
  const required = new Map();
  for (const ch of t) required.set(ch, (required.get(ch) || 0) + 1);

  const windowCounts = new Map();
  let have = 0; // how many DISTINCT required characters are currently fully satisfied
  const need = required.size;
  let left = 0, resultLen = Infinity, resultStart = 0;

  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    windowCounts.set(ch, (windowCounts.get(ch) || 0) + 1);
    if (required.has(ch) && windowCounts.get(ch) === required.get(ch)) {
      have++; // this character JUST became fully satisfied (exactly, not more — counted once)
    }

    while (have === need) { // window is currently valid — try to shrink it
      if (right - left + 1 < resultLen) {
        resultLen = right - left + 1;
        resultStart = left;
      }
      const leftChar = s[left];
      windowCounts.set(leftChar, windowCounts.get(leftChar) - 1);
      if (required.has(leftChar) && windowCounts.get(leftChar) < required.get(leftChar)) {
        have--; // shrinking broke this character's requirement — window is no longer valid
      }
      left++;
    }
  }
  return resultLen === Infinity ? '' : s.slice(resultStart, resultStart + resultLen);
}
```
**Why tracking `have`/`need` (distinct satisfied characters) instead of a raw total-count comparison:** comparing total character counts directly can't distinguish "have enough of the right characters" from "have enough characters overall but the wrong distribution" — tracking whether each *specific* required character's count has reached its target, and counting how many distinct characters have reached that milestone, correctly captures the actual multi-character matching condition the problem demands.

**Follow-up:** this is widely considered one of the hardest "standard" sliding window problems specifically because of the `have`/`need` bookkeeping — being able to re-derive it from the simpler Problem 3 (also frequency-based) rather than memorizing it verbatim is the real skill being tested.

---

### 5. Permutation in String — Medium

**Recognize it:** "does `s1`'s string contain a permutation of `s2` as a substring" — a **fixed-size window** (size = `s1.length`) sliding across `s2`, checking a frequency-match condition at every position — simpler than Minimum Window Substring because the window size never changes.

**Approach:** maintain a frequency count of `s1`'s characters and a frequency count of the current fixed-size window in `s2`; slide the window one character at a time, comparing frequency maps for equality at each position.

**Complexity:** O(|s2|) time (with O(26) comparison per step, still effectively linear), O(1) space (bounded alphabet).

```js
function checkInclusion(s1, s2) {
  if (s1.length > s2.length) return false;
  const need = new Array(26).fill(0);
  const window = new Array(26).fill(0);
  const code = (ch) => ch.charCodeAt(0) - 97;

  for (const ch of s1) need[code(ch)]++;
  for (let i = 0; i < s1.length; i++) window[code(s2[i])]++;
  if (need.every((v, i) => v === window[i])) return true;

  for (let right = s1.length; right < s2.length; right++) {
    window[code(s2[right])]++;                       // include the new right character
    window[code(s2[right - s1.length])]--;              // exclude the character leaving the fixed window
    if (need.every((v, i) => v === window[i])) return true;
  }
  return false;
}
```
**Why a fixed-size window is simpler than a variable one:** there's no shrink/grow decision to make at all — the window size is always exactly `s1.length`, so each step is a pure "add the new right character, remove the departing left character" swap, with no conditional logic about whether or how much to shrink.

**Follow-up:** using a 26-length array instead of a `Map` here is a deliberate choice, not just style — a fixed, small, known alphabet (lowercase letters) makes array indexing genuinely faster than hashmap operations in practice; worth noting explicitly as a micro-optimization applicable whenever the character set is small and known.

---

### 6. Fruit Into Baskets — Medium

**Recognize it:** despite the tree/fruit framing, this is "longest subarray containing at most **2 distinct values**" — a variable-size window with a distinct-count validity condition, structurally identical to Problem 3's frequency-tracking shape but with a distinct-count limit instead of a most-frequent-character condition.

**Approach:** expand the window, tracking a frequency map of values currently inside it; shrink from the left whenever the map contains more than 2 distinct keys.

**Complexity:** O(n) time, O(1) space (at most 3 keys in the map at any point, since it never grows to more than one over the limit before shrinking).

```js
function totalFruit(fruits) {
  const basket = new Map();
  let left = 0, maxLen = 0;
  for (let right = 0; right < fruits.length; right++) {
    basket.set(fruits[right], (basket.get(fruits[right]) || 0) + 1);
    while (basket.size > 2) { // more than 2 distinct fruit types in the window
      const leftType = fruits[left];
      basket.set(leftType, basket.get(leftType) - 1);
      if (basket.get(leftType) === 0) basket.delete(leftType); // remove the key entirely once its
      left++;                                                      // count hits 0 — this is what shrinks .size
    }
    maxLen = Math.max(maxLen, right - left + 1);
  }
  return maxLen;
}
```

**Follow-up:** generalize to "at most **k** distinct values" — literally a one-character change (`basket.size > k`), a good self-check that the underlying pattern (not the specific number 2) has actually been internalized.

---

### 7. Max Consecutive Ones III — Medium

**Recognize it:** "longest subarray of 1s if you can flip at most k 0s" — the same shape as Problem 3 (Longest Repeating Character Replacement) with a binary alphabet, which makes the validity condition simpler: track a running count of zeroes in the window directly instead of a full frequency map.

**Approach:** expand the window, counting zeroes inside it; shrink from the left whenever the zero count exceeds `k`.

**Complexity:** O(n) time, O(1) space.

```js
function longestOnes(nums, k) {
  let left = 0, zeroCount = 0, maxLen = 0;
  for (let right = 0; right < nums.length; right++) {
    if (nums[right] === 0) zeroCount++;
    while (zeroCount > k) {
      if (nums[left] === 0) zeroCount--;
      left++;
    }
    maxLen = Math.max(maxLen, right - left + 1);
  }
  return maxLen;
}
```
**Why this is "Problem 3 with a binary alphabet" and not a new pattern:** Problem 3 tracks "how many characters in the window differ from the most frequent one" (which needs a full frequency map to determine the most-frequent count); here, with only two possible values, "differs from the majority" collapses to simply "is a zero" — a direct count is sufficient, no frequency map needed at all.

**Follow-up:** explicitly state the mapping from this problem to Problem 3's general frequency-based template — the same "recognize it as an already-solved shape" skill flagged repeatedly throughout this track.

---

## Cross-links

- Problem 1's "non-negative numbers required" caveat connects directly to [01.3 — Subarray & Subsequence](arrays-and-strings/03-subarray-and-subsequence.md)'s prefix-sum-plus-hashmap approach, which is what's needed once negative numbers are allowed.
- Sliding Window Maximum (a deque-based sliding window) lives in [Part 08 — Queues](08-queues.md#3-sliding-window-maximum--hard), since its core mechanism is a monotonic deque, not a simple running aggregate — worth studying as the natural "what if the window needs its MAX, not just a sum/count" escalation of this whole pattern.

---

**Previous:** [Part 02 — Two Pointers](02-two-pointers.md) · **Next:** [Part 04 — Hashing](04-hashing.md)
