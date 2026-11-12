// Upload queue (SPEC AC-UP-01..05, ARCHITECTURE §8.1): process 1 at a time, upload 3 at a time,
// per-file progress, batch counter, retry of a single failed file, leave-page warning.
import { useEffect, useRef, useState } from "preact/hooks";
import { api, ApiError, isAbort } from "./api";
import { MAX_BATCH, PipelineError, precheck, processImage } from "./image/pipeline";
import { showToast, uploadsInFlight } from "./store";
import type { Photo, UploadParts } from "../lib/db/types";
import { plural } from "../lib/text/plural";

export const COPY = {
  title: "Povuci fotografije ovdje",
  button: "Odaberi fotografije",
  hint: "JPEG, PNG, WebP ili HEIC · do 60 MB po fotografiji",
  overlay: "Pusti za prijenos",
  retry: "Nije uspjelo — Pokušaj ponovno",
  leave: "Prijenos još traje. Ako izađeš, neke fotografije neće biti spremljene.",
  errType: "Ovaj format nije podržan. Izvezi fotografiju kao JPEG.",
  errDecode: "Preglednik ne može otvoriti ovu datoteku. Izvezi je kao JPEG pa pokušaj ponovno.",
  errSize: "Datoteka je veća od 60 MB.",
  errServer: "Poslužitelj je odbio fotografiju. Pokušaj ponovno.",
  errAlbumFull: "Album može imati najviše 400 fotografija.",
} as const;

export interface QueueItem {
  key: string;
  file: File;
  status: "queued" | "processing" | "ready" | "uploading" | "error";
  progress: number;
  thumbUrl: string | null;
  parts: UploadParts | null;
}

export interface Rejected {
  key: string;
  name: string;
  reason: string;
}

const UPLOAD_CONCURRENCY = 3;
let keySeq = 0;

export function useUploader(albumId: string, onUploaded: (p: Photo) => void) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [rejects, setRejects] = useState<Rejected[]>([]);
  const [batch, setBatch] = useState({ total: 0, done: 0 });
  const itemsRef = useRef<QueueItem[]>([]);
  const batchRef = useRef({ total: 0, done: 0, ok: 0 });
  const processing = useRef(false);
  const active = useRef(0);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const commit = (next: QueueItem[]): void => {
    itemsRef.current = next;
    setItems(next);
    uploadsInFlight.value = next.filter((i) => i.status !== "error").length;
  };
  const patch = (key: string, p: Partial<QueueItem>): void =>
    commit(itemsRef.current.map((i) => (i.key === key ? { ...i, ...p } : i)));
  const remove = (key: string): void => {
    const it = itemsRef.current.find((i) => i.key === key);
    if (it?.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
    commit(itemsRef.current.filter((i) => i.key !== key));
  };
  const reject = (name: string, reason: string): void =>
    setRejects((r) => [...r, { key: `r${++keySeq}`, name, reason }]);

  function settle(ok: boolean): void {
    const b = batchRef.current;
    b.done++;
    if (ok) b.ok++;
    setBatch({ total: b.total, done: b.done });
    if (b.done >= b.total && !itemsRef.current.some((i) => i.status !== "error")) {
      if (b.ok > 0) showToast(`Dodano ${b.ok} ${plural(b.ok, "fotografija", "fotografije", "fotografija")}`);
      batchRef.current = { total: 0, done: 0, ok: 0 };
      setBatch({ total: 0, done: 0 });
    }
  }

  async function processNext(): Promise<void> {
    if (processing.current) return;
    const next = itemsRef.current.find((i) => i.status === "queued");
    if (!next) return;
    processing.current = true;
    patch(next.key, { status: "processing" });
    try {
      const out = await processImage(next.file);
      const thumbUrl = URL.createObjectURL(out.v640);
      const old = itemsRef.current.find((i) => i.key === next.key)?.thumbUrl;
      if (old) URL.revokeObjectURL(old);
      patch(next.key, {
        status: "ready",
        thumbUrl,
        parts: { meta: { w: out.w, h: out.h, lqip: out.lqip }, v2400: out.v2400, v1280: out.v1280, v640: out.v640 },
      });
    } catch (e) {
      const kind = e instanceof PipelineError ? e.kind : "decode";
      reject(next.file.name, kind === "server" ? COPY.errServer : COPY.errDecode);
      remove(next.key);
      settle(false);
    } finally {
      processing.current = false;
    }
    pump();
  }

  async function uploadOne(item: QueueItem, attempt = 1): Promise<void> {
    patch(item.key, { status: "uploading", progress: 0 });
    try {
      const photo = await api.uploadPhoto(albumId, item.parts!, (f) => patch(item.key, { progress: f }));
      remove(item.key);
      onUploadedRef.current(photo);
      settle(true);
    } catch (e) {
      if (isAbort(e)) return;
      if (e instanceof ApiError && e.status === 0 && attempt === 1) {
        await new Promise((r) => setTimeout(r, 2000)); // one retry on network error
        return uploadOne(item, 2);
      }
      if (e instanceof ApiError && (e.code === "ALBUM_FULL" || e.code === "NOT_FOUND")) {
        reject(item.file.name, e.code === "ALBUM_FULL" ? COPY.errAlbumFull : COPY.errServer);
        remove(item.key);
      } else {
        patch(item.key, { status: "error", progress: 0 });
      }
      settle(false);
    }
  }

  function pump(): void {
    void processNext();
    while (active.current < UPLOAD_CONCURRENCY) {
      const next = itemsRef.current.find((i) => i.status === "ready");
      if (!next) break;
      active.current++;
      void uploadOne(next).finally(() => {
        active.current--;
        pump();
      });
    }
  }

  function addFiles(list: FileList | File[]): void {
    const files = [...list].slice(0, MAX_BATCH);
    const accepted: QueueItem[] = [];
    for (const file of files) {
      const why = precheck(file);
      if (why) {
        reject(file.name, why === "type" ? COPY.errType : COPY.errSize);
        continue;
      }
      // Show the local file straight away where the browser can render it (not HEIC).
      const previewable = /^image\/(jpeg|png|webp)$/.test(file.type);
      accepted.push({
        key: `u${++keySeq}`,
        file,
        status: "queued",
        progress: 0,
        thumbUrl: previewable ? URL.createObjectURL(file) : null,
        parts: null,
      });
    }
    if (!accepted.length) return;
    batchRef.current.total += accepted.length;
    setBatch({ total: batchRef.current.total, done: batchRef.current.done });
    commit([...itemsRef.current, ...accepted]);
    pump();
  }

  function retry(key: string): void {
    const it = itemsRef.current.find((i) => i.key === key);
    if (!it || it.status !== "error") return;
    batchRef.current.total++;
    setBatch({ total: batchRef.current.total, done: batchRef.current.done });
    patch(key, { status: it.parts ? "ready" : "queued" });
    pump();
  }

  // AC-UP-04: the browser's leave warning while anything is still in flight.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent): string | undefined => {
      if (uploadsInFlight.value === 0) return undefined;
      e.preventDefault();
      e.returnValue = COPY.leave;
      return COPY.leave;
    };
    addEventListener("beforeunload", onLeave);
    return () => removeEventListener("beforeunload", onLeave);
  }, []);

  return { items, rejects, batch, addFiles, retry, dismissRejects: () => setRejects([]) };
}

