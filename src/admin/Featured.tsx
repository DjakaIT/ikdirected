// Screen 3 — Naslovnica (SPEC AC-FEAT-01..04, DESIGN §6): the homepage selection in its public
// order, as a strip that mimics the public track. Reorder by drag or the ← / → buttons; "Makni".
import { useEffect, useRef, useState } from "preact/hooks";
import Sortable from "sortablejs";
import { api, errorCopy } from "./api";
import { showToast } from "./store";
import { FEATURED_CAP, type FeaturedPhoto } from "../lib/db/types";
import { trackClass } from "../lib/layout/track";

export default function Featured() {
  const [photos, setPhotos] = useState<FeaturedPhoto[] | null>(null);
  const strip = useRef<HTMLUListElement>(null);
  const photosRef = useRef<FeaturedPhoto[]>([]);
  photosRef.current = photos ?? [];

  useEffect(() => {
    api
      .listFeatured()
      .then((r) => setPhotos(r.photos))
      .catch((e) => {
        setPhotos([]);
        showToast(errorCopy(e));
      });
  }, []);

  async function reorder(next: FeaturedPhoto[]): Promise<void> {
    const before = photosRef.current;
    setPhotos(next);
    try {
      await api.reorderFeatured(next.map((p) => p.id));
    } catch (e) {
      setPhotos(before);
      showToast(errorCopy(e));
    }
  }

  function move(from: number, to: number, refocus?: string): void {
    const list = photosRef.current;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    void reorder(next);
    if (refocus) requestAnimationFrame(() => document.querySelector<HTMLElement>(refocus)?.focus());
  }

  async function removeOne(p: FeaturedPhoto): Promise<void> {
    const before = photosRef.current;
    setPhotos(before.filter((x) => x.id !== p.id));
    try {
      await api.updatePhoto(p.id, { featured: false });
    } catch (e) {
      setPhotos(before);
      showToast(errorCopy(e));
    }
  }

  useEffect(() => {
    if (!strip.current || !photos?.length) return;
    const sortable = new Sortable(strip.current, {
      animation: 160,
      direction: "horizontal",
      draggable: ".fitem",
      filter: "button",
      ghostClass: "is-ghost",
      delayOnTouchOnly: true,
      delay: 150,
      onEnd: (evt) => {
        const { oldIndex, newIndex, item } = evt;
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;
        const parent = item.parentElement!;
        parent.removeChild(item);
        parent.insertBefore(item, parent.children[oldIndex] ?? null);
        move(oldIndex, newIndex);
      },
    });
    return () => sortable.destroy();
  }, [photos === null, (photos?.length ?? 0) > 0]);

  const n = photos?.length ?? 0;

  return (
    <div>
      <div class="fhead">
        <h1 class="adm-h1">Naslovnica</h1>
        {photos && (
          <span class="fhead__count" aria-label={`${n} od ${FEATURED_CAP}`}>
            {n} / {FEATURED_CAP}
          </span>
        )}
      </div>
      <p class="fhelp">
        Ove fotografije vide se na početnoj stranici, ovim redom. Ako odabereš manje od 4, dopunit ću ih naslovnim fotografijama najnovijih
        albuma.
      </p>

      {photos === null ? (
        <p class="adm-loading" aria-busy="true">
          …
        </p>
      ) : n === 0 ? (
        <div class="empty">
          <p>Još nisi odabrala fotografije za naslovnicu. Otvori album i u izborniku ⋯ odaberi „Na naslovnicu”.</p>
        </div>
      ) : (
        <ul class="fstrip" role="list" ref={strip} aria-label="Redoslijed na naslovnici">
          {photos.map((p, i) => (
            <li class={`fitem ${trackClass(p.width, p.height)}`} key={p.id} data-id={p.id}>
              <div class="fitem__img">
                <img src={p.thumb} alt={p.alt} width={p.width} height={p.height} loading="lazy" decoding="async" />
              </div>
              <p class="fitem__cap">
                <b>
                  {String(i + 1).padStart(2, "0")} · {p.album_title}
                </b>
                {p.album_status !== "published" && <span class="fitem__draft">Skica</span>}
              </p>
              <div class="fitem__actions">
                <button
                  type="button"
                  aria-label="Pomakni lijevo"
                  data-left={p.id}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1, `[data-left="${p.id}"]`)}
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label="Pomakni desno"
                  data-right={p.id}
                  disabled={i === n - 1}
                  onClick={() => move(i, i + 1, `[data-right="${p.id}"]`)}
                >
                  →
                </button>
                <button type="button" onClick={() => void removeOne(p)}>
                  Makni
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
