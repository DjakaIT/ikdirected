<?php
// Sessions on disk (data/sesije/<sha256(id)>.json): the cookie carries only a random id (256 bits) and the file is
// named by its SHA-256, so even a copy of the folder yields no usable cookie. Independent of the host's PHP sessions
// (their cleanup would sign people out mid-work). Expiry: 30 min without user activity (background polls do not
// count), at most 12 h; the 2FA step 5 min. Password change / reset / removal: sessionVersion (app.php).
declare(strict_types=1);

const IDLE_MS = 30 * 60 * 1000;
const LONGEST_MS = 12 * 3600 * 1000;
const STEP_2FA_MS = 5 * 60 * 1000;
const TOUCH_WRITE_MS = 60 * 1000;

function expiry_reason(array $s, int $t): ?string
{
    if ($t - $s['created'] > LONGEST_MS) return 'trajanje';
    if (($s['step'] ?? '') === 'in') return $t - $s['active'] > IDLE_MS ? 'neaktivnost' : null;
    return $t - $s['active'] > STEP_2FA_MS ? 'korak' : null;
}

final class Sessions
{
    public readonly string $cookie;
    /** why the last read session is gone (a cookie was there, the session is not valid) */
    public ?string $expired = null;

    public function __construct(private string $dir, private bool $secure)
    {
        $this->cookie = $secure ? '__Host-ik-admin' : 'ik-admin';
        if (!is_dir($dir)) @mkdir($dir, 0700, true);
        if (random_int(1, 50) === 1) $this->sweep();
    }

    private function file(string $id): string { return $this->dir . '/' . sha256($id) . '.json'; }

    private function sweep(): void
    {
        $t = now_ms();
        foreach (glob($this->dir . '/*.json') ?: [] as $f) {
            try { $s = read_json($f); } catch (Throwable) { $s = null; }
            if (!is_array($s) || expiry_reason($s, $t)) @unlink($f);
        }
    }

    private function setCookie(string $value, int $maxAge): void
    {
        header("Set-Cookie: {$this->cookie}=$value; Path=/; HttpOnly; SameSite=Strict; Max-Age=$maxAge" . ($this->secure ? '; Secure' : ''), false);
    }

    /** ['id' => ..., 's' => [...]] or null; background = automatic poll (does not extend the session) */
    public function read(bool $background = false): ?array
    {
        $this->expired = null;
        $id = $_COOKIE[$this->cookie] ?? null;
        if (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{43}$/', $id)) return null;
        try { $s = read_json($this->file($id)); } catch (Throwable) { $s = null; }
        if (!is_array($s)) { $this->expired = 'nema'; return null; }
        $t = now_ms();
        if ($r = expiry_reason($s, $t)) { @unlink($this->file($id)); $this->expired = $r; return null; }
        $ses = ['id' => $id, 's' => $s];
        if (!$background) {
            $ses['s']['active'] = $t;
            if ($t - ($s['written'] ?? 0) > TOUCH_WRITE_MS) $this->save($ses);
        }
        return $ses;
    }

    public function save(array &$ses): void
    {
        $ses['s']['written'] = now_ms();
        write_json($this->file($ses['id']), $ses['s']);
    }

    /** new session (always a new id — protects against session fixation); returns its data */
    public function create(array $data, ?string $oldId = null): array
    {
        if ($oldId) @unlink($this->file($oldId));
        $t = now_ms();
        $ses = ['id' => random_token(32), 's' => array_merge($data, ['csrf' => random_token(32), 'created' => $t, 'active' => $t])];
        $this->save($ses);
        $this->setCookie($ses['id'], intdiv(LONGEST_MS, 1000));
        return $ses['s'];
    }

    public function delete(?string $id, bool $cookie = true): void
    {
        if ($id) @unlink($this->file($id));
        if ($cookie) $this->setCookie('', 0);
    }

    /** sign a user out everywhere, optionally except one session */
    public function signOutUser(string $name, ?string $except = null): void
    {
        $keep = $except ? $this->file($except) : null;
        foreach (glob($this->dir . '/*.json') ?: [] as $f) {
            if ($keep && realpath($f) === realpath($keep)) continue;
            try { if ((read_json($f)['name'] ?? null) === $name) @unlink($f); } catch (Throwable) { /* skip */ }
        }
    }
}
