# DSA Notes — Part 01

## Arrays & Strings — Deep Dive Index

> The single highest-frequency problem category in real interviews — covered across 8 focused sub-parts rather than one flat list, ~55–60 problems total. Where a problem is *really* a Two Pointers, Sliding Window, or Hashing problem underneath, it lives in that pattern's dedicated part instead and is cross-linked from here, not duplicated.

---

## Sub-parts

| # | Sub-part | Recognize it by... | Problem count |
|---|---|---|---|
| [01.1](01-basics-and-in-place-manipulation.md) | Basics & In-Place Manipulation | "in place," "O(1) extra space," rotate/reverse/rearrange with no sorting/hashing angle | 7 |
| [01.2](02-prefix-sum-and-difference-arrays.md) | Prefix Sum & Difference Arrays | Repeated range-sum queries, or repeated range-update operations | 6 |
| [01.3](03-subarray-and-subsequence.md) | Subarray & Subsequence Problems | "contiguous subarray" + max/target-sum aggregate, not a fixed/bounded window | 7 |
| [01.4](04-2d-arrays-and-matrix.md) | 2D Arrays & Matrix | Input is explicitly a grid; traversal order or in-place matrix transforms | 7 |
| [01.5](05-intervals.md) | Intervals | Input is a list of `[start, end]` ranges; "merge," "overlap," "rooms" | 7 |
| [01.6](06-string-manipulation-and-pattern-matching.md) | String Manipulation & Pattern Matching | Text structure (words, palindromes, anagram signatures, numeric parsing) | 7 |
| [01.7](07-sorting-based-array-tricks.md) | Sorting-Based Array Tricks | Sorting first is a legitimate unlock, or a custom comparator is needed | 7 |
| [01.8](08-greedy-and-simulation-on-arrays.md) | Greedy & Simulation on Arrays | A single left-to-right pass with a locally-best choice, provably optimal | 7 |

---

## Full recognition cheat sheet

Skim this before a mock interview — it's the actual transferable skill this whole deep-dive builds toward:

```
"in place" / "O(1) space" / rotate / reverse           → 01.1 Basics
repeated RANGE queries on a static array                → 01.2 Prefix Sum
repeated RANGE updates, then read the final array        → 01.2 Difference Array
"contiguous subarray" + max sum/product                   → 01.3 Subarray (Kadane's family)
"subarray sums to k" / "divisible by k" (has negatives)     → 01.3 Subarray (prefix sum + hashmap)
input is a grid/matrix                                        → 01.4 2D Arrays & Matrix
list of [start, end] ranges                                     → 01.5 Intervals — sort first, almost always
words/palindrome/anagram/numeric-string-parsing                   → 01.6 String Manipulation
sorting unlocks the answer, or a CUSTOM comparator is needed         → 01.7 Sorting-Based Tricks
one pass, locally-best choice, provably can't be undone later          → 01.8 Greedy & Simulation

(if the array is SORTED and the ask is a target sum/condition)          → Part 02 Two Pointers
(if it's "substring/subarray" + a SIZE/uniqueness constraint)             → Part 03 Sliding Window
(if it needs O(1) lookup / frequency counting / "have I seen this")         → Part 04 Hashing
(if it's SORTED and the ask is "find/search," or a monotonic yes/no answer)   → Part 05 Binary Search
```

---

## Cross-links summary (avoid duplicate solving)

- **Two Sum** — brute force lives conceptually in 01.1's spirit, but the actual optimal solution is [Part 04 — Hashing](../04-hashing.md)'s opening problem.
- **Subarray Sum Equals K** ([01.3](03-subarray-and-subsequence.md)) — prefix sum + hashmap combo; study alongside [Part 04 — Hashing](../04-hashing.md).
- **Search a 2D Matrix** ([01.4](04-2d-arrays-and-matrix.md)) — a matrix reinterpreted as one sorted 1D array; study alongside [Part 05 — Binary Search](../05-binary-search.md).
- **Group Anagrams** ([01.6](06-string-manipulation-and-pattern-matching.md)) — signature-based hashmap grouping; study alongside [Part 04 — Hashing](../04-hashing.md).
- **Interval List Intersections** ([01.5](05-intervals.md)) — a two-pointer sweep over two separate sorted lists; study alongside [Part 02 — Two Pointers](../02-two-pointers.md).
- **Sort Colors** ([01.7](07-sorting-based-array-tricks.md)) — the three-way partition that [Part 02 — Two Pointers](../02-two-pointers.md)'s general two-pointer discipline builds on.

---

**Previous:** [Part 00 — Foundations](../00-foundations.md) · **Start here:** [01.1 — Basics & In-Place Manipulation](01-basics-and-in-place-manipulation.md) · **Next part:** [Part 02 — Two Pointers](../02-two-pointers.md)
