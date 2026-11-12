<?php
// Attempt limits (password and code guessing, upload volume), sliding windows. PHP has no long-lived process,
// so counters live in data/ogranicenja.json (under the lock).
declare(strict_types=1);

const MAX_LIMIT_KEYS = 2000;

final class Limits
{
    private string $file;

    /** @param array<string, array{windowMs:int, max:int}> $kinds e.g. ['ip' => [...], 'user' => [...]] */
    public function __construct(private string $dir, private array $kinds) { $this->file = $dir . '/ogranicenja.json'; }

    private function fresh(array $all, string $kind, string $key, int $t): array
    {
        $w = $this->kinds[$kind]['windowMs'];
        return array_values(array_filter($all["$kind:$key"] ?? [], fn ($x) => $t - $x < $w));
    }

    /** seconds to wait (0 = allowed) */
    public function wait(string $kind, string $key): int
    {
        $t = now_ms();
        $v = $this->fresh(read_json($this->file, []), $kind, $key, $t);
        ['windowMs' => $w, 'max' => $max] = $this->kinds[$kind];
        return count($v) < $max ? 0 : (int) ceil(($w - ($t - $v[0])) / 1000);
    }

    public function record(string $kind, string $key): void
    {
        with_lock($this->dir, function () use ($kind, $key) {
            $t = now_ms();
            $all = read_json($this->file, []);
            foreach ($all as $k => $v) { // old entries go on the way
                $w = $this->kinds[explode(':', $k, 2)[0]]['windowMs'] ?? 0;
                $all[$k] = array_values(array_filter($v, fn ($x) => $t - $x < $w));
                if (!$all[$k]) unset($all[$k]);
            }
            $all["$kind:$key"] = [...$this->fresh($all, $kind, $key, $t), $t];
            // an attack from many addresses or made-up names keeps the file small (newest entries win)
            if (count($all) > MAX_LIMIT_KEYS) {
                uasort($all, fn ($a, $b) => max($b) <=> max($a));
                $all = array_slice($all, 0, MAX_LIMIT_KEYS, true);
            }
            write_json($this->file, $all);
        }, '.lock-limits');
    }

    public function reset(string $kind, string $key): void
    {
        with_lock($this->dir, function () use ($kind, $key) {
            $all = read_json($this->file, []);
            if (!isset($all["$kind:$key"])) return;
            unset($all["$kind:$key"]);
            write_json($this->file, $all);
        }, '.lock-limits');
    }
}

/** First setup (no user yet) needs the code from data/PRVO-POSTAVLJANJE.txt (outside public_html): only the owner of
 * the hosting account can read it (hPanel → File Manager). The code stays until used; the file is deleted after. */
final class FirstSetup
{
    public readonly string $file;

    public function __construct(string $dir, private string $origin) { $this->file = $dir . '/PRVO-POSTAVLJANJE.txt'; }

    public function code(): string
    {
        $s = is_file($this->file) ? (string) @file_get_contents($this->file) : '';
        if (preg_match('/^ {2}([A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5})$/m', $s, $m)) return $m[1];
        $z = random_code(15);
        $code = substr($z, 0, 5) . '-' . substr($z, 5, 5) . '-' . substr($z, 10);
        write_atomic($this->file, "ikdirected administracija — prvo postavljanje\n\nOtvori {$this->origin}/admin i upiši ovaj kod:\n\n  $code\n\n"
            . "Kod vrijedi dok se ne postavi prvi račun; nakon toga se ova datoteka sama briše.\n");
        return $code;
    }

    public function check(mixed $input): bool { return normalize_code($input) !== '' && hash_equals(normalize_code($this->code()), normalize_code($input)); }
    public function remove(): void { @unlink($this->file); }
}
