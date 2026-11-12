<?php
// Shared helpers for the admin API (PHP on Hostinger, no database): errors, time, files, JSON, locks, crypto.
// Ported from the CamelliaSinensis/Septillion "uredništvo" core (same rules, English names).
declare(strict_types=1);

/** An expected failure with a status, a contract error code (ARCHITECTURE §6) and Croatian text for people. */
final class ApiError extends RuntimeException
{
    public function __construct(public int $status, public string $errorCode, string $message = '', public array $extra = [])
    {
        parent::__construct($message !== '' ? $message : $errorCode);
    }
}

// ---------------- time ----------------
function now_ms(): int { return (int) floor(microtime(true) * 1000); }
function iso_time(?int $ms = null): string
{
    $ms ??= now_ms();
    return gmdate('Y-m-d\TH:i:s', intdiv($ms, 1000)) . sprintf('.%03dZ', $ms % 1000);
}
function iso_to_ms(?string $iso): ?int
{
    if (!is_string($iso) || $iso === '') return null;
    $t = strtotime($iso);
    if ($t === false) return null;
    $frac = preg_match('/\.(\d{1,3})/', $iso, $m) ? (int) str_pad($m[1], 3, '0') : 0;
    return $t * 1000 + $frac;
}

// ---------------- files ----------------
/** temp file in the same folder + fsync + rename: a file is never half written */
function write_atomic(string $path, string $content, int $mode = 0600): void
{
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) throw new RuntimeException("Cannot create $dir");
    $tmp = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
    $f = @fopen($tmp, 'xb');
    if ($f === false) throw new RuntimeException("Cannot write in $dir");
    try {
        if (fwrite($f, $content) !== strlen($content)) throw new RuntimeException("Incomplete write ($path)");
        fflush($f);
        if (function_exists('fsync')) fsync($f);
    } finally {
        fclose($f);
    }
    @chmod($tmp, $mode);
    if (!@rename($tmp, $path)) {
        // Windows (local tests) cannot rename over a file another request holds open: retry briefly
        for ($i = 0; $i < 20 && !@rename($tmp, $path); $i++) usleep(25_000);
        if (is_file($tmp)) { @unlink($tmp); throw new RuntimeException("Cannot save $path"); }
    }
}

function to_json(mixed $v, bool $pretty = false): string
{
    return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR | ($pretty ? JSON_PRETTY_PRINT : 0));
}
function from_json(string $s): mixed { return json_decode($s, true, 64, JSON_THROW_ON_ERROR); }
function write_json(string $path, mixed $v): void { write_atomic($path, to_json($v, true)); }
function read_json(string $path, mixed $default = null): mixed
{
    if (!is_file($path)) return $default;
    $s = @file_get_contents($path);
    if ($s === false || $s === '') return $default;
    return from_json($s);
}

/** exclusive lock on a data folder (named lock file): requests that change it run one after another */
function with_lock(string $dir, callable $fn, string $name = '.lock'): mixed
{
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $f = fopen("$dir/$name", 'c');
    if ($f === false) throw new RuntimeException('Cannot lock data');
    try {
        flock($f, LOCK_EX);
        return $fn();
    } finally {
        flock($f, LOCK_UN);
        fclose($f);
    }
}

/** deletes a folder with everything in it (only our own temp and media folders) */
function remove_dir(string $dir): void
{
    if (!is_dir($dir)) return;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) $f->isDir() && !$f->isLink() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    @rmdir($dir);
}

// ---------------- crypto ----------------
function random_token(int $bytes = 32): string { return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '='); }
function sha256(string $s): string { return hash('sha256', $s); }
/** constant-time comparison */
function same(mixed $a, mixed $b): bool { return is_string($a) && is_string($b) && hash_equals($a, $b); }

function uuid4(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    $h = bin2hex($b);
    return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
}
const UUID_RE = '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';
function is_uuid(mixed $v): bool { return is_string($v) && preg_match(UUID_RE, $v) === 1; }

/** length in UTF-16 units, like JavaScript's String.length (same limits as the build-time validation) */
function js_length(string $s): int { return intdiv(strlen(mb_convert_encoding($s, 'UTF-16LE', 'UTF-8')), 2); }
/** like String.prototype.trim (Unicode spaces too) */
function js_trim(string $s): string { return preg_replace('/^[\s\p{Zs}\x{FEFF}\x{2028}\x{2029}]+|[\s\p{Zs}\x{FEFF}\x{2028}\x{2029}]+$/u', '', $s) ?? $s; }
