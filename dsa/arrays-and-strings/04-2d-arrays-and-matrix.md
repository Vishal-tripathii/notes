# DSA Notes — Arrays & Strings, Sub-Part 01.4

## 2D Arrays & Matrix

**Recognize this bucket:** the input is explicitly a grid/matrix — the core skills are careful index bookkeeping (row/column bounds), recognizing when a transformation can be done via a **sequence of simpler 1D operations** (transpose + reverse = rotate), and traversal order tricks (spiral, diagonal) that don't map onto simple nested loops.

---

### 1. Transpose Matrix — Easy

**Recognize it:** the foundational building block for Problem 2's rotation — swap `matrix[i][j]` with `matrix[j][i]` for every `i < j`.

**Approach:** iterate only the upper triangle (`j > i`) and swap with the lower triangle's mirrored position — iterating the whole matrix would swap every pair twice, undoing the transpose.

**Complexity:** O(n²) time, O(1) space (in place, for a square matrix).

```js
function transpose(matrix) {
  const n = matrix.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) { // j starts at i+1 — only the upper triangle
      [matrix[i][j], matrix[j][i]] = [matrix[j][i], matrix[i][j]];
    }
  }
  return matrix;
}
```

**Follow-up:** transpose a **non-square** matrix — requires a new output matrix (dimensions swap, `m×n` becomes `n×m`), since an in-place transpose only works cleanly for square matrices.

---

### 2. Rotate Image (90° In-Place) — Medium

**Recognize it:** "rotate an n×n matrix 90 degrees clockwise, in place" — the O(1)-space constraint rules out building a new rotated matrix directly.

**Approach:** rotation by 90° clockwise decomposes into two simpler operations — **transpose**, then **reverse each row**. Recognizing that a seemingly-complex 2D transformation is actually a composition of two easy 1D operations is the core insight.

**Complexity:** O(n²) time, O(1) space.

```js
function rotate(matrix) {
  transpose(matrix);              // Problem 1's helper
  for (const row of matrix) {
    row.reverse();                    // reverse each row in place
  }
}
```
**Why transpose + row-reverse equals 90° clockwise rotation:** transposing flips the matrix across its main diagonal, turning rows into columns; reversing each row then flips left-right — the composition of "flip across the diagonal" then "flip left-right" is exactly a 90° clockwise turn. Verify by hand on a small 3×3 example rather than taking it on faith.

**Follow-up:** rotate **counter-clockwise** instead — reverse each row *first*, then transpose (the same two operations, different order, since composition order matters for rotation direction).

---

### 3. Spiral Matrix — Medium

**Recognize it:** "traverse in spiral order" — a traversal-order problem, not a value-transformation one; the technique is maintaining four shrinking boundaries.

**Approach:** track `top`, `bottom`, `left`, `right` boundaries. Traverse the top row left-to-right, the right column top-to-bottom, the bottom row right-to-left, the left column bottom-to-top — shrinking each boundary inward after its pass, and stopping once the boundaries cross.

**Complexity:** O(m×n) time (every cell visited once), O(1) extra space (excluding output).

```js
function spiralOrder(matrix) {
  const result = [];
  if (matrix.length === 0) return result;
  let top = 0, bottom = matrix.length - 1;
  let left = 0, right = matrix[0].length - 1;

  while (top <= bottom && left <= right) {
    for (let col = left; col <= right; col++) result.push(matrix[top][col]);
    top++;
    for (let row = top; row <= bottom; row++) result.push(matrix[row][right]);
    right--;
    if (top <= bottom) { // guard — a single remaining row would otherwise be traversed TWICE
      for (let col = right; col >= left; col--) result.push(matrix[bottom][col]);
      bottom--;
    }
    if (left <= right) { // guard — a single remaining column would otherwise be traversed TWICE
      for (let row = bottom; row >= top; row--) result.push(matrix[row][left]);
      left++;
    }
  }
  return result;
}
```
**Why the two guard conditions exist:** after traversing the top row and right column, if only a single row or column remains, traversing "the bottom row" and "the left column" separately would revisit the same cells already covered — the guards specifically prevent double-counting the last remaining row/column when the spiral has nearly exhausted the matrix.

