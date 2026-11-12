# SETUP — Hostinger, korak po korak (za Daniela)

Ovaj dokument je za čovjeka. Claude Code ništa od ovoga ne radi sam (nema postavljanja na hosting iz agenta).

**Kako radi:** GitHub Actions izgradi stranicu i gotove datoteke stavi na granu **`hosting`** repozitorija.
hPanel (*Create site → Deploy from Git*) tu granu povlači u `public_html` i sam je ponovno povuče kad se promijeni.
Javna stranica su obične HTML datoteke, administracija (`/admin`) je PHP u `public_html/api`. Sve što se ne smije
izgubiti — korisnici, albumi, povijest, dnevnik i **sve fotografije** — je u mapi `ikdirected-podaci` **pokraj**
`public_html`, pa ih Git deploy nikad ne dira. Kad Ivana nešto promijeni, administracija pošalje popis albuma na
GitHub (grana `sadrzaj`), Actions za ~2 minute izgradi novu verziju na grani `hosting`, a Hostinger je preuzme.

**Trošak:** 0 € više od onoga što se već plaća — Hostinger Unlimited (Sarin račun, neograničen broj stranica)
i domena na Porkbunu. GitHub Actions: javni repozitorij neograničeno, privatni 2.000 minuta mjesečno (objava ≈ 2 min).

---

## 1. GitHub (repozitorij `DjakaIT/ikdirected`) — prvo, jer grana `hosting` mora postojati
1. Kod je već na grani `main` (spojeno 12.11.2026.). Na `main` se kod svake promjene koda pokrenu provjere.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   - `SITE_ORIGIN` = `https://<domena>` (bez kose crte na kraju)
   - `OBJAVA_UKLJUCENA` = `da` (bez nje GitHub samo provjerava kod i ništa ne objavljuje)
3. **Actions → Objava → Run workflow** (grana `main`). Kad završi zeleno, u repozitoriju postoji grana
   **`hosting`** (stranica bez albuma — albumi dolaze iz administracije).

## 2. Stranica na Hostingeru (hPanel, Sarin račun)
1. **Websites → Create site → Deploy from Git** → poveži GitHub (Hostingerova GitHub aplikacija; dopusti joj
   pristup repozitoriju `DjakaIT/ikdirected`) → repozitorij `DjakaIT/ikdirected` → grana **`hosting`** →
   mapa **`public_html`** → domena s Porkbuna → **Deploy**.
2. Provjeri da je uključeno **automatsko postavljanje** (*Auto-deployment*): svaki novi commit na grani `hosting`
   Hostinger povuče sam.
3. **Advanced → PHP Configuration**: PHP **8.3 ili 8.4**; proširenja `mbstring`, `curl`, `json`
   (i `intl`, `fileinfo` ako ih ima). Ako nešto nedostaje, `/api/admin/auth/state` to i napiše.
4. Na nadzornoj ploči stranice (*Plan details*) prepiši **dva nameservera** koja hPanel pokaže
   (npr. `ns1.dns-parking.com` / `ns2.dns-parking.com`, ali uzmi točno ona koja piše).

## 3. Domena s Porkbuna na Hostinger
1. porkbun.com → **Account → Domain Management** → kod domene **Details**.
2. Ako je uključen **DNSSEC**, prvo ga isključi (s uključenim DNSSEC-om domena nakon promjene ne radi).
3. **Authoritative Nameservers → Edit** → obriši Porkbunove → upiši ona dva iz hPanela → **Submit**.
4. Ako na domeni već koristite e-poštu preko Porkbuna: MX zapise treba upisati na Hostingeru
   (hPanel → Domains → DNS) — inače pošta prestane stizati.
5. Čekaj (obično sat-dva, najviše 48 h). **hPanel → Security → SSL**: besplatni certifikat se instalira sam
   čim domena pokazuje na Hostinger; provjeri da je *Active* i za `www`.

## 4. Prvi račun (tvoj, administratorski)
1. hPanel → **File Manager** → mapa **pokraj** `public_html` (`domains/<domena>/ikdirected-podaci/`) → otvori
   `PRVO-POSTAVLJANJE.txt` → kod oblika `XXXXX-XXXXX-XXXXX`. (Mapa nastaje kad se `/admin` prvi put otvori.)
