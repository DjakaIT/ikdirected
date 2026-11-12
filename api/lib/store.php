<?php
// Content store: data/sadrzaj.json (albums and photos, soft-deleted rows included) + snapshots in data/povijest/
// + audit log data/dnevnik.log. Every change runs under one lock on a fresh read and is written atomically.
// After a change: the public export (export.php) is rewritten and the publisher is told (publish.php).
declare(strict_types=1);

const CONTENT_FORMAT = 1;
const SNAPSHOT_EVERY_MS = 15 * 60 * 1000;
const SNAPSHOTS_KEPT = 100;

final class Store
{
    private string $file;
    /** @var (Closure(array): void)|null called with the new state after every change (inside the lock) */
    public ?Closure $afterChange = null;

    public function __construct(private string $dir)
    {
        $this->file = $dir . '/sadrzaj.json';
    }

    public static function empty(): array
    {
        return ['format' => CONTENT_FORMAT, 'version' => 0, 'updated_at' => null, 'albums' => [], 'photos' => []];
    }

    public function read(): array
    {
        $s = read_json($this->file);
        return is_array($s) ? $s : self::empty();
    }

    /**
     * Runs $fn(&$state) under the lock; when the state changed it is saved as a new version.
     * The callback's return value is returned; an ApiError inside leaves the state untouched.
     */
    public function mutate(callable $fn): mixed
    {
        return with_lock($this->dir, function () use ($fn) {
            $state = $this->read();
            $before = to_json($state);
            $result = $fn($state);
            if (to_json($state) !== $before) {
                $state['version'] = (int) $state['version'] + 1;
                $state['updated_at'] = iso_time();
                write_json($this->file, $state);
                $this->snapshot($state);
                if ($this->afterChange) ($this->afterChange)($state);
            }
            return $result;
        }, '.lock-content');
    }

    private function snapshot(array $state): void
    {
        $dir = $this->dir . '/povijest';
        $all = glob($dir . '/*.json') ?: [];
        sort($all);
        $last = $all ? filemtime(end($all)) * 1000 : 0;
        if (now_ms() - $last < SNAPSHOT_EVERY_MS) return;
        write_json(sprintf('%s/%s-v%06d.json', $dir, gmdate('Ymd-His'), $state['version']), $state);
        foreach (array_slice($all, 0, max(0, count($all) + 1 - SNAPSHOTS_KEPT)) as $f) @unlink($f);
    }

    /** one line per action: who, from where, what (never request bodies, tokens or cookies) */
    public function log(array $entry): void
    {
        if (!is_dir($this->dir)) @mkdir($this->dir, 0700, true);
        $f = $this->dir . '/dnevnik.log';
        if (@filesize($f) > 1024 * 1024) @rename($f, $this->dir . '/dnevnik.1.log'); // bounded: ~2 MB in total
        file_put_contents($f, to_json(['at' => iso_time(), ...$entry]) . "\n", FILE_APPEND | LOCK_EX);
    }
}
