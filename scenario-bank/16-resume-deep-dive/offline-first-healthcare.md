# Resume Deep-Dive — Offline-First Healthcare Platform (AMDHA) — Scenario Bank

> Grounded in your AMDHA project (Flutter · Node.js · Express.js · MongoDB · RealmDB). Frameworks for you to fill in with your actual decisions.

---

### "What does 'trigger-based synchronization' mean concretely in your RealmDB setup?"

The reasoning framework: "trigger-based" implies sync isn't purely time-interval polling ("check every 30 seconds") — it fires in response to specific **events**: connectivity being restored, a local write happening, the app coming to the foreground, or an explicit user action. This matters because a well-designed trigger set means sync happens **promptly** when it can (rather than waiting up to a full polling interval after connectivity returns) without wastefully polling when there's nothing to sync and no connection anyway.

**Fill in:** What are your actual triggers — connectivity change, app foreground, a specific local write, a timer, some combination? What happens if a trigger fires but a sync is already in progress — does it queue, get dropped, or run concurrently (and if concurrently, how do you avoid two syncs racing on the same records)?

**Interview line (template):** *"Sync is triggered by [your actual events — e.g. connectivity restoration, app foreground, explicit local writes] rather than pure polling, so it happens promptly when there's actually something to sync. [Your handling of overlapping trigger fires — e.g. a sync-in-progress flag that queues or ignores a redundant trigger.]"*

**Tests:** event-driven sync design, avoiding redundant/overlapping syncs

*Axis: normal · Source: challenge question*

---

### "How does Realm's built-in conflict resolution work — did you need custom resolution on top of it?"

The reasoning framework: Realm's sync (Atlas Device Sync) uses **operational transformation**-style conflict resolution under the hood for its built-in sync — it merges concurrent operations at a fairly fine-grained level automatically for many common cases (e.g. two different fields changed concurrently merge cleanly), which is more sophisticated than naive last-write-wins. But automatic merging has real limits: it can't know your *business* rules — e.g. two conflicting updates to the *same* field, or a domain-specific rule like "a patient's diagnosis shouldn't be silently overwritten, it should be flagged for review" — cases where the "technically correct" merge isn't necessarily the *medically/operationally correct* one.

**Fill in:** Did you rely fully on Realm's built-in merge behavior, or did specific fields/entities need custom conflict handling on top of it (e.g. flagging same-field diagnosis conflicts for manual review rather than auto-merging)? Any real incident where the built-in behavior wasn't sufficient?

**Interview line (template):** *"Realm's built-in sync handles a lot of conflict merging automatically at a fine-grained level, better than plain last-write-wins. [Your actual answer — where you relied on that vs. built custom handling, e.g. for same-field clinical data conflicts that needed explicit review rather than silent auto-merge.]"*

**Tests:** Realm sync internals, when automatic conflict resolution isn't enough

*Axis: consistency · Source: challenge question*

---

### "OCR cut registration time ~50% — what happens when extraction is wrong or low-confidence, offline, with no server model to double-check?"

The reasoning framework: an offline OCR model has no fallback to a larger, more accurate server-side model in the moment — so the system has to handle its own uncertainty locally. Good practice: surface **confidence** to the user rather than silently accepting whatever the model extracted (e.g. highlighting a low-confidence field for the registering staff to visually verify against the physical document before submitting), rather than treating every extraction as ground truth. This is a direct trust/automation trade-off — full auto-accept is faster but risk-prone for wrong data entering a healthcare record; forcing manual review of every field defeats the whole point of OCR's speed benefit.

**Fill in:** Does your OCR pipeline expose confidence scores per extracted field? Is there a manual review/confirmation step before data is committed, and did that review requirement change based on confidence?

**Interview line (template):** *"[Your actual design — e.g. 'the OCR pipeline surfaces per-field confidence, and low-confidence fields are visually flagged for the registering staff to verify against the physical document before submitting, while high-confidence fields can be accepted with a lighter review' — this is the trust/speed trade-off that actually delivered the 50% time reduction without blindly trusting every extraction.]"*

