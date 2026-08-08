# 🧩 DSA / Coding Problems — Master Roadmap

> **Purpose:** pattern-first coding-interview prep — solved in JavaScript, organized by **technique** (how you recognize which approach a problem wants), not by textbook data-structure chapter. Data structures with their own distinct interview patterns (Linked Lists, Stacks, Queues) still get dedicated sections; general data-structure trivia doesn't.
>
> **Scope, deliberately bounded:** Arrays & Strings get a full dedicated deep-dive (see below — this is the highest-frequency category, so it gets the most coverage), plus Two Pointers, Sliding Window, Hashing, Binary Search, Linked Lists, Stacks, Queues, and a cross-cutting "most asked" set. **No DP, no backtracking, no advanced graph/tree algorithms** — out of scope by request, easy to add as a later phase if that changes.
>
> **Depth per topic:** a curated core set per sub-topic, ~6–10 hand-picked problems, Easy → Medium → Hard, not exhaustive grinding — except Arrays & Strings, which is intentionally broad (8 sub-parts, near-comprehensive coverage of that category specifically). Each problem gets: **recognition heuristic** (how you'd know to reach for this pattern from the problem statement alone) → **approach** → **complexity** → **clean solution** → a **follow-up variant** (the way an interviewer escalates once you solve the base version).
>
> **Format note:** unlike the concept-track roadmaps (javascript/dart/flutter), each part here is a **problem set**, not a concept explainer — the teaching happens through *why this pattern applies here*, not through prose definitions.

---

## Progress tracker

| # | Part | Pattern focus | Status |
|---|---|---|---|
| 00 | [Foundations](00-foundations.md) | Big-O, how to approach any problem, brute force → optimize | ✅ done |
| 01 | **Arrays & Strings** — [`arrays-and-strings/`](arrays-and-strings/00-index.md) *(8 sub-parts, see below)* | Deliberately the deepest section — highest interview frequency | ✅ done |
| 02 | [Two Pointers](02-two-pointers.md) | Opposite-end / same-direction pointer techniques | ✅ done |
| 03 | [Sliding Window](03-sliding-window.md) | Fixed and variable-size window over a contiguous range | ✅ done |
| 04 | [Hashing](04-hashing.md) | HashMap/HashSet for O(1) lookup, frequency counting, complement-finding | ✅ done |
| 05 | [Binary Search](05-binary-search.md) | On a sorted array, and "binary search on the answer" | ✅ done |
| 06 | [Linked Lists](06-linked-lists.md) | Fast/slow pointer, reversal, merge, cycle detection | ✅ done |
| 07 | [Stacks](07-stacks.md) | Monotonic stack, matching/nesting, expression evaluation | ✅ done |
| 08 | [Queues](08-queues.md) | BFS foundation, circular queue, deque-based sliding window | ✅ done |
| 09 | [Most Asked — Cross-Pattern Highlights](09-most-asked-highlights.md) | The "if you only have one week" set, spanning every pattern above | ✅ done |

### Part 01 sub-parts — [`arrays-and-strings/`](arrays-and-strings/00-index.md)

| # | Sub-part | Focus | Status |
|---|---|---|---|
| 01.1 | [Basics & In-Place Manipulation](arrays-and-strings/01-basics-and-in-place-manipulation.md) | Traversal, reversal, rotation, in-place dedup, move zeroes | ✅ done |
| 01.2 | [Prefix Sum & Difference Arrays](arrays-and-strings/02-prefix-sum-and-difference-arrays.md) | Range-sum queries, product-except-self, range-update tricks | ✅ done |
| 01.3 | [Subarray & Subsequence Problems](arrays-and-strings/03-subarray-and-subsequence.md) | Kadane's, max product subarray, subarray sum variants | ✅ done |
| 01.4 | [2D Arrays & Matrix](arrays-and-strings/04-2d-arrays-and-matrix.md) | Rotate image, spiral traversal, set matrix zeroes, transpose | ✅ done |
| 01.5 | [Intervals](arrays-and-strings/05-intervals.md) | Merge/insert intervals, non-overlapping, meeting rooms | ✅ done |
| 01.6 | [String Manipulation & Pattern Matching](arrays-and-strings/06-string-manipulation-and-pattern-matching.md) | Reverse words, compression, palindromes, anagram grouping | ✅ done |
| 01.7 | [Sorting-Based Array Tricks](arrays-and-strings/07-sorting-based-array-tricks.md) | Dutch flag, merge sorted array, majority element, custom sort | ✅ done |
| 01.8 | [Greedy & Simulation on Arrays](arrays-and-strings/08-greedy-and-simulation-on-arrays.md) | Jump Game, Gas Station, Buy/Sell Stock II — array-native greedy only | ✅ done |

**If you have one week left:** Part 09 alone, plus re-solving each pattern's Medium-tier problems (Parts 01–08) cold, without looking at your own notes.

---

## Why pattern-first

The real skill being tested in a DSA interview isn't "do you know how to reverse a linked list" — it's **can you look at an unseen problem and recognize which of a handful of techniques it wants**. A problem statement mentioning "subarray," "contiguous," and a length/sum constraint is a sliding-window signal, regardless of whether it's dressed up as arrays, strings, or something else. Organizing by pattern trains that recognition directly; organizing by data structure alone (the more common textbook approach) teaches implementation but not triage.

Each part starts with a short **"how you'd recognize this pattern"** section before any problems — that's the actual transferable skill, more than any individual solution.

**Why Arrays & Strings breaks this rule and gets its own deep folder instead of one flat part:** it's not really one pattern — it's the *substrate* nearly every other pattern operates on, and it has its own sub-patterns (matrix traversal, interval merging, in-place rearrangement, string-specific parsing) that don't fit cleanly under Two Pointers/Sliding Window/Hashing alone. Given it's also the single highest-frequency category in real interviews, it gets deliberately broader coverage than any other part here. Where an array/string problem is *really* a Two Pointers or Sliding Window problem underneath, it lives in that pattern's part instead and gets cross-linked from the array/string index — no duplication between folders.

---

## Part 00 — [Foundations](00-foundations.md)

Big-O complexity analysis (time and space) · how to approach an unseen problem systematically (clarify constraints → brute force → identify the bottleneck → optimize) · common complexity classes and what input size each realistically tolerates (a hint most candidates under-use: `n ≤ 10⁵` rules out anything worse than O(n log n)) · talking out loud during an interview.

## Part 01 — Arrays & Strings *(deep dive, `arrays-and-strings/`)*

The single highest-frequency problem category in real interviews — covered across 8 focused sub-parts rather than one flat list, roughly **~55–60 problems total**:

- **[01.1 — Basics & In-Place Manipulation](arrays-and-strings/01-basics-and-in-place-manipulation.md):** reversal, rotation, removing duplicates without extra space, move zeroes, in-place partitioning.
- **[01.2 — Prefix Sum & Difference Arrays](arrays-and-strings/02-prefix-sum-and-difference-arrays.md):** range-sum queries, Product of Array Except Self, range-update-via-difference-array.
- **[01.3 — Subarray & Subsequence Problems](arrays-and-strings/03-subarray-and-subsequence.md):** Maximum Subarray (Kadane's), Maximum Product Subarray, Subarray Sum Equals K (cross-linked to Hashing).
- **[01.4 — 2D Arrays & Matrix](arrays-and-strings/04-2d-arrays-and-matrix.md):** Rotate Image, Spiral Matrix, Set Matrix Zeroes, Search a 2D Matrix (cross-linked to Binary Search).
- **[01.5 — Intervals](arrays-and-strings/05-intervals.md):** Merge Intervals, Insert Interval, Non-overlapping Intervals, Meeting Rooms I/II.
- **[01.6 — String Manipulation & Pattern Matching](arrays-and-strings/06-string-manipulation-and-pattern-matching.md):** Reverse Words in a String, String Compression, Valid Palindrome variants, Group Anagrams (cross-linked to Hashing), Longest Palindromic Substring.
- **[01.7 — Sorting-Based Array Tricks](arrays-and-strings/07-sorting-based-array-tricks.md):** Sort Colors (Dutch flag), Merge Sorted Array, Majority Element, custom comparator sorting.
- **[01.8 — Greedy & Simulation on Arrays](arrays-and-strings/08-greedy-and-simulation-on-arrays.md):** Jump Game, Gas Station, Best Time to Buy/Sell Stock II — array-native greedy only, no general greedy/DP theory.

Full sub-index with recognition heuristics per topic: [`arrays-and-strings/00-index.md`](arrays-and-strings/00-index.md).

## Part 02 — [Two Pointers](02-two-pointers.md)

**Recognize it:** a sorted array (or one that can be sorted) plus a target sum/condition, or a need to compare from both ends inward.

**~7 problems**, e.g.: Two Sum II (sorted input), Valid Palindrome, Container With Most Water, 3Sum, Remove Duplicates from Sorted Array, Trapping Rain Water (the classic escalation).

## Part 03 — [Sliding Window](03-sliding-window.md)

**Recognize it:** "subarray"/"substring" + "contiguous" + a size/sum/uniqueness constraint.

**~8 problems**, e.g.: Best Size Subarray Sum ≥ Target, Longest Substring Without Repeating Characters, Longest Repeating Character Replacement, Minimum Window Substring (the classic hard escalation), Permutation in String, Fruit Into Baskets, Max Consecutive Ones III.

## Part 04 — [Hashing](04-hashing.md)

**Recognize it:** needing O(1) lookup/existence-check, counting frequencies, or finding a "complement" of something already seen.

**~7 problems**, e.g.: Two Sum (hashmap-optimal), Top K Frequent Elements, Longest Consecutive Sequence, Contains Duplicate II, Valid Sudoku.

## Part 05 — [Binary Search](05-binary-search.md)

**Recognize it:** a sorted array, OR — the escalation most candidates miss — a monotonic "yes/no" answer space you can binary-search over even without an explicitly sorted array (search on the answer, not the input).

**~7 problems**, e.g.: Classic Binary Search, Search in Rotated Sorted Array, Find First and Last Position, Find Peak Element, Koko Eating Bananas (search-on-the-answer), Capacity To Ship Packages Within D Days.

## Part 06 — [Linked Lists](06-linked-lists.md)

**Recognize it:** by definition — but the *technique* within it is usually fast/slow pointers, in-place reversal, or careful pointer bookkeeping around a dummy head node.

**~8 problems**, e.g.: Reverse Linked List, Merge Two Sorted Lists, Linked List Cycle (Floyd's), Remove Nth Node From End, Reorder List, Add Two Numbers, Copy List with Random Pointer, Merge K Sorted Lists (kept iterative/simple here).

## Part 07 — [Stacks](07-stacks.md)

**Recognize it:** matching/nesting (parentheses-style), "next greater/smaller element," or needing to undo/backtrack the most recent operation.

**~7 problems**, e.g.: Valid Parentheses, Min Stack, Evaluate Reverse Polish Notation, Daily Temperatures (monotonic stack), Next Greater Element I, Largest Rectangle in Histogram (the classic hard escalation).

## Part 08 — [Queues](08-queues.md)

**Recognize it:** level-by-level/breadth-first processing, or needing FIFO order — plus the deque variant for sliding-window-with-order problems.

**~6 problems**, e.g.: Design Circular Queue, Sliding Window Maximum (deque — the natural crossover with Part 03), Number of Recent Calls, Moving Average from Data Stream, Task Scheduler.

## Part 09 — [Most Asked — Cross-Pattern Highlights](09-most-asked-highlights.md)

A curated, frequency-weighted subset pulled from real reported interview questions across companies — deliberately overlapping with Parts 01–08 rather than introducing new patterns, functioning as the "if you're short on time, drill this list first" fast path. Roughly Blind-75-scale, bounded to the patterns already in scope above, weighted toward Arrays & Strings given its real-world frequency.

---

## Problem entry format (applies to every part)

```md
### N. Problem Name — Difficulty

**Recognize it:** the specific words/constraints in a problem statement that signal this pattern.

**Approach:** the plan, in words, before any code.

**Complexity:** time and space, and WHY (not just the final answer).

​```js
// clean, commented solution
​```

**Follow-up:** the natural interviewer escalation once the base version is solved
(e.g. "now do it in O(1) space," "now the input is a stream," "now there can be duplicates").
```

---

## Connects to

- **[javascript/](../javascript/)** — Part 05 (Arrays), Part 06 (Strings & Regex), Part 15 (Map/Set), Part 19 (Polyfills) are the language-mechanics prerequisites; this track is where those mechanics get applied under interview pressure.
- **[javascript/25-coding-and-machine-coding-round.md](../javascript/25-coding-and-machine-coding-round.md)** — that part covers *system-building* machine coding (LRU Cache, Event Emitter, Promise Pool); this track covers *algorithmic* coding problems — related but distinct interview formats.
- **[scenario-bank/](../scenario-bank/)** — not applicable here; DSA problems are algorithmic, not production-scenario reasoning. No scenario-bank crossover expected for this track.

---

*This is the plan — nothing written yet below the roadmap. Confirm the shape above (or adjust it), then we start filling in Part 00.*
