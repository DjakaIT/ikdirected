<?php
// Passwords, two-step verification (TOTP, RFC 6238) and recovery codes — built-in PHP functions only.
//  - passwords: Argon2id (OWASP: m=19 MiB, t=2, p=1); without it bcrypt (cost 12) over SHA-256 (bcrypt cuts at 72 bytes)
//  - TOTP: SHA-1, 6 digits, 30 s, ±1 step, the same or an older step is never accepted twice
//  - recovery codes: single use, stored only as SHA-256
declare(strict_types=1);

function normalize_password(string $p): string
{
    return class_exists('Normalizer') ? (Normalizer::normalize($p, Normalizer::FORM_KC) ?: $p) : $p;
}

function hash_password(string $password): string
{
    $p = normalize_password($password);
    if (defined('PASSWORD_ARGON2ID')) return password_hash($p, PASSWORD_ARGON2ID, ['memory_cost' => 19456, 'time_cost' => 2, 'threads' => 1]);
    return password_hash(base64_encode(hash('sha256', $p, true)), PASSWORD_BCRYPT, ['cost' => 12]);
}

function verify_password(string $password, ?string $stored): bool
{
    if (!$stored) return false;
    $p = normalize_password($password);
    if (str_starts_with($stored, '$2y$')) $p = base64_encode(hash('sha256', $p, true));
    return password_verify($p, $stored);
}

/** dummy hash: a check takes as long when the user does not exist (names cannot be probed) */
function dummy_hash(): string
{
    static $h = null;
    return $h ??= hash_password(random_token());
}

const COMMON_PASSWORDS = ['123456789012', 'password1234', 'lozinka12345', 'qwertyuiopas', 'ikdirected12', 'fotografija1', 'vjencanje123',
    'zadar1234567', 'administrator', 'iloveyou1234', '111111111111', 'abcdefghijkl', 'welcome12345', 'letmein12345', 'passw0rd1234'];

/** error text (Croatian, shown to the person) or null when the new password is fine */
function check_new_password(mixed $password, string $name = ''): ?string
{
    $p = is_string($password) ? $password : '';
    if (js_length($p) < 12) return 'Lozinka mora imati barem 12 znakova (najbolje nekoliko riječi).';
    if (js_length($p) > 200) return 'Lozinka je predugačka.';
    $n = mb_strtolower($p, 'UTF-8');
    if ($name !== '' && str_contains($n, mb_strtolower($name, 'UTF-8'))) return 'Lozinka ne smije sadržavati korisničko ime.';
    if (count(array_unique(mb_str_split($n, 1, 'UTF-8'))) < 5) return 'Lozinka ima premalo različitih znakova.';
    foreach (COMMON_PASSWORDS as $c) if (str_contains($n, $c)) return 'Lozinka je prečesta, odaberi drugu.';
    return null;
}

// ---------------- TOTP ----------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP = 30;

function base32_encode(string $bin): string
{
    $bits = 0; $v = 0; $out = '';
    foreach (str_split($bin) as $c) {
        $v = (($v << 8) | ord($c)) & 0xFFFF; $bits += 8;
        while ($bits >= 5) { $out .= B32[($v >> ($bits - 5)) & 31]; $bits -= 5; }
    }
    if ($bits > 0) $out .= B32[($v << (5 - $bits)) & 31];
    return $out;
}
function base32_decode(string $s): string
{
    $c = preg_replace('/[^A-Z2-7]/', '', strtoupper($s));
    $bits = 0; $v = 0; $out = '';
    foreach (str_split($c) as $z) {
        if ($z === '') continue;
        $v = (($v << 5) | strpos(B32, $z)) & 0xFFFF; $bits += 5;
        if ($bits >= 8) { $out .= chr(($v >> ($bits - 8)) & 255); $bits -= 8; }
    }
    return $out;
}
function new_totp_secret(): string { return base32_encode(random_bytes(20)); }
function current_step(?int $nowMs = null): int { return intdiv($nowMs ?? now_ms(), TOTP_STEP * 1000); }
function totp_code(string $secret, int $step): string
{
    $h = hash_hmac('sha1', pack('J', $step), base32_decode($secret), true);
    $o = ord($h[19]) & 15;
    $n = ((ord($h[$o]) & 127) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string) ($n % 1000000), 6, '0', STR_PAD_LEFT);
}
/** the step that was used, or null */
function verify_totp(string $secret, mixed $code, int $lastStep = -1): ?int
{
    $k = preg_replace('/\s/', '', is_scalar($code) ? (string) $code : '');
    if (!preg_match('/^\d{6}$/', $k)) return null;
    $t = current_step();
    foreach ([$t - 1, $t, $t + 1] as $step) {
        if ($step <= $lastStep) continue;
        if (hash_equals(totp_code($secret, $step), $k)) return $step;
    }
    return null;
}
function otpauth_uri(string $secret, string $name): string
{
    $issuer = 'ikdirected admin';
    return 'otpauth://totp/' . rawurlencode("$issuer:$name") . "?secret=$secret&issuer=" . rawurlencode($issuer) . '&algorithm=SHA1&digits=6&period=' . TOTP_STEP;
}

// ---------------- recovery codes ----------------
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
function normalize_code(mixed $code): string { return preg_replace('/[^A-Z0-9]/', '', strtoupper(is_scalar($code) ? (string) $code : '')); }
function random_code(int $chars): string
{
    $s = '';
    foreach (str_split(random_bytes($chars)) as $b) $s .= CODE_ALPHABET[ord($b) % strlen(CODE_ALPHABET)];
    return $s;
}
function new_recovery_codes(int $n = 8): array
{
    $codes = [];
    for ($i = 0; $i < $n; $i++) { $s = random_code(10); $codes[] = substr($s, 0, 5) . '-' . substr($s, 5); }
    return ['codes' => $codes, 'hashes' => array_map(fn ($k) => sha256(normalize_code($k)), $codes)];
}
/** index of the matching code, or -1 */
function find_recovery_code(mixed $code, array $hashes): int
{
    $h = sha256(normalize_code($code));
    foreach ($hashes as $i => $x) if (is_string($x) && hash_equals($x, $h)) return $i;
    return -1;
}
