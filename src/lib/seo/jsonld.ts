// Structured data (reference atelier.html L429–486, SPEC AC-SEO-02). Values come from site.ts.
import { site } from "../../content/site";
import { absoluteUrl } from "./meta";

type Json = Record<string, unknown>;

/** Serialise JSON-LD so no `</script>` or `<!--` inside data can break out of the element (SECURITY §5). */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export const ids = (origin: string) => ({
  business: `${origin}/#business`,
  person: `${origin}/#person`,
  website: `${origin}/#website`,
});

export function businessNode(origin: string): Json {
  return {
    "@type": ["ProfessionalService", "LocalBusiness"],
    "@id": ids(origin).business,
    name: site.brand,
    description: site.seo.businessDescription,
    url: `${origin}/`,
    image: absoluteUrl(origin, "/og-default.jpg"),
    email: site.email,
    telephone: site.phoneHref.replace(/^tel:/, ""),
    priceRange: site.priceRange,
    currenciesAccepted: "EUR",
    knowsLanguage: site.languages,
    address: {
      "@type": "PostalAddress",
      addressLocality: site.address.locality,
      postalCode: site.address.postalCode,
      addressRegion: site.address.region,
      addressCountry: site.address.country,
    },
    geo: { "@type": "GeoCoordinates", latitude: site.geo.lat, longitude: site.geo.lng },
    areaServed: site.area.served.map((a) => ({ "@type": a.type, name: a.name })),
    sameAs: [site.instagram.url],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Usluge fotografiranja",
      itemListElement: site.offers.map((o) => ({
        "@type": "Offer",
        price: o.price,
        priceCurrency: "EUR",
        itemOffered: { "@type": "Service", name: o.name, description: o.description },
      })),
    },
  };
}

export function personNode(origin: string): Json {
  return {
    "@type": "Person",
    "@id": ids(origin).person,
    name: site.personName,
    jobTitle: site.jobTitle,
    worksFor: { "@id": ids(origin).business },
    sameAs: [site.instagram.url],
  };
}

export function websiteNode(origin: string): Json {
  return {
    "@type": "WebSite",
    "@id": ids(origin).website,
    url: `${origin}/`,
    name: site.brand,
    inLanguage: "hr-HR",
    publisher: { "@id": ids(origin).business },
  };
}

export function webPageNode(origin: string, path: string, name: string, dateModified?: string): Json {
  const url = absoluteUrl(origin, path);
  return {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name,
    isPartOf: { "@id": ids(origin).website },
    about: { "@id": ids(origin).business },
    inLanguage: "hr-HR",
    ...(dateModified ? { dateModified } : {}),
  };
}

/** FAQ answers mirror the visible text exactly (search engines require the match). */
export function faqNode(origin: string): Json {
  return {
    "@type": "FAQPage",
    "@id": `${origin}/#faq`,
    mainEntity: site.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function homeGraph(origin: string, dateModified?: string): Json {
  return {
    "@context": "https://schema.org",
    "@graph": [
      businessNode(origin),
      personNode(origin),
      websiteNode(origin),
      webPageNode(origin, "/", site.seo.homeTitle, dateModified),
      faqNode(origin),
    ],
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbNode(origin: string, crumbs: Crumb[]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(origin, c.path),
    })),
  };
}

/** Archive and category pages (AC-SEO-02). */
export function collectionGraph(
  origin: string,
  page: { path: string; name: string; description: string },
  crumbs: Crumb[],
  albums: Array<{ slug: string; title: string }>,
): Json {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${absoluteUrl(origin, page.path)}#page`,
        url: absoluteUrl(origin, page.path),
        name: page.name,
        description: page.description,
        inLanguage: "hr-HR",
        isPartOf: { "@id": ids(origin).website },
        about: { "@id": ids(origin).business },
        hasPart: albums.map((a) => ({ "@type": "ImageGallery", name: a.title, url: absoluteUrl(origin, `/radovi/${a.slug}`) })),
      },
      breadcrumbNode(origin, crumbs),
    ],
  };
}

/** Album pages (AC-SEO-02): the gallery with its images, plus breadcrumbs. */
export function albumGraph(
  origin: string,
  album: { slug: string; title: string; description: string; place: string; eventDate: string },
  images: Array<{ url: string; width: number; height: number; caption: string }>,
  crumbs: Crumb[],
): Json {
  const url = absoluteUrl(origin, `/radovi/${album.slug}`);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ImageGallery",
        "@id": `${url}#gallery`,
        url,
        name: album.title,
        description: album.description,
        inLanguage: "hr-HR",
        dateCreated: album.eventDate,
        ...(album.place ? { contentLocation: { "@type": "Place", name: album.place } } : {}),
        author: { "@id": ids(origin).person },
        publisher: { "@id": ids(origin).business },
        isPartOf: { "@id": ids(origin).website },
        image: images.map((img) => ({
          "@type": "ImageObject",
          contentUrl: absoluteUrl(origin, img.url),
          width: img.width,
          height: img.height,
          caption: img.caption,
        })),
      },
      breadcrumbNode(origin, crumbs),
    ],
  };
}
