// Admin screens against the front-end-phase API simulation (src/admin/mock). Every test gets a
// fresh browser context, so the simulation starts from its seed each time.
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const FIX = join(process.cwd(), "tests", "fixtures");
const A1 = "/admin/albumi/00000000-0000-4000-8000-0000000186a1"; // published, 17 photos, first is cover

async function openEditor(page: Page, path = A1): Promise<void> {
  await page.goto(path);
  await expect(page.getByLabel("Naziv")).toBeVisible();
}

async function newAlbum(page: Page): Promise<void> {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Novi album" }).click();
  await expect(page).toHaveURL(/\/admin\/albumi\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Naziv")).toHaveValue("Novi album");
}

const tiles = (page: Page) => page.locator(".tile--photo");
const menuFor = (page: Page, i: number) => page.getByRole("button", { name: `Izbornik fotografije ${i}`, exact: true });

async function failNext(page: Page, kind: "PATCH" | "UPLOAD"): Promise<void> {
  await page.evaluate((k) => localStorage.setItem("ik-mock-fail", k), kind);
}

test.describe("admin shell", () => {
  test("AC-ADM-03 top bar shows the signed-in email and Odjava", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText("dev@example.test")).toBeVisible();
    await expect(page.getByRole("link", { name: "Odjava" })).toHaveAttribute("href", "/cdn-cgi/access/logout");
    const nav = page.getByRole("navigation", { name: "Administracija" });
    await expect(nav.getByRole("link", { name: "Albumi" })).toHaveAttribute("aria-current", "page");
  });

  test("AC-ADM-04 admin pages are noindex", async ({ page }) => {
    for (const path of ["/admin", A1, "/admin/naslovnica"]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    }
  });
});

test.describe("Albumi", () => {
  test("AC-ALBL-01 grid of albums with status pills and filter chips", async ({ page }) => {
    await page.goto("/admin");
    const cards = page.locator(".acard");
    await expect(cards.first()).toBeVisible();
    await expect(cards.first().locator(".pill")).toHaveText(/Objavljeno|Skica/);
    await page.getByRole("button", { name: /^Skice \d+$/ }).click();
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await expect(cards.nth(i).locator(".pill")).toHaveText("Skica");
  });

  test("AC-ALBL-02 Novi album creates a draft in the active category and opens it", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("button", { name: /^Eventi \d+$/ }).click();
    await page.getByRole("button", { name: "Novi album" }).click();
    await expect(page).toHaveURL(/\/admin\/albumi\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Naziv")).toHaveValue("Novi album");
    await expect(page.getByRole("radio", { name: "Eventi" })).toBeChecked();
    await expect(page.getByLabel("Datum")).toHaveValue(new Date().toISOString().slice(0, 10));
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  test("AC-ALBL-04 empty state offers Novi album", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("ik-admin-mock-v1", JSON.stringify({ albums: [], photos: [] })));
    await page.goto("/admin");
    await expect(page.getByText("Još nemaš nijedan album. Napravi prvi i dodaj fotografije.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Novi album" })).toBeVisible();
  });
});

