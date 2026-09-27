# DESIGN — Atelier, refined

The approved look is `reference/atelier.html` (dark, cinematic, horizontal gallery). **Do not
redesign it.** This doc lists (a) the tokens to extract, (b) a small set of premium deltas that
raise craft without changing character, (c) the designs for the new pages (archive, album) and
the admin, (d) the exact Croatian copy.

Sections: 1 Principles · 2 Tokens · 3 Reference line map · 4 Premium deltas · 5 Public pages ·
6 Admin · 7 Motion · 8 Accessibility · 9 Copy

---

## 1. Principles (Apple HIG's eight, turned into rules for this site)

| Principle | Rule here |
|---|---|
| Purpose | Photos are the product. Chrome recedes: no card shadows, no gradients except image scrims, no icons where a word works. |
| Agency | Visitor can always escape: every overlay closes with Esc, back button works, horizontal gallery also works with keys and native scroll. |
| Responsibility | Admin never loses work: autosave, undo on delete, 7-day recovery, leave-page warning during upload. EXIF/GPS stripped from every photo. |
| Familiarity | Archive uses the convention visitors expect (chips + grid + year order). Admin uses the convention she knows from phone galleries (grid, long-press/⋯ menu, drag to reorder). |
| Flexibility | 360 px → 2560 px. Mouse, touch, keyboard. Reduced motion. 200 % zoom without horizontal scroll (except the gallery track itself). |
| Simplicity | Admin = 3 screens, 4 categories, 1 switch (Skica/Objavljeno). Layout of album pages is automatic — zero layout choices. |
| Craft | One spacing scale, one easing family, tabular numerals, real diacritics subset, hairlines at exactly 1px, no widows in headings (`text-wrap: balance`). |
| Delight | Exactly three signature moments: hero reveal, horizontal track with inertia, cover → album morph (view transition). Nothing else animates for show. |

---

## 2. Tokens → `src/styles/tokens.css`

```css
:root{
  /* colour — monochrome, photos supply the colour */
  --bg:#0A0A0A; --bg-2:#131313; --bg-3:#1B1B1B;
  --fg:#F2F0ED;
  --fg-2:rgba(242,240,237,.74);   /* body copy on dark  ≈ 10:1 */
  --dim:rgba(242,240,237,.56);    /* meta ≥ 12px only   ≈ 5.9:1 */
  --line:rgba(242,240,237,.14);  --line-2:rgba(242,240,237,.28);
  --scrim:rgba(8,8,8,.96);
  --ok:#8FD6A0; --danger:#FF7A6B;   /* admin only; both ≥ 7:1 on --bg */

  /* type */
  --sans:'Archivo',system-ui,sans-serif;      /* variable: wght 300–800, wdth 75–125 */
  --mono:'Space Mono',ui-monospace,monospace;
  --t-meta:.75rem;      /* 12px floor — never smaller */
  --t-body:clamp(1rem,.95vw + .4rem,1.125rem);
  --t-lead:clamp(1.15rem,1.4vw + .5rem,1.5rem);
  --t-h3:clamp(1.5rem,2.6vw,2.5rem);
  --t-h2:clamp(1.8rem,4.4vw,3.4rem);
  --t-display:clamp(3rem,12.6vw,13rem);
  --track-caps:.12em;  --track-display:-.045em;

  /* space — 4-based */
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:24px; --s-6:32px;
  --s-7:48px; --s-8:64px; --s-9:96px; --s-10:128px; --s-11:192px;
  --pad:clamp(18px,3.4vw,54px);
  --section:clamp(96px,14vw,192px);

  /* motion */
  --ease-out:cubic-bezier(.2,.8,.2,1);
  --ease-io:cubic-bezier(.76,0,.24,1);
  --d-1:180ms; --d-2:320ms; --d-3:600ms; --d-4:1200ms;

  /* shape — the site is square. radius only for the cursor dot and round icon buttons */
  --r-0:0; --r-round:999px;

  --z-nav:60; --z-grain:70; --z-cursor:90; --z-lb:95; --z-toast:98; --z-load:100;
}
```

Fonts: use Astro 6's built-in Fonts API with Google provider; subsets `latin` + `latin-ext`
(č ć đ š ž). Archivo variable (wght + wdth axes) and Space Mono 400. Preload only Archivo.

---

## 3. Reference line map — `reference/atelier.html` (581 lines)

Read with offset/limit. Never read the whole file.

