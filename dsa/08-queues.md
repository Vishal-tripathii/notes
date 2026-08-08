# DSA Notes — Part 08

## Queues

**Recognize it:** level-by-level/breadth-first processing, needing strict FIFO order, or — the escalation most candidates haven't drilled — a **monotonic deque** for maintaining a running max/min over a sliding window in O(1) amortized per step.

> **A practical JS note before starting:** `Array.prototype.shift()` is O(n) (it re-indexes every remaining element), so using a plain array as a queue in a hot loop is a real performance trap — the problems below either use a plain array where the input size is small/the point is conceptual clarity, or explicitly flag where a more efficient structure matters.

---

### 1. Design Circular Queue — Medium

**Recognize it:** "implement a fixed-capacity FIFO queue that reuses freed slots" — a direct data-structure-design problem testing careful index arithmetic (specifically, wraparound via modulo) rather than any clever algorithm.

**Approach:** a fixed-size backing array with `head`/`tail` indices that wrap around via modulo, plus an explicit size counter to distinguish a completely full queue from a completely empty one (both of which would otherwise have `head === tail`).

**Complexity:** O(1) time for every operation, O(n) space (the fixed-capacity backing array).

```js
class MyCircularQueue {
  constructor(k) {
    this.capacity = k;
    this.queue = new Array(k);
    this.head = 0;
    this.size = 0;
  }
  enQueue(value) {
    if (this.size === this.capacity) return false;
    const tail = (this.head + this.size) % this.capacity; // wraparound via modulo
    this.queue[tail] = value;
    this.size++;
    return true;
  }
  deQueue() {
    if (this.size === 0) return false;
    this.head = (this.head + 1) % this.capacity; // wraparound via modulo
    this.size--;
    return true;
  }
  Front() {
    return this.size === 0 ? -1 : this.queue[this.head];
  }
  Rear() {
    return this.size === 0 ? -1 : this.queue[(this.head + this.size - 1) % this.capacity];
  }
  isEmpty() { return this.size === 0; }
  isFull() { return this.size === this.capacity; }
}
```
**Why an explicit `size` counter (not just comparing `head` and `tail`) is necessary:** a completely empty queue and a completely full queue can both end up with the exact same `head === tail` relationship depending on the wraparound history — without a separate counter tracking the actual element count, those two opposite states become indistinguishable from index positions alone.

**Follow-up:** implement a circular **deque** (double-ended) instead — same modulo-wraparound idea, extended with `addFront`/`addRear`/`removeFront`/`removeRear`, each requiring careful sign handling for the "front" direction's wraparound (`(head - 1 + capacity) % capacity`, not just `head - 1`, to correctly wrap backward past index 0).

---

### 2. Implement Stack Using Queues — Easy

