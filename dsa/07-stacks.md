# DSA Notes — Part 07

## Stacks

**Recognize it:** matching/nesting (parentheses-style), "next greater/smaller element," or needing to undo/backtrack the **most recently seen** item — the LIFO (last-in-first-out) structure is a direct match whenever a problem's logic depends on "what did I see most recently that's still unresolved."

**The monotonic stack idea, introduced once here since three problems below use it:** a stack that's kept either increasing or decreasing (by popping off elements that violate the order before pushing a new one) — the pops themselves are the useful signal, since each pop identifies "the next element that breaks this element's streak," which is exactly the "next greater/smaller element" question.

---

### 1. Valid Parentheses — Easy

**Recognize it:** the canonical stack problem — matching/nesting brackets, where "most recently opened, must be closed first" is a direct LIFO description.

**Approach:** push opening brackets onto a stack; on a closing bracket, check that it matches the most recently pushed (i.e. top-of-stack) opening bracket, popping it if so.

**Complexity:** O(n) time, O(n) space.

```js
function isValid(s) {
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(ch);
    } else {
      if (stack.pop() !== pairs[ch]) return false; // mismatched, or stack was already empty (pop
    }                                                  // returns undefined, which won't match any pair)
  }
  return stack.length === 0; // any unclosed opening brackets remain — invalid
}
```
**Why the final `stack.length === 0` check is necessary:** the loop alone only catches *mismatches*, not *unclosed* brackets — a string like `"((("` never triggers a mismatch (there are no closing brackets to compare against), so without checking the stack is empty at the end, unclosed brackets would incorrectly pass as valid.

**Follow-up:** generate all valid combinations of n pairs of parentheses instead of validating one — this shifts into backtracking territory, explicitly out of scope for this track.

---

### 2. Min Stack — Medium

**Recognize it:** "design a stack that supports push/pop/top AND retrieving the minimum, all in O(1)" — the O(1)-minimum constraint is what makes this non-trivial; a naive re-scan for the min on every query would be O(n).

**Approach:** maintain a **second stack** tracking the minimum-so-far at each corresponding point in the main stack's history — pushing onto the min-stack whenever a new overall minimum is pushed (or re-pushing the current min, if not — simpler and avoids conditional pop logic later).

**Complexity:** O(1) time for every operation, O(n) space (two parallel stacks).

```js
class MinStack {
  constructor() {
    this.stack = [];
    this.minStack = [];
  }
  push(val) {
    this.stack.push(val);
    const currentMin = this.minStack.length === 0 ? val : Math.min(val, this.minStack[this.minStack.length - 1]);
    this.minStack.push(currentMin); // ALWAYS push — keeps both stacks in lockstep, simplifying pop()
  }
  pop() {
    this.stack.pop();
    this.minStack.pop(); // popping in lockstep keeps minStack.top() correct for whatever remains
  }
  top() {
    return this.stack[this.stack.length - 1];
  }
  getMin() {
    return this.minStack[this.minStack.length - 1];
  }
}
```
**Why pushing to `minStack` on every single push (not just new minimums) is the simpler, correct design:** keeping both stacks the exact same length at all times means `pop()` can simply pop both without any conditional logic about "was this the actual minimum, or just a regular value" — the minor extra space cost buys meaningfully simpler, more obviously correct code.

**Follow-up:** achieve the same O(1) min tracking in O(1) *extra* space (not a second full stack) — store the *difference* between each pushed value and the running min instead of the raw min itself, recovering both the value and updating the min via arithmetic on pop; a genuinely clever but much less obvious approach, worth knowing exists even if not the default answer.

---

### 3. Evaluate Reverse Polish Notation — Medium

**Recognize it:** "evaluate a postfix expression" — operands are pushed, and an operator always applies to the two *most recently seen* operands, which is a direct LIFO fit.

**Approach:** scan tokens left to right; push numbers onto the stack; on an operator, pop the top two values, apply the operator, and push the result back.

**Complexity:** O(n) time, O(n) space.

