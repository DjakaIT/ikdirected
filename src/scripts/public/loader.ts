// PD-05 loader. Min 500 ms, max 1200 ms, finishes as soon as the hero image is decoded.
// Always ends by starting the hero reveal (.go).

const MIN = 500;
const MAX = 1200;

export function initLoader(): void {
  const html = document.documentElement;
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  const go = (): void => hero?.classList.add("go");

  const el = document.querySelector<HTMLElement>("[data-loader]");
  if (!html.classList.contains("is-loading") || !el) {
    html.classList.remove("is-loading");
    requestAnimationFrame(go);
    return;
  }
  try {
    sessionStorage.setItem("ik-seen", "1");
  } catch {
    /* storage blocked: the loader simply shows again next visit */
  }

  const pct = el.querySelector<HTMLElement>("[data-loader-pct]");
  const bar = el.querySelector<HTMLElement>("[data-loader-bar]");
  const img = hero?.querySelector<HTMLImageElement>(".pic__img");
  let ready = !img;
  if (img) {
    const decoded = img.complete
      ? img.decode()
      : new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(img.decode()), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        });
    decoded.catch(() => undefined).then(() => (ready = true));
  }

  const t0 = performance.now();
  const tick = (now: number): void => {
    const t = now - t0;
    const finish = (ready && t >= MIN) || t >= MAX;
    const v = finish ? 1 : Math.min(0.95, t / MAX);
    if (pct) pct.textContent = String(Math.floor(v * 100)).padStart(2, "0");
    if (bar) bar.style.transform = `scaleX(${v})`;
    if (!finish) {
      requestAnimationFrame(tick);
      return;
    }
    el.classList.add("off");
    go();
    el.addEventListener("transitionend", () => html.classList.remove("is-loading"), { once: true });
  };
  requestAnimationFrame(tick);
}
