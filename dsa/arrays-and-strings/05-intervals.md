# DSA Notes — Arrays & Strings, Sub-Part 01.5

## Intervals

**Recognize this bucket:** input is a list of `[start, end]` ranges — "merge," "overlap," "insert," "minimum rooms/removals" are the tell. **The near-universal first move: sort by start time** (occasionally by end time — flagged where it matters) — almost every interval problem becomes tractable only after sorting removes the need to consider intervals in arbitrary order.

---

### 1. Merge Intervals — Medium

**Recognize it:** "merge all overlapping intervals" — the foundational interval problem everything else in this sub-part builds on.

**Approach:** sort by start time. Walk through, keeping a "current merged interval" — if the next interval's start is ≤ the current merged interval's end, they overlap, so extend the end; otherwise, close out the current merged interval and start a new one.

**Complexity:** O(n log n) time (dominated by the sort), O(n) space for the output.

```js
function merge(intervals) {
  if (intervals.length <= 1) return intervals;
  intervals.sort((a, b) => a[0] - b[0]); // sort by START time — the universal first move

  const result = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const [start, end] = intervals[i];
    const lastMerged = result[result.length - 1];
    if (start <= lastMerged[1]) { // overlaps (or touches) the last merged interval
      lastMerged[1] = Math.max(lastMerged[1], end); // extend it
    } else {
      result.push([start, end]); // no overlap — a new merged interval begins
    }
  }
  return result;
}
```
**Why sorting by start makes this a single linear pass:** once sorted, any interval that overlaps with the current merged range MUST appear next (since nothing with a smaller start remains unprocessed) — this is exactly what turns an otherwise-combinatorial "check every pair for overlap" problem into one clean left-to-right sweep.

**Follow-up:** intervals are given as **closed** (`[1,3]` and `[3,5]` should merge, since they touch at 3) versus **open** — verify which the problem intends, and note the `<=` vs `<` comparison above is what encodes that choice.

---

### 2. Insert Interval — Medium

**Recognize it:** "insert a new interval into an already-sorted, non-overlapping list, merging as needed" — a variant of Problem 1 where the list starts pre-sorted, so no full sort is needed, just a single targeted pass.

**Approach:** three phases in one linear scan — add every interval that ends entirely before the new interval starts (no overlap, untouched); merge every interval that overlaps the new interval into a single growing interval; add every interval that starts entirely after the merged interval ends (also untouched).

**Complexity:** O(n) time (no sort needed — input is already sorted), O(n) space for output.

```js
function insert(intervals, newInterval) {
  const result = [];
  let i = 0;
  const n = intervals.length;

  while (i < n && intervals[i][1] < newInterval[0]) { // entirely BEFORE newInterval — no overlap
    result.push(intervals[i]);
    i++;
  }
  while (i < n && intervals[i][0] <= newInterval[1]) { // OVERLAPS newInterval — merge in
    newInterval = [
      Math.min(newInterval[0], intervals[i][0]),
      Math.max(newInterval[1], intervals[i][1]),
    ];
    i++;
  }
  result.push(newInterval); // the fully-merged new interval
  while (i < n) { // entirely AFTER newInterval — no overlap
    result.push(intervals[i]);
    i++;
  }
  return result;
}
```

**Follow-up:** what if the input list is **not** guaranteed sorted? Falls back to Problem 1's approach entirely — append the new interval to the list, sort, then merge, losing the O(n) advantage this problem's pre-sorted assumption provides.

---

### 3. Non-overlapping Intervals — Medium

**Recognize it:** "minimum number of intervals to remove so the rest don't overlap" — a greedy problem, and the key insight is which sort key to use: **sort by END time, not start time**, the one interval problem in this set where that distinction actually matters.