**Follow-up:** **generate** an n×n spiral matrix filled with `1..n²` in spiral order (LeetCode's Spiral Matrix II) — same boundary-shrinking traversal, writing an incrementing counter instead of reading values.

---

### 4. Set Matrix Zeroes — Medium

**Recognize it:** "if any cell is 0, zero its entire row and column" — the naive approach (zero immediately upon finding a 0) corrupts the data other cells need to check, which is the actual difficulty: marking "should become zero" without destroying information prematurely.

**Approach:** use the **first row and first column of the matrix itself** as marker storage (avoiding an O(m+n) extra array), being careful to record whether the first row/column themselves originally contained a zero before overwriting them as markers.

**Complexity:** O(m×n) time, O(1) extra space (the clever part — versus an O(m+n) space solution using separate marker arrays, which is a perfectly good first pass to state before optimizing further).

```js
function setZeroes(matrix) {
  const m = matrix.length, n = matrix[0].length;
  let firstRowHasZero = false, firstColHasZero = false;

  for (let j = 0; j < n; j++) if (matrix[0][j] === 0) firstRowHasZero = true;
  for (let i = 0; i < m; i++) if (matrix[i][0] === 0) firstColHasZero = true;

  // use row 0 / col 0 as marker storage for the REST of the matrix
  for (let i = 1; i < m; i++) {
    for (let j = 1; j < n; j++) {
      if (matrix[i][j] === 0) {
        matrix[i][0] = 0;
        matrix[0][j] = 0;
      }
    }
  }
  // apply markers (skip row 0/col 0 for now — they hold marker data, not final values yet)
  for (let i = 1; i < m; i++) {
    for (let j = 1; j < n; j++) {
      if (matrix[i][0] === 0 || matrix[0][j] === 0) matrix[i][j] = 0;
    }
  }
  if (firstRowHasZero) for (let j = 0; j < n; j++) matrix[0][j] = 0;
  if (firstColHasZero) for (let i = 0; i < m; i++) matrix[i][0] = 0;
}
```

**Follow-up:** solve it first with an O(m+n) auxiliary space solution (two sets tracking which rows/columns need zeroing) — that's a perfectly reasonable first answer in an interview; the O(1)-space version above is the natural "can you do better?" escalation.

---

### 5. Search a 2D Matrix — Medium

**Recognize it:** "each row sorted left-to-right, first element of each row greater than the last element of the previous row" — this constraint means the whole matrix is effectively **one sorted 1D array** in disguise, which is the signal to reach for binary search.

**Approach:** binary search over a virtual 1D index space `[0, m*n)`, converting each midpoint back to a `(row, col)` pair via integer division/modulo.

**Complexity:** O(log(m×n)) time, O(1) space — versus O(m+n) for a staircase-search approach, or O(m×n) for a naive scan.

```js
function searchMatrix(matrix, target) {
  const m = matrix.length, n = matrix[0].length;
  let left = 0, right = m * n - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const value = matrix[Math.floor(mid / n)][mid % n]; // map 1D index back to 2D
    if (value === target) return true;
    if (value < target) left = mid + 1;
    else right = mid - 1;
  }
  return false;
}
```

**Follow-up:** the weaker variant where only rows AND columns are individually sorted (not the whole matrix as one sorted sequence) — binary search per row no longer works globally; the standard approach becomes starting from the top-right corner and eliminating a row or column each step, O(m+n).

---

### 6. Diagonal Traverse — Medium

**Recognize it:** "traverse in a zig-zag diagonal order" — a pure traversal-order problem like Spiral Matrix, but along anti-diagonals with alternating direction.

**Approach:** group cells by `row + col` (constant along each anti-diagonal); traverse each diagonal's cells in alternating up-right / down-left order.

**Complexity:** O(m×n) time, O(1) extra space (excluding output).

```js
function findDiagonalOrder(mat) {
  const m = mat.length, n = mat[0].length;
  const result = [];
  for (let d = 0; d < m + n - 1; d++) { // d = row + col, one group per diagonal
    const diagonal = [];
    let row = d < n ? 0 : d - n + 1;
    let col = d < n ? d : n - 1;
    while (row < m && col >= 0) {
      diagonal.push(mat[row][col]);
      row++; col--;
    }
    if (d % 2 === 0) diagonal.reverse(); // alternate direction per diagonal
    result.push(...diagonal);
  }
  return result;
}
```

**Follow-up:** trace the starting `(row, col)` formula by hand for a 3×4 matrix — this problem is much more about careful index derivation than any deep algorithmic insight, and that derivation is worth being able to redo from scratch, not memorize.

---

### 7. Game of Life — Medium

**Recognize it:** "update every cell simultaneously based on its neighbors' CURRENT state" combined with an in-place, O(1)-space follow-up — the core difficulty is that naively updating cells one at a time corrupts the "current state" that later cells still need to read.

**Approach:** encode both the old and new state in the same cell using extra bit/value states (e.g. `2` = was alive, now dead; `3` = was dead, now alive), then do a final pass converting these intermediate codes to plain 0/1.

**Complexity:** O(m×n) time, O(1) extra space.

```js
function gameOfLife(board) {
  const m = board.length, n = board[0].length;
  const countLiveNeighbors = (row, col) => {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr, c = col + dc;
        if (r >= 0 && r < m && c >= 0 && c < n && (board[r][c] === 1 || board[r][c] === 2)) {
          count++; // state 2 = "was alive" — still counts as alive for THIS pass's neighbor checks
        }
      }
    }
    return count;
  };
  for (let row = 0; row < m; row++) {
    for (let col = 0; col < n; col++) {
      const liveNeighbors = countLiveNeighbors(row, col);
      if (board[row][col] === 1 && (liveNeighbors < 2 || liveNeighbors > 3)) board[row][col] = 2; // dies
      if (board[row][col] === 0 && liveNeighbors === 3) board[row][col] = 3; // becomes alive
    }
  }
  for (let row = 0; row < m; row++) {
    for (let col = 0; col < n; col++) {
      board[row][col] %= 2; // 2 -> 0, 3 -> 1, collapsing the intermediate encoding to final values
    }
  }
}
```
**Why the intermediate encoding (2, 3) is necessary:** every cell's next state depends on its neighbors' *current* (pre-update) state — if a cell were updated to its final 0/1 value immediately, a neighboring cell processed afterward would incorrectly read that already-updated value instead of the original. Encoding "was X, now becoming Y" preserves both pieces of information in one pass, resolved cleanly in the second pass.

**Follow-up:** the board is infinite/unbounded in principle — the fixed-size in-place trick above no longer applies directly; the real-world approach becomes tracking only currently-live cells in a sparse set and checking neighbor counts against that set instead of a fixed grid.

---

## Cross-links

- Problem 5 is a direct application of [Part 05 — Binary Search](../05-binary-search.md)'s "sorted structure → binary search" recognition heuristic, just on a matrix reinterpreted as 1D.

---

**Previous:** [01.3 — Subarray & Subsequence Problems](03-subarray-and-subsequence.md) · **Next:** [01.5 — Intervals](05-intervals.md)
