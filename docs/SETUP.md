# SETUP — Hostinger, korak po korak (za Daniela)

Ovaj dokument je za čovjeka. Claude Code ništa od ovoga ne radi sam (nema postavljanja na hosting iz agenta).

**Kako radi:** javna stranica su obične HTML datoteke u `public_html` (bez Node.js-a). Administracija
(`/admin`) je PHP u `public_html/api`, podaci su u mapi `ikdirected-podaci` **pokraj** `public_html`
(korisnici, albumi, povijest, dnevnik), a fotografije u `public_html/media`. Kad Ivana nešto promijeni,
administracija pošalje popis albuma na GitHub, GitHub Actions za oko 2 minute izgradi stranicu, a
administracija je sama preuzme i postavi. Isti model kao Camellia sinensis.

**Trošak:** 0 € više od onoga što se već plaća — Hostinger Unlimited (Sarin račun, neograničen broj stranica,
50 GB) i domena na Porkbunu. GitHub Actions je besplatan (javni repozitorij neograničeno, privatni 2.000 minuta
mjesečno; jedna objava ≈ 2 minute).

---

## 1. Stranica na Hostingeru (hPanel, Sarin račun)
1. **Web stranice → Dodaj web stranicu** → prazna stranica (PHP/HTML, *ne* WordPress) → **koristi postojeću
   domenu** → upiši domenu s Porkbuna.
2. **Web stranice → Nadzorna ploča** te stranice → *Plan details / Detalji plana*: prepiši **dva nameservera**
   koja hPanel pokaže (npr. `ns1.dns-parking.com` i `ns2.dns-parking.com`, ali uzmi točno ona koja piše).
3. **Napredno → PHP konfiguracija**: PHP **8.3 ili 8.4**; u proširenjima uključeno `mbstring`, `curl`, `zip`,
   `json` (i `intl`, `fileinfo` ako ih ima). Ako nešto nedostaje, `/api/admin/auth/state` to i napiše.

## 2. Domena s Porkbuna na Hostinger
1. porkbun.com → **Account → Domain Management** → kod domene **Details**.
2. Ako je uključen **DNSSEC**, prvo ga isključi (s uključenim DNSSEC-om domena nakon promjene ne radi).
3. **Authoritative Nameservers → Edit** → obriši Porkbunove → upiši ona dva iz hPanela → **Submit**
   (i potvrdi ako opet pita).
4. Ako na domeni već koristite e-poštu preko Porkbuna: nakon promjene MX zapise treba upisati na Hostingeru
   (hPanel → Domene → DNS) — inače pošta prestane stizati.
5. Čekaj: obično sat-dva, najviše 48 h. **hPanel → Sigurnost → SSL**: besplatni certifikat se instalira sam čim
   domena pokazuje na Hostinger; provjeri da piše *Active* i za `www`.

## 3. GitHub (repozitorij `DjakaIT/ikdirected`)
1. Spoji granu `build/atelier-cms` u `main` (pull request → merge). Na `main` se uvijek pokrenu provjere.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   - `SITE_ORIGIN` = `https://<domena>` (bez kose crte na kraju)
   - `OBJAVA_UKLJUCENA` = `da` — **tek kad je sve ispod gotovo**. Bez nje GitHub samo provjerava, ništa ne objavljuje.

## 4. Prvo postavljanje paketa (jednom, ručno)
1. GitHub → **Actions → Objava → Run workflow** (grana `main`). Kad završi zeleno: otvori taj run →
   *Artifacts* → preuzmi **hosting** (zip).
   (Ili lokalno: `SITE_ORIGIN=https://<domena> npm run build && npm run paket` → `hosting.zip`.)
2. hPanel → **Datoteke → File Manager** → `public_html` → obriši početnu datoteku koju je Hostinger stavio
   (`default.php` ili `index.php`) → **Upload** zip → desni klik → **Extract** u `public_html` → obriši zip.
3. Provjeri: `https://<domena>` se otvara, `https://<domena>/admin` pokaže *Postavljanje administracije*.

## 5. Prvi račun (tvoj, administratorski)
1. File Manager → mapa **pokraj** `public_html` (`domains/<domena>/ikdirected-podaci/`) → otvori
   `PRVO-POSTAVLJANJE.txt` → kod oblika `XXXXX-XXXXX-XXXXX`.
