# DSA Notes — Arrays & Strings, Sub-Part 01.8

## Greedy & Simulation on Arrays

**Recognize this bucket:** deliberately narrow scope — **array-native greedy problems only**, where a single left-to-right pass making the locally-best choice at each step provably reaches the global optimum. General greedy theory and DP are out of scope for this track by design; these problems are included because they're extremely common in real interviews and happen to have clean, provably-correct one-pass solutions, not because this is a general greedy/DP unit.

> **What makes a greedy approach provably correct (worth stating in an interview, not just applying blindly):** a greedy choice is safe when committing to the locally-best option at each step can never prevent reaching the true global optimum — usually because any "damage" from a locally-suboptimal alternative can't be undone later, or because the problem has an exchange-argument property (swapping a greedy choice for an alternative never improves the result). Each problem below states this justification explicitly — reciting the algorithm without it is a weaker interview answer.

---

### 1. Best Time to Buy and Sell Stock — Easy

**Recognize it:** "one transaction only, maximize profit" — the foundational version; the array-native greedy insight is tracking the minimum price seen so far as you scan forward.

**Approach:** walk the array once, tracking the lowest price seen so far and the best profit achievable by selling at the current price given that minimum.

**Complexity:** O(n) time, O(1) space.

```js
function maxProfit(prices) {
  let minPrice = Infinity, maxProfit = 0;
  for (const price of prices) {
    minPrice = Math.min(minPrice, price);
    maxProfit = Math.max(maxProfit, price - minPrice);
  }
  return maxProfit;
}
```
**Why tracking the running minimum is greedy-correct here:** the best possible sale at any given day is always paired with the lowest buy price available *before* that day — there's never a reason to consider a higher earlier buy price, since it can only produce an equal or worse profit than the true minimum. No later decision can retroactively make an earlier, higher buy price better.

**Follow-up:** this is the base case of Problem 2 (unlimited transactions) — naming that relationship explicitly is a good signal.

---

### 2. Best Time to Buy and Sell Stock II — Medium

**Recognize it:** same setup as Problem 1, but **unlimited transactions** allowed (buy/sell as many times as wanted, must sell before buying again) — this relaxation is what makes a simple greedy sum work, versus Problem 1's single-transaction constraint.

**Approach:** sum up every positive day-to-day price increase — buying right before each upward move and selling right after captures all available profit.

**Complexity:** O(n) time, O(1) space.

```js
function maxProfitMultiple(prices) {
  let profit = 0;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > prices[i - 1]) {
      profit += prices[i] - prices[i - 1]; // capture every upward day-to-day move
    }
  }
  return profit;
}
```
**Why summing every positive delta is greedy-correct:** with unlimited transactions, any longer upward run's total gain equals the sum of its individual day-to-day gains (e.g. buying at 1 and selling at 5 is equivalent, profit-wise, to buying/selling at every intermediate up-tick: 1→2→3→4→5 sums to the same total as one 1→5 trade) — so there's no advantage to holding through a longer run versus capturing each daily increase separately, and capturing every available positive delta is trivially optimal.

