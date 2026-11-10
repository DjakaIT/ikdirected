<?php
// Admin accounts (data/korisnici.json, mode 600). Passwords and tokens are never stored, only hashes.
// Roles: 'admin' (first account; invites and removes others) and 'urednik' (edits albums).
declare(strict_types=1);

const INVITE_TTL_MS = 72 * 3600 * 1000;
const NAME_RULE = 'Korisničko ime: 2–32 znaka, mala slova, brojke, točka, crtica.';

function normalize_name(mixed $name): string { return mb_strtolower(js_trim(is_scalar($name) ? (string) $name : ''), 'UTF-8'); }
function valid_name(string $name): bool { return (bool) preg_match('/^[a-z0-9][a-z0-9._-]{1,31}$/', $name); }
function account_state(array $u): string
{
    if (empty($u['password'])) return (($u['invite']['expires'] ?? 0) > now_ms()) ? 'čeka pozivnicu' : 'pozivnica istekla';
    return !empty($u['totp']) ? 'aktivan' : 'bez dvostruke potvrde';
}

final class Users
{
    private string $file;

    public function __construct(private string $dir) { $this->file = $dir . '/korisnici.json'; }

    public function all(): array { return read_json($this->file, ['users' => []]); }
    public function count(): int { return count($this->all()['users']); }

    public function find(mixed $name): ?array
    {
        $n = normalize_name($name);
        foreach ($this->all()['users'] as $u) if ($u['name'] === $n) return $u;
        return null;
    }

    /** change one user under the lock (fresh read, immediate write); returns the new record */
    public function update(string $name, callable $fn): array
    {
        return with_lock($this->dir, function () use ($name, $fn) {
            $data = $this->all();
            foreach ($data['users'] as $i => $u) {
                if ($u['name'] !== normalize_name($name)) continue;
                $data['users'][$i] = $fn($u);
                write_json($this->file, $data);
                return $data['users'][$i];
            }
            throw new ApiError(404, 'NOT_FOUND', 'Korisnik ne postoji.');
        });
    }

    private static function blank(string $name, string $role): array
    {
        return ['name' => $name, 'role' => $role, 'password' => null, 'totp' => null, 'recovery' => [], 'lastStep' => -1, 'sessionVersion' => 1,
            'created' => iso_time(), 'lastLogin' => null];
    }

    /** first account (first setup): administrator */
    public function createFirst(string $name): void
    {
        with_lock($this->dir, function () use ($name) {
            $data = $this->all();
            if ($data['users']) throw new ApiError(409, 'CONFLICT', 'Administracija je već postavljena. Prijavi se.');
            $data['users'][] = self::blank($name, 'admin');
            write_json($this->file, $data);
        });
    }

    /** new invite (and a new user if missing); reset = new password and 2FA, signed out everywhere */
    public function invite(string $name, bool $reset = false): string
    {
        $n = normalize_name($name);
        if (!valid_name($n)) throw new ApiError(422, 'VALIDATION', NAME_RULE);
        $token = random_token(32);
        with_lock($this->dir, function () use ($n, $reset, $token) {
            $data = $this->all();
            $i = null;
            foreach ($data['users'] as $j => $u) if ($u['name'] === $n) $i = $j;
            if ($i === null) {
                $data['users'][] = self::blank($n, $data['users'] ? 'urednik' : 'admin');
                $i = array_key_last($data['users']);
            } elseif ($reset) {
                $data['users'][$i] = array_merge($data['users'][$i], ['password' => null, 'totp' => null, 'recovery' => [], 'lastStep' => -1,
                    'sessionVersion' => ($data['users'][$i]['sessionVersion'] ?? 1) + 1]);
            } elseif (!empty($data['users'][$i]['password'])) {
                throw new ApiError(409, 'CONFLICT', "Korisnik \"$n\" već postoji.");
            }
            $data['users'][$i]['invite'] = ['hash' => sha256($token), 'expires' => now_ms() + INVITE_TTL_MS];
            write_json($this->file, $data);
        });
        return $token;
    }

    /** user for a valid invite (the token is compared as a hash, in constant time) */
    public function byInvite(mixed $token): ?array
    {
        if (!is_string($token) || strlen($token) < 20 || strlen($token) > 100) return null;
        $h = sha256($token);
        foreach ($this->all()['users'] as $u) {
            if (!empty($u['invite']) && $u['invite']['expires'] > now_ms() && hash_equals($u['invite']['hash'], $h)) return $u;
        }
        return null;
    }

    public function remove(string $name): void
    {
        with_lock($this->dir, function () use ($name) {
            $data = $this->all();
            $before = count($data['users']);
            $data['users'] = array_values(array_filter($data['users'], fn ($u) => $u['name'] !== normalize_name($name)));
            if (count($data['users']) === $before) throw new ApiError(404, 'NOT_FOUND', 'Korisnik ne postoji.');
            write_json($this->file, $data);
        });
    }
}
