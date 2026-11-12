// Contact form in the footer (#kontakt). Validates in the browser with Croatian messages, moves focus to
// the first invalid field, and — until the mail endpoint exists — opens the visitor's mail app with the
// message prepared (mailto:). Copy comes from site.ts via data attributes; nothing is sent from the site.

import {
  CONTACT_FIELDS,
  type ContactErrorKey,
  type ContactField,
  cleanContact,
  contactMailto,
  validateContact,
} from "../../lib/contact";

export function initContact(): void {
  const form = document.querySelector<HTMLFormElement>("form[data-contact]");
  if (!form) return;
  const to = form.dataset.to ?? "";
  const messages = JSON.parse(form.dataset.errors ?? "{}") as Record<ContactErrorKey | "summary", string>;
  const labels = JSON.parse(form.dataset.labels ?? "{}") as Record<ContactField, string>;
  const status = form.querySelector<HTMLElement>("[data-cf-status]")!;
  const statusText = status.querySelector<HTMLElement>("[data-cf-status-text]")!;
  const openLink = status.querySelector<HTMLAnchorElement>("[data-cf-open]")!;
  const counter = form.querySelector<HTMLElement>("[data-cf-count]");
  let attempted = false;

  const control = (f: ContactField) => form.elements.namedItem(f) as HTMLInputElement | HTMLTextAreaElement;
  const read = () => {
    const raw: Partial<Record<ContactField, string>> = {};
    for (const f of CONTACT_FIELDS) raw[f] = control(f).value;
    return cleanContact(raw);
  };

  function mark(f: ContactField, key: ContactErrorKey | undefined): void {
    const el = control(f);
    const err = form!.querySelector<HTMLElement>(`[data-cf-err="${f}"]`)!;
    el.closest(".fld")?.toggleAttribute("data-invalid", !!key);
    if (key) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
    err.textContent = key ? (messages[key] ?? "") : "";
  }

  function check(): ReturnType<typeof validateContact> {
    const errors = validateContact(read());
    for (const f of CONTACT_FIELDS) mark(f, errors[f]);
    return errors;
  }

  function showStatus(text: string, mailto: string | null): void {
    statusText.textContent = text;
    openLink.hidden = !mailto;
    if (mailto) openLink.href = mailto;
  }

  for (const f of CONTACT_FIELDS) {
    const el = control(f);
    // after the first submit, errors follow typing; before it, only leaving a filled-in field checks it
    el.addEventListener("input", () => {
      if (attempted || el.hasAttribute("aria-invalid")) mark(f, validateContact(read())[f]);
    });
    el.addEventListener("blur", () => {
      if (attempted || el.value.trim()) mark(f, validateContact(read())[f]);
    });
  }

  if (counter) {
    const msg = control("poruka");
    const max = msg.maxLength;
    const update = () => (counter.textContent = `${msg.value.length} / ${max}`);
    msg.addEventListener("input", update);
    update();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    attempted = true;
    const errors = check();
    const first = CONTACT_FIELDS.find((f) => errors[f]);
    if (first) {
      showStatus(messages.summary ?? "", null);
      control(first).focus();
      return;
    }
    const url = contactMailto(to, read(), labels);
    showStatus(form.dataset.prepared ?? "", url);
    openLink.click(); // the same link stays visible in case no mail app opens
  });
}
