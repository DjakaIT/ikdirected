# SPEC — what we are building

Every acceptance criterion has an ID. Tests must carry the ID in their title.

## 1. People and jobs

| Who | Job to be done | Where |
|---|---|---|
| Couple / event client (visitor) | "Show me her best work, then let me find weddings like mine, then contact her." | public site |
| Search engines + AI assistants | "Understand who she is, where she works, what she shoots, what it costs." | public HTML + schema |
| **Photographer (admin, non-technical)** | "After an event I want to put an album online from my laptop or phone in a few minutes, pick what's on the homepage, and delete things without fear." | `/admin` |
| Daniel (maintainer) | "It runs on free tiers, needs no babysitting, and cannot be broken into." | Cloudflare |

The admin has **exactly three screens**: Albumi · Album · Naslovnica. Anything not in this
spec is out of scope (no blog, no client proofing, no shop, no multi-user roles, no settings UI).

## 2. Content model (plain language — schema in ARCHITECTURE.md §3)

- **Album** = one event/shoot. Title, category (one of 4), place, date, optional short story
  (≤ 600 chars), cover photo, status Skica/Objavljeno, ordered photos.
- **Category** is fixed: `vjencanja` Vjenčanja · `eventi` Eventi · `portreti` Portreti · `iz-zraka` Iz zraka.
- **Photo** belongs to one album. Has position, alt text, dimensions, LQIP, and a flag
  "na naslovnici" (featured) with its own order.
- **Naslovnica** (homepage selection) = featured photos, max 12, ordered.

## 3. Public site

### Home `/`  (Atelier design, see DESIGN.md §5.1)
- AC-HOME-01 Hero shows the photographer's chosen hero = first featured photo; falls back to newest published album cover; falls back to a static placeholder when DB is empty.
- AC-HOME-02 Horizontal gallery shows featured photos in their order (max 12). If fewer than 4 are featured, it fills with covers of the newest published albums until it has 4–12 items. Never shows draft or deleted content.
- AC-HOME-03 Each gallery item opens the lightbox; the lightbox bar has a link "Otvori album →" to that photo's album.
- AC-HOME-04 The track ends with a card "Sve priče" showing the published album count and linking to `/radovi`.
- AC-HOME-05 Services cards link to their category pages.
- AC-HOME-06 Without JS the gallery is a readable, scrollable row of images with captions and working links.

### Archive `/radovi`  (DESIGN.md §5.2)
- AC-ARC-01 Lists all published albums, newest event date first, grouped under year dividers.
- AC-ARC-02 Filter chips: Sve · Vjenčanja · Eventi · Portreti · Iz zraka, each with its count. Chips are real links (`/radovi`, `/radovi/vjencanja`, …) — filtering works without JS.
- AC-ARC-03 24 albums per page. Pagination via `?stranica=N` real links; with JS a "Učitaj još" button appends the next page in place and updates the URL (history.replaceState). Invalid `stranica` → 404.
- AC-ARC-04 Text search field "Traži po mjestu ili nazivu" filters the already-loaded list client-side (progressive enhancement; hidden without JS).
- AC-ARC-05 Card shows cover, title, place, month/year, photo count. On hover (fine pointer only) crossfades to the album's 2nd photo.
- AC-ARC-06 Empty state for a category with no albums: text + link back to "Sve".

### Category `/radovi/{kategorija}`
- AC-CAT-01 Same component as the archive, pre-filtered, with its own H1 and an SEO intro (≈ 80 words) from `src/content/site.ts`.
- AC-CAT-02 Unknown category slug → 404.