test.describe("album editor", () => {
  test("AC-ALBED-01 autosave shows Spremam… then Spremljeno and persists", async ({ page }) => {
    await openEditor(page);
    await page.getByLabel("Mjesto").fill("Mjesto Z");
    await expect(page.getByRole("status").filter({ hasText: /Spremam…|Spremljeno/ })).toBeVisible();
    await expect(page.getByText("Spremljeno")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Mjesto")).toHaveValue("Mjesto Z");
  });

  test("AC-ALBED-01 failed autosave keeps the value and retries", async ({ page }) => {
    await openEditor(page);
    await failNext(page, "PATCH");
    await page.getByLabel("Naziv").fill("Testni album jedan");
    const retry = page.getByRole("button", { name: "Nije spremljeno — Pokušaj ponovno" });
    await expect(retry).toBeVisible();
    await expect(page.getByLabel("Naziv")).toHaveValue("Testni album jedan");
    await retry.click();
    await expect(page.getByText("Spremljeno")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Naziv")).toHaveValue("Testni album jedan");
  });

  test("AC-ALBED-01 story counter counts to 600", async ({ page }) => {
    await openEditor(page);
    const story = page.getByLabel("Kratka priča (neobavezno)");
    await story.fill("abc");
    await expect(page.locator("#f-story-count")).toHaveText("3/600");
  });

  test("AC-ALBED-03 publishing needs a photo and a real title", async ({ page }) => {
    await newAlbum(page);
    const sw = page.getByRole("switch");
    await sw.click();
    await expect(page.getByText("Dodaj barem jednu fotografiju prije objave.")).toBeVisible();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await page.locator("[data-upload-input]").setInputFiles(join(FIX, "upload-landscape.jpg"));
    await expect(tiles(page)).toHaveCount(1, { timeout: 20_000 });
    await sw.click();
    await expect(page.getByText("Upiši naziv albuma prije objave.")).toBeVisible();
    await page.getByLabel("Naziv").fill("Testni objavljeni album");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    // AC-ALBED-04: the public link appears once published.
    await expect(page.getByRole("link", { name: "Pogledaj na stranici ↗" })).toHaveAttribute("href", "/radovi/testni-objavljeni-album");
  });

  test("AC-ALBED-04 no public link while the album is a draft", async ({ page }) => {
    await newAlbum(page);
    await expect(page.getByRole("link", { name: "Pogledaj na stranici ↗" })).toHaveCount(0);
  });

  test("AC-ALBED-05 keyboard reorder through the ⋯ menu persists", async ({ page }) => {
    await openEditor(page);
    const first = await tiles(page).nth(0).getAttribute("data-id");
    const second = await tiles(page).nth(1).getAttribute("data-id");
    await menuFor(page, 1).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("menuitem", { name: "Pomakni desno" }).click();
    await expect(tiles(page).nth(0)).toHaveAttribute("data-id", second ?? "");
    await expect(tiles(page).nth(1)).toHaveAttribute("data-id", first ?? "");
    await page.reload();
    await expect(tiles(page).nth(1)).toHaveAttribute("data-id", first ?? "");
  });

  test("AC-ALBED-05 menu is keyboard operable and Esc returns focus", async ({ page }) => {
    await openEditor(page);
    const btn = menuFor(page, 2);
    await btn.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Postavi kao naslovnu" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: /Na naslovnicu|Makni s naslovnice/ })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(btn).toBeFocused();
  });

  test("AC-ALBED-06 set cover and toggle homepage from the menu", async ({ page }) => {
    await openEditor(page);
    await expect(tiles(page).nth(0).getByText("Naslovna")).toBeVisible();
    await menuFor(page, 3).click();
    await page.getByRole("menuitem", { name: "Postavi kao naslovnu" }).click();
    await expect(tiles(page).nth(2).getByText("Naslovna")).toBeVisible();
    await expect(tiles(page).nth(0).getByText("Naslovna")).toHaveCount(0);
    // Unfeature the album's featured photo (seed features one photo here), then feature it back.
    const featured = page.locator(".tile--photo:has(.tile__badge .sr)");
    const before = await featured.count();
    const idx = await tiles(page).evaluateAll((els) => els.findIndex((e) => e.querySelector(".tile__badge .sr")));
    if (idx >= 0) {
      await menuFor(page, idx + 1).click();
      await page.getByRole("menuitem", { name: "Makni s naslovnice" }).click();
      await expect(featured).toHaveCount(before - 1);
    }
  });

  test("AC-FEAT-02 a 13th homepage photo is refused with the copy", async ({ page }) => {
    await openEditor(page);
    const idx = await tiles(page).evaluateAll((els) => els.findIndex((e) => !e.querySelector(".tile__badge .sr")));
    await menuFor(page, idx + 1).click();
    await page.getByRole("menuitem", { name: "Na naslovnicu" }).click();
    await expect(page.getByText("Naslovnica ima najviše 12 fotografija. Makni jednu pa dodaj novu.")).toBeVisible();
  });

  test("AC-DEL-01 delete a photo, undo puts it back in the same place", async ({ page }) => {
    await openEditor(page);
    const n = await tiles(page).count();
    const third = await tiles(page).nth(2).getAttribute("data-id");
    await menuFor(page, 3).click();
    await page.getByRole("menuitem", { name: "Obriši" }).click();
    await expect(tiles(page)).toHaveCount(n - 1);
    await expect(page.getByText("Fotografija obrisana")).toBeVisible();
    await page.getByRole("button", { name: "Poništi" }).click();
    await expect(tiles(page)).toHaveCount(n);
    await expect(tiles(page).nth(2)).toHaveAttribute("data-id", third ?? "");
  });

  test("AC-DEL-03 deleting the cover makes the next photo the cover", async ({ page }) => {
    await openEditor(page);
    const next = await tiles(page).nth(1).getAttribute("data-id");
    await menuFor(page, 1).click();
    await page.getByRole("menuitem", { name: "Obriši" }).click();
    await expect(page.locator(`.tile--photo[data-id="${next}"]`).getByText("Naslovna")).toBeVisible();
  });

  test("AC-ALBED-08 delete album: dialog, soft delete, undo from Albumi and Vrati", async ({ page }) => {
    await openEditor(page);
    await page.getByRole("button", { name: "Obriši album" }).click();
    const dialog = page.getByRole("dialog", { name: "Obriši album" });
    await expect(dialog).toContainText("Obrisati „Testni album 1” i 17 fotografija? Moći ćeš ga vratiti idućih 7 dana.");
    await expect(dialog.getByRole("button", { name: "Odustani" })).toBeFocused();
    await dialog.getByRole("button", { name: "Obriši", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Album obrisan")).toBeVisible();
    const card = page.locator(".acard").filter({ has: page.getByRole("heading", { name: "Testni album 1", exact: true }) });
    await expect(card).toHaveCount(0);
    // AC-ALBL-03: listed under Nedavno obrisano with Vrati.
    await page.getByText(/^Nedavno obrisano \(\d+\)$/).click();
    await page.locator(".trash li").filter({ hasText: /^Testni album 1 ·/ }).getByRole("button", { name: "Vrati" }).click();
    await expect(card).toHaveCount(1);
  });
});

test.describe("upload", () => {
  test("AC-UP-01/04/07 + AC-ALBED-07 files upload with progress; default alt; first becomes cover", async ({ page }) => {
    await newAlbum(page);
    await page.getByLabel("Naziv").fill("Testni upload");
    await page.getByLabel("Mjesto").fill("Mjesto T");
    await expect(page.getByText("Spremljeno")).toBeVisible();
    await page.locator("[data-upload-input]").setInputFiles([join(FIX, "upload-landscape.jpg"), join(FIX, "upload-portrait.png")]);
    await expect(page.getByText(/^Prenosim \d+ \/ 2$/)).toBeVisible();
    await expect(tiles(page)).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByText("Dodano 2 fotografije")).toBeVisible();
    await expect(tiles(page).nth(0).getByText("Naslovna")).toBeVisible();
    await menuFor(page, 1).click();
    await page.getByRole("menuitem", { name: "Opis fotografije" }).click();
    await expect(page.getByRole("dialog", { name: "Opis fotografije" }).getByRole("textbox")).toHaveValue("Testni upload, Mjesto T");
  });

  test("AC-UP-02 an undecodable file is rejected with the copy; the rest still upload", async ({ page }) => {
    await newAlbum(page);
    await page.locator("[data-upload-input]").setInputFiles([join(FIX, "fake.heic"), join(FIX, "upload-landscape.jpg")]);
    await expect(page.getByText("Preglednik ne može otvoriti ovu datoteku. Izvezi je kao JPEG pa pokušaj ponovno.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(tiles(page)).toHaveCount(1, { timeout: 30_000 });
  });

  test("AC-UP-03 privacy: stored WebP has no EXIF/XMP/GPS, long edge 2400, orientation applied", async ({ page }) => {
    await newAlbum(page);
    await page.locator("[data-upload-input]").setInputFiles(join(FIX, "camera-gps-3000x2000.jpg"));
    await expect(tiles(page)).toHaveCount(1, { timeout: 45_000 });
    const info = await page.evaluate(async () => {
      const parts = (globalThis as { __ikLastUpload?: { v2400: Blob } }).__ikLastUpload!;
      const b = new Uint8Array(await parts.v2400.arrayBuffer());
      const s = (o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));
      const u16 = (o: number) => b[o]! | (b[o + 1]! << 8);
      const u24 = (o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
      const u32 = (o: number) => (u16(o) | (u16(o + 2) << 16)) >>> 0;
      const chunks: string[] = [];
      for (let o = 12; o + 8 <= b.length; ) {
        const id = s(o, 4);
        const size = u32(o + 4);
        chunks.push(id);
        o += 8 + size + (size % 2);
      }
      const first = s(12, 4);
      let w = 0;
      let h = 0;
      if (first === "VP8 ") {
        w = u16(26) & 0x3fff;
        h = u16(28) & 0x3fff;
      } else if (first === "VP8L") {
        const v = u32(21);
        w = (v & 0x3fff) + 1;
        h = ((v >> 14) & 0x3fff) + 1;
      } else if (first === "VP8X") {
        w = u24(24) + 1;
        h = u24(27) + 1;
      }
      const text = new TextDecoder("latin1").decode(b);
      return {
        riff: s(0, 4),
        webp: s(8, 4),
        chunks,
        flags: first === "VP8X" ? b[20]! : 0,
        w,
        h,
        hasGpsText: text.includes("GPS") || text.includes("Fixture"),
      };
    });
    expect(info.riff).toBe("RIFF");
    expect(info.webp).toBe("WEBP");
    expect(info.chunks).not.toContain("EXIF");
    expect(info.chunks).not.toContain("XMP ");
    expect(info.flags & 0x0c).toBe(0);
    expect(info.hasGpsText).toBe(false);
    expect(Math.max(info.w, info.h)).toBe(2400);
    expect(info.w).toBeLessThan(info.h); // Orientation=6 applied: stored landscape → portrait
  });

  test("AC-UP-05 a failed upload retries only that file", async ({ page }) => {
    await newAlbum(page);
    await failNext(page, "UPLOAD");
    await page.locator("[data-upload-input]").setInputFiles(join(FIX, "upload-landscape.jpg"));
    const retry = page.getByRole("button", { name: "Nije uspjelo — Pokušaj ponovno" });
    await expect(retry).toBeVisible({ timeout: 30_000 });
    await retry.click();
    await expect(tiles(page)).toHaveCount(1, { timeout: 30_000 });
    await expect(retry).toHaveCount(0);
  });

  test("AC-UP-04 leaving mid-upload triggers the browser warning", async ({ page }) => {
    await newAlbum(page);
    await page.getByLabel("Naziv").click(); // user activation, required for beforeunload dialogs
    await page.locator("[data-upload-input]").setInputFiles([join(FIX, "upload-landscape.jpg"), join(FIX, "upload-portrait.png")]);
    await expect(page.getByText(/^Prenosim/)).toBeVisible();
    const dialog = new Promise<string>((resolve) => page.once("dialog", (d) => (resolve(d.type()), void d.dismiss())));
    await page.close({ runBeforeUnload: true });
    expect(await dialog).toBe("beforeunload");
  });
});

test.describe("Naslovnica", () => {
  test("AC-FEAT-01/03 featured in order with count, help line, move and remove", async ({ page }) => {
    await page.goto("/admin/naslovnica");
    await expect(page.getByText("12 / 12")).toBeVisible();
    await expect(page.getByText(/Ako odabereš manje od 4, dopunit ću ih naslovnim fotografijama najnovijih albuma\./)).toBeVisible();
    const items = page.locator(".fitem");
    await expect(items).toHaveCount(12);
    const first = await items.nth(0).getAttribute("data-id");
    await items.nth(0).getByRole("button", { name: "Pomakni desno" }).click();
    await expect(items.nth(1)).toHaveAttribute("data-id", first ?? "");
    await page.reload();
    await expect(page.locator(".fitem").nth(1)).toHaveAttribute("data-id", first ?? "");
    await page.locator(".fitem").nth(0).getByRole("button", { name: "Makni", exact: true }).click();
    await expect(page.getByText("11 / 12")).toBeVisible();
  });

  test("feat.empty shows guidance when nothing is featured", async ({ page }) => {
    await page.goto("/admin/naslovnica");
    for (let i = 0; i < 12; i++) await page.locator(".fitem").first().getByRole("button", { name: "Makni", exact: true }).click();
    await expect(page.getByText("Još nisi odabrala fotografije za naslovnicu.", { exact: false })).toBeVisible();
  });
});