| Lines | Content |
|---|---|
| 17–58 | `<head>`: SEO meta, geo meta, OG — port into `src/components/Seo.astro` |
| 60–65 | `:root` tokens (superseded by §2) |
| 66–101 | base, skip link, `.m` label, grain, cursor, loader, nav |
| 103–121 | hero CSS |
| 122–128 | "say" word-reveal CSS |
| 129–154 | horizontal gallery CSS (+ mobile fallback) |
| 155–169 | services sticky-card stack CSS |
| 170–183 | area (Gdje radim) + marquee CSS |
| 184–193 | FAQ CSS |
| 194–204 | footer/contact CSS |
| 205–218 | lightbox CSS |
| 222–249 | skip, cursor, loader, nav, hero HTML |
| 251–255 | say section HTML |
| 256–330 | gallery track HTML (12 `figure.shot`) |
| 331–369 | services cards HTML |
| 370–401 | area, marquee, FAQ HTML |
| 404–420 | footer HTML |
| 421–427 | lightbox HTML |
| 429–486 | JSON-LD (LocalBusiness, Person, WebSite, WebPage, FAQPage) |
| 488–579 | JS: gallery read, horizontal scroll, word reveal, marquee, lightbox, cursor, loader |

---

## 4. Premium deltas (apply on top of the reference, each is small and testable)

| ID | Change | Why |
|---|---|---|
| PD-01 | Body weight 300 → **350**, body colour `--fg-2`. Thin light text blooms on black. | legibility |
| PD-02 | All `.m` labels .62rem → **`--t-meta` (12px)**, tracking .12em. Cursor label .55rem → 12px. | AC-A11Y-04 |
| PD-03 | `font-variant-numeric: tabular-nums` on counters, dates, "03 / 12". | craft |
| PD-04 | **Native cursor is never hidden.** Delete `cursor:none`. Follower dot = extra layer, fine pointer only, off under reduced motion. | a11y |
| PD-05 | Loader: first visit per session only (`sessionStorage`), progress tied to real `heroImg.decode()` (min 500 ms, max 1200 ms), skipped under reduced motion. Content is in the DOM underneath (no blocking). | honesty, LCP |
| PD-06 | Hero: add a mono stamp top-right under the nav: `ZADAR · 44.12° N 15.23° E`. Ken-burns 1.08 → 1 over 14 s. | cinematic detail |
| PD-07 | Gallery track: scroll position is **lerped** (factor .12) instead of mapped 1:1 → inertia. Add counter `03 / 12` beside the progress line. Section is focusable (`tabindex="0"`, `aria-roledescription="galerija"`); ←/→ move one item. End card "Sve priče (N) →". | premium feel, AC-HOME-04 |
| PD-08 | Captions sit at `--dim` and rise to `--fg` for the item nearest viewport centre. | focus |
| PD-09 | **Cross-document view transitions** (`@view-transition{navigation:auto}` — native). The album hero has `view-transition-name: album-hero` in CSS; on the archive page a tiny `pageswap` listener sets `style.viewTransitionName = "album-hero"` on the clicked card's image only (CSSOM, CSP-safe). Disabled under reduced motion. | signature moment #3 |
| PD-10 | Word-reveal paragraph: unrevealed words at .28 opacity (not .16). Full opacity under reduced motion and without JS. | legibility |
| PD-11 | Grain opacity .055 → .045; never over the lightbox. | restraint |
| PD-12 | Marquee pauses on hover/focus and under reduced motion; stays `aria-hidden`. | WCAG 2.2.2 |
| PD-13 | Focus ring: `outline: 2px solid var(--fg); outline-offset: 4px`. On image links: inset ring `outline-offset:-6px`. | a11y |
| PD-14 | Services cards: image = cover of newest published album in that category (fallback static). Each card links to its category page. | live content |
| PD-15 | Lightbox gains "Otvori album →" (home) and image counter; swipe on touch; loads 2400 variant only when opened. | AC-HOME-03 |

Do **not** add: new colours, rounded corners, glassmorphism, extra fonts, scroll-jacking outside
the gallery, autoplaying video, sound.

---

## 5. Public pages

### 5.1 Home `/`
Order from the reference, unchanged: nav → hero → say → **gallery track** → services stack →
area → marquee → FAQ → footer. Data sources: hero + track = featured (AC-HOME-01/02), counts
and category covers from D1, all business facts from `src/content/site.ts`.

### 5.2 Archive `/radovi` and category `/radovi/{kategorija}` — "Arhiva"