```js
function evalRPN(tokens) {
  const stack = [];
  const ops = {
    '+': (a, b) => a + b,
    '-': (a, b) => a - b,
    '*': (a, b) => a * b,
    '/': (a, b) => Math.trunc(a / b), // truncate toward zero, per the problem's usual spec
  };
  for (const token of tokens) {
    if (token in ops) {
      const b = stack.pop(); // note the ORDER — b was pushed LAST, so it's the second operand
      const a = stack.pop();
      stack.push(ops[token](a, b));
    } else {
      stack.push(Number(token));
    }
  }
  return stack.pop();
}
```
**Why the pop order (`b` first, then `a`) matters for non-commutative operators:** for input `["4", "2", "-"]` (meaning `4 - 2`), `2` is popped first (it was pushed last) and `4` second — the operator must be applied as `a - b` (i.e. `4 - 2`), not `b - a`, so correctly tracking which popped value is the *first* operand versus the *second* is essential for subtraction and division specifically (addition/multiplication are commutative and would silently hide this bug).

**Follow-up:** evaluate a standard **infix** expression (with parentheses and operator precedence) instead — a meaningfully harder problem requiring either a two-stack (values + operators) shunting-yard-style approach, or first converting to postfix and then applying this exact algorithm.

---

### 4. Daily Temperatures — Medium

**Recognize it:** "for each day, how many days until a warmer temperature" — the first genuinely **monotonic stack** problem in this part: "next greater element" is exactly what a decreasing monotonic stack's pop events reveal.

**Approach:** maintain a stack of **indices** with decreasing temperatures. For each new day, pop every index whose temperature is lower than today's (each pop means "today is the answer for that popped day"), recording the day-distance; then push today's index.

**Complexity:** O(n) time — each index is pushed once and popped at most once, so total work across the whole run is linear despite the nested-looking loop; O(n) space.