**Recognize it:** the mirror image of [Part 07's Implement Queue Using Stacks](07-stacks.md#7-implement-queue-using-stacks--easy) — implementing LIFO behavior using only FIFO primitives.

**Approach:** a single queue, where `push` immediately rotates the queue so the newly-added element ends up at the front — achieved by pushing the new element, then rotating every *other* element in the queue behind it (dequeue and immediately re-enqueue each one).

**Complexity:** O(n) time for `push` (the rotation), O(1) for `pop`/`top` — the inverse trade-off from the stacks-based queue implementation, worth noting explicitly as a point of comparison.

```js
class MyStack {
  constructor() {
    this.queue = [];
  }
  push(x) {
    this.queue.push(x);
    for (let i = 0; i < this.queue.length - 1; i++) { // rotate everyone BEFORE x behind it
      this.queue.push(this.queue.shift());
    }
  }
  pop() {
    return this.queue.shift(); // the front is now always the MOST recently pushed element
  }
  top() {
    return this.queue[0];
  }
  empty() {
    return this.queue.length === 0;
  }
}
```
**Why this problem's cost trade-off is the mirror image of Part 07's queue-via-stacks:** there, `push` was O(1) and `pop`/`peek` were amortized O(1) via a lazy transfer. Here, making `pop`/`top` cheap (O(1), just look at the front) requires paying the rearrangement cost upfront on every `push` instead — there's no way to make both operations cheap simultaneously with only two simple FIFO/LIFO structures, and recognizing *which* operation to make expensive (and why) is the actual design decision being tested.

**Follow-up:** using **two** queues instead of one — functionally equivalent, and a good exercise in translating this single-queue rotation trick into an explicit two-queue transfer, mirroring the two-stack queue implementation's shape more directly.

---

### 3. Sliding Window Maximum — Hard

**Recognize it:** "maximum of every k-sized window as it slides across the array" — the natural, harder escalation of [Part 03 — Sliding Window](03-sliding-window.md)'s pattern family: tracking a running **maximum** (not a sum or a simple count) over a sliding window needs a fundamentally different structure, since a naive running max can't be easily "undone" when the window's leftmost element (which might have been the max) slides out.

**Approach:** a **monotonic decreasing deque** storing *indices* — before adding a new index, remove indices from the back whose values are smaller than the new value (they can never be the max again, since the new, later, larger value will always outlast them within any future window). Also remove the front index if it's fallen outside the current window's left boundary. The front of the deque is always the current window's maximum.

**Complexity:** O(n) time — the same amortized argument as [Part 07's monotonic stack problems](07-stacks.md#4-daily-temperatures--medium): each index is pushed once and popped at most once across the whole run. O(k) space for the deque.

```js
function maxSlidingWindow(nums, k) {
  const deque = []; // indices, values in DECREASING order from front to back
  const result = [];

  for (let i = 0; i < nums.length; i++) {
    if (deque.length > 0 && deque[0] <= i - k) { // front has fallen out of the window
      deque.shift();
    }
    while (deque.length > 0 && nums[deque[deque.length - 1]] < nums[i]) {
      deque.pop(); // remove smaller values from the back — they can never win again
    }
    deque.push(i);
    if (i >= k - 1) { // window is fully formed
      result.push(nums[deque[0]]); // front of the deque is always the current max
    }
  }
  return result;
}
```
**Why a value can be safely discarded from the back the moment a larger value arrives, even before it's known to leave the window:** once a larger value enters the window, any smaller value still sitting behind it in the deque can never become the maximum of *any* future window — the larger value is both later-arriving (so it stays in the window at least as long) and bigger, meaning it will always be the window's max for as long as the smaller value would have been relevant, making the smaller value permanently useless information from that point forward.

**Follow-up:** explicitly connect this back to Part 07's monotonic stack — same core "maintain a monotonic ordering, let pops reveal the answer" idea, just needing a deque instead of a stack specifically because elements need to be evicted from **both** ends (the back for the monotonic-order maintenance, the front for the sliding-window boundary), which a plain stack (single-ended) can't support.

---

### 4. Number of Recent Calls — Easy

**Recognize it:** "count requests within the last 3000ms as new ones arrive" — a genuinely simple, direct FIFO application: old, now-irrelevant timestamps need to be discarded from the *front* as new ones are added at the *back*.

**Approach:** a queue of timestamps; on each new ping, add it to the back, then remove everything from the front older than `t - 3000`, and return the remaining count.

**Complexity:** O(1) amortized time per call (each timestamp is added once and removed at most once, ever), O(n) space in the worst case (a burst of pings all within the 3000ms window).

```js
class RecentCounter {
  constructor() {
    this.queue = [];
  }
  ping(t) {
    this.queue.push(t);
    while (this.queue[0] < t - 3000) {
      this.queue.shift(); // discard timestamps now outside the trailing 3000ms window
    }
    return this.queue.length;
  }
}
```

**Follow-up:** the JS `shift()` performance caveat flagged at the top of this part applies directly here under a genuinely high-frequency call pattern — a real production version might reach for a proper ring buffer or a two-stack queue (Part 07's amortized O(1) design) instead of a plain array, if profiling showed it mattered.

---

### 5. Moving Average from Data Stream — Easy

**Recognize it:** "average of the last k values as new ones stream in" — a fixed-size window, tracked with a running sum (avoiding recomputing the sum from scratch on every call) plus a queue to know which value to subtract when the window slides.

**Approach:** a queue holding the current window's values, plus a running sum; on each new value, add it and update the sum, then evict the oldest value (and subtract it from the sum) if the window now exceeds size k.

**Complexity:** O(1) time per call, O(k) space.

```js
class MovingAverage {
  constructor(size) {
    this.size = size;
    this.queue = [];
    this.sum = 0;
  }
  next(val) {
    this.queue.push(val);
    this.sum += val;
    if (this.queue.length > this.size) {
      this.sum -= this.queue.shift(); // evict the oldest, adjust the running sum in the SAME step
    }
    return this.sum / this.queue.length;
  }
}
```
**Why maintaining a running sum (instead of summing the queue's contents on every call) matters:** summing the queue directly on every `next()` call would be O(k) per call — fine for a small fixed k, but the running-sum approach makes each call genuinely O(1), the same incremental-aggregate idea introduced at the top of [Part 03 — Sliding Window](03-sliding-window.md).

**Follow-up:** this is functionally identical to a fixed-size sliding window average from Part 03, wearing a "streaming"/class-based framing instead of an array-input framing — recognizing the underlying pattern equivalence, once again, is the actual transferable skill.

---

### 6. Task Scheduler — Medium

**Recognize it:** "schedule tasks with a mandatory cooldown between identical tasks, minimize total time" — the queue's role here is tracking **when each task type becomes available again**, which combines a frequency count (most frequent task drives the theoretical minimum) with a simulation of the cooldown constraint.

**Approach (formula-based, the cleaner derivation once understood):** the most frequent task type determines the schedule's minimum shape — it needs `(maxFreq - 1)` full cooldown cycles of length `(n + 1)`, plus however many tasks tie for that maximum frequency at the very end. The answer is the **larger** of that computed minimum and simply the total task count (since if there are enough *different* task types, no idle slots are needed at all and the tasks alone fill every slot).

**Complexity:** O(t) time to count frequencies (t = number of tasks), O(1) space (bounded by 26 uppercase task types, per the problem's usual constraint).

```js
function leastInterval(tasks, n) {
  const freq = new Map();
  for (const task of tasks) freq.set(task, (freq.get(task) || 0) + 1);

  const maxFreq = Math.max(...freq.values());
  const countOfMaxFreq = [...freq.values()].filter(f => f === maxFreq).length;

  const minimumPossible = (maxFreq - 1) * (n + 1) + countOfMaxFreq;
  return Math.max(minimumPossible, tasks.length); // can't be shorter than the total task count itself
}
```
**Why the formula's shape (`(maxFreq - 1) * (n + 1) + countOfMaxFreq`) makes sense, mechanically:** picture the most frequent task laid out with its mandatory cooldown gaps between each occurrence — that creates `(maxFreq - 1)` "cooldown blocks" of length `(n + 1)` each (the task itself plus n cooldown slots), with the very last occurrence needing no trailing cooldown. Any *other* task type tied for that same maximum frequency needs its own slot in that final group too, hence `+ countOfMaxFreq`. If there are enough other, less-frequent tasks to fill all those cooldown gaps (and more), the actual answer is simply the total task count instead — hence the final `Math.max`.

**Follow-up:** this formula-based approach assumes only the *counts* matter, not which specific tasks fill which slots — a **simulation-based** approach (a max-heap of remaining counts, greedily scheduling the most-frequent-remaining task each slot, tracking a cooldown queue of recently-used tasks) also works and generalizes better if the problem were extended to actually output the schedule, not just its length — worth naming as the more "constructive" alternative even if the formula is more efficient for just the count.

---

## Cross-links

- Problem 3's monotonic deque is the direct generalization of [Part 07 — Stacks](07-stacks.md)'s monotonic stack technique — study them back to back.
- Problem 2 is the intentional mirror of [Part 07's Implement Queue Using Stacks](07-stacks.md#7-implement-queue-using-stacks--easy) — comparing the two cost trade-offs side by side is worth doing explicitly.

---

**Previous:** [Part 07 — Stacks](07-stacks.md) · **Next:** [Part 09 — Most Asked Highlights](09-most-asked-highlights.md)