```
┌ nav ───────────────────────────────────────────────────────────────┐
│ RADOVI                                           (Archivo wide 700)│
│ 86 priča · 2019. — 2026.                         (mono, dim)       │
├ sticky chip bar (bg .86 + backdrop blur 12px, hairline bottom) ────┤
│ [Sve 86] [Vjenčanja 41] [Eventi 23] [Portreti 14] [Iz zraka 8]  ⌕ │
├────────────────────────────────────────────────────────────────────┤
│ 2026                    ← outlined numeral, 1px --line-2 stroke,    │
│ ┌──────┐ ┌──────┐ ┌──────┐   clamp(6rem,16vw,14rem), sits behind   │
│ │cover │ │cover │ │cover │   the first row, overlapping by 30%     │
│ │ 4:5  │ │ 4:5  │ │ 4:5  │                                          │
│ └──────┘ └──────┘ └──────┘                                          │
│ ANA I MARKO   NIN · 06/2025 · 84                                   │
│ 2025 …                                                             │
│              [ Učitaj još ]   (links ?stranica=2 without JS)       │
└────────────────────────────────────────────────────────────────────┘
```
- Grid: 3 cols ≥ 1100px, 2 cols ≥ 640px, 1 col below. Gap `--s-6`. Card title Archivo 600,
  wdth 110, uppercase, `--t-h3` scaled to .6; meta mono 12px `--dim`.
- Chips: text chips separated by 1px vertical hairlines, active = `--fg` with underline 1px at
  6px offset; counts in tabular nums. Horizontal scroll on mobile with fade mask.
- Search: underline-only input, mono placeholder, `⌕` glyph; filters on title + place, 120 ms debounce, announces "Pronađeno 7 priča" via `aria-live="polite"`.
- Hover (fine pointer): cover crossfades to 2nd photo over `--d-3`. Focus shows the same.
- Category page: H1 = category name ("VJENČANJA"), intro paragraph from site.ts under it,
  active chip set.

### 5.3 Album `/radovi/{slug}`

```
┌ cover hero 88svh, scrim bottom-left ─────────────────────────────┐
│                                                                   │
│ VJENČANJA · NIN · LIPANJ 2025. · 84 FOTOGRAFIJE     (mono)        │
│ ANA I MARKO                                          (display)     │
└───────────────────────────────────────────────────────────────────┘
  story (max 56ch, --t-lead, --fg-2), omitted if empty
  ── rhythm layout rows (ARCHITECTURE §7) ──
  [full-bleed wide]                         (landscape, every 3rd)
  [ 7/12 portrait ][ 5/12 portrait, +12vh ] (pair)
  [   8/12 centered   ]                     (single)
  [ 10/12 offset right ]                    (landscape alt)
  …
  ── footer nav ──
  ← PRETHODNA PRIČA  |  SVA VJENČANJA  |  SLJEDEĆA PRIČA →   (with 3:2 thumbs)
  CTA strip: "Vaš datum je slobodan? Provjerite." → /#kontakt
```
- Row gap `clamp(48px,7vw,120px)`; within pair gap `--s-5`.
- Images fade in (opacity .0 → 1, `--d-3`) when decoded — no slide-in.
- Breadcrumb above hero title (mono): `Radovi / Vjenčanja / Ana i Marko`.

### 5.4 404
Full-screen dark, display "404", line "Ova stranica ne postoji ili je premještena.", two links:
"Naslovnica" · "Svi radovi".

---

## 6. Admin (`/admin`) — same language, calmer

No grain, no custom cursor, no loader, no view transitions. Same tokens, fonts, hairlines.
Max content width 1200px. Everything ≥ 44×44 px tap targets. Works one-handed on a phone.

**Top bar** (sticky, `--bg` with hairline): `ikdirected / admin` · `Albumi` `Naslovnica` · email (dim) · `Odjava`.

**Components**
- Button primary: bg `--fg`, text `#0A0A0A`, Archivo 500, 14px, uppercase .08em, padding 14×22, square.
- Button secondary: 1px `--line-2`, text `--fg`. Hover: border `--fg`.
- Button danger: text `--danger`, 1px `--danger` border. Only in dialogs and page-bottom zones.
- Field: label above (mono 12px dim), input underline 1px `--line-2` → `--fg` on focus, 16px text (prevents iOS zoom). Error text `--danger` below, `aria-describedby`.
- Segmented control (Kategorija): 4 equal segments, active = filled `--fg`. Radio group semantics.
- Switch (Skica/Objavljeno): 44×24, knob `--fg`, on-track `--ok` at .35 + label text beside it. Real `role="switch"` + `aria-checked`.
- Status pill: 12px mono uppercase, 1px border; Objavljeno has a 6px `--ok` dot.
- Toast: bottom-centre, `--bg-3`, hairline, 10 s, action link underlined. `role="status"`. Max 1 visible; newer replaces older.
- Dialog: native `<dialog>`, `--bg-2`, width min(520px, 92vw), focus on the safest button (Odustani).
- Save indicator: mono 12px in the album header — `Spremam…` / `Spremljeno` / `Nije spremljeno — Pokušaj ponovno`.

