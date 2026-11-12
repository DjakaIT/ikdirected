// Sign-in through the admin UI (AuthGate): first setup with 2FA and recovery codes, password + code, expiry.
import { expect, seed, test, totp, TEST_USER } from "./admin-fixture";

test("SEC-AUTH-05 /admin without a session shows sign-in and no album data", async ({ page }) => {
  await seed(page, { user: true });
  await page.context().clearCookies({ name: "ik-admin" });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Prijava" })).toBeVisible();
  await expect(page.locator(".acard")).toHaveCount(0);
  await expect(page.getByText("Testni album 1")).toHaveCount(0);
});

test("AC-ADM-01 first setup: account, QR + code, recovery codes, then the albums", async ({ page }) => {
  await seed(page, { user: false, empty: true });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Postavljanje administracije" })).toBeVisible();
  await page.getByLabel("Korisničko ime").fill("ivana");
  await page.getByLabel("Lozinka", { exact: true }).fill("moja nova duga lozinka");
  await page.getByLabel("Ponovi lozinku").fill("moja druga lozinka");
  await page.getByRole("button", { name: "Nastavi" }).click();
  await expect(page.getByRole("alert")).toHaveText("Lozinke se ne podudaraju.");
  await page.getByLabel("Ponovi lozinku").fill("moja nova duga lozinka");
  await page.getByRole("button", { name: "Nastavi" }).click();

  await expect(page.getByRole("heading", { name: "Dvostruka potvrda" })).toBeVisible();
  await expect(page.getByAltText("QR kod za aplikaciju za potvrdu")).toBeVisible();
  await page.getByText("Ne mogu skenirati — upisat ću ključ ručno").click();
  const key = (await page.locator(".auth__key").textContent())!.replace(/\s/g, "");
  await page.getByLabel(/Upiši šesteroznamenkasti kod/).fill(await totp(key));
  await page.getByRole("button", { name: "Uključi dvostruku potvrdu" }).click();

  await expect(page.getByRole("heading", { name: "Spremi rezervne kodove" })).toBeVisible();
  await expect(page.locator(".auth__codes li")).toHaveCount(8);
  const open = page.getByRole("button", { name: "Otvori administraciju" });
  await expect(open).toBeDisabled();
  await page.getByLabel(/Kodovi su spremljeni/).check();
  await open.click();
  await expect(page.getByText("Još nemaš nijedan album. Napravi prvi i dodaj fotografije.")).toBeVisible();
  await expect(page.getByRole("button", { name: "ivana", exact: true })).toBeVisible();
});

test("sign out, then password + code from the phone", async ({ page }) => {
  await seed(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Odjava" }).click();
  await expect(page.getByRole("heading", { name: "Prijava" })).toBeVisible();
  await page.getByLabel("Korisničko ime").fill(TEST_USER.name);
  await page.getByLabel("Lozinka").fill("kriva lozinka nekakva");
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page.getByRole("alert")).toHaveText("Pogrešno korisničko ime ili lozinka.");
  await page.getByLabel("Lozinka").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page.getByRole("heading", { name: "Kod s mobitela" })).toBeVisible();
  await page.getByLabel("Kod", { exact: true }).fill(await totp(TEST_USER.totp));
  await page.getByRole("button", { name: "Potvrdi" }).click();
  await expect(page.locator(".acard").first()).toBeVisible();
});

test("an expired session mid-work brings back sign-in with the reason", async ({ page }) => {
  await seed(page);
  await page.goto("/admin/naslovnica");
  await expect(page.locator(".fitem").first()).toBeVisible();
  await page.context().clearCookies({ name: "ik-admin" });
  await page.locator(".fitem").nth(0).getByRole("button", { name: "Makni", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Prijava" })).toBeVisible();
});

test("an invalid invite link says so and leads to sign-in", async ({ page }) => {
  await seed(page);
  await page.goto("/admin#pozivnica=" + "x".repeat(43));
  await expect(page.getByRole("heading", { name: "Pozivnica ne vrijedi" })).toBeVisible();
  await page.getByRole("button", { name: "Na prijavu" }).click();
  await expect(page.locator(".acard").first()).toBeVisible();
});
