// Fades photos in once decoded (DESIGN §7 "Image appear") and drops the LQIP layer.

function reveal(pic: Element): void {
  pic.classList.add("is-loaded");
}

export function initPictures(root: ParentNode): void {
  for (const pic of root.querySelectorAll(".pic:not(.is-loaded)")) {
    const img = pic.querySelector<HTMLImageElement>(".pic__img");
    if (!img) continue;
    if (img.complete && img.naturalWidth > 0) {
      reveal(pic);
      continue;
    }
    img.addEventListener(
      "load",
      () => {
        img
          .decode()
          .catch(() => undefined)
          .then(() => reveal(pic));
      },
      { once: true },
    );
    img.addEventListener("error", () => reveal(pic), { once: true });
  }
}
