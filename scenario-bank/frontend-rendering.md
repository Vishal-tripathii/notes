# Frontend Rendering — Scenario Bank

---

### "SSR vs CSR vs ISR — what are they, why and when would you use each?"

These are **rendering strategies** — different answers to "where does the HTML get built, and when?" ISR only really makes sense once you see it sitting between SSR and SSG, so all four belong together.

| | **CSR** | **SSR** | **SSG** | **ISR** |
|---|---|---|---|---|
| HTML built | In the browser, by JS, after load | On the server, **per request** | On the server, **once, at build time** | Like SSG, but **regenerated on a timer** |
| First paint | Slow (blank → JS loads → fetches → renders) | Fast (server sends real content) | Fastest (static file from CDN) | Fastest (static file from CDN) |
| Freshness | Always fresh (fetches live) | Always fresh (re-renders every request) | Stale until next deploy | Fresh within the revalidate window |
| Server cost | Cheap (just hosts a JS bundle) | Expensive (compute on every request) | Cheapest (no compute after build) | Cheap (compute only on regeneration) |
| SEO | Weak (crawler may not wait for JS) | Strong | Strong | Strong |

**CSR — Client-Side Rendering**
Server sends a near-empty HTML shell + a JS bundle. The browser downloads it, executes it, and *then* renders and fetches data.
Use when: the app is behind a login, SEO doesn't matter, and it's highly interactive — dashboards, admin panels, Figma/Gmail-style apps. Classic SPA.
Cost: blank page → JS parses → data fetches → render. Bad on slow networks/devices, bad for SEO.

**SSR — Server-Side Rendering**
On **every request**, the server fetches the data and renders full HTML, sends it down already populated. The browser then **hydrates** it (attaches event listeners) to make it interactive.
Use when: content is personalized/per-user, must always be current, and still needs to be crawlable — a logged-in dashboard that also needs SEO, live pricing/inventory, a news homepage.
Cost: every single request pays server compute — this is the expensive one to scale.

**SSG — Static Site Generation**
HTML is built **once, at build/deploy time**, then served as a static file straight from a CDN — no per-request compute at all.
Use when: content barely changes — marketing pages, docs, blogs. Fastest and cheapest option, full stop.
Cost: content is frozen until the next deploy. A CMS edit doesn't show up until you rebuild.

**ISR — Incremental Static Regeneration (Next.js)**
The fix for SSG's staleness problem without paying SSR's per-request cost. Pages are statically cached like SSG, but with a **revalidate window** (e.g. `revalidate: 60`). Once that window expires, the *next* request triggers regeneration **in the background** — that request still gets the old (stale) cached page instantly (stale-while-revalidate), and the *following* request gets the freshly rebuilt one.
```js
// Pages Router
export async function getStaticProps() {
  return { props: { data }, revalidate: 60 };
}
// App Router
export const revalidate = 60;
```
Use when: content changes periodically, not per-request — product listings, blog posts, category pages — traffic that would make SSR wastefully expensive, but where a full rebuild-on-every-edit (pure SSG) is too slow to reflect changes.
Escape hatch: on-demand revalidation (`revalidatePath()` / `res.revalidate()`) lets a CMS webhook force a refresh immediately instead of waiting for the timer — used when "eventually fresh within 60s" isn't good enough for a specific edit (e.g. a price correction).

**Decision framework**
- Per-user/personalized + must be crawlable → **SSR**
- Rarely changes, SEO-critical → **SSG**
- Changes periodically, SEO-critical, traffic too high for SSR cost → **ISR**
- Behind login, no SEO need, highly interactive → **CSR**

**Tests:** rendering strategy trade-offs, SEO vs interactivity vs cost, when a hybrid (ISR) beats either extreme

*Axis: performance · Source: real interview*

#### Follow-ups

- **Concurrency:** An ISR page's revalidate window just expired, and 1,000 requests land on it in the same second. Does that trigger 1,000 regenerations?
  → No — the framework/platform dedupes this. Next.js (and Vercel's ISR implementation) holds a single regeneration lock per path: the first request past expiry triggers the one background rebuild, and it still gets served the stale cached page instantly rather than waiting. The other 999 requests just get the same stale page from cache with no lock contention and no dogpile of concurrent rebuilds. Once the single regeneration finishes, the cache swaps and the *next* request after that gets the fresh version. This is the same stampede-prevention shape as a cache-aside "single-flight" pattern.

- **Failure / edge case:** A product page under ISR gets zero traffic for six months. Does it ever go stale-and-fix-itself, or stay stale forever?
  → Stays stale forever. ISR regeneration is **request-triggered, not time-triggered** — the revalidate window only marks the cached page as "eligible to regenerate on next hit," it doesn't schedule a rebuild itself. If nobody requests the page after expiry, nothing regenerates it, no matter how much time passes. That's a real gotcha for low-traffic pages holding time-sensitive data (e.g. pricing). The fix is either on-demand revalidation triggered by the actual data change (a CMS/inventory webhook calling `revalidatePath()`), or a scheduled job that pings low-traffic paths periodically to force a refresh independent of real user traffic.

---
