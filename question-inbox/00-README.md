# Question Inbox

> Drop zone. When you hit a question you didn't have a ready answer for — in a real interview, self-study, wherever — write it in [`INBOX.md`](INBOX.md), raw, right then. No formatting effort, no deciding where it belongs yet.

## Why a separate place instead of filing it directly

Filing something properly (is this a scenario-bank entry? a fundamentals-bank gap? does it already exist somewhere and just needs a link?) takes a beat of thinking. That beat is exactly what causes a question to get forgotten between "I got asked this" and "I have five minutes to write it down." This folder removes the beat — just capture it here, triage later.

## How to add one

Append a line to `INBOX.md`:

```md
- [ ] "<the question, as close to verbatim as you can>" — <where it came from: real interview / self-study / JD prep> — <optional: one line of context, e.g. what you answered, what you weren't sure about>
```

## How it gets triaged

Periodically (or whenever you're going through it with me), each unchecked line gets looked at and routed:

- Already answered somewhere in the repo → note the link here, check it off, done.
- "You have X, something happens" shape, worth real teaching → becomes a [scenario-bank](../scenario-bank/) entry, per that folder's teach-first-then-agree workflow.
- "What is X / X vs Y" shape, no home yet → becomes a [fundamentals-bank](../fundamentals-bank/) entry.
- Belongs in an existing topic track (Node/React/Angular/database/System-design) → gets added there directly.

Checked-off lines can be deleted once triaged — this file is a queue, not an archive.