### Album `/radovi/{slug}`  (DESIGN.md §5.3)
- AC-ALB-01 Shows cover hero, H1 title, meta line (category · place · date · N fotografija), story if present.
- AC-ALB-02 Photos render in the automatic **rhythm layout** (pure function, ARCHITECTURE.md §7). The photographer never chooses layouts.
- AC-ALB-03 Every photo opens the lightbox (prev/next across the whole album, Esc, arrows, swipe on touch).
- AC-ALB-04 Footer nav: previous/next album (by date, same category) + "Sva vjenčanja" style link back.
- AC-ALB-05 Draft, deleted or unknown slug → 404 (never 403 — do not leak existence).
- AC-ALB-06 Images use `srcset` (640/1280/2400 WebP) + inline LQIP; first 2 images eager, rest lazy.

### Lightbox (shared)
- AC-LB-01 `role="dialog"`, `aria-modal`, focus moves to close button, focus trapped, background `inert`, focus returns to the opener on close.
- AC-LB-02 Keyboard: Esc closes, ←/→ navigate. Touch: horizontal swipe navigates. Loads the 2400 variant only when opened.

## 4. Admin `/admin`

### Access
- AC-ADM-01 Every `/admin*` and `/api/admin*` request requires a valid Cloudflare Access JWT (verified in code, not just at the edge). Missing/invalid → 401 for API, 403 page for HTML.
- AC-ADM-02 Allowed identities come from env `ADMIN_EMAILS` (comma list). Valid JWT but email not listed → 403.
- AC-ADM-03 Header shows signed-in email and "Odjava" (links to `/cdn-cgi/access/logout`).
- AC-ADM-04 Admin pages send `noindex`, `Cache-Control: no-store`, and are excluded in robots.txt.

