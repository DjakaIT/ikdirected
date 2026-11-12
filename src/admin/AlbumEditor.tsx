// Screen 2 — Album (SPEC AC-ALBED-01..08, AC-UP-*, AC-DEL-*; DESIGN §6). One scrolling page:
// fields with autosave, publish switch, uploader, photo grid, danger zone.
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { api, ApiError, errorCopy, isAbort } from "./api";
import Dialog from "./Dialog";
import PhotoGrid from "./PhotoGrid";
import { DropZone, PendingTile, RejectList, UploadStatus, useUploader } from "./Uploader";
import { setFlash, showToast } from "./store";
import { site, type CategorySlug } from "../content/site";
import { NEW_ALBUM_TITLE, type AlbumDetail, type AlbumPatch, type Photo } from "../lib/db/types";
import { plural } from "../lib/text/plural";

const AUTOSAVE_MS = 800;
const STORY_MAX = 600;
const ALT_MAX = 200;

const COPY = {
  back: "← Albumi",
  saving: "Spremam…",
  saved: "Spremljeno",
  failed: "Nije spremljeno — Pokušaj ponovno",
  draft: "Skica",
  published: "Objavljeno",
  noPhotos: "Dodaj barem jednu fotografiju prije objave.",
  noTitle: "Upiši naziv albuma prije objave.",
  view: "Pogledaj na stranici ↗",
  deleted: "Fotografija obrisana",
  undo: "Poništi",
  deleteAlbum: "Obriši album",
  cancel: "Odustani",
  confirmDelete: "Obriši",
  danger: "Opasna zona:",
} as const;

type Fields = Pick<AlbumDetail, "title" | "category" | "place" | "event_date" | "story">;
type SaveState = "idle" | "saving" | "saved" | "failed";

