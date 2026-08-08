# LLD Problem 12 — Snake & Ladder (bonus)

> Worked end-to-end using the LLD Problem-Solving Framework (../04-lld-problem-solving-framework.md). Lower priority — a quick warm-up problem, not a common flagship ask, useful for drilling the framework fast.

---

## Table of Contents

1. [Requirements & Scope](#requirements)
2. [Class Design](#design)
3. [Core Code](#code)
4. [Multi-Player Extensibility](#extensibility)
5. [Interview Q&A](#interview)
6. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements & Scope *(Framework Steps 1-2)*

**Functional:**
1. Standard 10x10 board, cells numbered 1–100.
2. 2+ players take turns rolling a single die (1–6) and moving forward that many cells.
3. Landing on a **snake's head** sends the player down to its tail; landing on a **ladder's base** sends them up to its top.
4. First player to land exactly on (or past, depending on house rule) cell 100 wins.

**Non-functional:**
- Board configuration (snake/ladder positions, board size) should be data, not hardcoded logic — an interviewer follow-up is almost always "what if the board is 15x15 with different snakes."
- Turn order must generalize past exactly 2 players (see §4).

**Actors:** `Player` (N of them, alternating), `Board` (fixed size + snake/ladder positions), `Dice`, and a `Game` orchestrating turns.

> Small state space, single-threaded turn order — this problem exists to drill Steps 1–8 of the framework fast, not to teach a new pattern. The one genuine design decision is how snakes/ladders are represented (§2).

---

<a name="design"></a>
# 2. Class Design *(Framework Steps 3-6)*

**Nouns → classes:**
- `Board` — `size` (default 100) + a jump table for snakes and ladders.
- `Player` — `name`, current `position` (starts at 0, off-board).
- `Dice` — `roll()` returns a random int in `[1, 6]`.
- `Game` — owns `Board`, `Player[]`, a turn index/queue, and runs `playTurn()`.

**Snakes/ladders as a jump table — `Map<position, position>`:**

```
snakesAndLadders = {
  16: 6,    // snake: head 16 → tail 6
  47: 26,   // snake
  1: 38,    // ladder: base 1 → top 38
  8: 30,    // ladder
  ...
}
```

After every dice move, look up the landed cell in this single map: if present, the player's position immediately becomes the mapped value (no distinction needed in code between "snake" and "ladder" — both are just "you're actually somewhere else now"). One `Map` unifies both concepts because from the mover's perspective they're identical: *land here, get relocated there.*

**Why a hashmap beats a linked/graph traversal here:**
- A snake or ladder is a single, direct, non-chained jump — cell 16 always resolves straight to cell 6, it never passes through intermediate cells or triggers another jump on the way (no snake leads into another snake). There's no traversal to do — it's a **pure key lookup**, exactly what a hashmap is for.
- A linked-list/graph model (each cell pointing to a "next" cell, walked step by step) would imply a chain to traverse, adding O(chain length) work and opening the door to bugs like accidental cycles (a ladder feeding into a snake feeding into another ladder) — a real rule ambiguity you don't want your data structure to even permit.
- Lookup is **O(1)** either way it's needed: "did I land on a jump point" (`map.has(pos)`) and "where do I go" (`map.get(pos)`) — both single hashmap operations, versus O(n) if snakes/ladders were stored as a list to scan.
- It also keeps validation trivial: constructing the `Board` can assert no cell appears as both a key and elsewhere as a different key's value in a way that creates a cycle, or that no two snakes/ladders share a head/base — checks that are awkward to express over a linked traversal but natural over a flat map.

**Relationships:** `Game` **has-a** `Board`, **has-a** `Dice`, **has-many** `Player` (composition throughout — no inheritance anywhere in this problem, deliberately; it's a good sign when a problem doesn't need one).

---

<a name="code"></a>
# 3. Core Code

```javascript
class Dice {
  roll() {
    return Math.floor(Math.random() * 6) + 1; // 1..6
  }
}

class Board {
  constructor(size = 100, jumps = {}) {
    this.size = size;
    this.jumps = new Map(Object.entries(jumps).map(([k, v]) => [Number(k), v]));
  }

  // Resolve a landed position through any snake/ladder — O(1) lookup.
  resolve(position) {
    return this.jumps.has(position) ? this.jumps.get(position) : position;
  }
}

class Player {
  constructor(name) {
    this.name = name;
    this.position = 0; // off-board; board cells are 1..size
  }
}

class Game {
  constructor(players, board = new Board(), dice = new Dice()) {
    this.players = players;   // Player[]
    this.board = board;
    this.dice = dice;
    this.turn = 0;
    this.winner = null;
  }

  playTurn() {
    if (this.winner) throw new Error("Game already over");

    const player = this.players[this.turn];
    const roll = this.dice.roll();
    let next = player.position + roll;

    if (next > this.board.size) {
      // overshoot — stay put (common house rule); alternative: bounce back
      next = player.position;
    } else {
      next = this.board.resolve(next); // apply snake/ladder jump, if any
    }
    player.position = next;

    if (player.position === this.board.size) {
      this.winner = player;
      return { status: "WIN", winner: player.name, roll };
    }

    this.turn = (this.turn + 1) % this.players.length; // advance to next player
    return { status: "CONTINUE", player: player.name, roll, position: next };
  }
}
```

---

<a name="extensibility"></a>
# 4. Multi-Player Extensibility *(Framework Step 9)*

- `Game.players` is already an array and `Game.turn` already advances via `(turn + 1) % players.length` — going from 2 to N players is a **zero-line change**, it was designed that way from the start rather than bolted on. This is the payoff of not hardcoding `player1`/`player2` as named fields.
- **Turn order variants** an interviewer might ask for: skip-a-turn power cells, a player who rolls three 6's in a row forfeiting their turn, or reordering players by some rule — all of these are naturally expressed as extra logic inside `playTurn()` or as a small pluggable `TurnRule` hook, without touching `Board`, `Dice`, or `Player`.
- **Bigger/custom boards:** `Board.size` and `Board.jumps` are both constructor params, not constants — a 15x15 board with a different snake/ladder layout is just a different `Board` instance, same `Game` code.
- **Eliminating players** (e.g. a variant where landing on another player's exact cell sends them back to start): would add a `Map<position, Player[]>` occupancy check inside `playTurn()` — additive, doesn't disturb the jump-table design.

---

<a name="interview"></a>
# 5. Interview Q&A

### Q: "How do you model snakes and ladders in your board?"
> *"A single `Map<position, position>` — the cell you land on maps directly to where you actually end up. Snakes and ladders are the same concept from the mover's perspective, just opposite direction, so I don't need separate classes or logic for them — one lookup after every move covers both."*

### Q: "Why a hashmap instead of, say, a linked structure between cells?"
> *"A jump is always a single direct hop — cell 16 always resolves straight to cell 6, there's no chain to walk and no intermediate cells involved. That's a pure key lookup, which is exactly what a hashmap gives you at O(1), both for 'did I land on something' and 'where do I actually go.' A linked/graph traversal would imply stepping through a chain, which adds unnecessary work and risks an ambiguous rule like a ladder feeding straight into a snake."*

### Q: "How would you extend this to more than 2 players?"
> *"It already supports it — `players` is an array and the turn index advances with modulo, so N players falls out of the same code path as 2. That's a design choice, not a coincidence: I didn't hardcode named `player1`/`player2` fields specifically so this follow-up wouldn't force a rewrite."*

### Q: "What happens on a dice roll that would overshoot cell 100?"
> *"I treat it as a no-op — the player stays put and forfeits that roll, which is the common house rule. I'd flag the alternative 'bounce back' rule (moving backward from 100 by the overshoot amount) as a one-line change in `playTurn()`, since the position math is already isolated there."*

---

<a name="cheatsheet"></a>
# 6. Cheat Sheet

- **Shape:** small state space, turn-based, no concurrency or inheritance concerns — a framework speed-drill.
- **Classes:** `Board` (size + jump table) · `Player` (name + position) · `Dice` (roll 1-6) · `Game` (orchestrates turns).
- **Key design decision:** snakes/ladders unified as one `Map<position, position>` — O(1) lookup, no traversal, no separate snake/ladder logic.
- **Why hashmap > linked traversal:** jumps are single direct hops, not chains — a map is the natural fit; a linked model implies stepping through intermediate links that don't exist in the rules.
- **Core loop:** `playTurn()` = roll → add to position → resolve through jump table → check win → advance turn (modulo players.length).
- **Extensibility:** N-player support is free (array + modulo turn advance); custom board size/layout is just different constructor args, not new code.

*— LLD Problem 12 complete —*