**Follow-up:** limit to **at most 2 transactions** — this specific constraint breaks the simple greedy sum (can't just capture every uptick anymore) and is the point where this family of problems genuinely crosses into DP territory, out of scope here by design.

---

### 3. Jump Game — Medium

**Recognize it:** "each element is the max jump length from that position, can you reach the last index" — a reachability question, not an optimization one; the greedy insight is tracking the farthest reachable index seen so far.

**Approach:** walk the array once, maintaining the farthest index reachable so far — if the current index ever exceeds that farthest-reachable boundary, the end is unreachable; otherwise keep extending the boundary.

**Complexity:** O(n) time, O(1) space.

```js
function canJump(nums) {
  let farthest = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i > farthest) return false; // this index is unreachable — nothing before it could jump this far
    farthest = Math.max(farthest, i + nums[i]);
  }
  return true;
}
```
**Why tracking only the farthest reachable index (not every reachable index) is greedy-correct:** if the farthest reachable boundary extends past the last index, reachability is confirmed regardless of the specific path taken to get there — the *maximum* reach at each step is a superset of every other possible reach, so tracking anything less than the maximum could only lose information, never gain it.

**Follow-up:** Problem 4 (Jump Game II) asks for the **minimum number of jumps** to reach the end, not just whether it's reachable — a natural escalation using the same "farthest reachable" tracking idea, with one more layer of bookkeeping.

---

### 4. Jump Game II — Medium

**Recognize it:** the minimum-jumps escalation of Problem 3 — "reachability" becomes "optimal count," which needs tracking not just the farthest reach but *when* to commit to a jump.

**Approach:** a greedy "level-by-level" scan (conceptually similar to BFS levels, [Part 08 — Queues](../08-queues.md)) — track the current jump's reachable boundary and the farthest boundary reachable with one more jump; when the scan reaches the current boundary, commit to a jump (increment the count) and update the boundary to the farthest one tracked.

**Complexity:** O(n) time, O(1) space.

```js
function jump(nums) {
  let jumps = 0, currentEnd = 0, farthest = 0;
  for (let i = 0; i < nums.length - 1; i++) { // don't need to jump FROM the last index
    farthest = Math.max(farthest, i + nums[i]);
    if (i === currentEnd) { // exhausted the current jump's range — must commit to another jump
      jumps++;
      currentEnd = farthest;
    }
  }
  return jumps;
}
```
**Why this greedy "commit at the boundary" strategy is optimal:** delaying a jump decision as long as possible (i.e. scanning the entire current range before committing) always gathers the maximum possible information about the *next* jump's best reach before locking it in — committing earlier could only ever choose an equal or worse next boundary, never a better one, since the farthest-reach tracking has strictly more information the longer it scans within the current range.

**Follow-up:** trace through `[2,3,1,1,4]` by hand, marking exactly where `currentEnd` updates and a jump is counted — this problem's greedy logic is genuinely easy to get subtly wrong without a careful trace.

---

### 5. Gas Station — Medium

**Recognize it:** "circular route, find the starting gas station that allows completing the full circuit" — the greedy insight (if it exists at all) is that failure at any point rules out every station up to the failure point as a valid start, not just the immediate current one.

**Approach:** track a running tank total across the whole circuit; if it ever goes negative, every station from the last reset point up through the current one is disqualified as a starting point — reset the candidate start to the next station and the running total to 0. Also track the全 overall total surplus/deficit — a solution exists only if the total gas ≥ total cost across the whole circuit.

**Complexity:** O(n) time, O(1) space.

```js
function canCompleteCircuit(gas, cost) {
  let totalTank = 0, currentTank = 0, start = 0;
  for (let i = 0; i < gas.length; i++) {
    const diff = gas[i] - cost[i];
    totalTank += diff;
    currentTank += diff;
    if (currentTank < 0) {
      start = i + 1;     // this station (and everything since the last reset) can't be a valid start
      currentTank = 0;      // reset and try the NEXT station as a fresh candidate
    }
  }
  return totalTank >= 0 ? start : -1; // a solution exists iff total gas covers total cost overall
}
```
**Why disqualifying the whole range up to the failure point (not just the current station) is greedy-correct:** if starting at station `s` and running out of gas at station `i`, then starting at any station **between** `s` and `i` would arrive at that intermediate station with even less accumulated surplus than starting from `s` did (since it skips some of the earlier positive contributions) — so none of those intermediate stations could possibly do better, and all of them are safely ruled out in one step rather than needing to be individually retested.

**Follow-up:** state, out loud, why checking `totalTank >= 0` alone (without the per-station reset logic) determines *whether* a solution exists, while the reset logic is what actually *locates* it — a common point of confusion is conflating existence-checking with the actual starting-index-finding mechanism.

---

### 6. H-Index — Medium

**Recognize it:** "h papers have at least h citations each" — not obviously greedy at first glance, but sorting plus a single counting pass reveals the answer directly.

**Approach:** sort citations descending; the h-index is the largest `i` (1-indexed position) such that the citation count at that position is still ≥ `i` — walk the sorted array once looking for where this condition stops holding.

**Complexity:** O(n log n) time (dominated by the sort), O(1) extra space (beyond the sort).

```js
function hIndex(citations) {
  citations.sort((a, b) => b - a); // descending — remember the comparator (01.7's file-level warning)
  let h = 0;
  for (let i = 0; i < citations.length; i++) {
    if (citations[i] >= i + 1) { // at least (i+1) papers (this one and everything before it)
      h = i + 1;                    // have at least (i+1) citations each
    } else {
      break; // once this fails, it can never hold again for later (smaller-citation) entries
    }
  }
  return h;
}
```
**Why sorting descending and stopping at the first failure is correct:** after sorting descending, citation counts are non-increasing, so the condition "at least `i+1` papers have `≥ i+1` citations" can only hold for a contiguous prefix — the moment it fails at some position, every later position (with an even lower citation count) is guaranteed to fail too, so an early break is safe, not just an optimization.

**Follow-up:** citations are given **already sorted** — the O(n) counting-sort-style linear approach (bucket by citation count, capped at array length, then sum from the top) beats the O(n log n) comparison sort, worth naming as the true optimal answer even if the sort-based version is a perfectly good first pass.

---

### 7. Candy — Hard

**Recognize it:** "each child must have more candy than each neighbor with a lower rating, minimize total candy" — the escalation problem in this sub-part (parallel to how other sub-parts each have one deliberately harder problem); the two-directional constraint (compare against BOTH neighbors) is what makes a single pass insufficient.

**Approach:** **two greedy passes.** Left-to-right, ensure each child has more candy than their left neighbor if their rating is higher. Right-to-left, ensure each child has more candy than their right neighbor if their rating is higher — taking the **max** of both passes' requirements at each position, since both constraints must simultaneously hold.

**Complexity:** O(n) time (two passes), O(n) space for the candy array.

```js
function candy(ratings) {
  const n = ratings.length;
  const candies = new Array(n).fill(1); // everyone starts with the minimum, 1 candy

  for (let i = 1; i < n; i++) { // left-to-right: satisfy the LEFT-neighbor constraint
    if (ratings[i] > ratings[i - 1]) {
      candies[i] = candies[i - 1] + 1;
    }
  }
  for (let i = n - 2; i >= 0; i--) { // right-to-left: satisfy the RIGHT-neighbor constraint
    if (ratings[i] > ratings[i + 1]) {
      candies[i] = Math.max(candies[i], candies[i + 1] + 1); // MAX — don't overwrite the left pass's work
    }
  }
  return candies.reduce((sum, c) => sum + c, 0);
}
```
**Why a single pass can't satisfy both directional constraints, and why `Math.max` (not overwrite) in the second pass is essential:** a left-to-right-only pass correctly handles "higher rating than the left neighbor" but has no mechanism to also guarantee "higher rating than the right neighbor" — that requires seeing the right neighbor's *final* candy count, which isn't known yet during a single forward pass. The second, backward pass supplies that missing information — but it must take the max against the first pass's result, not overwrite it, since overwriting could violate the already-satisfied left-neighbor constraint from the first pass.

**Follow-up:** trace through `ratings = [1, 2, 87, 87, 87, 2, 1]` — the plateau of equal ratings (`87, 87, 87`) has no ordering constraint between them at all (equal ratings never require more candy than each other), which is a common place to introduce an off-by-one bug if the `>` (strict) comparisons above are accidentally written as `>=`.

---

## Cross-links

- Problem 2's relationship to a full DP formulation (Best Time to Buy/Sell Stock with a transaction-count limit or a cooldown) is the natural next step **if** DP is added to this track later — flagged here rather than pursued, per this track's deliberate scope boundary.
- The "two-pass, take the max" structure in Problem 7 is a useful general technique worth remembering independent of this specific problem — any constraint that depends on both a left-context and a right-context often decomposes into exactly this shape.

---

**Previous:** [01.7 — Sorting-Based Array Tricks](07-sorting-based-array-tricks.md) · **Back to:** [Arrays & Strings Index](00-index.md)