### Screen 1 — Albumi `/admin`
- AC-ALBL-01 Grid of all albums (drafts included) with cover, title, date, status pill, photo count. Sorted newest first. Filter chips by category + "Skice".
- AC-ALBL-02 Primary button "Novi album" → creates an empty draft (title "Novi album", today's date, category from active chip or `vjencanja`) and opens it.
- AC-ALBL-03 "Nedavno obrisano" collapsible list at the bottom: albums deleted < 7 days ago, each with "Vrati".
- AC-ALBL-04 Empty state (no albums): one sentence + "Novi album" button.

### Screen 2 — Album `/admin/albumi/{id}`
- AC-ALBED-01 Fields: Naziv, Kategorija (4 segmented options), Mjesto, Datum, Kratka priča (optional, counter /600). Autosave 800 ms after typing stops; status line shows "Spremam…" → "Spremljeno". Failed save shows inline error + "Pokušaj ponovno", and keeps the typed value.
- AC-ALBED-02 Slug is generated from title on first publish (Croatian transliteration č→c, ć→c, đ→d, š→s, ž→z), unique, never one of the reserved words `vjencanja eventi portreti iz-zraka admin api`. Slug never changes after first publish (URLs stay stable).
- AC-ALBED-03 Status switch Skica ↔ Objavljeno. Publishing requires ≥ 1 photo and a title ≠ "Novi album"; otherwise the switch explains why in one line.
- AC-ALBED-04 "Pogledaj na stranici ↗" opens the public album (only when published).
- AC-ALBED-05 Photo grid: drag to reorder (mouse + touch), plus keyboard reorder (focus photo → "Pomakni lijevo/desno" buttons). Order persists immediately.
- AC-ALBED-06 Per photo menu: Postavi kao naslovnu (cover) · Na naslovnicu / Makni s naslovnice (featured) · Opis fotografije (alt) · Obriši.
- AC-ALBED-07 First uploaded photo becomes cover automatically if none set.
- AC-ALBED-08 Delete album: button at page bottom → dialog stating title + photo count → soft delete → back to Albumi with undo toast.

### Upload (inside Album screen)
- AC-UP-01 Drop zone accepts drag-drop and a file picker (multi-select). On phones the picker offers the photo library.
- AC-UP-02 Accepted input: JPEG, PNG, WebP, and HEIC **when the browser can decode it**. Max 60 MB per file, max 200 files per batch. Rejected files get a per-file reason in Croatian.
- AC-UP-03 Client pipeline per file: decode with EXIF orientation → re-encode to WebP at 2400/1280/640 px long edge (never upscale) → 16 px LQIP → upload. Re-encoding strips all EXIF/GPS. Original never leaves the device.
- AC-UP-04 Uploads run 3 at a time, show per-file progress and a batch counter "12 / 40". The user can keep editing while uploading. Leaving the page mid-upload triggers the browser's leave warning.
- AC-UP-05 Failed file shows "Nije uspjelo — Pokušaj ponovno"; retry re-sends only that file.
- AC-UP-06 Server rejects: non-WebP bytes (415), declared vs. actual dimension mismatch (422), any variant over its byte cap or pixel cap (413), album not found / deleted (404), batch over album cap of 400 photos (409).
- AC-UP-07 Default alt text = "{Naziv albuma}, {Mjesto}" — editable later.

### Delete and undo
- AC-DEL-01 Deleting a photo removes it from the grid instantly and shows a toast "Fotografija obrisana · Poništi" for 10 s. Undo restores it at the same position.
- AC-DEL-02 All deletes are soft (deleted_at). A daily cron hard-deletes rows and R2 objects older than 7 days.
- AC-DEL-03 Deleting the cover photo makes the next photo the cover. Deleting a featured photo removes it from Naslovnica.

### Screen 3 — Naslovnica `/admin/naslovnica`
- AC-FEAT-01 Shows featured photos in homepage order with "x / 12". Drag or keyboard to reorder; "Makni" per photo.
- AC-FEAT-02 Trying to feature a 13th photo shows "Naslovnica ima najviše 12 fotografija. Makni jednu pa dodaj novu." and does nothing.
- AC-FEAT-03 Short help line explaining the fallback: "Ako odabereš manje od 4, dopunit ću ih naslovnim fotografijama najnovijih albuma."
- AC-FEAT-04 Only photos from published albums appear on the public homepage, even if featured.

## 5. SEO / GEO

- AC-SEO-01 Every public page: unique `<title>` and meta description, canonical, OG/Twitter image (1200 variant or static), `lang="hr"`.
- AC-SEO-02 JSON-LD: site-wide `ProfessionalService`+`LocalBusiness` (from reference, values from site.ts), `WebSite`, `FAQPage` on home; `ImageGallery` + `BreadcrumbList` on album pages; `CollectionPage` + `BreadcrumbList` on archive/category.
- AC-SEO-03 `/sitemap.xml` generated from D1 (home, archive, 4 categories, each published album with lastmod). `/robots.txt` disallows `/admin` and `/api`.
- AC-SEO-04 All meaningful text is in server HTML (no JS-only content). Album meta line reads as a sentence LLMs can quote: "Vjenčanje · Nin · lipanj 2025. · 84 fotografije".
- AC-SEO-05 Image `alt` always present and non-empty on public pages.

## 6. Quality bars

- AC-A11Y-01 axe: 0 serious/critical violations on every public route and every admin screen, desktop and 360px.
- AC-A11Y-02 Everything operable by keyboard; visible focus; targets ≥ 24×24 CSS px (admin buttons ≥ 44×44).
- AC-A11Y-03 `prefers-reduced-motion`: no loader animation, no parallax, no word-reveal, lightbox without slide.
- AC-A11Y-04 Text contrast ≥ 4.5:1 (≥ 3:1 for ≥ 24px text). No text smaller than 12px.
- AC-PERF-01 Public JS ≤ 30 KB gz per page. CSS ≤ 25 KB gz. No web font > 2 families.
- AC-PERF-02 Lab (Lighthouse mobile, local build): LCP ≤ 2.5 s, CLS ≤ 0.05, TBT ≤ 150 ms on `/`, `/radovi`, one album.
- AC-REL-01 `RELEASE=1 npm run test` fails while any `TODO(client)` remains in `src/content/site.ts`.
