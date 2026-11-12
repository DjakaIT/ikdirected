// Sign-in (AC-ADM-01/02 on the hosting): first setup, password + TOTP, recovery codes, invites, limits, sessions.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, startPhp, totp, TEST_PASSWORD, TEST_TOTP, type PhpServer } from "./harness";

let php: PhpServer;
beforeAll(async () => {
  php = await startPhp();
});
afterAll(() => php.stop());

const secretOf = (uri: string): string => new URL(uri).searchParams.get("secret")!;

async function firstAdmin(name = "ivana", password = "ovo je moja duga lozinka"): Promise<{ c: Client; secret: string; codes: string[] }> {
  const c = await new Client(php).seed({ user: false });
  const s = await c.req("POST", "/api/admin/auth/setup", { json: { name, password } });
  expect(s.status).toBe(200);
  const secret = secretOf(s.body.uri);
  const done = await c.req("POST", "/api/admin/auth/2fa/confirm", { json: { code: await totp(secret) } });
  expect(done.status).toBe(200);
  return { c, secret, codes: done.body.recoveryCodes };
}

describe("first setup", () => {
  it("AC-ADM-01 state reports first setup; locally no code is needed", async () => {
    const c = await new Client(php).seed({ user: false });
    const r = await c.req("GET", "/api/admin/auth/state");
    expect(r.body).toMatchObject({ step: null, firstSetup: true, codeRequired: false });
  });

  it("weak passwords and bad names are refused with the rule", async () => {
    const c = await new Client(php).seed({ user: false });
    const short = await c.req("POST", "/api/admin/auth/setup", { json: { name: "ivana", password: "kratka" } });
    expect(short.status).toBe(422);
    expect(short.body.error.message).toContain("12 znakova");
    const name = await c.req("POST", "/api/admin/auth/setup", { json: { name: "I", password: "ovo je moja duga lozinka" } });
    expect(name.status).toBe(422);
    const withName = await c.req("POST", "/api/admin/auth/setup", { json: { name: "ivana", password: "ivana ivana ivana 123" } });
    expect(withName.body.error.message).toContain("korisničko ime");
  });

  it("setup → TOTP confirm signs in fully with 8 recovery codes; setup cannot run twice", async () => {
    const { c, codes } = await firstAdmin();
    expect(codes).toHaveLength(8);
    const st = await c.req("GET", "/api/admin/auth/state");
    expect(st.body).toMatchObject({ step: "in", name: "ivana", role: "admin", firstSetup: false });
    const again = await c.req("POST", "/api/admin/auth/setup", { json: { name: "drugi", password: "ovo je moja duga lozinka" } });
    expect(again.status).toBe(409);
  });

  it("a wrong TOTP code during setup is refused, five wrong end the step", async () => {
    const c = await new Client(php).seed({ user: false });
    await c.req("POST", "/api/admin/auth/setup", { json: { name: "ivana", password: "ovo je moja duga lozinka" } });
    for (let i = 0; i < 4; i++) expect((await c.req("POST", "/api/admin/auth/2fa/confirm", { json: { code: "000000" } })).status).toBe(400);
    expect((await c.req("POST", "/api/admin/auth/2fa/confirm", { json: { code: "000000" } })).status).toBe(429);
    expect((await c.req("POST", "/api/admin/auth/2fa/confirm", { json: { code: "000000" } })).status).toBe(401);
  });
});

