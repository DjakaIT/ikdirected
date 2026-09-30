// Lightbox for any [data-lb-group]: links carry data-lb-full (2400 variant, loaded only on open),
// data-lb-alt, data-lb-cap and optionally data-lb-album. Esc closes (native dialog cancel),
// ←/→ navigate, horizontal swipe navigates, focus returns to the opener.

interface Item {
  full: string;
  alt: string;
  cap: string;
  album: string | null;
  opener: HTMLElement;
}

export function initLightbox(): void {
  const dlg = document.querySelector<HTMLDialogElement>("dialog[data-lightbox]");
  if (!dlg) return;
  const img = dlg.querySelector<HTMLImageElement>("[data-lb-img]")!;
  const idx = dlg.querySelector<HTMLElement>("[data-lb-idx]")!;
  const cap = dlg.querySelector<HTMLElement>("[data-lb-cap]")!;
  const albumLink = dlg.querySelector<HTMLAnchorElement>("[data-lb-album]")!;
  const closeBtn = dlg.querySelector<HTMLButtonElement>("[data-lb-close]")!;
  const stage = dlg.querySelector<HTMLElement>("[data-lb-stage]")!;

  let items: Item[] = [];
  let at = 0;
  let opener: HTMLElement | null = null;

  const pad = (n: number): string => String(n).padStart(2, "0");

  function show(i: number): void {
    at = (i + items.length) % items.length;
    const it = items[at]!;
    img.src = it.full;
    img.alt = it.alt;
    cap.textContent = it.cap;
    idx.textContent = `${pad(at + 1)} / ${pad(items.length)}`;
    albumLink.hidden = !it.album;
    if (it.album) albumLink.href = it.album;
  }

  function collect(group: Element): Item[] {
    return [...group.querySelectorAll<HTMLElement>("[data-lb-full]")].map((el) => ({
      full: el.dataset.lbFull ?? "",
      alt: el.dataset.lbAlt ?? "",
      cap: el.dataset.lbCap ?? "",
      album: el.dataset.lbAlbum ?? null,
      opener: el,
    }));
  }

  function open(group: Element, from: HTMLElement): void {
    items = collect(group);
    const i = items.findIndex((it) => it.opener === from);
    if (i < 0) return;
    opener = from;
    show(i);
    dlg!.showModal();
    document.documentElement.style.overflow = "hidden";
    closeBtn.focus();
  }

  function close(): void {
    if (dlg!.open) dlg!.close();
  }

  dlg.addEventListener("close", () => {
    document.documentElement.style.overflow = "";
    img.removeAttribute("src");
    opener?.focus();
    opener = null;
  });

  document.addEventListener("click", (e) => {
    const link = (e.target as Element | null)?.closest<HTMLElement>("[data-lb-full]");
    const group = link?.closest("[data-lb-group]");
    if (!link || !group || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    open(group, link);
  });

  closeBtn.addEventListener("click", close);
  dlg.querySelector("[data-lb-prev]")!.addEventListener("click", () => show(at - 1));
  dlg.querySelector("[data-lb-next]")!.addEventListener("click", () => show(at + 1));
  stage.addEventListener("click", (e) => {
    if (e.target === stage) close();
  });
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      show(at + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      show(at - 1);
    }
  });

  // Swipe (touch/pen): horizontal movement over 40px navigates.
  let startX = 0;
  let startY = 0;
  let tracking = false;
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  });
  stage.addEventListener("pointerup", (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(at + (dx < 0 ? 1 : -1));
  });
  stage.addEventListener("pointercancel", () => {
    tracking = false;
  });
}
