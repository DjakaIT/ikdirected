// Screen 1 — Albumi (SPEC AC-ALBL-01..04, DESIGN §6).
import { useEffect, useMemo, useState } from "preact/hooks";
import { api, errorCopy } from "./api";
import { showToast, takeFlash } from "./store";
import { site, type CategorySlug } from "../content/site";
import type { AlbumCard } from "../lib/db/types";
import { longDate } from "../lib/text/dates";
import { countPhotos } from "../lib/text/plural";

type Filter = "all" | CategorySlug | "drafts";

export default function AlbumList() {
  const [albums, setAlbums] = useState<AlbumCard[] | null>(null);
  const [trash, setTrash] = useState<AlbumCard[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);

  async function load(): Promise<void> {
    try {
      const res = await api.listAlbums();
      setAlbums(res.albums);
      setTrash(res.trash);
    } catch (e) {
      setAlbums([]);
      showToast(errorCopy(e));
    }
  }

  async function restore(id: string): Promise<void> {
    try {
      await api.restoreAlbum(id);
      await load();
    } catch (e) {
      showToast(errorCopy(e));
    }
  }

  useEffect(() => {
    void load().then(() => {
      const flash = takeFlash();
      if (flash?.kind === "album-deleted") {
        showToast("Album obrisan", { label: "Poništi", run: () => restore(flash.albumId) });
      }
    });
  }, []);

  async function create(): Promise<void> {
    if (creating) return;
    setCreating(true);
    try {
      const category = filter !== "all" && filter !== "drafts" ? filter : undefined;
      const album = await api.createAlbum(category);
      location.href = `/admin/albumi/${album.id}`;
    } catch (e) {
      setCreating(false);
      showToast(errorCopy(e));
    }
  }

  const counts = useMemo(() => {
    const list = albums ?? [];
    const by = (f: Filter) =>
      f === "all" ? list.length : f === "drafts" ? list.filter((a) => a.status === "draft").length : list.filter((a) => a.category === f).length;
    return by;
  }, [albums]);

  const shown = (albums ?? []).filter((a) =>
    filter === "all" ? true : filter === "drafts" ? a.status === "draft" : a.category === filter,
  );

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "Sve" },
    ...site.categories.map((c) => ({ key: c.slug as Filter, label: c.name })),
    { key: "drafts", label: "Skice" },
  ];

  const newButton = (
    <button type="button" class="btn btn--primary" onClick={create} disabled={creating}>
      Novi album
    </button>
  );

  return (
    <div>
      <div class="ahead">
        <h1 class="adm-h1">
          Albumi
          {albums && <span class="ahead__count">{albums.length}</span>}
        </h1>
        {albums && albums.length > 0 && newButton}
      </div>

      {albums === null ? (
        <p class="adm-loading" aria-busy="true">
          …
        </p>
      ) : albums.length === 0 ? (
        <div class="empty">
          <p>Još nemaš nijedan album. Napravi prvi i dodaj fotografije.</p>
          {newButton}
        </div>
      ) : (
        <>
          <ul class="achips" role="list" aria-label="Filtar">
            {filters.map((f) => (
              <li key={f.key}>
                <button type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                  {f.label} <span class="n">{counts(f.key)}</span>
                </button>
              </li>
            ))}
          </ul>
          <ul class="agrid" role="list">
            {shown.map((a) => (
              <li class="acard" key={a.id}>
                <a href={`/admin/albumi/${a.id}`}>
                  <div class="acard__img">
                    {a.cover ? (
                      <>
                        <img class="acard__lqip" src={a.cover.lqip} alt="" aria-hidden="true" />
                        <img src={a.cover.thumb} alt="" loading="lazy" decoding="async" />
                      </>
                    ) : (
                      <span class="acard__empty" aria-hidden="true" />
                    )}
                  </div>
                  <h2 class="acard__t">{a.title}</h2>
                  <p class="acard__m">
                    <span>{longDate(a.event_date)}</span>
                    <span class={`pill ${a.status === "published" ? "pill--published" : ""}`}>
                      {a.status === "published" ? "Objavljeno" : "Skica"}
                    </span>
                    <span>{countPhotos(a.photo_count)}</span>
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {trash.length > 0 && (
        <details class="trash">
          <summary>Nedavno obrisano ({trash.length})</summary>
          <ul role="list">
            {trash.map((a) => (
              <li key={a.id}>
                <span>
                  {a.title} <span class="trash__meta">· {countPhotos(a.photo_count)}</span>
                </span>
                <button type="button" class="btn btn--secondary" onClick={() => restore(a.id)}>
                  Vrati
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
