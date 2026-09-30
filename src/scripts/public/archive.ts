// Archive enhancements: in-place "Učitaj još" (AC-ARC-03), client-side search over loaded cards
// with a polite live region (AC-ARC-04), and the cover → album view-transition name (PD-09).
// New cards come from our own server-rendered page and are adopted as DOM nodes — never built
// from data strings.
import { initPictures } from "./picture";
import { plural } from "../../lib/text/plural";

const norm = (s: string): string =>
  s.toLocaleLowerCase("hr").normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");

export function initArchive(): void {
  const root = document.querySelector<HTMLElement>("[data-archive]");
  if (!root) return;
  initSearch(root);
  initMore(root);
  initViewTransitionName();
}

function initSearch(root: HTMLElement): void {
  const wrap = document.querySelector<HTMLElement>("[data-search-wrap]");
  const input = document.querySelector<HTMLInputElement>("[data-search]");
  const none = root.querySelector<HTMLElement>("[data-none]");
  const found = root.querySelector<HTMLElement>("[data-found]");
  if (!wrap || !input || !none || !found) return;
  wrap.hidden = false;

  let timer = 0;
  const apply = (): void => {
    const tokens = norm(input.value.trim()).split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const group of root.querySelectorAll<HTMLElement>("[data-year]")) {
      let inGroup = 0;
      for (const card of group.querySelectorAll<HTMLElement>("[data-card]")) {
        const hay = norm(card.dataset.search ?? "");
        const match = tokens.every((t) => hay.includes(t));
        card.hidden = !match;
        if (match) inGroup++;
      }
      group.hidden = inGroup === 0;
      shown += inGroup;
    }
    none.hidden = !(tokens.length > 0 && shown === 0);
    found.textContent = tokens.length ? `Pronađeno ${shown} ${plural(shown, "priča", "priče", "priča")}` : "";
  };
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(apply, 120);
  });
  // Re-apply after "Učitaj još" appends cards.
  root.addEventListener("archive:appended", apply);
}

function initMore(root: HTMLElement): void {
  const more = root.querySelector<HTMLAnchorElement>("[data-more]");
  const groupsEl = root.querySelector<HTMLElement>("[data-groups]");
  if (!more || !groupsEl) return;

  more.addEventListener("click", async (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (more.getAttribute("aria-busy") === "true") return;
    more.setAttribute("aria-busy", "true");
    const url = new URL(more.href);
    try {
      const res = await fetch(url, { headers: { Accept: "text/html" } });
      if (!res.ok) throw new Error(String(res.status));
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const incoming = [...doc.querySelectorAll<HTMLElement>("[data-groups] > [data-year]")];
      let firstNew: HTMLElement | null = null;
      for (const group of incoming) {
        const year = group.dataset.year;
        const existing = groupsEl.querySelector<HTMLElement>(`[data-year="${year}"]`);
        const cards = [...group.querySelectorAll<HTMLElement>("[data-card]")];
        if (existing) {
          const grid = existing.querySelector<HTMLElement>("[data-grid]");
          // appendChild, not append: the Workers runtime types merge an HTMLRewriter Element.append.
          for (const card of cards) grid?.appendChild(document.adoptNode(card));
        } else {
          groupsEl.appendChild(document.adoptNode(group));
        }
        firstNew ??= cards[0] ?? null;
      }
      initPictures(groupsEl);
      history.replaceState(history.state, "", url.pathname + url.search);
      const nextMore = doc.querySelector<HTMLAnchorElement>("[data-more]");
      if (nextMore) {
        more.href = nextMore.href;
        more.removeAttribute("aria-busy");
      } else {
        more.parentElement?.remove();
      }
      root.dispatchEvent(new Event("archive:appended"));
      firstNew?.querySelector<HTMLElement>("a")?.focus();
    } catch {
      // Fall back to a normal navigation; the link works without JS too.
      location.href = url.href;
    }
  });
}

/** PD-09: name only the clicked card's cover so it morphs into the album hero. */
function initViewTransitionName(): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  addEventListener("pageswap", (event: Event) => {
    const e = event as Event & { viewTransition?: unknown; activation?: { entry?: { url?: string } } };
    const target = e.activation?.entry?.url;
    if (!e.viewTransition || !target) return;
    const path = new URL(target).pathname;
    const link = [...document.querySelectorAll<HTMLAnchorElement>("[data-card] a")].find(
      (a) => new URL(a.href).pathname === path,
    );
    const cover = link?.querySelector<HTMLElement>("[data-card-cover]");
    if (cover) cover.style.viewTransitionName = "album-hero";
  });
}
