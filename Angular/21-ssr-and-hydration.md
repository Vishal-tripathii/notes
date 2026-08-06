# Angular Study Notes — Part 21

## SSR & Hydration

> **Roadmap:** [Part 21](00-ROADMAP.md) · **Priority:** ⭐⭐☆☆☆ — rarely asked in depth. Know the why, the mechanism, and what breaks.
>
> **Continues:** [Part 01 — Bootstrap](01-angular-architecture-and-bootstrap.md) · [Part 18 — Performance](18-performance.md).

---

## 1. The problem SSR solves

A normal Angular app ships an empty shell:

```html
<body>
  <app-root></app-root>     ← empty until JavaScript downloads, parses and runs
  <script src="main.js">
</body>
```

Two consequences:

```
SLOW FIRST PAINT   the user stares at blank white until the bundle executes
BAD FOR CRAWLERS   a crawler that doesn't run JS sees an empty page
```

**SSR renders the component tree to HTML on the server**, so the first response already contains the page. The user sees content immediately; the crawler sees content at all.

```
CSR   request → empty shell → download JS → run → render      (slow first paint)
SSR   request → server renders HTML → visible NOW → JS arrives → interactive
```

---

## 2. Hydration

Server-rendered HTML is visible but dead — no event listeners, no bindings. **Hydration** is Angular taking over that existing DOM once the JavaScript loads.

```
without hydration    Angular DESTROYS the server HTML and re-renders from scratch
                     → visible flicker, wasted work

with hydration       Angular REUSES the existing DOM, attaches listeners and state
                     → no flicker, much less work
```

```ts
provideClientHydration()
```

That single provider is the difference. Without it, SSR gives you a fast first paint followed by an ugly re-render.

**Incremental hydration** goes further — hydrating a component only when it's needed, pairing with `@defer` triggers so below-the-fold sections stay dormant until scrolled to.

---

## 3. ⭐ What breaks on the server

There is no browser on the server. These are `undefined` and will crash your render:

```
window        document       localStorage     sessionStorage
navigator     setTimeout in some patterns     any direct DOM access
```

```ts
private platformId = inject(PLATFORM_ID);

ngOnInit() {
  if (isPlatformBrowser(this.platformId)) {
    localStorage.getItem('token');      // only runs in the browser
  }
}
```

Also safe: put browser-only work in `afterNextRender()`, which never runs on the server.

⚠️ This is why direct `nativeElement` manipulation is discouraged ([Part 04](04-directives.md)) — `Renderer2` works on both platforms.

---

## 4. The double-fetch problem

Without help, data is fetched twice: once on the server to render, then again in the browser after hydration.

`TransferState` serialises the server's data into the HTML so the client reuses it:

```
server fetches /api/employees  →  renders  →  embeds the JSON in the page
client hydrates  →  reads the embedded JSON  →  NO second request
```

Angular's `HttpClient` does this automatically for SSR when hydration is enabled.

---

## 5. SSR vs SSG vs CSR

```
CSR   render in the browser        dashboards, admin panels — behind a login anyway
SSR   render per request           content that's personalised AND public
SSG   render once at build time    docs, marketing, blogs — fastest possible
```

**When SSR isn't worth it:** an internal tool behind authentication. Nobody crawls it, users load it once and keep it open, and you've added a Node server to operate for no benefit.

---

## 6. Interview Q&A

### Q: Why use SSR?

Two reasons: first paint and SEO. A client-rendered app sends an empty shell, so the user waits for the bundle before seeing anything, and crawlers that don't execute JavaScript see nothing. SSR returns rendered HTML on the first response.

### Q: What is hydration and what problem does it solve?

Server-rendered HTML is visible but has no listeners or bindings. Hydration is Angular adopting that existing DOM instead of destroying and re-rendering it. Without it you get a visible flicker and duplicated work — `provideClientHydration()` is what enables it.

### Q: What breaks when a component renders on the server?

Anything browser-only — `window`, `document`, `localStorage`, direct DOM access. I guard those with `isPlatformBrowser` or move them into `afterNextRender`, which never runs on the server.

### Q: When would you not use SSR?

For an app behind a login. There's no SEO benefit, users load it once, and you've taken on operating a Node server for nothing. SSR is for public, content-heavy pages where first paint matters.

---

## 7. The 60-second summary

> *"A client-rendered Angular app sends an empty shell, so the first paint waits for the JavaScript bundle and crawlers see nothing. SSR renders the component tree to HTML on the server so the first response already contains the page. That HTML is inert though, so hydration lets Angular adopt the existing DOM rather than destroying and re-rendering it — that's `provideClientHydration()`, and without it SSR causes a visible flicker. The catch is that there's no browser on the server, so `window`, `document` and `localStorage` are undefined and need an `isPlatformBrowser` guard or `afterNextRender`. `TransferState` stops data being fetched twice by embedding the server's response in the HTML. And SSR isn't always worth it — behind a login there's no SEO benefit and you've added a Node server to operate."*

---

## Connects to

- **[Part 01 — Bootstrap](01-angular-architecture-and-bootstrap.md):** the SPA model this is fixing.
- **[Part 04 — Directives](04-directives.md):** `@defer` and incremental hydration.
- **[Part 18 — Performance](18-performance.md):** first-paint levers.
- **[Part 22 — Internals](22-angular-internals.md):** `Renderer2` as the platform-safe DOM API.

*— End of Part 21 —*