describe("sign-in", () => {
  it("SEC-AUTH-01 wrong password and unknown user get the same answer", async () => {
    const { c } = await firstAdmin();
    await c.req("POST", "/api/admin/auth/logout");
    const wrong = await c.req("POST", "/api/admin/auth/login", { json: { name: "ivana", password: "kriva lozinka nekakva" } });
    const unknown = await c.req("POST", "/api/admin/auth/login", { json: { name: "nitko", password: "kriva lozinka nekakva" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it("password then TOTP; the same TOTP step is never accepted twice", async () => {
    const { c, secret } = await firstAdmin();
    await c.req("POST", "/api/admin/auth/logout");
    const step = await c.req("POST", "/api/admin/auth/login", { json: { name: "ivana", password: "ovo je moja duga lozinka" } });
    expect(step.body).toEqual({ step: "2fa" });
    // the code used at setup is still in the window: refused as already used
    const reused = await c.req("POST", "/api/admin/auth/login/2fa", { json: { code: await totp(secret) } });
    expect(reused.status).toBe(400);
    const ok = await c.req("POST", "/api/admin/auth/login/2fa", { json: { code: await totp(secret, 1) } });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ step: "in", name: "ivana" });
  });

  it("a recovery code works once", async () => {
    const { c, codes } = await firstAdmin();
    await c.req("POST", "/api/admin/auth/logout");
    await c.req("POST", "/api/admin/auth/login", { json: { name: "ivana", password: "ovo je moja duga lozinka" } });
    const ok = await c.req("POST", "/api/admin/auth/login/2fa", { json: { code: codes[0]!.toLowerCase() } });
    expect(ok.body).toMatchObject({ step: "in", recoveryLeft: 7 });
    await c.req("POST", "/api/admin/auth/logout");
    await c.req("POST", "/api/admin/auth/login", { json: { name: "ivana", password: "ovo je moja duga lozinka" } });
    expect((await c.req("POST", "/api/admin/auth/login/2fa", { json: { code: codes[0] } })).status).toBe(400);
  });

  it("five wrong passwords for one user lock that user for 15 minutes (429 + Retry-After)", async () => {
    const { c } = await firstAdmin("ana");
    await c.req("POST", "/api/admin/auth/logout");
    for (let i = 0; i < 5; i++) await c.req("POST", "/api/admin/auth/login", { json: { name: "ana", password: `kriva lozinka broj ${i}` } });
    const locked = await c.req("POST", "/api/admin/auth/login", { json: { name: "ana", password: "ovo je moja duga lozinka" } });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("session cookie is HttpOnly + SameSite=Strict; logout ends it", async () => {
    const c = await new Client(php).seed({ user: false });
    const r = await c.req("POST", "/api/admin/auth/setup", { json: { name: "ivana", password: "ovo je moja duga lozinka" } });
    const cookie = r.headers.getSetCookie().find((x) => x.startsWith("ik-admin="))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    await c.req("POST", "/api/admin/auth/2fa/confirm", { json: { code: await totp(secretOf(r.body.uri)) } });
    expect((await c.req("GET", "/api/admin/albums")).status).toBe(200);
    await c.req("POST", "/api/admin/auth/logout");
    expect((await c.req("GET", "/api/admin/albums")).status).toBe(401);
  });
});

describe("invites and accounts", () => {
  it("admin invites an editor; the link sets a password and 2FA; editors cannot manage users", async () => {
    const admin = await new Client(php).seed();
    const inv = await admin.req("POST", "/api/admin/users/invite", { json: { name: "sara" } });
    expect(inv.status).toBe(200);
    const token = inv.body.link.split("#pozivnica=")[1];

    const sara = new Client(php);
    sara.cookies.set("ik-test-ns", admin.ns); // same site
    expect((await sara.req("POST", "/api/admin/auth/invite/check", { json: { token } })).body).toEqual({ name: "sara" });
    const set = await sara.req("POST", "/api/admin/auth/invite", { json: { token, password: "sarina duga lozinka 1" } });
    expect(set.body.step).toBe("setup-2fa");
    const done = await sara.req("POST", "/api/admin/auth/2fa/confirm", { json: { code: await totp(secretOf(set.body.uri)) } });
    expect(done.body).toMatchObject({ name: "sara", role: "urednik" });
    expect((await sara.req("GET", "/api/admin/albums")).status).toBe(200);
    expect((await sara.req("GET", "/api/admin/users")).status).toBe(403);
    // the invite is single use
    expect((await sara.req("POST", "/api/admin/auth/invite/check", { json: { token } })).status).toBe(404);

    const list = await admin.req("GET", "/api/admin/users");
    expect(list.body.users.map((u: { name: string; state: string }) => `${u.name}:${u.state}`)).toEqual(["test:aktivan", "sara:aktivan"]);
    expect((await admin.req("POST", "/api/admin/users/remove", { json: { name: "sara" } })).status).toBe(200);
    expect((await sara.req("GET", "/api/admin/albums")).status).toBe(401);
  });

  it("changing the password signs out other sessions but keeps this one", async () => {
    const a = await new Client(php).seed();
    const other = new Client(php);
    other.cookies.set("ik-test-ns", a.ns);
    await other.req("POST", "/api/admin/auth/login", { json: { name: "test", password: TEST_PASSWORD } });
    await other.req("POST", "/api/admin/auth/login/2fa", { json: { code: await totp(TEST_TOTP) } });
    expect((await other.req("GET", "/api/admin/albums")).status).toBe(200);

    const wrong = await a.req("POST", "/api/admin/auth/password", { json: { old: "nije ta lozinka", new: "nova jako duga lozinka" } });
    expect(wrong.status).toBe(400);
    const ok = await a.req("POST", "/api/admin/auth/password", { json: { old: TEST_PASSWORD, new: "nova jako duga lozinka" } });
    expect(ok.status).toBe(200);
    expect((await a.req("GET", "/api/admin/albums")).status).toBe(200);
    expect((await other.req("GET", "/api/admin/albums")).status).toBe(401);
  });
});
