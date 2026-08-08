# Resume Deep-Dive — AI Assistant Platform (JULES) — Scenario Bank

> Grounded in your JULES project (React · SWR · Zustand · Material UI · Python · Amazon Bedrock).

---

### "How is Bedrock-based semantic search architected differently from your own self-hosted RAG platform?"

The reasoning framework: your own RAG platform is **self-hosted/self-managed** — you chose the embedding model (FastEmbed/BAAI/bge-small-en-v1.5), run and scale Qdrant yourself, and control every step of the pipeline directly. Amazon Bedrock is a **managed** service — it provides embedding models and (depending on what you used) retrieval infrastructure as an API, trading direct control and potential cost-at-scale efficiency for far less operational overhead (no self-hosted vector DB to run, patch, and scale yourself) and faster integration. This is a genuinely good comparison to be able to speak to directly, since you've now built both versions of the same underlying pattern.

**Fill in:** Which specific Bedrock capability did you use — embeddings only, or a managed retrieval/knowledge-base feature? What would it take to migrate JULES's search from Bedrock to a self-hosted setup like your RAG platform, or vice versa — what's actually portable between them (the pattern) versus vendor-specific (the API)?

**Interview line (template):** *"[Your actual comparison — e.g. 'Bedrock gave us managed embeddings and retrieval without operating our own vector database, which was the right trade-off for JULES's timeline, whereas the RAG platform's self-hosted Qdrant setup gives full control over indexing and model choice, which mattered more there because Y.' Fill in what actually drove each project's choice.]"*

**Tests:** managed vs self-hosted AI infrastructure, cross-project comparison

*Axis: normal · Source: challenge question*

---

### "Why Zustand and SWR together — where's the actual boundary between what each owns?"

This is the exact server-state-vs-client-state distinction already saved in [`06-frontend-architecture/state-management.md`](../06-frontend-architecture/state-management.md) — now answerable with your own project as the concrete example instead of a generic one. **SWR** should own **server state** — data that actually lives on the backend and can go stale (fetched data, cached with automatic revalidation/deduplication). **Zustand** should own **client state** — state that's genuinely local to the app's UI and doesn't correspond to anything on a server (open/closed panels, form-in-progress state, UI preferences, maybe auth/session state held client-side).

**Fill in:** In JULES specifically, what actually lives in each? Was there ever a case where the boundary got blurry — something that felt like it could go in either, and how did you decide? (A common real blur: should "currently selected item" live in Zustand as UI state, or does it need to trigger an SWR fetch, making it feel like both?)

**Interview line (template):** *"SWR owns anything that's actually server data — [your examples: fetched conversation history, search results, etc.] — with its caching and revalidation. Zustand owns genuinely local UI state — [your examples]. [Your specific answer for any case where the line wasn't obvious.]"*

**Tests:** server state vs client state, applied to a real project

*Axis: normal · Source: challenge question*

---

### "WCAG-compliant accessibility and keyboard navigation — what did that actually require, concretely?"

The reasoning framework: "WCAG-compliant" and "keyboard navigation" sound like checkbox requirements but each implies specific, concrete engineering work: every interactive element reachable and operable via keyboard alone (tab order that makes sense, no keyboard traps, visible focus indicators — easy to accidentally break with custom-styled components that remove the browser's default focus outline without replacing it), proper semantic HTML/ARIA roles so screen readers announce components correctly (a custom modal, dropdown, or data table built from generic `div`s needs explicit ARIA roles/labels that a native `<select>` or `<dialog>` would get for free), sufficient color contrast, and correctly labeled form inputs.

**Fill in:** What specific components needed the most work to get right — likely candidates given your resume: modals (focus trapping — keyboard focus shouldn't escape an open modal to the page behind it), data tables (keyboard navigation between cells/rows), custom form components built on Material UI. Did you use an automated accessibility checker (axe, Lighthouse) as part of the workflow, or was this manual review?

**Interview line (template):** *"[Your actual specifics — e.g. 'the biggest work was focus management in modals — trapping focus while open and restoring it to the triggering element on close — and making sure custom Material UI-based components exposed correct ARIA roles rather than relying on generic divs.' Name the tooling you used to verify, if any.]"*

**Tests:** concrete accessibility engineering, not just the buzzword

*Axis: normal · Source: challenge question*

---
