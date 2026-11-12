// Right side of the admin top bar: publish status (the public site is rebuilt after changes, ~2 min), the account
// menu (password, users and invites, publish settings — the last two for the administrator) and "Odjava".
import { useEffect, useRef, useState } from "preact/hooks";
import Dialog from "./Dialog";
import { accounts, auth, authCopy, publishing, type PublishSettings, type PublishStatus, type UserRow } from "./api";
import { session, signedOut } from "./session";
import { showToast } from "./store";

const POLL_MS = 10_000;

const time = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString("hr-HR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

function statusLine(p: PublishStatus | null): { text: string; tone: "ok" | "wait" | "bad" } | null {
  if (!p) return null;
  if (p.state === "unconfigured") return { text: "Objava nije postavljena", tone: "bad" };
  if (p.state === "error") return { text: "Objava nije uspjela", tone: "bad" };
  if (p.state === "building") return { text: "Objavljujem…", tone: "wait" };
  if (p.pending) return { text: "Čeka objavu", tone: "wait" };
  return { text: "Stranica je ažurna", tone: "ok" };
}

export default function AccountBar() {
  const s = session.value;
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<"password" | "users" | "publish" | null>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const signedIn = s.kind === "in";

  async function poll(): Promise<void> {
    try {
      setStatus(await publishing.status(true));
    } catch {
      /* a 401 signs out; anything else: try again on the next tick */
    }
  }

  useEffect(() => {
    if (!signedIn) return;
    void poll();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [signedIn]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && (e.target as HTMLElement).closest(".acct")) return;
      setMenu(false);
      if (e instanceof KeyboardEvent) menuBtn.current?.focus();
    };
    document.addEventListener("keydown", close);
    document.addEventListener("click", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("click", close);
    };
  }, [menu]);

  if (!signedIn) return null;
  const isAdmin = s.role === "admin";
  const line = statusLine(status);

  async function publishNow(): Promise<void> {
    try {
      await publishing.now();
      setStatus((p) => (p ? { ...p, state: "building" } : p));
      setTimeout(() => void poll(), 1500);
    } catch (e) {
      showToast(authCopy(e));
    }
  }

  async function logout(): Promise<void> {
    try {
      await auth.logout();
    } finally {
      signedOut(null);
      location.href = "/admin";
    }
  }

  return (
    <div class="acct">
      {line && (
        <p class={`acct__status acct__status--${line.tone} m`} role="status" title={status?.published ? `Zadnja objava: ${time(status.published)}` : undefined}>
          <span class="acct__dot" aria-hidden="true" />
          {line.text}
          {status && (status.pending || status.state === "error") && status.state !== "building" && status.state !== "unconfigured" && (
            <button class="acct__now" type="button" onClick={() => void publishNow()}>
              Objavi sada
            </button>
          )}
          {status?.state === "error" && status.message && <span class="sr"> — {status.message}</span>}
        </p>
      )}
      <div class="acct__menu">
        <button ref={menuBtn} class="adm-top__out" type="button" aria-expanded={menu} aria-haspopup="true" onClick={() => setMenu((m) => !m)}>
          {s.name}
        </button>
        {menu && (
          <ul class="acct__list" role="list">
            <li>
              <button type="button" onClick={() => (setMenu(false), setDialog("password"))}>
                Promijeni lozinku
              </button>
            </li>
            {isAdmin && (
              <li>
                <button type="button" onClick={() => (setMenu(false), setDialog("users"))}>
                  Korisnici
                </button>
              </li>
            )}
            {isAdmin && (
              <li>
                <button type="button" onClick={() => (setMenu(false), setDialog("publish"))}>
                  Objava stranice
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <button class="adm-top__out" type="button" onClick={() => void logout()}>
        Odjava
      </button>
      <PasswordDialog open={dialog === "password"} onClose={() => setDialog(null)} />
      {isAdmin && <UsersDialog open={dialog === "users"} self={s.name} onClose={() => setDialog(null)} />}
      {isAdmin && <PublishDialog open={dialog === "publish"} status={status} onClose={() => setDialog(null)} onSaved={() => void poll()} />}
    </div>
  );
}

function val(form: HTMLFormElement, name: string): string {
  return (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? "";
}

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  async function save(): Promise<void> {
    const f = form.current!;
    setError("");
    if (val(f, "next") !== val(f, "next2")) return setError("Nove lozinke se ne podudaraju.");
    try {
      await auth.changePassword(val(f, "old"), val(f, "next"));
      f.reset();
      onClose();
      showToast("Lozinka je promijenjena. Ostali uređaji su odjavljeni.");
    } catch (e) {
      setError(authCopy(e));
    }
  }
  return (
    <Dialog
      open={open}
      title="Promijeni lozinku"
      onClose={onClose}
      actions={
        <>
          <button class="btn btn--secondary" type="button" autofocus onClick={onClose}>
            Odustani
          </button>
          <button class="btn btn--primary" type="button" onClick={() => void save()}>
            Spremi
          </button>
        </>
      }
    >
      <form ref={form} class="acct__form" onSubmit={(e) => (e.preventDefault(), void save())}>
        <label class="field">
          <span class="field__label">Trenutna lozinka</span>
          <input class="field__input" name="old" type="password" autocomplete="current-password" required />
        </label>
        <div class="field">
          <label class="field__label" for="pw-next">
            Nova lozinka
          </label>
          <input id="pw-next" class="field__input" name="next" type="password" autocomplete="new-password" required aria-describedby="pw-hint" />
          <span id="pw-hint" class="field__hint">
            Barem 12 znakova — najlakše je nekoliko riječi.
          </span>
        </div>
        <label class="field">
          <span class="field__label">Ponovi novu lozinku</span>
          <input class="field__input" name="next2" type="password" autocomplete="new-password" required />
        </label>
        <p class="auth__error" role="alert">
          {error}
        </p>
      </form>
    </Dialog>
  );
}

function UsersDialog({ open, self, onClose }: { open: boolean; self: string; onClose: () => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [link, setLink] = useState<{ name: string; link: string } | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");

  async function load(): Promise<void> {
    try {
      setUsers((await accounts.list()).users);
    } catch (e) {
      setError(authCopy(e));
    }
  }
  useEffect(() => {
    if (open) {
      setLink(null);
      setError("");
      void load();
    }
  }, [open]);

  async function invite(n: string, reset = false): Promise<void> {
    setError("");
    try {
      setLink(await accounts.invite(n, reset));
      setName("");
      await load();
    } catch (e) {
      setError(authCopy(e));
    }
  }
  async function remove(n: string): Promise<void> {
    if (!confirm(`Ukloniti korisnika ${n}? Odmah se odjavljuje sa svih uređaja.`)) return;
    try {
      await accounts.remove(n);
      await load();
    } catch (e) {
      setError(authCopy(e));
    }
  }

  return (
    <Dialog
      open={open}
      title="Korisnici"
      onClose={onClose}
      actions={
        <button class="btn btn--secondary" type="button" autofocus onClick={onClose}>
          Zatvori
        </button>
      }
    >
      <p class="acct__help">Svatko se prijavljuje svojom lozinkom i kodom s mobitela. Pozivnica je poveznica kojom nova osoba sama odabere lozinku; vrijedi 72 sata.</p>
      <ul class="acct__users" role="list">
        {users.map((u) => (
          <li key={u.name}>
            <span>
              <strong>{u.name}</strong> · {u.role === "admin" ? "administrator" : "urednik"} · {u.state}
              {u.lastLogin && ` · zadnja prijava ${time(u.lastLogin)}`}
            </span>
            {u.name !== self && (
              <span class="acct__actions">
                <button class="link-btn" type="button" onClick={() => void invite(u.name, true)}>
                  Nova pozivnica
                </button>
                <button class="link-btn" type="button" onClick={() => void remove(u.name)}>
                  Ukloni
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <form class="acct__invite" onSubmit={(e) => (e.preventDefault(), void invite(name))}>
        <label class="field">
          <span class="field__label">Pozovi novu osobu (korisničko ime)</span>
          <input class="field__input" value={name} onInput={(e) => setName(e.currentTarget.value)} autocapitalize="off" spellcheck={false} required />
        </label>
        <button class="btn btn--secondary" type="submit">
          Napravi pozivnicu
        </button>
      </form>
      {link && (
        <div class="acct__link">
          <p>
            Pozivnica za <strong>{link.name}</strong>. Pošalji je osobno (poruka ili e-pošta), ne javno:
          </p>
          <input class="field__input m" readOnly value={link.link} onFocus={(e) => e.currentTarget.select()} aria-label="Poveznica pozivnice" />
          <button class="link-btn" type="button" onClick={() => void navigator.clipboard?.writeText(link.link).then(() => showToast("Poveznica je kopirana."))}>
            Kopiraj poveznicu
          </button>
        </div>
      )}
      <p class="auth__error" role="alert">
        {error}
      </p>
    </Dialog>
  );
}

function PublishDialog({ open, status, onClose, onSaved }: { open: boolean; status: PublishStatus | null; onClose: () => void; onSaved: () => void }) {
  const [settings, setSettings] = useState<PublishSettings | null>(null);
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!open) return;
    setError("");
    publishing.settings().then(setSettings, (e) => setError(authCopy(e)));
  }, [open]);

  async function save(): Promise<void> {
    const f = form.current!;
    setError("");
    try {
      setSettings(await publishing.saveSettings({ repo: val(f, "repo"), branch: val(f, "branch"), token: val(f, "token") }));
      (f.elements.namedItem("token") as HTMLInputElement).value = "";
      showToast("Veza s GitHubom radi.");
      onSaved();
    } catch (e) {
      setError(authCopy(e));
    }
  }

  return (
    <Dialog
      open={open}
      title="Objava stranice"
      onClose={onClose}
      actions={
        <>
          <button class="btn btn--secondary" type="button" autofocus onClick={onClose}>
            Zatvori
          </button>
          <button class="btn btn--primary" type="button" onClick={() => void save()}>
            Spremi i provjeri vezu
          </button>
        </>
      }
    >
      <p class="acct__help">
        Nakon promjena javna stranica se nanovo izgradi na GitHubu (oko 2 minute), a Hostinger je preuzme s grane
        hosting (hPanel → Git, automatsko postavljanje).
        {status?.published && ` Zadnja objava: ${time(status.published)}.`}
        {settings?.deployed?.built && ` Na hostingu je verzija izgrađena ${time(settings.deployed.built)}.`}
      </p>
      {status?.state === "error" && status.message && <p class="auth__error">{status.message}</p>}
      <form ref={form} class="acct__form" onSubmit={(e) => (e.preventDefault(), void save())}>
        <label class="field">
          <span class="field__label">Repozitorij</span>
          <input class="field__input m" name="repo" value={settings?.repo ?? ""} placeholder="DjakaIT/ikdirected" spellcheck={false} />
        </label>
        <label class="field">
          <span class="field__label">Grana za sadržaj</span>
          <input class="field__input m" name="branch" value={settings?.branch ?? "sadrzaj"} spellcheck={false} />
        </label>
        <div class="field">
          <label class="field__label" for="pub-token">
            GitHub token
          </label>
          <input
            id="pub-token"
            class="field__input m"
            name="token"
            type="password"
            autocomplete="off"
            placeholder={settings?.tokenSet ? "postavljen — upiši novi samo za zamjenu" : "github_pat_…"}
            aria-describedby="tok-hint"
          />
          <span id="tok-hint" class="field__hint">
            Fine-grained token samo za ovaj repozitorij: Contents read and write, Actions read-only.
            {settings?.tokenExpires && ` Istječe ${time(settings.tokenExpires)}.`}
          </span>
        </div>
      </form>
      <p class="auth__error" role="alert">
        {error}
      </p>
    </Dialog>
  );
}