2. `https://<domena>/admin` → kod, korisničko ime (npr. `daniel`), lozinka (12+ znakova) → skeniraj QR kod
   aplikacijom (Google ili Microsoft Authenticator) → upiši kod → **spremi rezervne kodove** (izvan mobitela).
   Datoteka s kodom se nakon toga sama briše.

## 6. Veza s GitHubom (da promjene idu na stranicu)
1. GitHub → tvoj profil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens →
   Generate new token**: *Repository access* = samo `DjakaIT/ikdirected`; *Permissions*: **Contents: Read and
   write**, **Actions: Read-only**; rok najdulji koji nudi (zapiši datum isteka).
2. Administracija → tvoje ime gore desno → **Objava stranice** → repozitorij `DjakaIT/ikdirected`, grana
   `sadrzaj`, token → **Spremi i provjeri vezu**. Mora pisati *Veza s GitHubom radi*.
3. Sad postavi varijablu `OBJAVA_UKLJUCENA = da` (korak 3.2).

## 7. Ivanin račun
Administracija → ime gore desno → **Korisnici** → upiši `ivana` → **Napravi pozivnicu** → poveznicu pošalji
osobno (poruka). Vrijedi 72 sata; Ivana sama odabere lozinku i skenira QR kod. Upute za nju: `docs/VODIC.md`.

## 8. Provjera (10 minuta)
1. U administraciji napravi testni album, dodaj 2 fotografije, upiši naziv, uključi **Objavljeno**.
2. Gore desno: *Čeka objavu* → nakon ~20 s *Objavljujem…* → za ~2 min *Stranica je ažurna*
   (ili klikni **Objavi sada**).
3. Album je na `https://<domena>/radovi`. Obriši ga → nakon objave stranica albuma vraća 404.
4. `https://<domena>/api/admin/osvjezi` vraća JSON (`aktualno`). `https://<domena>/media/` vraća 404.
5. Prije prave objave popuni `src/content/site.ts` stvarnim podacima (sve `TODO(client)`: e-pošta, telefon,
   cijene, odgovori u FAQ-u) i provjeri `RELEASE=1 npm run test -- --project unit`.

## 9. Sigurnosna mreža (preporučeno, 2 minute)
hPanel → **Napredno → Cron Jobs** → svakih 10 minuta, naredba:
`curl -s https://<domena>/api/admin/osvjezi > /dev/null`
Tako se promjena objavi i ako je Ivana zatvorila preglednik prije kraja objave.

## 10. Održavanje
- **Kopije:** Hostinger radi dnevne kopije. Ono što je nezamjenjivo: `ikdirected-podaci/` (albumi, korisnici)
  i `public_html/media/` (fotografije). Jednom mjesečno ih preuzmi (File Manager → Compress → Download).
  Originali fotografija ionako ostaju kod Ivane.
- **Token:** prije isteka napravi novi (korak 6.1) i upiši ga u *Objava stranice*. Kad istekne, promjene se
  spremaju, ali ne izlaze na stranicu (gore desno piše *Objava nije uspjela*).
- **Izgubljen mobitel:** prijava rezervnim kodom; ili ti kao administrator → Korisnici → **Nova pozivnica**
  (resetira lozinku i dvostruku potvrdu, odjavi sve uređaje).
- **Sumnjiva prijava:** Korisnici → Ukloni / Nova pozivnica; dnevnik je `ikdirected-podaci/dnevnik.log`.
- **Obrisano** se može vratiti 7 dana (Albumi → Nedavno obrisano), poslije se briše trajno, i fotografije.

## 11. Ako nešto ne radi
| Što piše | Što napraviti |
|---|---|
| *Objava nije postavljena* | korak 6 |
| *Objava nije uspjela — GitHub token…* | novi token (korak 6.1) |
| *…OBJAVA_UKLJUCENA* | varijabla na GitHubu (korak 3.2) |
| *Izgradnja stranice nije uspjela* | GitHub → Actions → crveni run → koji korak je pao |
| `/admin` bijela stranica s porukom o PHP-u | korak 1.3 |
| stranica bez HTTPS-a | korak 2.5 (SSL) |
