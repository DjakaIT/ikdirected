// Sign-in in front of every admin screen (SPEC §4 Access, hosting version): first setup, password + code from the
// phone (TOTP), invite links (#pozivnica=…), recovery codes. Flow and rules follow the CamelliaSinensis admin.
// Children render only once the API says the session is fully signed in.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { auth, authCopy, ApiError, type SignedInAnswer, type TwoFactorSetup } from "./api";
import { session, signedIn } from "./session";
import qrcode from "./vendor/qrcode.mjs";

type View =
  | { v: "loading" }
  | { v: "login"; note?: string | undefined }
  | { v: "2fa" }
  | { v: "setup"; codeRequired: boolean }
  | { v: "invite"; token: string; name: string }
  | { v: "invite-bad" }
  | { v: "setup-2fa"; uri: string; key: string }
  | { v: "codes"; answer: SignedInAnswer };

const REASONS: Record<string, string> = {
  neaktivnost: "Prijava je istekla nakon 30 minuta bez rada. Prijavi se ponovno.",
  trajanje: "Prijava traje najviše 12 sati. Prijavi se ponovno.",
  odjavljen: "Lozinka je promijenjena ili je račun odjavljen. Prijavi se ponovno.",
  korak: "Prijava je istekla. Upiši lozinku ponovno.",
};

const PASSWORD_HINT = "Barem 12 znakova — najlakše je nekoliko riječi.";

function qrDataUrl(uri: string): string {
  const q = qrcode(0, "M");
  q.addData(uri);
  q.make();
  return q.createDataURL(5, 4);
}

function inviteToken(): string | null {
  const m = /^#pozivnica=([A-Za-z0-9_-]{20,100})$/.exec(location.hash);
  return m ? m[1]! : null;
}

function Card({ title, intro, wide, children }: { title: string; intro?: ComponentChildren; wide?: boolean; children: ComponentChildren }) {
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => h.current?.focus(), [title]);
  return (
    <section class={`auth${wide ? " auth--wide" : ""}`} aria-labelledby="auth-title">
      <p class="auth__brand m">ikdirected · administracija</p>
      <h1 id="auth-title" class="auth__title" tabIndex={-1} ref={h}>
        {title}
      </h1>
      {intro && <div class="auth__intro">{intro}</div>}
      {children}
    </section>
  );
}

function Field(p: { label: string; name: string; type?: string; autocomplete?: string; inputMode?: "numeric" | "text"; hint?: string; value?: string; autofocus?: boolean; maxLength?: number }) {
  const id = `auth-${p.name}`;
  const hintId = p.hint ? `${id}-hint` : undefined;
  return (
    <div class="field">
      <label class="field__label" for={id}>
        {p.label}
      </label>
      <input
        id={id}
        class="field__input"
        name={p.name}
        type={p.type ?? "text"}
        autocomplete={p.autocomplete}
        inputMode={p.inputMode}
        required
        maxLength={p.maxLength}
        aria-describedby={hintId}
        value={p.value}
        autofocus={p.autofocus}
        spellcheck={false}
        autocapitalize="off"
      />
      {p.hint && (
        <span id={hintId} class="field__hint">
          {p.hint}
        </span>
      )}
    </div>
  );
}

