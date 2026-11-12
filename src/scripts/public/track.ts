// Home horizontal gallery: pinned + lerped on wide screens (PD-07), native scroll row otherwise.
// rAF runs only while the section intersects the viewport (DESIGN §7).

const LERP = 0.12;

export function initTrack(): void {
  const sec = document.querySelector<HTMLElement>("[data-track]");
  const rail = sec?.querySelector<HTMLElement>("[data-track-rail]");
  if (!sec || !rail) return;
  const items = [...sec.querySelectorAll<HTMLElement>("[data-track-item]")];
  const count = sec.querySelector<HTMLElement>("[data-track-count]");
  const bar = sec.querySelector<HTMLElement>("[data-track-bar]");
  const total = String(items.length).padStart(2, "0");

  const wide = matchMedia("(min-width: 901px)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const pinnedWanted = (): boolean => wide.matches && !reduced.matches;

  let pinned = false;
  let maxX = 0;
  let current = 0;
  let target = 0;
  let visible = false;
  let running = false;
  let nearIndex = -1;

  function setNear(): void {
    const mid = innerWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best !== nearIndex) {
      items[nearIndex]?.classList.remove("is-near");
      items[best]?.classList.add("is-near");
      nearIndex = best;
      if (count) count.textContent = `${String(best + 1).padStart(2, "0")} / ${total}`;
    }
  }

  function setProgress(p: number): void {
    if (bar) bar.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
  }

  function measure(): void {
    pinned = pinnedWanted();
    sec!.classList.toggle("is-pinned", pinned);
    if (!pinned) {
      sec!.style.height = "";
      rail!.style.transform = "";
      current = target = 0;
      onRailScroll();
      return;
    }
    maxX = Math.max(0, rail!.scrollWidth - innerWidth);
    sec!.style.height = `${maxX + innerHeight}px`;
    readTarget();
    current = target;
    paint();
  }

  function readTarget(): void {
    const y = scrollY - sec!.offsetTop;
    target = Math.min(maxX, Math.max(0, y));
  }

  function paint(): void {
    rail!.style.transform = `translate3d(${-current}px,0,0)`;
    setProgress(maxX ? current / maxX : 0);
    setNear();
  }

  function loop(): void {
    if (!pinned || !visible) {
      running = false;
      return;
    }
    const delta = target - current;
    current = Math.abs(delta) < 0.5 ? target : current + delta * LERP;
    paint();
    if (current === target) {
      running = false;
      return;
    }
    requestAnimationFrame(loop);
  }

  function kick(): void {
    if (running || !pinned || !visible) return;
    running = true;
    requestAnimationFrame(loop);
  }

  function onRailScroll(): void {
    if (pinned) return;
    const max = rail!.scrollWidth - rail!.clientWidth;
    setProgress(max > 0 ? rail!.scrollLeft / max : 0);
    setNear();
  }

  /** Brings item i to the centre (keyboard ←/→). */
  function goTo(i: number): void {
    const el = items[Math.max(0, Math.min(items.length - 1, i))];
    if (!el) return;
    if (pinned) {
      const x = el.offsetLeft + el.offsetWidth / 2 - innerWidth / 2;
      scrollTo({ top: sec!.offsetTop + Math.min(maxX, Math.max(0, x)), behavior: "instant" });
    } else {
      const left = el.offsetLeft - (rail!.clientWidth - el.offsetWidth) / 2;
      rail!.scrollTo({ left, behavior: reduced.matches ? "instant" : "smooth" });
    }
  }

  sec.addEventListener("keydown", (e) => {
    if (e.target !== sec) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      goTo((nearIndex < 0 ? 0 : nearIndex) + (e.key === "ArrowRight" ? 1 : -1));
    }
  });

  new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    if (visible) {
      readTarget();
      kick();
    }
  }).observe(sec);

  addEventListener(
    "scroll",
    () => {
      if (!pinned) return;
      readTarget();
      kick();
    },
    { passive: true },
  );
  rail.addEventListener("scroll", onRailScroll, { passive: true });
  addEventListener("resize", measure);
  wide.addEventListener("change", measure);
  reduced.addEventListener("change", measure);
  measure();
}
