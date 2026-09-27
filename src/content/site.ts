// Every business fact the templates print lives here. Values copied from the approved reference
// that the client has not confirmed carry a TODO(client) marker on their line; the release gate
// (tests/unit/release-gate.test.ts, AC-REL-01) fails while any marker remains.

export type CategorySlug = "vjencanja" | "eventi" | "portreti" | "iz-zraka";

export interface Category {
  slug: CategorySlug;
  /** Nominative singular for chips and meta: "Vjenčanja". */
  name: string;
  /** Singular noun for sentences and meta lines: "Vjenčanje". */
  singular: string;
  /** "Sva vjenčanja" style link back from an album. */
  backLabel: string;
  /** Category page SEO intro (≈ 80 words). */
  intro: string;
  /** Category page <title> and meta description. */
  title: string;
  description: string;
}

export interface Service {
  category: CategorySlug;
  name: string;
  text: string;
  priceLine: string;
  /** Static fallback image alt when no published album exists in the category (PD-14). */
  fallbackAlt: string;
}

export interface Faq {
  q: string;
  a: string;
}

export const site = {
  brand: "ikdirected",
  personName: "IME PREZIME", // TODO(client) real name for Person JSON-LD
  jobTitle: "Fotografkinja",
  email: "hello@ikdirected.com", // TODO(client)
  phone: "+385 91 000 0000", // TODO(client)
  phoneHref: "tel:+385910000000", // TODO(client)
  instagram: { handle: "@ikdirected", url: "https://www.instagram.com/ikdirected/" }, // TODO(client)
  address: {
    locality: "Zadar",
    postalCode: "23000", // TODO(client)
    region: "Zadarska županija",
    regionCode: "HR-13",
    country: "HR",
    countryName: "Hrvatska",
    display: "Zadar, Zadarska županija, Hrvatska",
  },
  geo: { lat: 44.119371, lng: 15.231365, stamp: "ZADAR · 44.12° N 15.23° E" },
  languages: ["hr", "en"], // TODO(client) confirm she works in English
  priceRange: "700 € – 3.000 €", // TODO(client)
  credit: { label: "Perasma", url: "https://perasma.dev" }, // TODO(client) confirm footer credit

  seo: {
    homeTitle: "Fotografkinja vjenčanja i evenata u Zadru | ikdirected",
    homeDescription:
      "Fotografiram vjenčanja, evente i portrete u Zadru i po cijeloj Hrvatskoj, uz dron kadrove iz zraka. Cijeli dan od 1.200 €, prve fotografije u tjedan dana.", // TODO(client) price + delivery
    ogDescription: "Vjenčanja, eventi, portreti i kadrovi iz zraka. Zadar i cijela Hrvatska.",
    businessDescription:
      "Fotografiranje vjenčanja, evenata i portreta u Zadru i po cijeloj Hrvatskoj, uz kadrove iz zraka snimljene dronom.",
    archiveTitle: "Radovi — vjenčanja, eventi, portreti i kadrovi iz zraka | ikdirected",
    archiveDescription:
      "Sve objavljene priče: vjenčanja, eventi, portreti i kadrovi iz zraka iz Zadra i cijele Hrvatske.",
  },

  hero: {
    sub: "Fotografkinja vjenčanja, evenata i portreta. Zadar i cijela Hrvatska, od ove godine i iz zraka.", // TODO(client) drone "from this year"
    row: [
      "Termini za 2026. su otvoreni", // TODO(client)
      "Odgovaram u dva dana", // TODO(client)
      "Pogledajte radove ↓",
    ],
    placeholderAlt: "Fotografija u pripremi",
  },

  say: {
    label: "Kako radim",
    text: "Volim kad me se ne primijeti. Dođem ranije, prošetam prostor i vidim gdje pada svjetlo, pa vas pustim na miru. Najbolje fotografije ionako nastanu kad ljudi zaborave da sam tu.", // TODO(client) approve statement
  },

  gallery: {
    label: "Odabrani radovi",
    title: "Galerija",
    lead: "Odabrane fotografije s vjenčanja, evenata i portreta. Kliknite za veliki prikaz.",
  },

  servicesHeading: "Usluge i cijene",
  servicesNote: "Bez paketa koje nitko ne razumije",
  services: [
    {
      category: "vjencanja",
      name: "Vjenčanja",
      text: "Cijeli dan, od priprema do zadnjeg plesa. Prvih četrdesetak fotografija dobivate u tjedan dana, cijelu galeriju unutar mjesec dana. Ako imate manju proslavu, postoji i kraći paket do pet sati.", // TODO(client) delivery times
      priceLine: "Od 1.200 € · kraći paket 700 €", // TODO(client)
      fallbackAlt: "Mladoženja ljubi mladenku nakon obreda",
    },
    {
      category: "eventi",
      name: "Eventi",
      text: "Konferencije, otvorenja i koncerti. Trideset fotografija za objave šaljem isti dan, ostatak u roku od 72 sata. Radim i s vašim marketing timom ako trebate određene kadrove.", // TODO(client) delivery times
      priceLine: "Od 150 € po satu", // TODO(client)
      fallbackAlt: "Nasmijani par na proslavi na otvorenom",
    },
    {
      category: "portreti",
      name: "Portreti",
      text: "Za web, društvene mreže i medije. Kadrove dogovorimo prije snimanja pa termin traje sat do sat i pol, u studiju ili vani.", // TODO(client) session length
      priceLine: "Od 250 €", // TODO(client)
      fallbackAlt: "Portret žene uz prirodno svjetlo",
    },
    {
      category: "iz-zraka",
      name: "Iz zraka",
      text: "Dron kadrovi lokacije, objekta ili proslave. Idu uz vjenčanja i evente na otvorenom, ako lokacija dopušta letenje, a mogu se naručiti i zasebno.",
      priceLine: "Od 200 € · novo od 2026.", // TODO(client)
      fallbackAlt: "Plaža i more snimljeni dronom",
    },
  ] satisfies Service[],

  /** Offers for JSON-LD; must agree with the price lines above. */
  offers: [
    { price: "1200", name: "Fotografiranje vjenčanja", description: "Cijeli dan od priprema do zadnjeg plesa, obrađene fotografije u online galeriji." }, // TODO(client)
    { price: "150", name: "Fotografiranje evenata", description: "Konferencije, otvorenja i koncerti. Trideset fotografija isti dan, ostatak u 72 sata." }, // TODO(client)
    { price: "250", name: "Portretno fotografiranje", description: "Portreti za web, društvene mreže i medije, u studiju ili na terenu." }, // TODO(client)
    { price: "200", name: "Snimanje dronom", description: "Zračni kadrovi lokacije, objekta ili proslave." }, // TODO(client)
  ],

  area: {
    heading: "Gdje radim",
    paragraphs: [
      "Baza mi je Zadar, pa u Zadarskoj županiji nema putnih troškova — Nin, Pag, Vir, Biograd, Sukošan, Petrčane, Kornati.", // TODO(client) travel policy
      "Redovito snimam i u Šibeniku, Splitu, Rijeci, Zagrebu i Istri. Za vjenčanja izvan Hrvatske šaljem posebnu ponudu s putnim troškovima i noćenjem.", // TODO(client) travel policy
    ],
    marquee: ["Zadar", "Nin", "Pag", "Biograd", "Šibenik", "Split", "Zagreb", "Istra"],
    served: [
      { type: "City", name: "Zadar" },
      { type: "AdministrativeArea", name: "Zadarska županija" },
      { type: "City", name: "Nin" },
      { type: "City", name: "Biograd na Moru" },
      { type: "City", name: "Šibenik" },
      { type: "City", name: "Split" },
      { type: "City", name: "Zagreb" },
      { type: "Country", name: "Hrvatska" },
    ],
  },

  faqLabel: "Česta pitanja",
  faqHeading: "Ono što me najčešće pitaju",
  faq: [
    {
      q: "Koliko košta fotografiranje vjenčanja?",
      a: "Cijeli dan kreće od 1.200 €. U to ulaze pripreme, obred, proslava i zadnji ples, obrađene fotografije u online galeriji i pravo na ispis. Kraći paket do pet sati je 700 €.", // TODO(client)
    },
    {
      q: "Kada dobivam fotografije?",
      a: "Prvih četrdesetak fotografija šaljem u roku od tjedan dana, a cijelu galeriju unutar mjesec dana od vjenčanja. Za evente je prvi izbor gotov isti dan.", // TODO(client)
    },
    {
      q: "Dolazite li izvan Zadra?",
      a: "Da. U Zadarskoj županiji nema doplate, za ostatak Hrvatske dogovaramo putne troškove, a za vjenčanja u inozemstvu šaljem posebnu ponudu.", // TODO(client)
    },
    {
      q: "Snimate li i dronom?",
      a: "Da, od 2026. Zračni kadrovi idu uz vjenčanja i evente na otvorenom kad lokacija dopušta letenje. Ako je riječ o zoni u kojoj treba dozvola, javim se ranije da to riješimo na vrijeme.", // TODO(client)
    },
    {
      q: "Koliko ranije treba rezervirati termin?",
      a: "Ljetne subote se obično zatvore osam do dvanaest mjeseci unaprijed. Za termine izvan sezone dovoljno je i nekoliko mjeseci.", // TODO(client)
    },
    {
      q: "Mogu li dobiti i neobrađene fotografije?",
      a: "Ne šaljem neobrađene datoteke jer obrada je dio stila po kojem me birate. Ako trebate nešto brzo za objavu, izdvojim vam nekoliko fotografija odmah.", // TODO(client)
    },
  ] satisfies Faq[],

  contact: {
    label: "Kontakt",
    heading: ["Pišite", "mi →"],
    lead: "Javite mi datum i lokaciju, pa vam u dva dana šaljem cijenu i slobodne termine. Ako još niste sigurni oko datuma, slobodno pitajte što je otvoreno.", // TODO(client) response time
  },

  categories: [
    {
      slug: "vjencanja",
      name: "Vjenčanja",
      singular: "Vjenčanje",
      backLabel: "Sva vjenčanja",
      title: "Fotografiranje vjenčanja u Zadru i Hrvatskoj | ikdirected",
      description: "Priče s vjenčanja u Zadru, Ninu, na Pagu i po cijeloj Hrvatskoj — od priprema do zadnjeg plesa.",
      intro:
        "Vjenčanja snimam cijeli dan, od priprema do zadnjeg plesa, bez poziranja koje traje dulje od minute. Baza mi je Zadar, a najčešće radim u Ninu, na Pagu, Viru i u Biogradu, ali i u Šibeniku, Splitu, Zagrebu i Istri. Ovdje su priče parova koji su pristali da ih pokažem — svaka je jedan dan, ispričan onim redom kojim se dogodio.", // TODO(client) approve intro
    },
    {
      slug: "eventi",
      name: "Eventi",
      singular: "Event",
      backLabel: "Svi eventi",
      title: "Fotografiranje evenata u Zadru i Hrvatskoj | ikdirected",
      description: "Konferencije, otvorenja i koncerti u Zadru i po Hrvatskoj — fotografije za objave isti dan.",
      intro:
        "Konferencije, otvorenja, koncerti i privatne proslave. Na eventu se krećem tiho i pratim ono što se stvarno događa, a ne samo pozornicu. Prve fotografije za objave dobivate isti dan, ostatak ubrzo nakon toga. Radim u Zadru i po cijeloj Hrvatskoj, samostalno ili uz vaš marketing tim kad trebate točno određene kadrove.", // TODO(client) approve intro
    },
    {
      slug: "portreti",
      name: "Portreti",
      singular: "Portret",
      backLabel: "Svi portreti",
      title: "Portretno fotografiranje u Zadru | ikdirected",
      description: "Portreti za web, društvene mreže i medije, u studiju ili na terenu u Zadru i okolici.",
      intro:
        "Portreti za web, društvene mreže, medije ili samo za vas. Prije snimanja zajedno dogovorimo kadrove i mjesto, pa sam termin prođe opušteno — u studiju, u gradu ili vani na svjetlu koje odgovara vašem licu. Ovdje su portreti ljudi koji su pristali da ih pokažem, snimljeni u Zadru i okolici.", // TODO(client) approve intro
    },
    {
      slug: "iz-zraka",
      name: "Iz zraka",
      singular: "Iz zraka",
      backLabel: "Svi kadrovi iz zraka",
      title: "Snimanje dronom u Zadru i Hrvatskoj | ikdirected",
      description: "Kadrovi iz zraka: lokacije, objekti i proslave snimljeni dronom u Zadru i po Hrvatskoj.",
      intro:
        "Kadrovi iz zraka pokazuju ono što se sa zemlje ne vidi: oblik obale, raspored stolova na proslavi, cijeli objekt u svom okruženju. Dron kadrovi idu uz vjenčanja i evente na otvorenom kad lokacija dopušta letenje, a mogu se naručiti i zasebno — za lokacije, apartmane, hotele i objekte u Zadru i po cijeloj Hrvatskoj.", // TODO(client) approve intro
    },
  ] satisfies Category[],
};

export const categoryBySlug = (slug: string): Category | undefined =>
  site.categories.find((c) => c.slug === slug);