**Tests:** ML confidence handling, human-in-the-loop design for healthcare data

*Axis: failure · Source: challenge question*

---

### "Multi-tenant AND offline-first together — how do you scope Realm's local data per-tenant on a shared device?"

The reasoning framework: this genuinely compounds both problems at once. If the same tablet is used across multiple facilities (tenants) — e.g. a traveling health worker, or a shared device at a multi-facility site — the **local** database on that device needs the same tenant-isolation discipline as the server (category 14), but now enforced entirely on-device, offline, with no server to fall back on for the isolation check. A local Realm instance scoped to the wrong tenant, or a sync that pulls Tenant B's data down onto a device currently logged in as Tenant A, would be a direct cross-tenant leak — the flagship multi-tenancy scenario, but now happening on a device that might not even have connectivity to detect or fix it quickly.

**Fill in:** Is there one shared local Realm database per device with a tenant filter applied to queries, or a genuinely separate local database/realm-file per tenant? What happens if a user switches tenant context on the same device — does old tenant data get cleared, or does it persist locally (a real risk if the device is later used by someone from a different tenant)?

**Interview line (template):** *"[Your actual design — e.g. 'each tenant gets its own local Realm file on the device, so there's no shared local store for a missing filter to leak across, and switching tenant context on the same device means opening a different Realm file entirely, not filtering within one' — or an honest description of what you actually built and its current limitations.]"*

**Tests:** multi-tenancy + offline-first combined, on-device isolation

*Axis: failure · Source: challenge question*

---

### "Patient data sitting on a device that could be lost or stolen — how does that change your offline-first design?"

The reasoning framework: for a non-healthcare offline app, a lost device mostly risks inconvenience or, at worst, business data exposure. For healthcare, it's **PHI (protected health information)** — a lost/stolen device with unencrypted local patient data is a real compliance and patient-privacy incident, not just a bug. This pushes offline-first design toward: **encryption at rest** for the local database (Realm supports local encryption), device-level protections (requiring a PIN/biometric before the app's local data is accessible), and minimizing what's actually cached locally to what's operationally necessary rather than a full copy of everything, so a compromised device exposes less.

**Fill in:** Is the local Realm database encrypted at rest? Is there a remote-wipe or session-expiry mechanism if a device is reported lost? Were there specific compliance requirements (HIPAA-equivalent, or a regional equivalent) that shaped these decisions?

**Interview line (template):** *"[Your actual measures — e.g. 'the local Realm store is encrypted at rest, access requires device-level authentication, and we scope what's cached locally to what's operationally necessary rather than mirroring the entire patient database onto every device' — fill in what was actually implemented and what compliance framework drove it, if any.]"*

**Tests:** healthcare data security, offline-first risk under real stakes

*Axis: failure · Source: challenge question*

---

### "Diagnosis validation offline — what if it references a reference dataset (e.g. ICD-10 codes) not fully available on-device?"

The reasoning framework: some validation is purely local (a required field is empty, a date is malformed) and works fine fully offline. But validation that depends on an external reference set — checking a diagnosis code against the full ICD-10 catalog, or checking a rule that depends on server-computed state — can't be fully verified offline unless that reference data itself is synced down to the device in advance. The design choice: either **bundle/sync a local copy of the reference dataset** onto the device (so offline validation can be fully correct), or **defer strict validation** for anything that needs server data until connectivity returns (accepting a "provisionally valid" local entry that gets properly validated on sync, flagging it if it turns out to be wrong).

**Fill in:** Did diagnosis/reference-data validation happen fully offline against a locally-synced reference set, or was some validation deferred until reconnection? What happened when a deferred validation failed after the fact — did the healthcare worker get notified?

**Interview line (template):** *"[Your actual approach — e.g. 'reference data like diagnosis codes is synced to the device so validation is fully correct offline, not deferred' — or 'some validation is provisional offline and confirmed on sync, with the worker notified if a provisional entry turns out invalid.']"*

**Tests:** offline validation against external reference data

*Axis: consistency · Source: challenge question*

---