**Approach:** sort by end time. Greedily keep an interval if it starts at or after the end of the last kept interval; otherwise it overlaps and must be removed (count it as removed, don't advance the "last kept end").

**Complexity:** O(n log n) time, O(1) extra space (beyond the sort).

```js
function eraseOverlapIntervals(intervals) {
  if (intervals.length === 0) return 0;
  intervals.sort((a, b) => a[1] - b[1]); // sort by END time — deliberately different from Problem 1

  let removals = 0;
  let lastEnd = intervals[0][1];
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i][0] < lastEnd) {
      removals++; // this interval overlaps — remove IT, keep the previously-kept one
    } else {
      lastEnd = intervals[i][1]; // no overlap — keep this one, update the tracked end
    }
  }
  return removals;
}
```
**Why sort by end time here, specifically, and not start time:** the greedy goal is to keep as many non-overlapping intervals as possible (equivalently, remove as few as possible) — always keeping the interval that **ends soonest** leaves the most remaining room for future intervals to also not overlap. Sorting by start time doesn't give you that greedy guarantee directly; sorting by end time is what makes "always prefer the earliest-ending option" a provably optimal greedy choice.

**Follow-up:** name the exact reason sorting by start time would give a wrong or harder-to-reason-about greedy here — a strong interview signal that you understand *why* the sort key was chosen, not just that it works.

---

### 4. Meeting Rooms — Easy

**Recognize it:** "can a person attend all meetings" — the simplest possible interval-overlap check, a warm-up before Problem 5's escalation.

**Approach:** sort by start time; if any interval's start is before the previous interval's end, there's a conflict.

**Complexity:** O(n log n) time, O(1) extra space.

```js
function canAttendMeetings(intervals) {
  intervals.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i][0] < intervals[i - 1][1]) return false; // overlap found
  }
  return true;
}
```

**Follow-up:** this is exactly Problem 5 (Meeting Rooms II) with the question changed from "is 1 room enough" to "how many rooms are needed" — recognizing the relationship is the actual point of pairing these two.

---

### 5. Meeting Rooms II — Medium

**Recognize it:** "minimum number of conference rooms required" — the natural escalation of Problem 4; needs tracking how many meetings are simultaneously in progress at any point, not just pairwise overlap.

**Approach:** separate all start times and all end times into two sorted arrays. Walk through start times in order; each time a meeting starts, check whether the **earliest-ending** currently-active meeting has already ended (using a pointer into the sorted end-times array) — if so, that room is now free and can be reused; if not, a new room is genuinely needed.

**Complexity:** O(n log n) time, O(n) space.

```js
function minMeetingRooms(intervals) {
  const starts = intervals.map(i => i[0]).sort((a, b) => a - b);
  const ends = intervals.map(i => i[1]).sort((a, b) => a - b);

  let rooms = 0, maxRooms = 0;
  let startPtr = 0, endPtr = 0;
  while (startPtr < starts.length) {
    if (starts[startPtr] < ends[endPtr]) {
      rooms++;          // a meeting starts before the earliest currently-running one ends —
      startPtr++;          // need another room
    } else {
      rooms--;          // the earliest-running meeting has ended — free up a room
      endPtr++;
    }
    maxRooms = Math.max(maxRooms, rooms);
  }
  return maxRooms;
}
```
**Why separating starts and ends into independent sorted arrays works:** the question "how many rooms are needed" only cares about the *count* of overlapping meetings at any instant, not which specific meeting occupies which room — sorting starts and ends independently and sweeping through both in tandem (a two-pointer technique, [Part 02](../02-two-pointers.md)) correctly counts concurrent meetings without needing to track individual meeting identity at all.

**Follow-up:** solve it with a **min-heap** of end times instead (push each new meeting's end time; whenever the heap's minimum end time is ≤ the new meeting's start, pop it — the room is reused) — a heap-based approach that generalizes better if rooms also need to be identified/labeled, not just counted, worth naming even without a dedicated heap sub-part in this track.

---

### 6. Interval List Intersections — Medium

**Recognize it:** "given two separate lists of disjoint, sorted intervals, find their pairwise intersections" — a two-pointer problem (one pointer per list) dressed as an interval problem.

**Approach:** advance two pointers, one per list. At each step, compute the overlap (if any) between the two currently-pointed-at intervals; then advance whichever interval **ends first**, since it can no longer contribute to any further intersection.

**Complexity:** O(m + n) time, O(min(m, n)) space for output in the worst case.

```js
function intervalIntersection(firstList, secondList) {
  const result = [];
  let i = 0, j = 0;
  while (i < firstList.length && j < secondList.length) {
    const start = Math.max(firstList[i][0], secondList[j][0]);
    const end = Math.min(firstList[i][1], secondList[j][1]);
    if (start <= end) result.push([start, end]); // a genuine overlap exists

    if (firstList[i][1] < secondList[j][1]) i++; // whichever interval ends FIRST is exhausted
    else j++;
  }
  return result;
}
```

**Follow-up:** what if either input list weren't guaranteed sorted/disjoint internally? Falls back to first merging each list independently (Problem 1) before applying this two-pointer sweep.

---

### 7. Minimum Number of Arrows to Burst Balloons — Medium

**Recognize it:** "burst overlapping balloons with the fewest arrows" — structurally identical to Problem 3 (Non-overlapping Intervals), just phrased as a physical scenario; recognizing this equivalence is the actual test.

**Approach:** sort by end coordinate. Greedily place an arrow at the end of the first (soonest-ending) balloon's range; every subsequent balloon whose start is ≤ that arrow's position is burst by the same arrow — advance past all of them, then place the next arrow at the next un-burst balloon's end, repeating.

**Complexity:** O(n log n) time, O(1) extra space.

```js
function findMinArrowShots(points) {
  if (points.length === 0) return 0;
  points.sort((a, b) => a[1] - b[1]); // sort by END — same greedy justification as Problem 3

  let arrows = 1;
  let arrowPosition = points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] > arrowPosition) { // this balloon starts AFTER the current arrow — needs a new one
      arrows++;
      arrowPosition = points[i][1];
    }
    // else: this balloon overlaps the current arrow's position — already burst, no new arrow needed
  }
  return arrows;
}
```
**Why this is "the same problem" as Problem 3:** "minimum arrows to burst all balloons" and "minimum intervals to keep such that none overlap" are the same underlying optimization, viewed from opposite directions — the number of arrows needed equals the number of *non-overlapping groups* the intervals split into, which is exactly the count `(total - removals)` from Problem 3. Recognizing two differently-worded problems as one already-solved pattern is worth more than solving either from scratch.

**Follow-up:** explicitly state the mapping between this problem's "arrows" and Problem 3's "kept intervals" out loud — an interviewer who's already seen your Problem 3 solution will often ask this one specifically to test pattern transfer.

---

## Cross-links

- The universal "sort first" move connects to [01.7 — Sorting-Based Array Tricks](07-sorting-based-array-tricks.md) — sorting as a first move that unlocks a simpler linear pass is a recurring theme across both sub-parts.
- Problem 6's two-pointer sweep over two separate sorted lists is a direct application of [Part 02 — Two Pointers](../02-two-pointers.md).

---

**Previous:** [01.4 — 2D Arrays & Matrix](04-2d-arrays-and-matrix.md) · **Next:** [01.6 — String Manipulation & Pattern Matching](06-string-manipulation-and-pattern-matching.md)
