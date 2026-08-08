# LLD Problem 06 — Tic-Tac-Toe & Chess

> Worked end-to-end using the LLD Problem-Solving Framework (../04-lld-problem-solving-framework.md). Signature challenge: a board abstraction that generalizes across games, and avoiding a deep inheritance trap in chess pieces.

---

## Table of Contents

1. [Requirements & Scope](#requirements)
2. [Tic-Tac-Toe Design](#ttt-design)
3. [Core Code — Tic-Tac-Toe](#ttt-code)
4. [Chess Design — the Inheritance Trap](#chess-design)
5. [Core Code — Chess](#chess-code)
6. [Concurrency](#concurrency)
7. [Extensibility](#extensibility)
8. [Interview Q&A](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements & Scope *(Framework Steps 1-2)*

Interviewers often bundle these two together deliberately — Tic-Tac-Toe warms you up on the board abstraction, then Chess tests whether your class design survives real complexity.

**Functional (both games):**
1. 2-player, turn-based, single shared board.
2. A player makes a move by choosing a cell/square; the move is validated before being applied.
3. After each move, check for a win/draw (Tic-Tac-Toe) or check/checkmate/stalemate (Chess) — out of scope for full chess rules, but the hook must exist.
4. Game reports its status: in-progress, won (by whom), draw.

**Non-functional:**
- **Extensible board size** — interviewers commonly follow up with "what if it's 4x4 or 5x5 Tic-Tac-Toe with 4-in-a-row to win?" The win-check logic must not be hardcoded to 3x3.
- **Extensible piece behavior** in Chess — new piece types or variants (e.g. a custom fairy piece) shouldn't require touching existing classes.
- **Correctness over performance** — these are correctness/design problems, not scale problems (that's the giveaway for the concurrency follow-up in §6 — it only matters once you bolt on a networked backend).

**Actors:** `Player` (two of them, alternating turns), the `Board`, and a `Game`/`GameEngine` orchestrating turns and win detection.

> Same shape, different complexity: Tic-Tac-Toe stresses the **board + pluggable win-check**; Chess stresses **per-entity behavior variation**, which is where inheritance tempts you into a bad tree.

---

<a name="ttt-design"></a>
# 2. Tic-Tac-Toe Design *(Framework Steps 3-6)*

**Nouns → classes:**
- `Cell` — holds a mark (`EMPTY | X | O`), knows its `(row, col)`.
- `Board` — an `n x n` grid of `Cell`s (default 3x3, but `n` is a constructor param). Exposes `placeMark(row, col, symbol)` and `getGrid()`.
- `Player` — `{ name, symbol }`.
- `WinChecker` — a **Strategy** interface: `checkWinner(board): symbol | null`. Concrete strategies: `ThreeInARowChecker` (classic 3x3) or a generalized `KInARowChecker(k)` for larger boards.
- `Game` — owns `Board`, `Player[]`, current-turn index, and a `WinChecker`. Runs `makeMove(row, col)`.

**Why WinChecker is a Strategy, not a hardcoded method:**
A naive `Board.checkWinner()` that loops 3 rows + 3 cols + 2 diagonals hardcodes the "3x3, 3-in-a-row" assumption. The moment the interviewer says *"now make it 5x5 needing 4-in-a-row to win"*, that method needs rewriting from inside the `Board` class — a SOLID **Open/Closed** violation. Making win-checking a pluggable `WinChecker` means `Board` stays generic (just a grid), and you swap in a different checker instance without touching `Board` or `Game`.

**Relationships:** `Game` **has-a** `Board`, **has-a** `WinChecker` (composition, injected at construction — classic Strategy wiring), **has-many** `Player`. No inheritance needed anywhere in Tic-Tac-Toe — flat composition is enough.

---

<a name="ttt-code"></a>
# 3. Core Code — Tic-Tac-Toe

```javascript
class Board {
  constructor(size = 3) {
    this.size = size;
    this.grid = Array.from({ length: size }, () => Array(size).fill(null));
  }

  placeMark(row, col, symbol) {
    if (row < 0 || row >= this.size || col < 0 || col >= this.size) {
      throw new Error("Out of bounds");
    }
    if (this.grid[row][col] !== null) {
      throw new Error("Cell already occupied");
    }
    this.grid[row][col] = symbol;
  }

  isFull() {
    return this.grid.every(row => row.every(cell => cell !== null));
  }
}

// Strategy — pluggable win condition, decoupled from Board size
class KInARowChecker {
  constructor(k) { this.k = k; }

  checkWinner(board) {
    const { grid, size } = board;
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]]; // →, ↓, ↘, ↙
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const symbol = grid[r][c];
        if (!symbol) continue;
        for (const [dr, dc] of dirs) {
          let count = 1;
          for (let i = 1; i < this.k; i++) {
            const nr = r + dr * i, nc = c + dc * i;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
            if (grid[nr][nc] !== symbol) break;
            count++;
          }
          if (count === this.k) return symbol;
        }
      }
    }
    return null;
  }
}

class Game {
  constructor(players, size = 3, winChecker = new KInARowChecker(3)) {
    this.board = new Board(size);
    this.players = players;       // [{ name, symbol }, { name, symbol }]
    this.turn = 0;
    this.winChecker = winChecker;
    this.winner = null;
  }

  makeMove(row, col) {
    if (this.winner) throw new Error("Game already over");
    const player = this.players[this.turn];
    this.board.placeMark(row, col, player.symbol);

    this.winner = this.winChecker.checkWinner(this.board);
    if (this.winner) return { status: "WIN", winner: this.winner };
    if (this.board.isFull()) return { status: "DRAW" };

    this.turn = 1 - this.turn; // alternate — 2-player only, see §7 for N-player
    return { status: "CONTINUE" };
  }
}
```

---

<a name="chess-design"></a>
# 4. Chess Design — the Inheritance Trap

## The wrong instinct: deep inheritance

The tempting first design, because "a Pawn *is a* Piece":

```
GamePiece
  └── Piece
        └── Pawn
              └── PromotedPawn   ← now what, does this extend Queen too??
```

**Why this breaks down:**
1. **Behavior doesn't nest cleanly.** A Queen moves like a Rook *and* a Bishop combined — there's no single parent to inherit "moves in straight lines" from without also dragging in unrelated pieces, and single-inheritance languages can't do `class Queen extends Rook, Bishop`.
2. **Pawn promotion is an identity change, not a new subclass.** When a pawn reaches the back rank it *becomes* a Queen (or Rook/Bishop/Knight) at runtime. Inheritance fixes an object's type at construction — you cannot re-parent an object mid-game. A `PromotedPawn extends Queen` class is a hack that still isn't a real Queen for other code checking `instanceof Queen`.
3. **Violates SOLID.** Every new piece variant (or chess variant with custom pieces) forces edits up and down the hierarchy — Open/Closed violation. And a deep chain of `extends` couples pieces that shouldn't know about each other (Liskov gets shaky too — is a `King` really substitutable wherever `Piece` is expected, given castling's special rules?).

## The correct model: composition over inheritance

Keep the class hierarchy **flat** — one `Piece` base — and vary *behavior* by **composing in a `MoveStrategy`** (Strategy pattern again, same tool as the Tic-Tac-Toe win-checker):

```
Piece (base)                MoveStrategy (interface)
  color, position, type        isValid(board, from, to): boolean
  moveStrategy ──has-a──►    ├── LinearMoveStrategy   (Rook/Bishop/Queen — differ by direction set)
                              ├── LShapeMoveStrategy   (Knight)
                              ├── SingleStepStrategy   (King)
                              └── PawnMoveStrategy     (forward + diagonal-capture + first-move double-step)
```

- **Promotion becomes trivial:** swap `pawn.moveStrategy = new LinearMoveStrategy(...)` (or just replace the `Piece` instance in that square) — no re-parenting, no class-identity gymnastics.
- **Queen = Rook directions + Bishop directions**, expressed as one `LinearMoveStrategy` configured with 8 directions instead of 4 — composition lets you *combine* behavior by configuration, something inheritance structurally can't do without multiple inheritance.
- **New piece = new strategy, zero edits elsewhere** — Open/Closed satisfied.
- **Board** stays a dumb `8x8` grid of `Cell`s, each holding `null` or a `Piece`. It doesn't know piece-specific rules — it only asks the piece's strategy "is this move valid," then separately checks board-level constraints (own-piece blocking, path obstruction, is a king left in check).

**Relationships:** `Piece` **has-a** `MoveStrategy` (composition, injected). `Board` **has-many** `Cell`, each **has (optionally) a** `Piece`. No `Piece` subclass needs to override a move method — the strategy owns that, so `Piece` itself doesn't even need subclassing at all; a `type` enum + injected strategy is enough.

---

<a name="chess-code"></a>
# 5. Core Code — Chess

```javascript
// --- Strategy interface ---
class MoveStrategy {
  isValid(board, from, to) { throw new Error("Not implemented"); }
}

// --- One concrete strategy: Knight (L-shape, ignores blocking pieces) ---
class LShapeMoveStrategy extends MoveStrategy {
  isValid(board, from, to) {
    const dr = Math.abs(from.row - to.row);
    const dc = Math.abs(from.col - to.col);
    return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
  }
}

// --- Piece: flat, no inheritance chain — behavior injected ---
class Piece {
  constructor(type, color, moveStrategy) {
    this.type = type;         // "PAWN" | "KNIGHT" | "BISHOP" | ...
    this.color = color;       // "WHITE" | "BLACK"
    this.moveStrategy = moveStrategy;
  }

  canMove(board, from, to) {
    return this.moveStrategy.isValid(board, from, to);
  }
}

// --- Board: dumb 8x8 grid, delegates rule-checking to the piece ---
class Board {
  constructor() {
    this.size = 8;
    this.grid = Array.from({ length: 8 }, () => Array(8).fill(null));
  }

  getPiece({ row, col }) { return this.grid[row][col]; }

  isValidMove(from, to) {
    const piece = this.getPiece(from);
    if (!piece) return false;

    const target = this.getPiece(to);
    if (target && target.color === piece.color) return false; // can't capture own piece

    if (!piece.canMove(this, from, to)) return false;

    // (path-obstruction check for sliding pieces, and "does this leave my
    // own king in check" both live here too — omitted for brevity)
    return true;
  }

  movePiece(from, to) {
    if (!this.isValidMove(from, to)) throw new Error("Illegal move");
    this.grid[to.row][to.col] = this.grid[from.row][from.col];
    this.grid[from.row][from.col] = null;
  }
}
```

---

<a name="concurrency"></a>
# 6. Concurrency *(Framework Step 7)*

**Local, single-process game:** turn-based games are naturally serialized — one shared `Board`, moves alternate, there's nothing to race because only one caller can legally act at a time (`Game` rejects a move if it isn't that player's turn).

**But: "this is now the backend for an online multiplayer match."** Now two separate client processes can each fire an HTTP/WebSocket move request at nearly the same instant. The race:

```
Client A (White) submits move            Client B (Black) submits move
        │                                          │
        ▼                                          ▼
Server reads turn = WHITE  ✓ passes check   Server reads turn = WHITE  ✗ should fail
        │                                          │  (but if both reads happen
        ▼                                          ▼   before either write...)
Server applies A's move, flips turn         Server also applies B's move
```

This is a classic **check-then-act (TOCTOU) race** on the shared `turn`/`board` state — if "is it your turn" and "apply the move" aren't atomic together, both requests can pass validation before either commits, corrupting the board (double-move, or two pieces landing on the same target).

**Guards, in order of how you'd actually reach for them:**
1. **Single source of truth, mutated only through one path.** The authoritative `Board` lives server-side (never trust client-submitted board state) — clients only submit *intended moves*, server re-validates and applies.
2. **Serialize per game session**, not globally. Lock/mutex keyed on `gameId` (in-process: a per-game queue/actor processing moves one at a time; distributed backend: a Redis distributed lock or a DB row lock on the game record). Because the lock is scoped to one `gameId`, thousands of concurrent games still scale horizontally — you're never serializing *all* games, just moves *within* one game.
3. **Optimistic concurrency as an alternative to locking:** stamp the board with a `version` number; a move request must include the version it was computed against; the server does an atomic `UPDATE ... WHERE version = ?` (or `compare-and-swap`) — a stale/racing second request fails the version check and the client is told to retry against fresh state.
4. **Turn ownership is the actual mutex.** Since only one player may legally move at a time, validating "is this player's ID == current turn's player ID" *inside* the same atomic operation that applies the move (not as a separate earlier read) closes the TOCTOU window.

> This is exactly the same shape as the BookMyShow seat-locking problem (Part 12) — a shared mutable resource, multiple actors racing to mutate it, fixed by pushing the check-and-mutate into one atomic operation instead of two separate steps.

---

<a name="extensibility"></a>
# 7. Extensibility *(Framework Step 9)*

### "Now add a 4-player variant"
- `Game.players` is already an array, not two named fields — turn advance becomes `this.turn = (this.turn + 1) % this.players.length` instead of `1 - this.turn`. No structural change.
- Tic-Tac-Toe: win-checking (`WinChecker`) is untouched — it just checks "k-in-a-row of *any* symbol," which already generalizes past 2 symbols.
- Chess 4-player variants (e.g. free-for-all chess) typically use a non-square board (cross-shaped) — this is where the `Board` abstraction earns its keep: if `Board` only exposes `getPiece`/`isValidMove`/grid bounds rather than assuming an 8x8 square internally everywhere, swapping the grid shape doesn't ripple into `Piece` or `MoveStrategy` at all — exactly because behavior was decoupled from board shape via Strategy.

### "Now add check/checkmate detection"
- **Check:** after applying a move, scan the board for the moving side's opponent king; the position is "in check" if *any* opposing piece's `moveStrategy.isValid(board, piecePos, kingPos)` returns true. This is a pure query over existing pieces — no new classes needed, just a `Board.isKingInCheck(color)` method reusing the same `isValidMove` machinery.
- **Checkmate:** in check **and** no legal move for that color resolves it. Brute-force but simple: for every piece of that color, for every board square, simulate the move (on a cloned board), check `isKingInCheck` afterward — if every simulated move still leaves the king in check, it's checkmate. Expensive (`O(pieces × squares)` clones) but correctness-first is fine for an interview; you'd mention memoizing legal-move generation as the optimization follow-up.
- Neither addition touches `Piece`, `MoveStrategy`, or existing move logic — it's purely additive, which is the Open/Closed payoff of having kept the design flat.

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: "Why not just make `Pawn`, `Knight`, `Bishop` etc. subclasses of `Piece`, each overriding a `move()` method?"
> *"That's the natural first instinct, but it breaks on two real cases: a Queen's movement is the union of a Rook's and a Bishop's, which single inheritance can't express without duplicating logic; and pawn promotion needs a piece to change its behavior — effectively its type — mid-game, which inheritance can't do since an object's class is fixed at construction. I'd instead keep `Piece` flat and give it a `MoveStrategy` — the movement rule becomes swappable data, not a rigid subclass."*

### Q: "How is the Tic-Tac-Toe win-checker designed so a 5x5 board with 4-in-a-row doesn't require rewriting `Board`?"
> *"`Board` is just a generic grid — it doesn't know how to detect a win. I inject a `WinChecker` strategy into the `Game`, parameterized by `k` (how many in a row counts as a win). Swapping board size or win length means constructing a different `KInARowChecker(k)` and a bigger `Board`, with zero changes to either class — that's Open/Closed in practice, not just the term."*

### Q: "Where does `Board` end and `Piece` begin in terms of responsibility?"
> *"`Board` owns board-level state and constraints — grid bounds, what occupies each cell, whether the destination has a friendly piece, whether a king is left in check. `Piece` (via its `MoveStrategy`) only knows its own movement geometry — can this shape move from A to B, ignoring context. Board asks the piece 'is this geometrically legal,' then layers its own checks on top. That split keeps single responsibility clean on both sides."*

### Q: "Two players submit a move at the same instant over the network — what actually breaks, and how do you stop it?"
> *"The risk is a check-then-act race: both requests read 'whose turn is it' before either one's move is committed, so both can pass validation and corrupt the board. I'd make the server the single source of truth for board state, never trust a client-submitted board, and serialize move processing per `gameId` — either a lock scoped to that game or optimistic concurrency with a version stamp so a racing second write fails and retries. Crucially the lock is per-game, not global, so it doesn't limit how many concurrent matches the system can run."*

### Q: "How would you detect checkmate?"
> *"First check: is the king currently attacked by any opposing piece, reusing the same `isValidMove` check I already have. Then for checkmate, I simulate every legal move for every piece of that color on a cloned board and re-check — if none of them clears the check, it's checkmate. It's brute-force, but it reuses existing move-validation rather than needing new classes, and I'd flag move-generation caching as the follow-up optimization if asked."*

### Q: "What SOLID principle is `MoveStrategy` mainly serving?"
> *"Open/Closed, primarily — adding a new piece type or a chess variant's custom piece means writing a new `MoveStrategy` implementation, not touching `Piece`, `Board`, or any existing strategy. Secondarily Single Responsibility — `Piece` holds identity and state, `MoveStrategy` holds movement rules, `Board` holds board-level legality. Each class has exactly one reason to change."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

- **Shape:** two entity-modeling problems — Tic-Tac-Toe stresses a pluggable board/win-check, Chess stresses per-entity behavior variation.
- **Tic-Tac-Toe classes:** `Board` (generic n×n grid) · `Player` · `WinChecker` (Strategy, e.g. `KInARowChecker(k)`) · `Game` (orchestrates turns).
- **Why WinChecker is a Strategy:** hardcoding win-detection into `Board` breaks Open/Closed the moment board size/win-length changes.
- **Chess trap:** `Pawn extends Piece extends GamePiece...` fails because (a) Queen = Rook + Bishop behavior, single inheritance can't union it, (b) pawn promotion needs a runtime identity change, which inheritance can't do.
- **Chess fix:** flat `Piece` base **has-a** `MoveStrategy` (Strategy pattern) — `LinearMoveStrategy`, `LShapeMoveStrategy`, `PawnMoveStrategy`. New piece = new strategy, zero edits elsewhere.
- **Board responsibility split:** `Board` = grid bounds + blocking + check state; `Piece`/`MoveStrategy` = pure movement geometry.
- **Concurrency (networked backend):** single-turn games are naturally serialized locally, but simultaneous client submissions create a check-then-act race on `turn`/board state → guard with server-authoritative board, per-`gameId` lock or optimistic version stamping, never a global lock.
- **Extensibility:** N-player → array of players + modulo turn advance, no structural change. Check/checkmate → additive `Board.isKingInCheck()` + brute-force simulate-all-moves, reusing existing `isValidMove`.

*— LLD Problem 06 complete —*
