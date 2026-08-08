# Git Internals (content-addressed storage)

### "`git diff` between two commits comes back instantly even on a huge repo — is git storing a diff for every commit?"

The common assumption (carried over from older tools like SVN/CVS) is that git stores each commit as a **delta** — the changes relative to the previous version — and diffing is just reading that stored delta back out. That's not how git's core model works, and the real answer is a better interview answer because it explains *why* git is fast, not just *that* it is.

**Git stores whole snapshots, addressed by content hash — not deltas**

Every version of a file's content is stored as a **blob**: the entire file content is hashed (SHA-1 traditionally, SHA-256 in newer repos), and stored under that hash. If a file's content is *byte-identical* across two commits, git doesn't store a second copy at all — the hash is literally the same, so both commits' trees just point at the same existing blob object. Unchanged files across thousands of commits cost essentially nothing extra.

A **commit** points to a **tree** object — think of it as a directory listing: filename → blob hash (or another tree hash, for subdirectories). This forms a **Merkle tree**: a content-addressed tree where any change to a file changes that blob's hash, which changes the tree's hash, which changes every parent tree's hash up to the commit — this is also *why* two commits with even one changed file have completely different commit hashes, and why git can tell two trees are identical in O(1) just by comparing their top-level hash.

**Why `git diff` is fast — most of it isn't actually diffing**

`git diff` between two commits walks both trees and compares blob hashes file by file. For every file where the hash **matches**, git already knows nothing changed — skip it instantly, no text comparison needed at all. Only for files where the hash **differs** does git run an actual line-by-line diff algorithm (Myers diff) to produce the human-readable output. So on a huge repo with one changed file, git isn't diffing the whole repo — it's doing a handful of hash comparisons (cheap) plus one real text diff (the only expensive part, and it's small).

```
Commit A tree: { file1: hashX, file2: hashY, file3: hashZ }
Commit B tree: { file1: hashX, file2: hashY, file3: hashW }   ← only file3 differs
diff: skip file1 (hashX==hashX), skip file2 (hashY==hashY), run Myers diff on file3 only
```

**Where delta compression actually happens — storage, not diffing**

Git *does* use deltas, but only as a storage optimization layer, separate from the conceptual model above: when you run `git gc` or push/fetch, git packs objects into **packfiles**, and within a packfile it may store some blobs as deltas against similar blobs to save disk/network space. This is purely a compression trick applied after the fact — the working model (snapshots, content-addressed, Merkle tree) is what makes diff/merge/branching fast and correct; packing deltas is just about not wasting bytes on disk.

**Merge** builds on the same foundation: a three-way merge finds the common ancestor commit of the two branches, then diffs each branch against that ancestor (same hash-comparison-first mechanism above) — a conflict is when both sides changed overlapping lines of the *same* file since that ancestor.

**Interview line:** *"Git doesn't store diffs per commit — it stores whole-file snapshots as content-addressed blobs, so an unchanged file across many commits is literally the same object, referenced by hash, costing nothing extra. Diffing two commits is mostly comparing tree hashes — unchanged files are skipped in O(1), and only files whose hash actually differs get a real line-by-line diff run. Delta compression does exist, but only inside packfiles for storage efficiency — it's not how the diff/merge model conceptually works."*

**Tests:** content-addressed storage / Merkle trees, why hash comparison beats brute-force diffing, separating the conceptual model from a storage-layer optimization

*Axis: performance · Source: challenge question*

#### Follow-ups

- Two completely different files happen to hash to the same value (a hash collision) — what would break, and why is this treated as essentially a non-issue in practice?
- Why does renaming a file with no content change show up in `git log --follow` as a rename rather than a delete+add, if git doesn't track renames explicitly?
- What does `git gc` actually do to a repo's `.git` folder size, and why would skipping it forever eventually hurt clone/fetch performance?
- How does a shallow clone (`--depth=1`) change what this Merkle-tree structure looks like locally, and what breaks if you later need history beyond that depth?