**Screen 1 — Albumi**
Header row: H1 "Albumi" · count · primary "Novi album". Chip filters (Sve, 4 categories, Skice).
Grid of album cards (4 / 3 / 2 cols): cover 4:5, title, date, status pill, photo count. Card =
one link. Bottom: `<details>` "Nedavno obrisano (3)" → rows with "Vrati".

**Screen 2 — Album** (single scroll page, no tabs)
```
← Albumi                                   Spremljeno   [Skica ◯ Objavljeno]
Naziv ____________________________________________
Kategorija [Vjenčanja|Eventi|Portreti|Iz zraka]
Mjesto ______________   Datum [__.__.____]
Kratka priča (neobavezno) _________________________ 0/600
─────────────────────────────────────────────────
Fotografije (84)                        Pogledaj na stranici ↗
┌ drop zone ──────────────────────────────────────┐
│  Povuci fotografije ovdje  ·  [Odaberi fotografije] │
│  JPEG, PNG, WebP ili HEIC · do 60 MB po fotografiji │
└─────────────────────────────────────────────────┘
upload queue (only while active): "Prenosim 12 / 40" + thin progress line
[grid of square thumbs · drag handle on hover · ⋯ menu · ★ if featured · "NASLOVNA" tag on cover]
─────────────────────────────────────────────────
Opasna zona:  [Obriši album]
```
- Dragging files anywhere over the page shows a full-screen overlay "Pusti za prijenos".
- Uploading tile: thumbnail from the local blob immediately, progress bar along its bottom
  edge, error tile has `--danger` hairline + "Pokušaj ponovno".
- Photo ⋯ menu (popover, keyboard navigable): Postavi kao naslovnu · Na naslovnicu / Makni s
  naslovnice · Opis fotografije · Pomakni lijevo · Pomakni desno · Obriši.
- "Opis fotografije" opens a small dialog with one textarea (alt), max 200 chars.

**Screen 3 — Naslovnica**
H1 "Naslovnica" · "7 / 12" · help line (AC-FEAT-03). Horizontal preview strip that mimics the
public track (same aspect ratios, smaller), reorder by drag or ⋯ Pomakni. "Makni" per item.
Empty state: "Još nisi odabrala fotografije za naslovnicu. Otvori album i u izborniku ⋯ odaberi
'Na naslovnicu'."

---

## 7. Motion

| Moment | Spec | Reduced motion |
|---|---|---|
| Loader | PD-05 | skipped |
| Hero | clip-path 100%→0 `--d-4` `--ease-io`; image 1.08→1 over 14s | image static, no clip |
| Track | lerp .12, rAF only while section intersects | native horizontal scroll, snap |
| View transition | cover morph 450ms `--ease-io`, rest cross-fade 250ms | none |
| Image appear | opacity 0→1 `--d-3` after `decode()` | instant |
| UI micro | colour/border `--d-1`; toasts slide 8px + fade `--d-2` | fade only |

rAF loops must stop when their section leaves the viewport (IntersectionObserver).

---

## 8. Accessibility checklist (applies to every screen)

Landmarks (header/nav/main/footer) · one H1 · heading order without gaps · skip link ·
visible focus (PD-13) · 12px text floor · contrast per §2 · all images have alt (public) ·
decorative imagery `alt=""` + `aria-hidden` · dialogs: focus in, trap, `inert` background,
restore focus · live regions for save status, upload progress, search results, toasts ·
drag & drop always has a keyboard alternative · forms: labels, `aria-describedby` errors,
no placeholder-as-label · `lang="hr"` · zoom 200 % works · touch targets ≥ 24px public,
≥ 44px admin.

---

## 9. Copy (use verbatim)

