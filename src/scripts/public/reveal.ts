// Word-by-word reveal of the statement paragraph (reference "say" section, PD-10).
// Words are built with DOM APIs (never innerHTML). Skipped under reduced motion: text stays full.

export function initReveal(): void {
  const el = document.querySelector<HTMLElement>("[data-reveal]");
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const text = (el.textContent ?? "").trim();
  const words = text.split(/\s+/);
  const frag = document.createDocumentFragment();
  const spans: HTMLSpanElement[] = [];
  words.forEach((word, i) => {
    const span = document.createElement("span");
    span.className = "w";
    span.textContent = word;
    spans.push(span);
    frag.append(span);
    if (i < words.length - 1) frag.append(" ");
  });
  el.replaceChildren(frag);

  let visible = false;
  let queued = false;
  const update = (): void => {
    queued = false;
    const r = el.getBoundingClientRect();
    const p = (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35);
    const n = Math.round(Math.min(1, Math.max(0, p)) * spans.length);
    spans.forEach((s, i) => s.classList.toggle("on", i < n));
  };
  const onScroll = (): void => {
    if (!visible || queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    if (visible) onScroll();
  }).observe(el);
  addEventListener("scroll", onScroll, { passive: true });
  update();
}
