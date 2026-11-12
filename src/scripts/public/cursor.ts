// Follower dot (PD-04). Fine pointer + motion allowed only; grows over gallery items.
// The rAF loop stops once the dot has caught up with the pointer.

export function initCursor(): void {
  const cur = document.querySelector<HTMLElement>("[data-cursor]");
  if (!cur) return;
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let cx = innerWidth / 2;
  let cy = innerHeight / 2;
  let mx = cx;
  let my = cy;
  let running = false;
  let shown = false;

  const loop = (): void => {
    cx += (mx - cx) * 0.18;
    cy += (my - cy) * 0.18;
    cur.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
    if (Math.abs(mx - cx) < 0.1 && Math.abs(my - cy) < 0.1) {
      running = false;
      return;
    }
    requestAnimationFrame(loop);
  };

  addEventListener(
    "mousemove",
    (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (!shown) {
        shown = true;
        cx = mx;
        cy = my;
        document.documentElement.classList.add("has-cur");
      }
      if (!running) {
        running = true;
        requestAnimationFrame(loop);
      }
    },
    { passive: true },
  );
  document.addEventListener("mouseover", (e) => {
    cur.classList.toggle("big", !!(e.target as Element | null)?.closest("[data-track-item]"));
  });
  document.documentElement.addEventListener("mouseleave", () => {
    document.documentElement.classList.remove("has-cur");
    shown = false;
  });
}
