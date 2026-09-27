# SETUP — Cloudflare, korak po korak (za Daniela)

Ovaj dokument je za čovjeka. Claude Code ga ne otvara i ništa od ovoga ne radi sam
(nema deploya ni `--remote` naredbi iz agenta).

**Trošak:** 0 € mjesečno unutar besplatnih limita (Workers 100k zahtjeva/dan, D1 5 GB,
R2 10 GB + 1M upisa/mj, Zero Trust do 50 korisnika). **R2 i Zero Trust traže da na računu bude
kartica** iako se ništa ne naplaćuje. 10 GB u R2 ≈ 5.000–7.000 fotografija u sve tri veličine.

> Provjeri pri postavljanju: jedan izvor tvrdi da vezanje R2 bucketa na Worker traži Workers Paid
> (5 $/mj), dok Cloudflareove stranice cijena navode besplatnu razinu. Ako te dashboard pri
> deployu zatraži nadogradnju, to je trenutak odluke — javi pa ćemo ocijeniti alternativu.

---

## 0. Preduvjeti
1. Cloudflare račun (dash.cloudflare.com), kartica dodana pod **Billing → Payment info**.
2. Domena na Cloudflareu: **Add a site** → upiši domenu → Free plan → kod registrara zamijeni
   nameservere onima koje Cloudflare pokaže. Čekaj status **Active**.
3. Lokalno: Node 22, `npx wrangler login` (otvori preglednik, potvrdi).

## 1. Baza (D1)
1. **Workers & Pages → D1 SQL Database → Create** → ime `ikdirected` → Create.
2. Kopiraj **Database ID** → u `wrangler.jsonc` zamijeni `REPLACE_ME` kod `database_id`.
3. U terminalu u repozitoriju: `npx wrangler d1 migrations apply ikdirected --remote`.

## 2. Spremište fotografija (R2)
1. **R2 Object Storage → Create bucket** → ime `ikdirected-media` → lokacija Automatic → Create.
2. Bucket → **Settings → Public access → R2.dev subdomain: Disabled** (ostavi isključeno).
3. **Settings → Custom Domains → Connect Domain** → `media.<tvoja-domena>` → Continue → Connect.
4. U `wrangler.jsonc` postavi `PUBLIC_MEDIA_BASE` na `https://media.<tvoja-domena>`.

## 3. Sigurnosna zaglavlja za media poddomenu
1. Domena → **Rules → Transform Rules → Modify Response Header → Create rule**.
2. Ime `media-security`. **If** → Custom filter → Field `Hostname` equals `media.<tvoja-domena>`.
3. **Then** → Set static:
   - `X-Content-Type-Options` = `nosniff`
   - `Content-Security-Policy` = `default-src 'none'; sandbox`
   - `Cross-Origin-Resource-Policy` = `cross-origin`
4. Deploy.

## 4. Prijava u administraciju (Cloudflare Access)
1. Lijevi izbornik **Zero Trust** → izaberi team name (npr. `ikdirected`) → plan **Free** → potvrdi.
   Team domain je `https://<team>.cloudflareaccess.com` → upiši u `CF_ACCESS_TEAM_DOMAIN`.
2. **Settings → Authentication → Login methods**: One-time PIN mora biti uključen (je, po defaultu).
3. **Access → Applications → Add an application → Self-hosted**.
   - Application name: `ikdirected admin`
   - Session Duration: `24 hours`
   - **Add public hostname**: domena `<tvoja-domena>`, Path `admin*`
   - **Add public hostname** (drugi red): domena `<tvoja-domena>`, Path `api/admin*`
   - Identity providers: samo **One-time PIN**; uključi *Instant Auth*.
4. **Policies → Add a policy**: ime `Vlasnici`, Action **Allow**, Include → **Emails** → email
   fotografkinje i tvoj. Save.
5. Otvori aplikaciju → **Overview / Basic information** → kopiraj **Application Audience (AUD) Tag**
   → upiši u `CF_ACCESS_AUD`.
6. `ADMIN_EMAILS` u `wrangler.jsonc` = ista dva emaila, odvojena zarezom.

## 5. Prvi deploy
1. Popuni `src/content/site.ts` stvarnim podacima (sve `TODO(client)`), pa
   `RELEASE=1 npm run test -- --project unit` mora proći.
2. `npm ci && npm run gate` → sve zeleno.
3. `npm run build && npx wrangler deploy`.
4. **Workers & Pages → ikdirected → Settings → Domains & Routes → Add → Custom domain** →
   `<tvoja-domena>` (i `www.` ako želiš; preusmjeri `www` → bez `www` pravilom Redirect Rules).
5. Purge worker: `cd workers/purge && npx wrangler deploy` (koristi istu D1 i R2).

## 6. Provjera nakon deploya (5 minuta)
- [ ] Anonimni prozor → `/admin` → traži email → PIN stiže → ulaziš.
- [ ] Email koji nije na listi → PIN ne stiže / pristup odbijen.
- [ ] `curl -i https://<domena>/api/admin/albums` → 401 ili preusmjeravanje na login.
- [ ] `https://ikdirected.<…>.workers.dev` ne postoji (workers_dev isključen).
- [ ] Napravi testni album, dodaj 3 fotografije, objavi, pogledaj javno, obriši.
- [ ] `https://media.<domena>/p/<id>/640.webp` ima zaglavlja iz koraka 3 (DevTools → Network).
- [ ] securityheaders.com na naslovnici → A ili bolje.

## 7. Predaja fotografkinji (tri rečenice)
„Otvori `<domena>/admin`, upiši svoj email i unesi kod koji ti stigne. Novi događaj = **Novi album**,
povuci fotografije u prozor i uključi **Objavljeno** kad si zadovoljna. Na početnu stranicu stavljaš
fotografije preko izbornika ⋯ → **Na naslovnicu**.”

## 8. Održavanje
- Jednom mjesečno backup baze: `npx wrangler d1 export ikdirected --remote --output=backup-$(date +%F).sql`
  (spremi izvan repozitorija). D1 dodatno ima Time Travel za vraćanje u prošlost.
- Kompromitiran uređaj: Zero Trust → **Access → Applications → ikdirected admin → revoke sessions**;
  makni email iz politike i iz `ADMIN_EMAILS`, redeploy.
- Nadogradnje: `npm outdated` jednom mjesečno; `@astrojs/cloudflare` drži na najnovijoj verziji.
- Pravno: obavijest o privatnosti (`/privatnost`) i privole osoba na fotografijama su obveza
  fotografkinje — sadržaj stranice je `TODO(client)`. Ovo nije pravni savjet.
