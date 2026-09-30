// Photo grid (SPEC AC-ALBED-05..07, AC-DEL-01/03; DESIGN §6): drag to reorder (mouse + touch via
// sortablejs), keyboard alternative through the ⋯ menu (Pomakni lijevo / desno), cover and
// homepage flags, alt text, delete with undo.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import Sortable from "sortablejs";
import type { Photo } from "../lib/db/types";

export interface PhotoActions {
  move: (from: number, to: number) => void;
  setCover: (p: Photo) => void;
  toggleFeatured: (p: Photo) => void;
  editAlt: (p: Photo) => void;
  remove: (p: Photo) => void;
}

interface Props extends PhotoActions {
  photos: Photo[];
  coverId: string | null;
  /** Pending upload tiles, rendered after the photos. */
  children?: ComponentChildren;
}

export default function PhotoGrid({ photos, coverId, children, ...actions }: Props) {
  const list = useRef<HTMLUListElement>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const moveRef = useRef(actions.move);
  moveRef.current = actions.move;

  useEffect(() => {
    if (!list.current) return;
    const sortable = new Sortable(list.current, {
      animation: 160,
      handle: ".tile__handle",
      draggable: ".tile--photo",
      ghostClass: "is-ghost",
      chosenClass: "is-chosen",
      delayOnTouchOnly: true,
      delay: 120,
      onEnd: (evt) => {
        const { oldIndex, newIndex, item } = evt;
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;
        // Put the node back where Preact expects it, then let state re-render the new order.
        const parent = item.parentElement!;
        parent.removeChild(item);
        parent.insertBefore(item, parent.children[oldIndex] ?? null);
        moveRef.current(oldIndex, newIndex);
      },
    });
    return () => sortable.destroy();
  }, []);

  return (
    <ul class="pgrid" role="list" ref={list} aria-label="Fotografije">
      {photos.map((p, i) => (
        <li class="tile tile--photo" key={p.id} data-id={p.id}>
          <img class="tile__lqip" src={p.lqip} alt="" aria-hidden="true" />
          <img src={p.thumb} alt={p.alt} loading="lazy" decoding="async" />
          <span class="tile__handle" aria-hidden="true">
            ⠿
          </span>
          <div class="tile__badges">
            {p.id === coverId && <span class="tile__badge">Naslovna</span>}
            {p.featured && (
              <span class="tile__badge">
                <span aria-hidden="true">★</span>
                <span class="sr">Na naslovnici</span>
              </span>
            )}
          </div>
          <button
            type="button"
            class="tile__menu-btn"
            aria-haspopup="menu"
            aria-expanded={menuFor === p.id}
            aria-label={`Izbornik fotografije ${i + 1}`}
            data-menu-btn={p.id}
            onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
          >
            ⋯
          </button>
          {menuFor === p.id && (
            <TileMenu
              photo={p}
              index={i}
              count={photos.length}
              isCover={p.id === coverId}
              close={(refocus) => {
                setMenuFor(null);
                if (refocus) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-menu-btn="${p.id}"]`)?.focus());
              }}
              {...actions}
            />
          )}
        </li>
      ))}
      {children}
    </ul>
  );
}

interface MenuProps extends PhotoActions {
  photo: Photo;
  index: number;
  count: number;
  isCover: boolean;
  close: (refocus: boolean) => void;
}

function TileMenu({ photo, index, count, isCover, close, ...a }: MenuProps) {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    const outside = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if ((t as Element).closest?.(`[data-menu-btn="${photo.id}"]`)) return;
      close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  const items: Array<{ label: string; run: () => void; disabled?: boolean; danger?: boolean; keepFocus?: boolean }> = [
    { label: "Postavi kao naslovnu", run: () => a.setCover(photo), disabled: isCover },
    { label: photo.featured ? "Makni s naslovnice" : "Na naslovnicu", run: () => a.toggleFeatured(photo) },
    { label: "Opis fotografije", run: () => a.editAlt(photo), keepFocus: true },
    { label: "Pomakni lijevo", run: () => a.move(index, index - 1), disabled: index === 0 },
    { label: "Pomakni desno", run: () => a.move(index, index + 1), disabled: index === count - 1 },
    { label: "Obriši", run: () => a.remove(photo), danger: true, keepFocus: true },
  ];

  function onKey(e: KeyboardEvent): void {
    const all = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length];
      next?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      (e.key === "Home" ? all[0] : all[all.length - 1])?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  return (
    <ul class="menu" role="menu" ref={ref} onKeyDown={onKey} aria-label="Radnje s fotografijom">
      {items.map((it, i) => (
        <li role="none" key={i}>
          {it.danger && <hr />}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            class={it.danger ? "is-danger" : undefined}
            aria-disabled={it.disabled ? "true" : undefined}
            onClick={() => {
              if (it.disabled) return;
              close(!it.keepFocus);
              it.run();
            }}
          >
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
