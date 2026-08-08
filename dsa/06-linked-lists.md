# DSA Notes — Part 06

## Linked Lists

**Recognize it:** by definition, the input is a linked list — but the actual *technique* within it is almost always one of: fast/slow pointers, in-place pointer reversal, or careful bookkeeping around a **dummy head node** to avoid special-casing the real head.

```js
class ListNode {
  constructor(val, next = null) {
    this.val = val;
    this.next = next;
  }
}
```

**The dummy-head trick, stated once here since every problem below leans on it:** creating a placeholder `dummy` node whose `.next` points at the real head lets every subsequent operation treat the "real head" uniformly with every other node — no special-case branch needed for "what if we need to modify/remove the head itself." Return `dummy.next` at the end instead of tracking the real head separately.

---

### 1. Reverse Linked List — Easy

**Recognize it:** the foundational pointer-manipulation problem every later reversal-involving problem (Problem 5, Problem 8's merge) builds on.

**Approach:** walk the list once, at each node redirecting its `.next` pointer to point **backward** instead of forward, using three tracking pointers (previous, current, next) since reversing `.next` would otherwise lose the forward reference needed to continue.

**Complexity:** O(n) time, O(1) space.

```js
function reverseList(head) {
  let prev = null, current = head;
  while (current !== null) {
    const next = current.next; // save BEFORE overwriting current.next
    current.next = prev;
    prev = current;
    current = next;
  }
  return prev; // prev ends up at the new head (the old tail)
}
```
**Why `next` must be saved before reassigning `current.next`:** once `current.next = prev` executes, the original forward link is gone — without saving it first, there would be no way to know which node to advance to next, since the only path to it (through `.next`) was just overwritten.

**Follow-up:** reverse only a sub-range `[left, right]` of the list — same core technique, with extra bookkeeping to correctly reconnect the reversed sub-range's boundaries back into the untouched parts of the list before and after it.

---

### 2. Merge Two Sorted Lists — Easy

**Recognize it:** the linked-list analogue of merging two sorted arrays — the dummy-head trick makes this cleaner than tracking the real head through the first comparison.

**Approach:** walk both lists simultaneously, at each step attaching the smaller current node to the result and advancing that list's pointer; attach whatever remains of the non-exhausted list at the end.

**Complexity:** O(m + n) time, O(1) extra space (reusing existing nodes, not creating new ones).

```js
function mergeTwoLists(list1, list2) {
  const dummy = new ListNode(-1); // the dummy-head trick — see the part intro
  let tail = dummy;
  while (list1 !== null && list2 !== null) {
    if (list1.val <= list2.val) {
      tail.next = list1;
      list1 = list1.next;
    } else {
      tail.next = list2;
      list2 = list2.next;
    }
    tail = tail.next;
  }
  tail.next = list1 !== null ? list1 : list2; // attach whichever list still has remaining nodes
  return dummy.next;
}
```

**Follow-up:** merge **k** sorted lists, not just two — Problem 8's escalation.

---

### 3. Linked List Cycle (Floyd's Algorithm) — Easy

**Recognize it:** "does this list contain a cycle" — the canonical fast/slow (tortoise and hare) pointer problem.

**Approach:** two pointers advance through the list at different speeds — slow moves one node per step, fast moves two. If a cycle exists, fast will eventually "lap" slow and they'll meet at the same node; if no cycle exists, fast reaches the end (`null`) first.

**Complexity:** O(n) time, O(1) space — versus O(n) space if using a hashset of visited nodes instead, which is a valid but less elegant alternative worth naming.

```js
function hasCycle(head) {
  let slow = head, fast = head;
  while (fast !== null && fast.next !== null) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) return true; // they've met — a cycle exists
  }
  return false; // fast reached the end — no cycle
}
```
**Why fast and slow are guaranteed to meet if a cycle exists, precisely:** once both pointers are inside the cycle, the *gap* between them (in terms of cycle position) shrinks by exactly one node every step, since fast gains one extra step of relative progress per iteration — a shrinking gap in a finite-sized cycle must eventually reach zero, guaranteeing a meeting, rather than the pointers perpetually orbiting without ever coinciding.

**Follow-up:** find the **starting node** of the cycle, not just whether one exists — after slow and fast meet, resetting one pointer to `head` and advancing both one step at a time (now at the same speed) causes them to meet again exactly at the cycle's start — a genuinely elegant, non-obvious extension worth memorizing the shape of, if not the full derivation.

---

### 4. Remove Nth Node From End — Medium

**Recognize it:** "remove the nth node from the end, one pass" — the one-pass constraint (versus the trivial two-pass "count the length, then remove") is the actual signal for a fast/slow pointer gap technique.

**Approach:** advance a `fast` pointer `n` steps ahead first, creating a fixed gap; then advance both `slow` and `fast` together until `fast` reaches the end — `slow` is now positioned exactly at the node before the one to remove.

**Complexity:** O(n) time (one pass), O(1) space.

```js
function removeNthFromEnd(head, n) {
  const dummy = new ListNode(-1, head); // dummy-head trick — handles removing the ACTUAL head cleanly
  let slow = dummy, fast = dummy;

  for (let i = 0; i < n; i++) fast = fast.next; // create the n-node gap
  while (fast.next !== null) { // advance both until fast reaches the LAST node
    slow = slow.next;
    fast = fast.next;
  }
  slow.next = slow.next.next; // slow is now just before the node to remove — skip it
  return dummy.next;
}
```
**Why the dummy head specifically matters here:** if the node to remove is the actual head of the list, there'd be no "previous node" to update `.next` on without a dummy — the dummy provides that always-present predecessor uniformly, regardless of whether the target happens to be the first node or somewhere in the middle.

**Follow-up:** what if `n` is guaranteed valid (`1 ≤ n ≤ length`) versus not guaranteed — the code above assumes validity; a robustness-focused interviewer might ask what happens (and what should happen) if `n` exceeds the list's length.

---

### 5. Reorder List — Medium

**Recognize it:** "reorder as `L0 → Ln → L1 → Ln-1 → ...`" — a three-technique composition: find the middle (fast/slow), reverse the second half (Problem 1), then merge the two halves alternately (Problem 2's shape, adapted).

**Approach:** **(1)** find the middle using fast/slow pointers, **(2)** reverse the second half in place, **(3)** merge the first half and the reversed second half by alternating nodes from each.

**Complexity:** O(n) time, O(1) space — a good example of composing three already-known O(1)-space techniques rather than inventing a new one.

```js
function reorderList(head) {
  if (!head || !head.next) return;

  // 1. find the middle
  let slow = head, fast = head;
  while (fast.next !== null && fast.next.next !== null) {
    slow = slow.next;
    fast = fast.next.next;
  }

  // 2. reverse the second half
  let second = slow.next;
  slow.next = null; // cut the list into two halves
  let prev = null;
  while (second !== null) {
    const next = second.next;
    second.next = prev;
    prev = second;
    second = next;
  }
  second = prev; // second now points at the head of the REVERSED second half

  // 3. merge alternately
  let first = head;
  while (second !== null) {
    const firstNext = first.next;
    const secondNext = second.next;
    first.next = second;
    second.next = firstNext;
    first = firstNext;
    second = secondNext;
  }
}
```
**Why this problem is a genuinely good test of pattern composition, not a new technique:** every individual step is a problem already solved elsewhere in this part — finding a middle, reversing a list, merging two lists — and the actual skill being assessed is recognizing that a seemingly novel problem decomposes cleanly into a sequence of already-familiar sub-problems, rather than requiring an entirely new algorithm.

**Follow-up:** walk through the merge step (§3) by hand on a small example — the alternating-attachment logic, while short, is easy to get subtly wrong on the first attempt without tracing it concretely.

---

### 6. Add Two Numbers — Medium

**Recognize it:** two numbers represented as linked lists, digits in **reverse order** (least significant digit first) — this specific ordering convention is what makes a simple left-to-right pass with carry propagation work, mirroring [01.1's Plus One](arrays-and-strings/01-basics-and-in-place-manipulation.md#6-plus-one--easy) but for two multi-digit numbers with carrying.

**Approach:** walk both lists simultaneously, summing corresponding digits plus any carry from the previous step, creating a new result node per digit.

**Complexity:** O(max(m, n)) time, O(max(m, n)) space for the result list.

```js
function addTwoNumbers(l1, l2) {
  const dummy = new ListNode(-1);
  let tail = dummy, carry = 0;

  while (l1 !== null || l2 !== null || carry !== 0) {
    const sum = (l1 ? l1.val : 0) + (l2 ? l2.val : 0) + carry;
    carry = Math.floor(sum / 10);
    tail.next = new ListNode(sum % 10);
    tail = tail.next;
    if (l1) l1 = l1.next;
    if (l2) l2 = l2.next;
  }
  return dummy.next;
}
```
**Why the loop condition includes `carry !== 0` even after both lists are exhausted:** a final carry (e.g. `5 + 5 = 10`) needs one more digit appended even though both input lists have run out — omitting that condition would silently drop the final carry digit.

**Follow-up:** the digits are in **forward** order (most significant first) instead — this removes the ability to process left-to-right with a simple carry, and typically needs either reversing both lists first (reducing to this exact problem) or a recursive/stack-based approach to handle carrying from the least-significant end backward.

---

### 7. Copy List with Random Pointer — Medium

**Recognize it:** "deep copy a list where each node has an extra `random` pointer to an arbitrary other node (or null)" — the difficulty is that `random` pointers can point *forward* to nodes not yet copied, which a naive single pass can't resolve without a two-pass or interleaving trick.

**Approach (hashmap-based, the clearer one to derive first):** first pass creates a copy of every node (ignoring `random` for now) and builds a hashmap from original node → copied node; second pass walks the originals again, using the hashmap to correctly wire up both `.next` and `.random` on the copies.

**Complexity:** O(n) time, O(n) space (the hashmap).

```js
function copyRandomList(head) {
  if (!head) return null;
  const map = new Map(); // original node -> copied node

  let current = head;
  while (current !== null) { // pass 1: create all copies, ignore random for now
    map.set(current, { val: current.val, next: null, random: null });
    current = current.next;
  }

  current = head;
  while (current !== null) { // pass 2: wire up next/random using the map
    const copy = map.get(current);
    copy.next = current.next ? map.get(current.next) : null;
    copy.random = current.random ? map.get(current.random) : null;
    current = current.next;
  }
  return map.get(head);
}
```
**Why a single pass can't correctly wire `random` pointers directly:** a `random` pointer can point to a node that appears *later* in the list — a single forward pass encountering such a pointer wouldn't yet have created that target node's copy, making it impossible to wire the reference correctly without either a second pass (this approach) or a more advanced interleaved-node trick.

**Follow-up:** solve it in **O(1) extra space** (no hashmap) — the advanced trick is interleaving each copied node directly after its original (`orig1 → copy1 → orig2 → copy2 → ...`), which lets `random` pointers be derived via `original.random.next` (the copy immediately follows its original) without ever needing a lookup structure, then a final pass un-interleaves the two lists.

---

### 8. Merge K Sorted Lists — Hard

**Recognize it:** Problem 2's escalation from 2 lists to k — the classic hard linked-list problem, kept here in its simpler iterative pairwise-merge form (a full heap-based O(n log k) solution is the more advanced standard answer, worth naming even if this simpler version is what's actually implemented).

**Approach (iterative pairwise merging, divide-and-conquer style):** repeatedly merge lists in pairs (using Problem 2's `mergeTwoLists`), halving the number of remaining lists each round, until only one list remains.

**Complexity:** O(n log k) time (n = total nodes across all lists, k = number of lists — `log k` merge rounds, each doing O(n) total work across all pairs), O(1) extra space beyond the lists themselves (reusing nodes, not creating new ones — same as `mergeTwoLists`).

```js
function mergeKLists(lists) {
  if (lists.length === 0) return null;
  while (lists.length > 1) {
    const merged = [];
    for (let i = 0; i < lists.length; i += 2) {
      const l1 = lists[i];
      const l2 = i + 1 < lists.length ? lists[i + 1] : null;
      merged.push(mergeTwoLists(l1, l2)); // reuses Problem 2's function directly
    }
    lists = merged; // half as many lists as before, each one now up to twice as long
  }
  return lists[0];
}
```
**Why pairwise merging in rounds beats merging one list into a running result at a time:** merging one-at-a-time (`merge(merge(merge(l1, l2), l3), l4)...`) does O(n) work *per merge*, k-1 times, for O(nk) total. Pairwise merging in rounds halves the list count each round (`log k` rounds), and each full round's total work across all its pairs is still bounded by O(n) — giving O(n log k) overall, a genuine asymptotic improvement, not just a constant-factor one.

**Follow-up:** the standard alternative is a **min-heap** holding the current head of each list — repeatedly pop the smallest, push its `.next` if it exists — also O(n log k), and the more commonly expected answer in practice; worth naming both approaches and the trade-off (the heap version processes truly one node at a time and is arguably more intuitive, while the pairwise-merge version above reuses simpler, already-verified code from Problem 2).

---

## Cross-links

- The fast/slow pointer technique (Problems 3–5) is conceptually the same "two pointers moving at different rates" idea as [Part 02 — Two Pointers](02-two-pointers.md), applied to a linked structure instead of an array.
- Problem 8's k-way merge connects directly to [Part 08 — Queues](08-queues.md) if a heap-based (priority-queue) solution is pursued instead of the pairwise-merge version shown here.

---

**Previous:** [Part 05 — Binary Search](05-binary-search.md) · **Next:** [Part 07 — Stacks](07-stacks.md)