interface DropZoneProps {
  onFiles: (files: FileList | File[]) => void;
  disabled?: boolean;
}

/** Drop zone + picker, and the full-page "Pusti za prijenos" overlay while files are dragged in. */
export function DropZone({ onFiles, disabled = false }: DropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pageDrag, setPageDrag] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const enter = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth.current++;
      setPageDrag(true);
    };
    const leave = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setPageDrag(false);
    };
    const overPage = (e: DragEvent): void => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setPageDrag(false);
      setOver(false);
      if (!disabled && e.dataTransfer?.files.length) onFiles(e.dataTransfer.files);
    };
    addEventListener("dragenter", enter);
    addEventListener("dragleave", leave);
    addEventListener("dragover", overPage);
    addEventListener("drop", drop);
    return () => {
      removeEventListener("dragenter", enter);
      removeEventListener("dragleave", leave);
      removeEventListener("dragover", overPage);
      removeEventListener("drop", drop);
    };
  }, [onFiles, disabled]);

  return (
    <>
      <div
        class={`drop${over ? " is-over" : ""}`}
        onDragOver={() => setOver(true)}
        onDragLeave={() => setOver(false)}
      >
        <div class="drop__row">
          <span class="drop__title">{COPY.title}</span>
          <span class="drop__or" aria-hidden="true">
            ·
          </span>
          <button type="button" class="btn btn--secondary" disabled={disabled} onClick={() => input.current?.click()}>
            {COPY.button}
          </button>
        </div>
        <span class="drop__hint">{COPY.hint}</span>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          hidden
          data-upload-input
          onChange={(e) => {
            const files = (e.currentTarget as HTMLInputElement).files;
            if (files?.length) onFiles([...files]);
            (e.currentTarget as HTMLInputElement).value = "";
          }}
        />
      </div>
      {pageDrag && (
        <div class="overlay" aria-hidden="true">
          {COPY.overlay}
        </div>
      )}
    </>
  );
}

export function UploadStatus({ total, done }: { total: number; done: number }) {
  if (total === 0) return null;
  const i = Math.min(total, done + 1);
  return (
    <div class="queue" role="status" aria-live="polite">
      <p class="queue__text">
        Prenosim {i} / {total}
      </p>
      <div class="queue__bar" aria-hidden="true">
        <i ref={(el) => void (el && (el.style.transform = `scaleX(${total ? done / total : 0})`))} />
      </div>
    </div>
  );
}

export function RejectList({ items, onDismiss }: { items: Rejected[]; onDismiss: () => void }) {
  if (!items.length) return null;
  return (
    <ul class="rejects" role="list" aria-live="polite" onClick={onDismiss}>
      {items.map((r) => (
        <li key={r.key}>
          <b>{r.name}</b> — {r.reason}
        </li>
      ))}
    </ul>
  );
}

export function PendingTile({ item, onRetry }: { item: QueueItem; onRetry: (key: string) => void }) {
  const failed = item.status === "error";
  return (
    <li class={`tile ${failed ? "tile--error" : "tile--busy"}`} data-pending={item.status}>
      {item.thumbUrl && <img src={item.thumbUrl} alt="" />}
      {failed ? (
        <div class="tile__err">
          <button type="button" onClick={() => onRetry(item.key)}>
            {COPY.retry}
          </button>
        </div>
      ) : (
        <div class="tile__progress" aria-hidden="true">
          <i ref={(el) => void (el && (el.style.transform = `scaleX(${item.status === "uploading" ? item.progress : 0.04})`))} />
        </div>
      )}
    </li>
  );
}