/** a form whose submit runs `act`; errors show in one alert line */
function Form({ submit, act, children }: { submit: string; act: (f: HTMLFormElement) => Promise<void>; children: ComponentChildren }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      class="auth__form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
          await act(e.currentTarget);
        } catch (err) {
          setError(err instanceof Error && err.message && !(err instanceof ApiError) ? err.message : authCopy(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      <p class="auth__error" role="alert">
        {error}
      </p>
      <button class="btn btn--primary auth__submit" type="submit" disabled={busy}>
        {submit}
      </button>
    </form>
  );
}

const val = (f: HTMLFormElement, name: string): string => (f.elements.namedItem(name) as HTMLInputElement | null)?.value ?? "";

function newPasswordFrom(f: HTMLFormElement): string {
  const p = val(f, "password");
  if (p !== val(f, "password2")) throw new Error("Lozinke se ne podudaraju.");
  return p;
}

export default function AuthGate({ children }: { children: ComponentChildren }) {
  const [view, setView] = useState<View>({ v: "loading" });
  const s = session.value;

  async function load(): Promise<void> {
    const token = inviteToken();
    if (token) {
      try {
        const { name } = await auth.checkInvite(token);
        setView({ v: "invite", token, name });
      } catch {
        setView({ v: "invite-bad" });
      }
      return;
    }
    try {
      const st = await auth.state();
      if (st.step === "in" && st.name && st.role && st.csrf) {
        signedIn({ name: st.name, role: st.role, csrf: st.csrf });
        return;
      }
      session.value = { kind: "out", firstSetup: st.firstSetup, codeRequired: !!st.codeRequired, step: st.step === "in" ? null : st.step, reason: st.reason };
      if (st.firstSetup) setView({ v: "setup", codeRequired: !!st.codeRequired });
      else if (st.step === "2fa") setView({ v: "2fa" });
      else setView({ v: "login", note: st.reason ? REASONS[st.reason] : undefined });
    } catch {
      setView({ v: "login", note: "Administracija trenutno nije dostupna. Pokušaj ponovno za minutu." });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // the API signed the page out while working (expired session, a 401): back to sign-in with the reason
  const wasIn = useRef(false);
  useEffect(() => {
    if (s.kind === "in") wasIn.current = true;
    else if (s.kind === "out" && wasIn.current) {
      wasIn.current = false;
      setView({ v: "login", note: (s.reason && REASONS[s.reason]) || "Prijava je istekla. Prijavi se ponovno." });
    }
  }, [s.kind]);

  const afterPassword = (r: { step: "2fa" } | TwoFactorSetup) => setView(r.step === "2fa" ? { v: "2fa" } : { v: "setup-2fa", uri: r.uri, key: r.key });
  const finish = (r: SignedInAnswer) => {
    if (location.hash) history.replaceState(null, "", location.pathname);
    if (r.recoveryCodes?.length) setView({ v: "codes", answer: r });
    else signedIn({ name: r.name, role: r.role, csrf: r.csrf });
  };

  if (s.kind === "in" && view.v !== "codes") return <>{children}</>;

  switch (view.v) {
    case "loading":
      return (
        <p class="auth__loading m" role="status">
          Učitavam…
        </p>
      );
    case "login":
      return (
        <Card title="Prijava" intro={view.note && <p>{view.note}</p>}>
          <Form submit="Prijavi se" act={async (f) => afterPassword(await auth.login(val(f, "name"), val(f, "password")))}>
            <Field label="Korisničko ime" name="name" autocomplete="username" autofocus />
            <Field label="Lozinka" name="password" type="password" autocomplete="current-password" />
          </Form>
        </Card>
      );
    case "2fa":
      return (
        <Card title="Kod s mobitela" intro={<p>Upiši šesteroznamenkasti kod iz aplikacije za potvrdu. Bez mobitela upiši jedan od rezervnih kodova.</p>}>
          <Form
            submit="Potvrdi"
            act={async (f) => {
              try {
                finish(await auth.login2fa(val(f, "code")));
              } catch (e) {
                if (e instanceof ApiError && (e.status === 401 || e.status === 429)) setTimeout(() => setView({ v: "login", note: authCopy(e) }), 1500);
                throw e;
              }
            }}
          >
            <Field label="Kod" name="code" inputMode="numeric" autocomplete="one-time-code" maxLength={11} autofocus />
          </Form>
        </Card>
      );
    case "setup":
      return (
        <Card title="Postavljanje administracije" intro={<p>Prvi račun je administratorski: s njim kasnije pozivaš druge. Ovo se radi samo jednom.</p>}>
          <Form
            submit="Nastavi"
            act={async (f) => {
              const password = newPasswordFrom(f);
              afterPassword(await auth.setup({ ...(view.codeRequired ? { code: val(f, "code") } : {}), name: val(f, "name"), password }));
            }}
          >
            {view.codeRequired && (
              <Field label="Kod za postavljanje" name="code" autofocus hint="Nalazi se u datoteci PRVO-POSTAVLJANJE.txt na hostingu (mapa ikdirected-podaci, pokraj public_html)." />
            )}
            <Field label="Korisničko ime" name="name" autocomplete="username" autofocus={!view.codeRequired} hint="Mala slova, brojke, točka ili crtica, npr. ivana." />
            <Field label="Lozinka" name="password" type="password" autocomplete="new-password" hint={PASSWORD_HINT} />
            <Field label="Ponovi lozinku" name="password2" type="password" autocomplete="new-password" />
          </Form>
        </Card>
      );
    case "invite":
      return (
        <Card title="Pozivnica za administraciju" intro={<p>Korisničko ime: <strong>{view.name}</strong>. Odaberi lozinku, zatim uključi dvostruku potvrdu na mobitelu. To radiš samo jednom.</p>}>
          <Form submit="Nastavi" act={async (f) => afterPassword(await auth.acceptInvite(view.token, newPasswordFrom(f)))}>
            <input type="text" name="username" autocomplete="username" value={view.name} hidden readOnly />
            <Field label="Lozinka" name="password" type="password" autocomplete="new-password" hint={PASSWORD_HINT} autofocus />
            <Field label="Ponovi lozinku" name="password2" type="password" autocomplete="new-password" />
          </Form>
        </Card>
      );
    case "invite-bad":
      return (
        <Card title="Pozivnica ne vrijedi" intro={<p>Poveznica je već iskorištena ili je istekla (vrijedi 72 sata). Zatraži novu pozivnicu.</p>}>
          <button
            class="btn btn--secondary"
            type="button"
            onClick={() => {
              history.replaceState(null, "", location.pathname);
              setView({ v: "loading" });
              void load();
            }}
          >
            Na prijavu
          </button>
        </Card>
      );
    case "setup-2fa":
      return (
        <Card title="Dvostruka potvrda" wide>
          <ol class="auth__steps">
            <li>Na mobitel instaliraj aplikaciju za potvrdu (npr. Google Authenticator ili Microsoft Authenticator).</li>
            <li>U aplikaciji dodaj račun i skeniraj ovaj kod:</li>
          </ol>
          <img class="auth__qr" src={qrDataUrl(view.uri)} alt="QR kod za aplikaciju za potvrdu" width={220} height={220} />
          <a class="link-btn auth__app" href={view.uri}>
            Administracija je otvorena na tom mobitelu? Dodaj račun u aplikaciju
          </a>
          <details class="auth__manual">
            <summary>Ne mogu skenirati — upisat ću ključ ručno</summary>
            <p class="auth__key m">{view.key}</p>
          </details>
          <Form
            submit="Uključi dvostruku potvrdu"
            act={async (f) => {
              try {
                finish(await auth.confirm2fa(val(f, "code")));
              } catch (e) {
                if (e instanceof ApiError && (e.status === 401 || e.status === 429)) setTimeout(() => setView({ v: "login", note: authCopy(e) }), 1500);
                throw e;
              }
            }}
          >
            <Field label="3. Upiši šesteroznamenkasti kod iz aplikacije" name="code" inputMode="numeric" autocomplete="one-time-code" maxLength={6} />
          </Form>
        </Card>
      );
    case "codes":
      return <RecoveryCodes answer={view.answer} onDone={() => setView({ v: "loading" })} />;
  }
}

function RecoveryCodes({ answer, onDone }: { answer: SignedInAnswer; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const codes = answer.recoveryCodes ?? [];
  const text = `ikdirected administracija — rezervni kodovi (${answer.name})\nSvaki kod vrijedi jednom, ako nemaš mobitel.\n\n${codes.join("\n")}\n`;
  return (
    <Card title="Spremi rezervne kodove" wide intro={<p>Ako izgubiš mobitel, s ovim kodovima se i dalje možeš prijaviti (svaki jednom). Prikazuju se samo sada.</p>}>
      <ul class="auth__codes m">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div class="auth__row">
        <button
          class="btn btn--secondary"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Kopirano ✓" : "Kopiraj"}
        </button>
        <button
          class="btn btn--secondary"
          type="button"
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            a.download = "ikdirected-rezervni-kodovi.txt";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          }}
        >
          Preuzmi .txt
        </button>
      </div>
      <label class="auth__check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.currentTarget.checked)} />
        Kodovi su spremljeni na sigurno mjesto (ne na isti mobitel).
      </label>
      <button class="btn btn--primary auth__submit" type="button" disabled={!saved} onClick={() => { signedIn({ name: answer.name, role: answer.role, csrf: answer.csrf }); onDone(); }}>
        Otvori administraciju
      </button>
    </Card>
  );
}