```js
function dailyTemperatures(temperatures) {
  const result = new Array(temperatures.length).fill(0);
  const stack = []; // stores INDICES, maintaining decreasing temperature order

  for (let i = 0; i < temperatures.length; i++) {
    while (stack.length > 0 && temperatures[i] > temperatures[stack[stack.length - 1]]) {
      const prevIndex = stack.pop();
      result[prevIndex] = i - prevIndex; // TODAY is the "next warmer day" for prevIndex
    }
    stack.push(i);
  }
  return result;
}
```
**Why this is O(n) despite looking like a nested loop:** every index is pushed exactly once (in the outer loop) and can be popped at most once (ever, across the entire algorithm's run) — even though the `while` loop appears nested inside the `for` loop, the *total* number of pop operations across the whole execution is bounded by n, not n², making the amortized total work linear.

**Follow-up:** Next Greater Element I (Problem 5) is the same monotonic-stack mechanism, applied to a slightly different output requirement (the actual next greater *value*, not a day-distance) — recognizing the shared mechanism is the point.

---

### 5. Next Greater Element I — Medium

**Recognize it:** the same monotonic decreasing stack as Problem 4, with a twist — the answer needs to be looked up for a separate query array (`nums1`) after being computed for the full array (`nums2`), which adds a hashmap step on top of the core monotonic-stack mechanism.

**Approach:** run the monotonic stack sweep over `nums2` to build a map from each value to its next-greater value; then answer each query in `nums1` via an O(1) map lookup.

**Complexity:** O(n + m) time (n = length of `nums2`, m = length of `nums1`), O(n) space.

```js
function nextGreaterElement(nums1, nums2) {
  const nextGreater = new Map();
  const stack = []; // stores VALUES this time (nums2 has no duplicates, per problem constraints)

  for (const num of nums2) {
    while (stack.length > 0 && num > stack[stack.length - 1]) {
      nextGreater.set(stack.pop(), num);
    }
    stack.push(num);
  }
  return nums1.map(num => nextGreater.get(num) ?? -1); // -1 if no next-greater element exists
}
```

**Follow-up:** Next Greater Element **II** — the array is **circular** (wraps around) — the standard trick is conceptually iterating over the array twice (`i % n`) without actually duplicating it in memory, letting the monotonic stack "see" wrap-around candidates naturally.

---

### 6. Largest Rectangle in Histogram — Hard

**Recognize it:** the classic hard escalation of the monotonic stack pattern — "largest rectangular area in a histogram" needs, for each bar, knowing how far it can extend both left and right while remaining the limiting (shortest) height — exactly what a monotonic increasing stack reveals via its pop events.

**Approach:** maintain a stack of indices with increasing heights. When a shorter bar is encountered, pop taller bars off the stack — each pop's height, combined with the current index and the new stack top, defines the maximum rectangle that popped bar could form as the limiting height.

**Complexity:** O(n) time (same amortized argument as Problem 4 — each index pushed once, popped at most once), O(n) space.

```js
function largestRectangleArea(heights) {
  const stack = []; // indices, INCREASING height order
  let maxArea = 0;

  for (let i = 0; i <= heights.length; i++) {
    const currentHeight = i === heights.length ? 0 : heights[i]; // sentinel 0 forces a final flush
    while (stack.length > 0 && currentHeight < heights[stack[stack.length - 1]]) {
      const height = heights[stack.pop()];
      const width = stack.length === 0 ? i : i - stack[stack.length - 1] - 1;
      maxArea = Math.max(maxArea, height * width);
    }
    stack.push(i);
  }
  return maxArea;
}
```
**Why the width formula (`i - stack.top - 1`, or just `i` if the stack is empty) is correct:** when a bar at height `h` is popped, everything currently below it on the stack is shorter (by the monotonic invariant), and everything from the new stack top's index up to (but not including) `i` is ≥ `h` — so the popped bar's height is the limiting factor across exactly that span, which is precisely `i - newTopIndex - 1` bars wide (or, if the stack is now empty, the popped bar was the shortest seen so far and extends all the way back to index 0, hence width `i`).

**Follow-up:** Maximal Rectangle (find the largest all-1s rectangle in a binary matrix) reduces to running this exact algorithm once per row, treating each row as a histogram whose bar heights are the running count of consecutive 1s upward from that row — a genuinely satisfying "apply a hard 1D algorithm as a subroutine, once per row, to solve a 2D problem" composition.

---

### 7. Implement Queue Using Stacks — Easy

**Recognize it:** "implement FIFO behavior using only stack (LIFO) primitives" — a direct test of understanding *why* the two structures behave differently and how to bridge that gap.

**Approach:** two stacks — an "in" stack for pushes, and an "out" stack for pops/peeks. When the "out" stack is empty and a pop/peek is requested, transfer everything from "in" to "out" (which reverses the order, converting LIFO-of-LIFO into the correct FIFO order).

**Complexity:** O(1) amortized time per operation (each element is transferred between stacks at most once over its lifetime, even though a single transfer operation is O(n) when it happens), O(n) space.

```js
class MyQueue {
  constructor() {
    this.inStack = [];
    this.outStack = [];
  }
  push(x) {
    this.inStack.push(x);
  }
  pop() {
    this._transferIfNeeded();
    return this.outStack.pop();
  }
  peek() {
    this._transferIfNeeded();
    return this.outStack[this.outStack.length - 1];
  }
  empty() {
    return this.inStack.length === 0 && this.outStack.length === 0;
  }
  _transferIfNeeded() {
    if (this.outStack.length === 0) {
      while (this.inStack.length > 0) {
        this.outStack.push(this.inStack.pop()); // reverses order — LIFO of a LIFO = FIFO
      }
    }
  }
}
```
**Why reversing twice (via two stacks) produces the correct FIFO order:** pushing elements `1, 2, 3` onto `inStack` leaves them in the order `[1,2,3]` with `3` on top. Popping all of them into `outStack` one at a time reverses that order, leaving `outStack` as `[3,2,1]` with `1` on top — exactly the FIFO order the original pushes should produce.

**Follow-up:** the "amortized O(1)" claim specifically — explain why a single expensive O(n) transfer doesn't violate this, by reasoning about the *total* cost across n operations rather than any single operation's worst case (the standard amortized-analysis argument: each element is pushed once, transferred at most once, and popped once — three O(1) operations per element, total O(n) for n elements, O(1) per operation on average).

---

## Cross-links

- The monotonic stack technique (Problems 4–6) reappears in spirit — same "pop reveals useful information" idea — in Sliding Window Maximum ([Part 08 — Queues](08-queues.md#3-sliding-window-maximum--hard)), which uses a monotonic **deque** instead of a plain stack.

---

**Previous:** [Part 06 — Linked Lists](06-linked-lists.md) · **Next:** [Part 08 — Queues](08-queues.md)
