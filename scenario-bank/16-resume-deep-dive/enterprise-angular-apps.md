# Resume Deep-Dive — Enterprise Angular Applications (NCP & CAP) — Scenario Bank

> Grounded in your NCP & CAP projects (Angular · TypeScript · RxJS · Ionic · Angular Material). Full generic Angular depth already lives in the [`Angular/`](../../Angular/) track — these entries are specifically about *your* project's choices.

---

### "Workflow-driven modules for inspection and assessment — sounds like conditional/dynamic forms. How did you architect that?"

The reasoning framework: an assessment where later questions depend on earlier answers (skip logic, conditionally-shown fields, dynamically-required validators) is meaningfully harder than a static form. In Angular Reactive Forms, this typically means: building the `FormGroup`/`FormArray` structure dynamically based on data (a form schema) rather than hand-writing every control, adding/removing controls at runtime as answers change (`form.addControl()` / `removeControl()`), and validators that need to be conditionally applied or re-evaluated when a *different* field changes (cross-field conditional validation, not just "is this field itself valid").

**Fill in:** Was the assessment structure driven by a data-defined schema (so the same code renders different assessment types), or was each assessment type its own hand-built form? How did conditional required/visible logic actually work — computed signals/observables reacting to other field values, or manual subscription-based logic in the component?

**Interview line (template):** *"[Your actual architecture — e.g. 'assessments are schema-driven — the form structure is built dynamically from a JSON schema per assessment type, and conditional visibility/validation reacts to specific field value changes via [RxJS valueChanges subscriptions / computed signals]' — fill in what you actually built.]"*

**Tests:** dynamic form architecture, conditional validation

*Axis: normal · Source: challenge question*

---

### "Offline photo capture on tablet, queued for later upload — what happens if connectivity drops mid-capture or mid-queue?"

The reasoning framework: this combines the resilient-upload pattern (category 07/13) with the offline-mutation-queue pattern (category 15), specifically for **photos captured on-device before any network call happens at all** — the capture itself always succeeds locally (it's just a camera API call), and the upload is a separate, deferred step. A photo captured offline needs to be persisted locally (not just held in memory, which would be lost if the app is closed/killed before connectivity returns) and queued for upload the same way any other offline mutation would be — including surviving an app restart, and eventually retrying with backoff once connectivity returns.

**Fill in:** Where do captured-but-not-yet-uploaded photos actually live before upload — local device storage plus a queue record, or something else? What happens if the user captures 20 photos offline, then the app is force-closed before any sync — are they still there on next launch?

**Interview line (template):** *"[Your actual mechanism — e.g. 'a captured photo is written to local device storage immediately and a queue entry created referencing it, so it survives an app restart even before any network call has happened; the queue drains with retry-with-backoff once connectivity returns' — fill in what you actually built and whether it was tested against a force-close mid-queue.]"*

**Tests:** offline media capture + queued upload, crash/restart safety

*Axis: failure · Source: challenge question*

---

### "BehaviorSubject-based state — would you migrate this app to signals now? What would actually change?"

The reasoning framework: `BehaviorSubject` (RxJS) and Angular signals solve overlapping problems (holding and reacting to changing state) but with real differences — signals integrate directly with Angular's change detection (a signal read in a template automatically triggers fine-grained updates without needing the `async` pipe or manual subscription management), and `computed()` gives lazy, memoized derived state without the mental overhead of RxJS operator chains (`combineLatest`, `map`, etc.) for simple derivations. The honest trade-off going the other way: RxJS's operator ecosystem (`switchMap`, `debounceTime`, `retry`, and the rest) is still far more powerful for genuinely asynchronous, event-stream-shaped problems (a type-ahead search, WebSocket streams) than signals alone — signals aren't a full RxJS replacement, they're a better fit specifically for **synchronous, template-bound state**.

**Fill in:** Where in NCP/CAP would migrating to signals genuinely simplify things (probably: simple UI state currently modeled as a `BehaviorSubject` purely for template binding)? Where would you deliberately keep RxJS (probably: anything actually asynchronous — HTTP calls, search-as-you-type, real-time data)?

**Interview line (template):** *"I'd migrate state that's purely synchronous UI state and only used for template binding — that's what signals are actually built for, and it removes the async-pipe/subscription-management overhead. I'd keep RxJS for anything genuinely asynchronous or event-stream-shaped, like [your examples — HTTP flows, search debouncing] — signals aren't a full RxJS replacement, they solve a narrower, more common problem well."*

**Tests:** signals vs RxJS, honest migration judgment

*Axis: normal · Source: challenge question*

---

### "Ionic bridging native device features — what actually breaks between iOS and Android?"

The reasoning framework: Ionic apps typically use **Capacitor** (or the older Cordova) to bridge web code to native device APIs (camera, GPS, filesystem) — but "bridged" doesn't mean "identical behavior everywhere." Real, common friction points: **permission prompts** differ in timing/wording/flow between iOS and Android (and each OS version can change this), camera/gallery plugin behavior can differ in returned image format or orientation metadata (a classic bug: photos appearing sideways on one platform due to EXIF orientation handling differences), and platform-specific build/signing configuration is a genuinely different process per platform, not just a flag flip.

**Fill in:** What specific native-bridging issue actually bit you in this project — camera permission handling, image orientation, GPS accuracy/permission differences, something else? How did you handle a permission denial gracefully (the user says no to camera access) rather than the feature just silently failing?

**Interview line (template):** *"[Your actual experience — e.g. 'the recurring issue was image orientation metadata differing between platforms after camera capture, which needed explicit EXIF handling before display' or 'permission denial needed an explicit fallback UI rather than letting the capture flow silently fail' — fill in your real war story here, since this is exactly the kind of specific detail that signals real hands-on experience.]"*

**Tests:** cross-platform native bridging, honest specific war stories

*Axis: failure · Source: challenge question*

---
