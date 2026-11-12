import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Contact form beside "Pišite mi" (#kontakt, every public page). Front-end only for now: a valid form opens the
// visitor's mail app (mailto:) with the message prepared; the mail endpoint comes later.

async function open(page: Page) {
  // the mail app is outside the test: record the mailto navigation instead of following it
  await page.addInitScript(() => {
    const sent: string[] = [];
    (window as unknown as { __mailto: string[] }).__mailto = sent;
    document.addEventListener(
      "click",
      (e) => {
        const a = (e.target as Element | null)?.closest?.('a[href^="mailto:"]');
        if (!a) return;
        e.preventDefault();
        sent.push(a.getAttribute("href") ?? "");
      },
      { capture: true },
    );
  });
  await page.goto("/privatnost");
  const form = page.getByRole("form", { name: "Pošaljite upit" });
  await form.scrollIntoViewIfNeeded();
  return form;
}

test("contact form has a labelled control for every field", async ({ page }) => {
  const form = await open(page);
  await expect(form).toBeVisible();
  for (const name of ["Ime", "Prezime", "E-mail", "Naslov zahtjeva", "Poruka"]) {
    await expect(form.getByRole("textbox", { name, exact: true })).toBeVisible();
  }
  await expect(form.getByRole("textbox", { name: "E-mail", exact: true })).toHaveAttribute("type", "email");
  await expect(form.getByRole("button", { name: "Pošalji" })).toBeVisible();
});

test("empty submit marks every field, explains why and focuses the first one", async ({ page }) => {
  const form = await open(page);
  await form.getByRole("button", { name: "Pošalji" }).click();
  await expect(form.getByRole("status")).toHaveText("Provjerite označena polja.", { useInnerText: true });
  await expect(form.getByRole("link", { name: "Otvori e-poštu →" })).toBeHidden();
  await expect(form.getByRole("textbox", { name: "Ime", exact: true })).toBeFocused();
  await expect(form.locator('[aria-invalid="true"]')).toHaveCount(5);
  await expect(form.getByRole("textbox", { name: "Ime", exact: true })).toHaveAccessibleDescription("Upišite ime.");
  await expect(form.getByRole("textbox", { name: "Poruka", exact: true })).toHaveAccessibleDescription("Napišite poruku.");

  const axe = await new AxeBuilder({ page }).include("#kontakt").analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("a malformed e-mail gets its own message and clears once fixed", async ({ page }) => {
  const form = await open(page);
  const email = form.getByRole("textbox", { name: "E-mail", exact: true });
  await email.fill("ana@primjer");
  await email.blur();
  await expect(email).toHaveAccessibleDescription("E-mail adresa nije ispravna.");
  await email.fill("ana@primjer.hr");
  await expect(email).not.toHaveAttribute("aria-invalid");
});

test("a valid form prepares the message in the mail app", async ({ page }) => {
  const form = await open(page);
  await form.getByRole("textbox", { name: "Ime", exact: true }).fill("Ana");
  await form.getByRole("textbox", { name: "Prezime", exact: true }).fill("Horvat");
  await form.getByRole("textbox", { name: "E-mail", exact: true }).fill("ana@primjer.hr");
  await form.getByRole("textbox", { name: "Naslov zahtjeva", exact: true }).fill("Vjenčanje u lipnju");
  await form.getByRole("textbox", { name: "Poruka", exact: true }).fill("Bok, imamo datum.");
  await expect(form.getByText("17 / 4000")).toBeVisible();
  await form.getByRole("button", { name: "Pošalji" }).click();

  await expect(form.getByRole("status")).toContainText("Poruka je pripremljena u vašoj aplikaciji za e-poštu.");
  const link = form.getByRole("link", { name: "Otvori e-poštu →" });
  const href = (await link.getAttribute("href")) ?? "";
  expect(href).toMatch(/^mailto:[^?]+\?subject=Vjen%C4%8Danje%20u%20lipnju&body=/);
  expect(decodeURIComponent(href.split("&body=")[1]!)).toContain("Ime: Ana\r\nPrezime: Horvat");
  const sent = await page.evaluate(() => (window as unknown as { __mailto: string[] }).__mailto);
  expect(sent).toEqual([href]);
  await expect(form.locator('[aria-invalid="true"]')).toHaveCount(0);
});
