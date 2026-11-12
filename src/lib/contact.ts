// Contact form: field rules and the mailto: fallback. Pure functions (unit-tested); the DOM glue is
// src/scripts/public/contact.ts. When the mail endpoint exists, only the submit step changes.

export const CONTACT_FIELDS = ["ime", "prezime", "email", "naslov", "poruka"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];
export type ContactValues = Record<ContactField, string>;
export type ContactErrorKey = ContactField | "emailFormat";

export const CONTACT_MAX: Record<ContactField, number> = {
  ime: 80,
  prezime: 80,
  email: 254,
  naslov: 140,
  poruka: 4000,
};

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

export function isEmail(value: string): boolean {
  return value.length <= CONTACT_MAX.email && EMAIL.test(value);
}

/** Trimmed values; the message keeps its inner line breaks. */
export function cleanContact(raw: Partial<Record<ContactField, string>>): ContactValues {
  const out = {} as ContactValues;
  for (const f of CONTACT_FIELDS) out[f] = (raw[f] ?? "").trim().slice(0, CONTACT_MAX[f]);
  return out;
}

/** One error key per invalid field, in form order. */
export function validateContact(v: ContactValues): Partial<Record<ContactField, ContactErrorKey>> {
  const errors: Partial<Record<ContactField, ContactErrorKey>> = {};
  for (const f of CONTACT_FIELDS) {
    if (!v[f]) errors[f] = f;
    else if (f === "email" && !isEmail(v[f])) errors[f] = "emailFormat";
  }
  return errors;
}

export function contactMailto(to: string, v: ContactValues, labels: Record<ContactField, string>): string {
  const body = [`${labels.ime}: ${v.ime}`, `${labels.prezime}: ${v.prezime}`, `${labels.email}: ${v.email}`, "", v.poruka]
    .join("\r\n");
  return `mailto:${to}?subject=${encodeURIComponent(v.naslov)}&body=${encodeURIComponent(body)}`;
}