export default function AlbumEditor({ id }: { id: string }) {
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState<Fields | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [save, setSave] = useState<SaveState>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [altFor, setAltFor] = useState<Photo | null>(null);
  const [altText, setAltText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = useRef<AlbumPatch>({});
  const timer = useRef<number>(0);
  const inflight = useRef<AbortController | null>(null);

  async function reload(): Promise<void> {
    try {
      const a = await api.getAlbum(id);
      setAlbum(a);
      setPhotos(a.photos);
      setForm((f) => f ?? { title: a.title, category: a.category, place: a.place, event_date: a.event_date, story: a.story });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else showToast(errorCopy(e));
    }
  }

  useEffect(() => {
    void reload();
  }, [id]);

  // ── autosave (AC-ALBED-01): 800 ms after typing stops, previous request aborted ─────────────
  async function flush(): Promise<boolean> {
    clearTimeout(timer.current);
    const patch = { ...dirty.current };
    if (Object.keys(patch).length === 0) return true;
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setSave("saving");
    try {
      const saved = await api.updateAlbum(id, patch, ctrl.signal);
      for (const k of Object.keys(patch) as Array<keyof AlbumPatch>) {
        if (dirty.current[k] === patch[k]) delete dirty.current[k];
      }
      setAlbum((a) => (a ? { ...a, ...saved } : a));
      setSave(Object.keys(dirty.current).length ? "saving" : "saved");
      if (Object.keys(dirty.current).length) schedule();
      return true;
    } catch (e) {
      if (isAbort(e)) return false;
      setSave("failed"); // the typed value stays in the field
      return false;
    } finally {
      if (inflight.current === ctrl) inflight.current = null;
    }
  }

  function schedule(): void {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), AUTOSAVE_MS);
  }

  function change<K extends keyof Fields>(key: K, value: Fields[K]): void {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    (dirty.current as Record<string, unknown>)[key] = value;
    setReason(null);
    schedule();
  }

  // ── publish switch (AC-ALBED-03) ─────────────────────────────────────────────────────────────
  async function toggleStatus(): Promise<void> {
    if (!album || !form) return;
    const to = album.status === "published" ? "draft" : "published";
    if (to === "published") {
      if (photos.length === 0) return setReason(COPY.noPhotos);
      if (form.title.trim() === NEW_ALBUM_TITLE) return setReason(COPY.noTitle);
    }
    setReason(null);
    if (!(await flush())) return;
    setSave("saving");
    try {
      const saved = await api.updateAlbum(id, { status: to });
      setAlbum((a) => (a ? { ...a, ...saved } : a));
      setSave("saved");
    } catch (e) {
      if (e instanceof ApiError && e.code === "PUBLISH_BLOCKED") {
        setReason(errorCopy(e));
        setSave("idle");
      } else {
        setSave("failed");
        showToast(errorCopy(e));
      }
    }
  }

  // ── uploads ──────────────────────────────────────────────────────────────────────────────────
  const onUploaded = useCallback((p: Photo) => {
    setPhotos((list) => [...list, p]);
    setAlbum((a) => (a && !a.cover_photo_id ? { ...a, cover_photo_id: p.id } : a)); // AC-ALBED-07
  }, []);
  const uploader = useUploader(id, onUploaded);

  // ── photo actions ────────────────────────────────────────────────────────────────────────────
  async function move(from: number, to: number): Promise<void> {
    if (to < 0 || to >= photos.length) return;
    const before = photos;
    const next = [...photos];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setPhotos(next);
    try {
      await api.reorderPhotos(id, next.map((p) => p.id));
    } catch (e) {
      setPhotos(before);
      showToast(errorCopy(e));
    }
  }

  async function setCover(p: Photo): Promise<void> {
    try {
      const saved = await api.updateAlbum(id, { cover_photo_id: p.id });
      setAlbum((a) => (a ? { ...a, ...saved } : a));
    } catch (e) {
      showToast(errorCopy(e));
    }
  }

  async function toggleFeatured(p: Photo): Promise<void> {
    try {
      const saved = await api.updatePhoto(p.id, { featured: !p.featured });
      setPhotos((list) => list.map((x) => (x.id === p.id ? saved : x)));
    } catch (e) {
      showToast(errorCopy(e)); // FEATURED_FULL → feat.full copy (AC-FEAT-02)
    }
  }

  async function removePhoto(p: Photo): Promise<void> {
    const before = photos;
    setPhotos((list) => list.filter((x) => x.id !== p.id)); // instant (AC-DEL-01)
    try {
      await api.deletePhoto(p.id);
      await reload(); // cover may have moved to the next photo (AC-DEL-03)
      showToast(COPY.deleted, {
        label: COPY.undo,
        run: async () => {
          try {
            await api.restorePhoto(p.id);
            await reload();
          } catch (e) {
            showToast(errorCopy(e));
          }
        },
      });
    } catch (e) {
      setPhotos(before);
      showToast(errorCopy(e));
    }
  }

  async function saveAlt(): Promise<void> {
    if (!altFor) return;
    const target = altFor;
    setAltFor(null);
    try {
      const saved = await api.updatePhoto(target.id, { alt: altText.trim() });
      setPhotos((list) => list.map((x) => (x.id === target.id ? saved : x)));
    } catch (e) {
      showToast(errorCopy(e));
    }
  }

  async function deleteAlbum(): Promise<void> {
    try {
      await api.deleteAlbum(id);
      setFlash({ kind: "album-deleted", albumId: id }); // undo toast on Albumi (AC-ALBED-08)
      location.href = "/admin";
    } catch (e) {
      setConfirmDelete(false);
      showToast(errorCopy(e));
    }
  }

  if (missing) {
    return (
      <div class="empty">
        <p>Nešto je pošlo po zlu. Pokušaj ponovno za minutu.</p>
        <a class="link-btn" href="/admin">
          {COPY.back}
        </a>
      </div>
    );
  }
  if (!album || !form) {
    return (
      <p class="adm-loading" aria-busy="true">
        …
      </p>
    );
  }

  const published = album.status === "published";
  const photoWord = plural(photos.length, "fotografiju", "fotografije", "fotografija");

  return (
    <div>
      <div class="ebar">
        <a class="link-btn ebar__back" href="/admin">
          {COPY.back}
        </a>
        <p class={`save${save === "failed" ? " save--failed" : ""}`} role="status" aria-live="polite">
          {save === "saving" && COPY.saving}
          {save === "saved" && COPY.saved}
          {save === "failed" && (
            <button type="button" onClick={() => void flush()}>
              {COPY.failed}
            </button>
          )}
        </p>
        <div class="ebar__status">
          <button type="button" class="switch" role="switch" aria-checked={published} aria-labelledby="sw-on" onClick={() => void toggleStatus()}>
            <span class={`switch__label${published ? "" : " is-on"}`}>{COPY.draft}</span>
            <span class="switch__track" aria-hidden="true">
              <span class="switch__knob" />
            </span>
            <span id="sw-on" class={`switch__label${published ? " is-on" : ""}`}>
              {COPY.published}
            </span>
          </button>
          <p class="ebar__reason" aria-live="polite">
            {reason}
          </p>
        </div>
      </div>

      <h1 class="sr">{form.title}</h1>

      <div class="fields">
        <div class="field">
          <label class="field__label" for="f-title">
            Naziv
          </label>
          <input
            id="f-title"
            class="field__input field__input--title"
            value={form.title}
            maxLength={120}
            onInput={(e) => change("title", e.currentTarget.value)}
          />
        </div>

        <fieldset class="field">
          <legend class="field__label">Kategorija</legend>
          <div class="seg">
            {site.categories.map((c) => (
              <label key={c.slug}>
                <input
                  type="radio"
                  name="category"
                  value={c.slug}
                  checked={form.category === c.slug}
                  onChange={() => change("category", c.slug as CategorySlug)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div class="fields__pair">
          <div class="field">
            <label class="field__label" for="f-place">
              Mjesto
            </label>
            <input id="f-place" class="field__input" value={form.place} maxLength={80} onInput={(e) => change("place", e.currentTarget.value)} />
          </div>
          <div class="field">
            <label class="field__label" for="f-date">
              Datum
            </label>
            <input
              id="f-date"
              type="date"
              class="field__input"
              value={form.event_date}
              min="2000-01-01"
              onInput={(e) => e.currentTarget.value && change("event_date", e.currentTarget.value)}
            />
          </div>
        </div>

        <div class="field">
          <div class="field__row">
            <label class="field__label" for="f-story">
              Kratka priča (neobavezno)
            </label>
            <span class="field__count" id="f-story-count">
              {form.story.length}/{STORY_MAX}
            </span>
          </div>
          <textarea
            id="f-story"
            class="field__input"
            value={form.story}
            maxLength={STORY_MAX}
            aria-describedby="f-story-count"
            onInput={(e) => change("story", e.currentTarget.value)}
          />
        </div>
      </div>

      <section class="esec" aria-labelledby="photos-title">
        <div class="esec__head">
          <h2 class="adm-h2" id="photos-title">
            Fotografije ({photos.length})
          </h2>
          {published && album.slug && (
            <a class="link-btn" href={`/radovi/${album.slug}`} target="_blank" rel="noopener">
              {COPY.view}
            </a>
          )}
        </div>
        <DropZone onFiles={uploader.addFiles} />
        <UploadStatus total={uploader.batch.total} done={uploader.batch.done} />
        <RejectList items={uploader.rejects} onDismiss={uploader.dismissRejects} />
        <PhotoGrid
          photos={photos}
          coverId={album.cover_photo_id}
          move={(a, b) => void move(a, b)}
          setCover={(p) => void setCover(p)}
          toggleFeatured={(p) => void toggleFeatured(p)}
          editAlt={(p) => {
            setAltText(p.alt);
            setAltFor(p);
          }}
          remove={(p) => void removePhoto(p)}
        >
          {uploader.items.map((it) => (
            <PendingTile key={it.key} item={it} onRetry={uploader.retry} />
          ))}
        </PhotoGrid>
      </section>

      <section class="esec danger-zone" aria-label="Opasna zona">
        <span class="danger-zone__label">{COPY.danger}</span>
        <button type="button" class="btn btn--danger" onClick={() => setConfirmDelete(true)}>
          {COPY.deleteAlbum}
        </button>
      </section>

      <Dialog
        open={confirmDelete}
        title={COPY.deleteAlbum}
        onClose={() => setConfirmDelete(false)}
        actions={
          <>
            <button type="button" class="btn btn--secondary" autofocus onClick={() => setConfirmDelete(false)}>
              {COPY.cancel}
            </button>
            <button type="button" class="btn btn--danger" onClick={() => void deleteAlbum()}>
              {COPY.confirmDelete}
            </button>
          </>
        }
      >
        <p>
          Obrisati „{form.title}” i {photos.length} {photoWord}? Moći ćeš ga vratiti idućih 7 dana.
        </p>
      </Dialog>

      <Dialog
        open={altFor !== null}
        title="Opis fotografije"
        onClose={() => setAltFor(null)}
        actions={
          <>
            <button type="button" class="btn btn--secondary" onClick={() => setAltFor(null)}>
              {COPY.cancel}
            </button>
            <button type="button" class="btn btn--primary" onClick={() => void saveAlt()}>
              Spremi
            </button>
          </>
        }
      >
        <div class="field">
          <div class="field__row">
            <label class="field__label" for="f-alt">
              Opis fotografije
            </label>
            <span class="field__count" id="f-alt-count">
              {altText.length}/{ALT_MAX}
            </span>
          </div>
          <textarea
            id="f-alt"
            class="field__input"
            autofocus
            value={altText}
            maxLength={ALT_MAX}
            aria-describedby="f-alt-count"
            onInput={(e) => setAltText(e.currentTarget.value)}
          />
        </div>
      </Dialog>
    </div>
  );
}
