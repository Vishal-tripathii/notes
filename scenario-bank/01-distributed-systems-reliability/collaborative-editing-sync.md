# Collaborative Editing Sync (Google Docs / Figma-style)

### "Two people are typing in the same paragraph of a Google Doc at the same time. How does that not corrupt the document or silently drop one person's keystrokes?"

The core problem: both people start from the **same document state**, both send an edit, and naive "last write wins" would just throw one person's changes away. Google Docs (and most real-time collaborative editors) solve this with **Operational Transformation (OT)** — the technique Docs was actually built on (Google acquired Writely, which pioneered it in the browser).

**The mechanism, step by step:**

1. Every edit is expressed as an **operation**, not a snapshot — e.g. `insert("hello", position=12)` or `delete(position=5, length=3)`, not "here's my new paragraph."
2. Each client applies its own operation **locally and immediately** (so typing feels instant — zero round-trip latency), then sends the operation to a central server.
3. The server holds the **canonical order** of operations. When two operations arrive that were both based on the same prior state (a concurrent edit), the server **transforms** the second one against the first before applying it — adjusting its position so it still makes sense. E.g. if Op A inserts 5 characters at position 10, and Op B (written concurrently, unaware of A) deletes at position 12, the server shifts B's position by +5 before applying it, so it deletes the *same intended characters*, not whatever now sits at raw position 12.
4. The transformed operation is broadcast back to every other connected client, which applies it locally.
5. Because everyone applies the same *sequence* of transformed operations, all clients converge to the **same final document state** — this convergence guarantee is the whole point of OT.

```
Client A: insert("XY", pos=10)  ──┐
                                    ├──> Server (orders + transforms) ──> broadcasts to both
Client B: delete(pos=12, len=3) ──┘
```

**Why a central server (not fully peer-to-peer):** OT's transform functions are notoriously hard to get right for arbitrary concurrent ops (rich text formatting makes it worse) — having one authority decide the order sidesteps a lot of that complexity. It's also why Docs shows that small "saving..."/offline indicator and can briefly diverge if your connection drops — you keep editing locally, and once reconnected, your queued operations get transformed against everything that happened while you were gone.

**The modern alternative worth knowing: CRDTs** (Conflict-free Replicated Data Types) — used by Figma, Notion's newer sync layers. Instead of transforming operations against each other, every character/element gets a globally unique, order-preserving ID, and merging is a mathematically commutative operation — any order of applying updates converges to the same state, without needing a central authority to sequence them. This is what makes true peer-to-peer / offline-first collaboration easier, at the cost of higher memory overhead (metadata per character) and messier deletion (tombstones).

| | OT | CRDT |
|---|---|---|
| Needs central server to sequence ops? | Yes (typically) | No — mergeable in any order |
| Used by | Google Docs | Figma, Notion (sync layer) |
| Cost | Complex transform functions per op type | Per-character metadata overhead |
| Offline-friendly | Harder | Natural fit |

**Interview line:** *"Google Docs uses Operational Transformation — edits are sent as operations, not snapshots, and a central server transforms concurrent operations against each other so every client converges to the same state. CRDTs are the newer alternative — used by Figma — where every element gets a globally ordered ID so merges are commutative and don't need a central sequencer, which makes offline/peer-to-peer collaboration easier at the cost of per-character metadata overhead."*

**Tests:** conflict resolution under concurrent writes, operation-based vs state-based sync, why centralization simplifies correctness, offline/reconnect reconciliation

*Axis: concurrency · Source: challenge question*

#### Follow-ups

- What happens if the server crashes mid-broadcast — after transforming Op B but before every client received it?
- How does **undo** work, given it has to be expressed as an operation too, and other people may have edited the document since?
- What happens when Client A goes offline for 10 minutes, keeps typing, then reconnects — how large a batch of operations gets transformed at once, and can that ever fail to converge?
- How would you extend this to rich text (bold/italic spans), where an insert can land *inside* a formatting range another user is concurrently removing?
- Why is CRDT metadata overhead per-character a real cost at scale — what does that do to a very long, heavily-edited document over its lifetime?
