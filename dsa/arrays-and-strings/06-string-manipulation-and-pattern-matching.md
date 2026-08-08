# DSA Notes — Arrays & Strings, Sub-Part 01.6

## String Manipulation & Pattern Matching

**Recognize this bucket:** the input is text, and the problem is about **structure** (word boundaries, character frequency, symmetry, numeric parsing) rather than a numeric aggregate — string problems lean heavily on JS-specific gotchas (immutability, `split`/`join`, character codes) worth knowing cold.

> **The one JS-specific fact underlying every solution here:** strings are immutable ([javascript Part 06](../../javascript/06-strings-and-regex.md#1-strings-are-primitives-but-have-methods)) — every "in-place" string manipulation in JS actually means "build a new string efficiently," typically via an array of characters joined at the end, since repeated string concatenation in a loop is O(n²) due to creating a new string object on every `+=`.

---

### 1. Reverse Words in a String — Medium

**Recognize it:** "reverse the order of words, collapse multiple spaces, trim leading/trailing whitespace" — a word-boundary problem, not a character-reversal one.

**Approach:** split on whitespace (using a regex that collapses multiple spaces and handles leading/trailing automatically), filter out empty strings from the split, reverse the resulting array, rejoin.

**Complexity:** O(n) time, O(n) space.

```js
function reverseWords(s) {
  return s.trim().split(/\s+/).reverse().join(' '); // \s+ collapses ANY run of whitespace into one split point
}
```
**Follow-up (the O(1)-extra-space version, if strings were mutable, or done on a char array):** reverse the entire character array first, then reverse each individual word in place within that reversed array — the same "reverse the whole, then reverse the parts" composition trick as [01.1's array rotation](01-basics-and-in-place-manipulation.md#2-rotate-array-by-k--medium).

---

### 2. String Compression — Medium

**Recognize it:** "compress consecutive repeated characters into character+count, in place, return new length" — an in-place array-of-characters problem (strings are given as a `char[]` in the classic framing specifically to make the in-place constraint meaningful).

**Approach:** two pointers — a read pointer scans runs of the same character, counting them; a write pointer writes the character and, if the run length is greater than 1, each digit of the count.

**Complexity:** O(n) time, O(1) extra space (writing back into the input array).

```js
function compress(chars) {
  let write = 0, read = 0;
  while (read < chars.length) {
    const currentChar = chars[read];
    let count = 0;
    while (read < chars.length && chars[read] === currentChar) {
      read++;
      count++;
    }
    chars[write++] = currentChar;
    if (count > 1) {
      for (const digit of String(count)) { // a multi-digit count needs one write PER digit
        chars[write++] = digit;
      }
    }
  }
  return write; // new length
}
```
**Why counts need a per-digit write loop:** a run length like `12` isn't a single character — writing `chars[write++] = count` would write the number `12`, not the two characters `'1'` and `'2'`; the array holds single characters, so a multi-digit count has to be decomposed and written digit by digit.

**Follow-up:** what if the compressed result is never shorter than the original (e.g. no repeated characters at all)? Verify the function still behaves correctly (it does — it just writes back essentially the original characters one at a time, with no count digits appended since every run length is 1).

---

### 3. Longest Common Prefix — Easy

**Recognize it:** "find the longest string that's a prefix of every string in the array" — a straightforward vertical or horizontal scan, useful as a warm-up for more complex prefix/trie-adjacent problems (tries themselves are out of scope for this track).

**Approach (horizontal scanning):** start with the first string as the candidate prefix; repeatedly shrink it until it's actually a prefix of the next string in the array, for every string.

**Complexity:** O(S) time where S is the sum of all character counts (worst case), O(1) extra space beyond the output.

```js
function longestCommonPrefix(strs) {
  if (strs.length === 0) return '';
  let prefix = strs[0];
  for (let i = 1; i < strs.length; i++) {
    while (!strs[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1); // shrink by one character until it fits
      if (prefix === '') return '';
    }
  }
  return prefix;
}
```

**Follow-up:** solve it via **vertical scanning** instead — compare the `k`-th character across every string simultaneously, for `k = 0, 1, 2, ...`, stopping at the first mismatch or the first string that runs out of characters; this variant can short-circuit earlier on average, worth naming as an alternative even if not strictly better in worst-case complexity.

---

### 4. Valid Palindrome — Easy

**Recognize it:** "ignoring non-alphanumeric characters and case, is this a palindrome" — the string-specific instance of the two-pointer pattern ([Part 02](../02-two-pointers.md)), included here for the string-cleaning aspect specifically.

**Approach:** two pointers from both ends, skipping non-alphanumeric characters as they're encountered, comparing lowercased characters.

**Complexity:** O(n) time, O(1) space.

```js
function isPalindrome(s) {
  let left = 0, right = s.length - 1;
  const isAlphanumeric = (ch) => /[a-z0-9]/i.test(ch);
  while (left < right) {
    while (left < right && !isAlphanumeric(s[left])) left++;
    while (left < right && !isAlphanumeric(s[right])) right--;
    if (s[left].toLowerCase() !== s[right].toLowerCase()) return false;
    left++; right--;
  }
  return true;
}
```

**Follow-up — Valid Palindrome II:** the string may have **at most one character removed** to become a palindrome — on the first mismatch, try skipping either the left or the right character (two recursive/helper checks) and see if either resulting substring is a clean palindrome; a good test of whether you can extend a known pattern rather than solve from scratch.

---

### 5. Longest Palindromic Substring — Medium

**Recognize it:** "find the longest substring that is itself a palindrome" — importantly different from Problem 4 (checking if a *whole* string is a palindrome); this needs checking every possible center point.

**Approach (expand around center):** a palindrome is symmetric around a center, which is either a single character (odd-length palindrome) or a gap between two characters (even-length palindrome) — try every possible center (`2n - 1` of them), expanding outward while characters match, tracking the longest found.

**Complexity:** O(n²) time (n centers, each expanding up to O(n)), O(1) extra space. (A more advanced O(n) solution — Manacher's algorithm — exists but is out of scope for this curated set; naming it as a "there's a linear-time algorithm for this specific problem" fact is worth doing even without implementing it.)

```js
function longestPalindrome(s) {
  let start = 0, maxLen = 0;

  const expandAroundCenter = (left, right) => {
    while (left >= 0 && right < s.length && s[left] === s[right]) {
      left--; right++;
    }
    const len = right - left - 1; // left/right overshot by one on the failing comparison
    if (len > maxLen) {
      maxLen = len;
      start = left + 1;
    }
  };

  for (let i = 0; i < s.length; i++) {
    expandAroundCenter(i, i);       // odd-length palindromes centered ON i
    expandAroundCenter(i, i + 1);     // even-length palindromes centered BETWEEN i and i+1
  }
  return s.slice(start, start + maxLen);
}
```
**Why both `(i, i)` and `(i, i+1)` centers are needed:** an odd-length palindrome like `"aba"` has a true single-character center (`b`); an even-length palindrome like `"abba"` has no single-character center at all — its center is the gap between the two middle characters. Checking only one center type would systematically miss half of all possible palindromes.

**Follow-up:** count the **total number of palindromic substrings** (not just the longest) — same expand-around-center technique, just incrementing a counter on every valid expansion step instead of tracking a single maximum.

---

### 6. Group Anagrams — Medium

**Recognize it:** "group strings that are anagrams of each other" — needs a canonical **signature** per group; sorting each string's characters (or building a character-count signature) produces identical keys for anagrams, making a hashmap the natural grouping mechanism.

**Approach:** for each string, compute a canonical key (sorted characters, or a character-frequency signature), and group strings sharing the same key in a hashmap.

**Complexity:** O(n · k log k) time, where n is the number of strings and k the max string length (dominated by sorting each string); O(n · k) space.

```js
function groupAnagrams(strs) {
  const groups = new Map();
  for (const str of strs) {
    const key = str.split('').sort().join(''); // canonical signature — anagrams sort to the SAME string
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(str);
  }
  return [...groups.values()];
}
```
**Why sorting each string produces a valid grouping key:** two strings are anagrams if and only if they contain exactly the same multiset of characters — sorting removes ordering entirely, so any two anagrams sort to the identical character sequence, making that sorted string a perfect canonical key for the hashmap.

**Follow-up:** for very long strings, sorting each one is the bottleneck (`O(k log k)` per string) — a character-frequency-count signature (e.g. a 26-length array of counts, joined into a string key) achieves the same grouping in `O(k)` per string instead, trading a slightly more complex key construction for better asymptotic behavior on long strings.

---

### 7. String to Integer (atoi) — Medium

**Recognize it:** "parse a string into an integer, handling whitespace/sign/overflow/invalid-input edge cases" — not algorithmically hard, but a genuine test of careful, systematic edge-case handling under a long list of rules, which is the actual skill being probed.

**Approach:** process the rules in order — skip leading whitespace, read an optional sign, read digits until a non-digit is found (stopping there, not erroring), clamp the result to 32-bit signed integer bounds.

**Complexity:** O(n) time, O(1) space.

```js
function myAtoi(s) {
  const INT_MAX = 2 ** 31 - 1;
  const INT_MIN = -(2 ** 31);
  let i = 0;
  const n = s.length;

  while (i < n && s[i] === ' ') i++;                     // 1. skip leading whitespace

  let sign = 1;
  if (i < n && (s[i] === '+' || s[i] === '-')) {             // 2. optional sign
    sign = s[i] === '-' ? -1 : 1;
    i++;
  }

  let result = 0;
  while (i < n && s[i] >= '0' && s[i] <= '9') {                // 3. read digits, STOP at first non-digit
    result = result * 10 + (s[i].charCodeAt(0) - '0'.charCodeAt(0));
    if (sign === 1 && result > INT_MAX) return INT_MAX;            // 4. clamp on overflow, don't throw
    if (sign === -1 && -result < INT_MIN) return INT_MIN;
    i++;
  }
  return sign * result;
}
```
**Why this problem is really about rule ordering, not algorithm design:** every individual step (skip spaces, read a sign, read digits, clamp) is trivial in isolation — the actual difficulty is applying them in the exact right order and stopping conditions the spec demands (e.g. `"words and 987"` should parse as `0`, not search ahead for the first digit sequence; `"-91283472332"` should clamp to `INT_MIN`, not throw or wrap around).

**Follow-up:** what should `"  -042"` parse to? Walk through the function by hand — leading whitespace skipped, `-` read as sign, then digits `042` read as `42` (leading zero handled naturally by the running `result * 10 + digit` accumulation, no special-casing needed) — a good self-check that the implementation is actually correct, not just plausible-looking.

---

## Cross-links

- Problem 6 (Group Anagrams) is also a canonical [Part 04 — Hashing](../04-hashing.md) problem — included here for its string-signature-construction aspect specifically; the hashmap-grouping mechanism itself is Part 04's core pattern.
- Problem 4's core two-pointer technique is the same as [Part 02 — Two Pointers](../02-two-pointers.md)'s Valid Palindrome entry — no duplication, just noting the overlap.

---

**Previous:** [01.5 — Intervals](05-intervals.md) · **Next:** [01.7 — Sorting-Based Array Tricks](07-sorting-based-array-tricks.md)
