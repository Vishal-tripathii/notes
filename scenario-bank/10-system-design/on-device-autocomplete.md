# On-Device Autocomplete & Spellcheck

### "Your phone keyboard suggests the next word or corrects a typo instantly, with no visible lag — is that hitting a server on every keystroke?"

No — and it can't be, for three reasons that are worth stating explicitly in an interview: a network round-trip on every keystroke would be too slow (tens to hundreds of ms, felt as lag), too battery-draining (radio wakeups are expensive), and it would break entirely offline (airplane mode, no signal). The whole design constraint is: **this has to run entirely on-device.**

**The data structure: a trie, same one as HLD/LLD search autocomplete**

Keyboard apps ship a compact local dictionary as a **trie** (prefix tree) — each node represents one character, and a path from the root spells out a prefix. As you type, the keyboard walks the trie one character at a time, which narrows the candidate set in time proportional to the length of what you've typed so far, not the size of the whole dictionary. This is the identical mechanism behind the "search autocomplete" system-design problem — same data structure, just running locally instead of behind a server API.

**The ranking: a local language model, not a network call**

Narrowing candidates by prefix isn't enough — "the" could complete to thousands of words. A compact on-device model (historically an n-gram frequency table, increasingly a small on-device neural model) ranks candidates using recent context — the last word or two you typed — entirely from data already resident on the phone. No network call, no latency beyond local memory access.

**Personalization without sending your typing to a server**

Your keyboard learns your slang, names, and habits by updating **local** frequency tables as you type and confirm words — this stays entirely on-device. The more advanced version of this idea is **federated learning**: instead of raw text ever leaving your phone, only *model update* deltas (learned from your local data) are sent and aggregated across millions of devices to improve the shared base model, without any individual's actual typed text being visible to the server. This is a genuine privacy-by-architecture pattern, not just a policy promise.

**Spellcheck is a variant of the same lookup**

Instead of walking the trie strictly by prefix, spellcheck generates candidates within a small **edit distance** (Levenshtein distance, usually 1–2 edits: insert/delete/substitute/transpose) of what you typed, filtered against the dictionary trie, then ranks them — often weighted by **keyboard layout proximity** (a "typo" that swaps two adjacent keys is treated as more likely than a random substitution, because that's how real typos actually happen).

```
You type: "hel"
Trie walk: h → e → l  (narrows to all words starting "hel": hello, help, helicopter...)
Local LM ranks by: recent context + your personal frequency history
Spellcheck (if "hwllo"): edit-distance search near dictionary entries → "hello" (1 substitution, adjacent key)
```

**Interview line:** *"It's entirely on-device — a network call per keystroke would be too slow, too battery-draining, and wouldn't work offline. The keyboard walks a local prefix trie to narrow candidates by what you've typed, then a small local language model ranks them by recent context, all without touching the network. Personalization happens via local frequency updates, and the more advanced version — federated learning — aggregates model improvements across devices without any individual's raw text ever leaving the phone. Spellcheck is the same trie, searched by edit distance instead of strict prefix, weighted by keyboard-adjacency to model real typo patterns."*

**Tests:** on-device vs server trade-offs (latency/battery/offline), trie-based prefix search, privacy-preserving personalization (federated learning), edit-distance-based fuzzy matching

*Axis: performance · Source: challenge question*

#### Follow-ups

- How does the keyboard decide when to periodically sync/update its local model without that sync itself causing noticeable lag or battery drain?
- What happens to autocomplete quality right after you switch languages or start typing a proper noun the trie has never seen?
- Why is edit-distance-based fuzzy search alone not enough for spellcheck at the start of a word vs. the middle — what changes about likely error patterns?
- How would you extend this design to a physical keyboard with no swipe-typing signal, versus a touchscreen keyboard where the *tap coordinates* themselves carry useful fuzzy-input information?
