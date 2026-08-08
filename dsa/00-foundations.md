# DSA Notes — Part 00

## Foundations

**Topics:** Big-O time/space complexity · how to approach an unseen problem · what input size tells you about required complexity · talking out loud in an interview.

---

## 1. Big-O — What It Actually Measures

> **Definition:** Big-O describes how an algorithm's running time (or memory use) **grows** as input size `n` grows — not the exact runtime, and not performance on any one specific input, but the *shape* of the growth curve as `n` gets large. It's an upper bound on growth rate, ignoring constant factors and lower-order terms.

```
O(1)        constant     — doesn't grow with n at all (array index access)
O(log n)    logarithmic  — halves the problem each step (binary search)
O(n)        linear       — one pass over the input (a single loop)
O(n log n)  linearithmic — a pass combined with a log-factor (efficient sorting)
O(n²)       quadratic    — nested loops over the same input (naive pair-checking)
O(2ⁿ)       exponential  — branching into two choices at every step (naive recursion w/o memo)
```
**Why constants and lower-order terms are dropped:** `O(3n + 100)` and `O(n)` describe the same *growth shape* — for small `n` the constant might dominate, but as `n` grows toward what actually matters in an interview (thousands to millions), the linear term dominates completely, and that's the behavior Big-O is designed to capture. This is exactly why an `O(n)` solution with a large constant factor can occasionally be slower in practice than an `O(n log n)` one for small inputs — Big-O is an asymptotic statement, not a promise about every specific `n`.

## 2. Space Complexity

> **Definition:** the same growth-rate idea, applied to **extra memory used**, beyond the input itself — auxiliary space. A solution that mutates the input array in place and uses only a few extra variables is `O(1)` space; one that builds a new array/hashmap proportional to the input is `O(n)` space.

```js
// O(1) extra space — reverses in place, no new data structure proportional to input
function reverseInPlace(arr) {
  let left = 0, right = arr.length - 1;
  while (left < right) {
    [arr[left], arr[right]] = [arr[right], arr[left]];
    left++; right--;
  }
  return arr;
}

// O(n) extra space — builds a brand new array
function reverseNewArray(arr) {
  return [...arr].reverse();
}
```
**Recursion's hidden space cost:** every recursive call adds a frame to the call stack ([javascript Part 00](../javascript/00-js-fundamentals.md#1-execution-context--call-stack)) — a recursive solution with depth proportional to `n` is `O(n)` space **even if it allocates no explicit data structure**, a detail candidates frequently forget to mention when asked for space complexity.

## 3. How to Approach an Unseen Problem, Systematically

> **The sequence:**

```
1. CLARIFY   → constraints (input size, value ranges, duplicates allowed?, sorted?),
                 edge cases (empty input, single element, all-same-values)
2. BRUTE FORCE → say the obvious, worst-case-but-correct solution OUT LOUD first —
                    this establishes a baseline and often reveals the actual bottleneck
3. IDENTIFY THE BOTTLENECK → which part of the brute force is expensive, and WHY
                                (usually: redundant nested lookups, redundant re-scanning)
4. OPTIMIZE   → apply the pattern that removes that specific bottleneck (a hashmap
                  for O(1) lookup instead of a nested loop, a sliding window instead
                  of recomputing a sum from scratch every time, etc.)
5. VERIFY     → trace through a small example AND the edge cases from step 1
```
**Why stating the brute force out loud first is a real interview technique, not a stalling tactic:** it demonstrates you can produce a *correct* solution before an *optimal* one (correctness first is the actual priority order interviewers care about), and naming the brute force's specific bottleneck is usually the exact insight that motivates the optimized pattern — "we're re-scanning the same range repeatedly, that's the O(n²) — so what if we tracked a window instead" is a complete, interview-ready thought process, not just narration.

## 4. What Input Size Tells You About Required Complexity

> **The heuristic:** competitive programming and interview problems almost always state (or imply) constraints on `n` — and those constraints are a direct, reliable signal for what time complexity is actually expected, before you've even fully solved the problem.

| Constraint on `n` | Complexity that's safe | Complexity that will likely TLE |
|---|---|---|
| `n ≤ 10` – `20` | anything, even `O(2ⁿ)`/`O(n!)` | — |
| `n ≤ 500` | `O(n³)` | worse than cubic |
| `n ≤ 5,000` | `O(n²)` | worse than quadratic |
| `n ≤ 10⁵` – `10⁶` | `O(n log n)`, `O(n)` | `O(n²)` |
| `n ≤ 10⁸`+ | `O(n)`, `O(log n)`, `O(1)` | anything above linear |

**Why most candidates under-use this:** seeing `1 ≤ n ≤ 10⁵` in a problem statement is a near-certain signal the intended solution is `O(n log n)` or better — an `O(n²)` brute force (25×10⁸ operations) would take seconds to minutes, well outside any reasonable time limit. Reading constraints *before* diving into a solution tells you roughly which pattern family to reach for immediately, rather than discovering an approach is too slow only after fully implementing it.

## 5. Talking Out Loud in an Interview

> **The expectation:** a coding interview evaluates **how you think**, not just whether the final code compiles — silently coding for ten minutes and then presenting a finished solution denies the interviewer the actual signal they're trying to collect.

**What to narrate, concretely:**
- Your understanding of the problem, restated in your own words, before coding (catches misunderstandings early, costs nothing).
- The brute force and its complexity, explicitly, even if you don't code it.
- The specific bottleneck you're targeting when you move to an optimized approach — *why* this pattern, not just *that* you're applying one.
- Complexity of your final solution, and whether it satisfies the constraints from §4.
- Edge cases you're deliberately handling (and a quick note on ones you're consciously not handling, if scope-limited by time).

---

## Interview Q&A

**Q: Why do we drop constants and lower-order terms in Big-O notation?**
> Because Big-O describes the *shape* of growth as input size gets large, not exact runtime on any specific input — for large enough `n`, the highest-order term dominates completely regardless of constant factors, which is the behavior that actually determines whether an algorithm scales. It's an asymptotic statement, which is why an algorithm with a better Big-O class can occasionally be slower in practice on small inputs due to constant-factor overhead — that doesn't contradict the notation, it's just outside what it claims to measure.

**Q: Why can a recursive solution have O(n) space complexity even if it never explicitly allocates an array or object?**
> Every recursive call adds a frame to the call stack, and those frames occupy real memory for as long as they're on the stack. A recursive solution whose call depth grows proportionally to input size `n` is using O(n) space via the call stack alone, even with zero explicit data structures — a detail worth stating explicitly when asked for space complexity, since it's easy to overlook.

**Q: How would you use a stated constraint like `n ≤ 10⁵` before you've even solved a problem?**
> It's a strong signal for the expected time complexity — `10⁵` rules out anything worse than roughly O(n log n) within a typical time limit, since an O(n²) approach would be on the order of 10¹⁰ operations, far too slow. Reading constraints first narrows which pattern family is even worth attempting, rather than fully implementing a brute force and discovering only afterward that it's too slow.

---

## Follow-ups (challenge questions)

- *Consistency:* two candidates both produce an O(n log n) solution to the same problem — one via sorting-based two pointers, one via a heap — walk through what other factors (space complexity, code simplicity, whether the input arrives as a stream) would make one genuinely preferable over the other despite identical time complexity.
- *Scale:* a brute-force O(n²) solution passes all provided test cases in an online judge because the test data happens to be small — what's the actual risk of stopping there in a real interview even if it technically "works," and how would you preemptively flag this tradeoff to an interviewer rather than let them discover it?

---

**Next:** [Part 01 — Arrays & Strings](arrays-and-strings/00-index.md)