2. `https://<domena>/admin` → kod, korisničko ime (npr. `daniel`), lozinka (12+ znakova) → skeniraj QR kod
   aplikacijom (Google ili Microsoft Authenticator) → upiši kod → **spremi rezervne kodove** (izvan mobitela).
   Datoteka s kodom se nakon toga sama briše.

## 5. Veza s GitHubom (da promjene iz administracije idu na stranicu)
1. GitHub → tvoj profil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens →
   Generate new token**: *Repository access* = samo `DjakaIT/ikdirected`; *Permissions*: **Contents: Read and
   write**, **Actions: Read-only**; rok najdulji koji nudi (zapiši datum isteka).
2. Administracija → tvoje ime gore desno → **Objava stranice** → repozitorij `DjakaIT/ikdirected`, grana
   `sadrzaj`, token → **Spremi i provjeri vezu**. Mora pisati *Veza s GitHubom radi*.

## 6. Ivanin račun
Administracija → ime gore desno → **Korisnici** → upiši `ivana` → **Napravi pozivnicu** → poveznicu pošalji
osobno (poruka). Vrijedi 72 sata; Ivana sama odabere lozinku i skenira QR kod. Upute za nju: `docs/VODIC.md`.

## 7. Provjera (10 minuta)
1. U administraciji napravi testni album, dodaj 2 fotografije, upiši naziv, uključi **Objavljeno**.
2. Gore desno: *Čeka objavu* → nakon ~20 s *Objavljujem…* (ili klikni **Objavi sada**) → za ~2–3 min
   *Stranica je ažurna*. Na GitHubu se vidi run *Objava …* i novi commit na grani `hosting`.
3. Album je na `https://<domena>/radovi`, fotografije se vide. Obriši album → nakon objave stranica albuma
   vraća 404.
4. `https://<domena>/api/admin/osvjezi` vraća JSON. `https://<domena>/.git/config` i
   `https://<domena>/.ik-paket.json` vraćaju 404.
5. Prije prave objave popuni `src/content/site.ts` stvarnim podacima (sve `TODO(client)`: e-pošta, telefon,
   cijene, odgovori u FAQ-u) i provjeri `RELEASE=1 npm run test -- --project unit`.

## 8. Sigurnosna mreža (preporučeno, 2 minute)
hPanel → **Advanced → Cron Jobs** → svakih 10 minuta, naredba:
`curl -s https://<domena>/api/admin/osvjezi > /dev/null`
Tako se promjena objavi i ako je Ivana zatvorila preglednik prije kraja objave.

## 9. Održavanje
- **Kopije:** Hostinger radi dnevne kopije. Nezamjenjivo je samo `ikdirected-podaci/` (albumi, korisnici,
  fotografije u `media/`) — jednom mjesečno je preuzmi (File Manager → Compress → Download). Kod i izgrađena
  stranica su na GitHubu.
- **Token:** prije isteka napravi novi (korak 5.1) i upiši ga u *Objava stranice*. Kad istekne, promjene se
  spremaju, ali ne izlaze na stranicu (gore desno piše *Objava nije uspjela*).
- **Izgubljen mobitel:** prijava rezervnim kodom; ili ti kao administrator → Korisnici → **Nova pozivnica**
  (resetira lozinku i dvostruku potvrdu, odjavi sve uređaje).
- **Sumnjiva prijava:** Korisnici → Ukloni / Nova pozivnica; dnevnik je `ikdirected-podaci/dnevnik.log`.
- **Obrisano** se može vratiti 7 dana (Albumi → Nedavno obrisano), poslije se briše trajno, i fotografije.
- **Grane** `hosting` i `sadrzaj` piše automatika — ne mijenjaj ih ručno i ne briši ih.

## 10. Ako nešto ne radi
| Što piše | Što napraviti |
|---|---|
| *Objava nije postavljena* | korak 5 |
| *Objava nije uspjela — GitHub token…* | novi token (korak 5.1) |
| *…OBJAVA_UKLJUCENA* | varijabla na GitHubu (korak 1.2) |
| *Izgradnja stranice nije uspjela* | GitHub → Actions → crveni run → koji korak je pao |
| *Hostinger još nije preuzeo novu verziju* | hPanel → stranica → Git: automatsko postavljanje uključeno? ili *Deploy* ručno |
| `/admin` bijela stranica s porukom o PHP-u | korak 2.3 |
| stranica bez HTTPS-a | korak 3.5 (SSL) |
