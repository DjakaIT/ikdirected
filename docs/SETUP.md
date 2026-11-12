# SETUP — Hostinger, korak po korak (za Daniela)

Ovaj dokument je za čovjeka. Claude Code ništa od ovoga ne radi sam (nema postavljanja na hosting iz agenta).

**Kako radi:** GitHub Actions izgradi stranicu i gotove datoteke stavi na granu **`hosting`** repozitorija.
hPanel Git tu granu povlači u `public_html`, a GitHub webhook mu javi svaku promjenu pa je odmah ponovno povuče.
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

## 2. Stranica na Hostingeru (hPanel, Sarin račun) — klasični Git, grana `hosting`
Tako je postavljeno 12.11.2026. Hostinger **ne gradi ništa**: samo povlači gotovu granu `hosting` u `public_html`.
**Ne** biraj Node.js / Astro aplikaciju (*Deploy from Git* s build postavkama): takva stranica gradi `main` bez
`api/` i s nje se ne može prijeći na statičnu bez pražnjenja `public_html`.
1. **Websites → Add website** → prazna stranica za domenu (bez WordPressa, bez aplikacije).
2. **File Manager** → `domains/<domena>/public_html` mora biti **prazna** (Git klonira samo u praznu mapu;
   staru mapu najlakše preimenuj, npr. u `public_html.stari`).
3. Stranica → **Advanced → Git** → *Create a New Repository*: repozitorij
   `https://github.com/DjakaIT/ikdirected.git` (javni, ključ ne treba), grana **`hosting`**, mapa prazno
   (= `public_html`) → **Create** → **Deploy**.
4. Kod repozitorija → **Auto Deployment** → kopiraj *Webhook URL* → GitHub → repozitorij → **Settings →
   Webhooks → Add webhook**: *Payload URL* = taj URL, *Content type* `application/json`, *Secret* prazno,
   *Just the push event*, *Active* → **Add webhook**. U *Recent Deliveries* mora biti zelena kvačica.
5. **Advanced → PHP Configuration**: PHP **8.3 ili 8.4**; proširenja `mbstring`, `curl`, `json`
   (i `intl`, `fileinfo` ako ih ima). Ako nešto nedostaje, `/api/admin/auth/state` to i napiše.
6. Na nadzornoj ploči stranice prepiši **IP adresu** poslužitelja (za korak 3).

## 3. Domena: DNS ostaje na Porkbunu
Nameservere **ne mijenjaj**: na Porkbunu je i prosljeđivanje e-pošte (MX `fwd1/fwd2.porkbun.com`, SPF u TXT),
koje bi se inače tiho ugasilo.
1. porkbun.com → **Account → Domain Management** → kod domene **DNS**.
2. Obriši parking zapise (ALIAS/CNAME na `uixie.porkbun.com`).
3. **Add**: *Type* **A**, *Host* prazno, *IPv4 Address* = IP iz koraka 2.6, TTL 600.
4. **Add**: *Type* **CNAME**, *Host* `www`, *Answer* `ikdirected.com` (bez točke na kraju), TTL 600.
5. **MX i TXT zapise ne diraj.**
6. Čekaj (obično pola sata do sat-dva). **hPanel → Security → SSL**: certifikat mora biti *Active* i za
   `www`. Ako je izdan prije nego je `www` zapis postojao, pokriva samo domenu bez `www` → ponovno
   **Install** (ili Hostinger chat).

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
4. `https://<domena>/api/admin/osvjezi` vraća JSON. `https://<domena>/.git/config` vraća 403 ili 404,
   `https://<domena>/.ik-paket.json` vraća 404.
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
| *Hostinger još nije preuzeo novu verziju* | GitHub → Settings → Webhooks → Recent Deliveries: zelena kvačica? ili hPanel → Git → *Deploy* ručno |
| `/admin` bijela stranica s porukom o PHP-u | korak 2.5 |
| stranica bez HTTPS-a | korak 3.6 (SSL) |