**Public**
| Key | Text |
|---|---|
| nav.cta | Provjerite termin |
| track.end | Sve priče ({n}) → |
| lb.close | Zatvori ✕ |
| lb.album | Otvori album → |
| lb.prev / lb.next (aria) | Prethodna fotografija / Sljedeća fotografija |
| arc.title | Radovi |
| arc.meta | {n} priča · {from}. — {to}. |
| arc.all | Sve |
| arc.search | Traži po mjestu ili nazivu |
| arc.found (live) | Pronađeno {n} priča |
| arc.none | Nema priča za ovaj pojam. |
| arc.more | Učitaj još |
| arc.emptyCat | U ovoj kategoriji još nema objavljenih priča. · Pogledaj sve radove → |
| alb.meta | {Kategorija} · {Mjesto} · {mjesec} {godina}. · {n} fotografija |
| alb.prev / alb.next | ← Prethodna priča / Sljedeća priča → |
| alb.back | Sva {kategorija u množini} (e.g. "Sva vjenčanja", "Svi eventi", "Svi portreti", "Svi kadrovi iz zraka") |
| alb.cta | Vaš datum je slobodan? Provjerite. |
| 404.text | Ova stranica ne postoji ili je premještena. |

Croatian plurals: 1 fotografija · 2–4 fotografije · 5+ fotografija (and 11–14 → fotografija).
Same rule for priča (1 priča, 2–4 priče, 5+ priča). Implement `plural(n, one, few, many)` with tests.
Months genitive for dates: siječnja veljače ožujka travnja svibnja lipnja srpnja kolovoza rujna listopada studenoga prosinca; in meta lines use nominative-with-year form: "lipanj 2025.".

**Admin**
| Key | Text |
|---|---|
| nav | Albumi · Naslovnica · Odjava |
| albums.new | Novi album |
| albums.empty | Još nemaš nijedan album. Napravi prvi i dodaj fotografije. |
| albums.drafts | Skice |
| albums.trash | Nedavno obrisano ({n}) |
| albums.restore | Vrati |
| album.back | ← Albumi |
| album.title / place / date / story | Naziv / Mjesto / Datum / Kratka priča (neobavezno) |
| album.category | Kategorija |
| album.status | Skica / Objavljeno |
| album.publishBlocked.noPhotos | Dodaj barem jednu fotografiju prije objave. |
| album.publishBlocked.noTitle | Upiši naziv albuma prije objave. |
| album.view | Pogledaj na stranici ↗ |
| save.saving / saved / failed | Spremam… / Spremljeno / Nije spremljeno — Pokušaj ponovno |
| drop.title | Povuci fotografije ovdje |
| drop.button | Odaberi fotografije |
| drop.hint | JPEG, PNG, WebP ili HEIC · do 60 MB po fotografiji |
| drop.overlay | Pusti za prijenos |
| up.progress | Prenosim {i} / {n} |
| up.done | Dodano {n} fotografija |
| up.retry | Nije uspjelo — Pokušaj ponovno |
| up.err.type | Ovaj format nije podržan. Izvezi fotografiju kao JPEG. |
| up.err.decode | Preglednik ne može otvoriti ovu datoteku. Izvezi je kao JPEG pa pokušaj ponovno. |
| up.err.size | Datoteka je veća od 60 MB. |
| up.err.server | Poslužitelj je odbio fotografiju. Pokušaj ponovno. |
| up.err.albumFull | Album može imati najviše 400 fotografija. |
| up.leave (beforeunload) | Prijenos još traje. Ako izađeš, neke fotografije neće biti spremljene. |
| photo.menu | Postavi kao naslovnu · Na naslovnicu · Makni s naslovnice · Opis fotografije · Pomakni lijevo · Pomakni desno · Obriši |
| photo.coverTag | Naslovna |
| photo.deleted | Fotografija obrisana · Poništi |
| album.delete | Obriši album |
| album.deleteDialog | Obrisati „{naziv}” i {n} fotografija? Moći ćeš ga vratiti idućih 7 dana. · Odustani · Obriši |
| album.deleted | Album obrisan · Poništi |
| feat.title | Naslovnica |
| feat.count | {n} / 12 |
| feat.help | Ove fotografije vide se na početnoj stranici, ovim redom. Ako odabereš manje od 4, dopunit ću ih naslovnim fotografijama najnovijih albuma. |
| feat.full | Naslovnica ima najviše 12 fotografija. Makni jednu pa dodaj novu. |
| feat.empty | Još nisi odabrala fotografije za naslovnicu. Otvori album i u izborniku ⋯ odaberi „Na naslovnicu”. |
| feat.remove | Makni |
| err.generic | Nešto je pošlo po zlu. Pokušaj ponovno za minutu. |
| err.forbidden | Ovaj račun nema pristup administraciji. |
