# Real-Time Video Conferencing (Zoom/Meet architecture)

### "How does Zoom handle a 20-person video call without every participant sending video to every other participant?"

Naively, if every participant streams video directly to every other participant (full mesh, peer-to-peer), that's N×(N-1) video streams total, and each client would need to **upload** N-1 copies of its own video simultaneously — a single laptop's upload bandwidth collapses well before N gets anywhere near 20. Something in the middle has to exist. There are two classic architectures:

**MCU (Multipoint Control Unit) — the old approach**

A central server **decodes every incoming stream, composites them into a single mixed video** (like a picture-in-picture grid baked into one frame), and sends **one output stream** to each participant. Clients stay simple (one stream in, one stream out), but the server does enormous CPU work — decode N streams, composite, re-encode N times (once per participant's desired layout) — and that compute cost scales badly and isn't very flexible (want a different layout per viewer? re-encode again).

**SFU (Selective Forwarding Unit) — what Zoom/Meet/Teams actually use**

The server does **not** decode or re-encode anything. Each client encodes and uploads **one** stream (its own video). The SFU's job is purely to **forward** — relay each participant's already-encoded stream to whichever other participants want to see it, untouched. This turns a CPU-bound transcoding problem into an I/O-bound routing problem, which scales to vastly more participants and lower server cost.

```
MCU:  A,B,C ──encode──▶ [Server: decode ALL + composite + re-encode] ──▶ one mixed stream ──▶ A,B,C
SFU:  A,B,C ──encode──▶ [Server: just forwards, untouched]           ──▶ each gets the raw streams it needs
```

The trade-off flips to the client: now each participant **downloads** N-1 separate streams instead of one composited one — so client-side download bandwidth becomes the real constraint, especially on a big call.

**How SFU-based systems manage that download cost — simulcast**

Each client doesn't just send one quality of its own video — it encodes and uploads **multiple resolutions simultaneously** (e.g. 180p/360p/720p, called *simulcast*). The SFU then picks which resolution to forward to each recipient based on that recipient's available bandwidth and how large that video tile actually is on their screen — the small thumbnail of someone in gallery view gets the 180p version, the active speaker's big tile gets 720p. This is also how a call gracefully degrades for someone on bad wifi without forcing everyone else down to their level.

**Active speaker detection** — the server (or a client-reported signal) tracks audio energy per participant to decide who's currently speaking, which drives layout decisions (who gets the big tile) and can be used to only forward the top-K loudest streams at full resolution in a very large call, dropping the rest to audio-only or a static thumbnail.

**Interview line:** *"Zoom uses an SFU, not an MCU — the server just forwards each participant's already-encoded stream instead of decoding and re-mixing everyone into one composite, which turns an expensive CPU transcoding job into a cheap routing job. The trade-off shifts bandwidth cost to the client's download side, which is managed with simulcast — each client uploads multiple resolutions, and the SFU forwards whichever resolution fits each recipient's bandwidth and tile size."*

**Tests:** trade-off between server compute cost and client bandwidth cost, why routing beats transcoding at scale, adaptive quality delivery

*Axis: scale · Source: challenge question*

#### Follow-ups

- What happens when one participant's upload bandwidth suddenly drops mid-call — how does the SFU keep the rest of the call smooth for everyone else?
- Why is audio handled differently from video in most of these systems (often actually mixed server-side, unlike video)?
- How would you scale an SFU itself across multiple servers/regions for a call with 500+ participants (webinar mode)?
- What's the latency cost of the SFU hop, and why is that acceptable for a group call but not for something like competitive gaming?
