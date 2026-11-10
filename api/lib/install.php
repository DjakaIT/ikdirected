<?php
// Installs a built site on the hosting without FTP (model: CamelliaSinensis instalacija.php): GitHub Actions keeps
// the package as artifact "hosting" (.github/workflows/objava.yml); it is downloaded here with the same token and
// copied into public_html in this order: new files (assets with hashed names, photos of the demo), the API, then
// HTML/XML/TXT and the .htaccess files last, so a page never points at a file that is not there yet.
// Then pages that are no longer in the package (a deleted album) are removed: only files the previous package
// listed in .ik-paket.json, never media/ uploads, never .well-known/. Identical files are not rewritten.
// Only builds of objava.yml on main of this repository are accepted, and only ordinary file names.
declare(strict_types=1);

const ARTIFACT = 'hosting';
const MANIFEST = '.ik-paket.json';
const MAX_PACKAGE = 200 * 1024 * 1024;
const MAX_UNPACKED = 400 * 1024 * 1024;
const MAX_FILES = 5000;

final class Installer
{
    private string $file;

    public function __construct(private string $data, private string $public)
    {
        $this->file = $data . '/instalirano.json';
    }

    /** @return array{run:int, number:int, sha:string, at:string}|null the last installed build */
    public function last(): ?array
    {
        $z = read_json($this->file);
        return is_array($z) ? $z : null;
    }

    /** is this build (or a newer one) installed */
    public function installed(array $run): bool
    {
        return ($this->last()['number'] ?? 0) >= (int) ($run['run_number'] ?? PHP_INT_MAX);
    }

    /** the package of a build, or null (e.g. publishing is switched off on GitHub, so the job did not run) */
    public function artifact(GitHub $gh, array $run): ?array
    {
        foreach ($gh->must('GET', '/actions/runs/' . (int) $run['id'] . '/artifacts?name=' . ARTIFACT)['artifacts'] ?? [] as $a) {
            if (($a['name'] ?? '') === ARTIFACT && empty($a['expired'])) return $a;
        }
        return null;
    }

    /** download and install; false when this or a newer build is installed, or another request is installing */
    public function install(GitHub $gh, array $run, array $artifact): bool
    {
        $lock = @fopen($this->data . '/instalacija.lock', 'c');
        if (!$lock) throw new RuntimeException('Cannot lock the install');
        if (!flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); return false; }
        $zip = $this->data . '/instalacija.zip';
        $dir = $this->data . '/instalacija';
        try {
            if ($this->installed($run)) return false;
            @set_time_limit(300);
            $gh->download((string) ($artifact['archive_download_url'] ?? ''), $zip, MAX_PACKAGE);
            remove_dir($dir);
            $this->unpack($zip, $dir);
            $this->installFolder($dir);
            write_json($this->file, ['run' => (int) $run['id'], 'number' => (int) $run['run_number'], 'sha' => (string) ($run['head_sha'] ?? ''), 'at' => iso_time()]);
            return true;
        } finally {
            @unlink($zip);
            remove_dir($dir);
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /** only plain relative names: letters, digits, . _ - @ + and "/" between parts (no "." or ".." parts) */
    public static function validName(string $name): bool
    {
        if (!preg_match('#^[A-Za-z0-9._@+-]+(/[A-Za-z0-9._@+-]+)*$#', $name)) return false;
        foreach (explode('/', $name) as $part) if ($part === '.' || $part === '..') return false;
        return true;
    }

    /** media/ belongs to the uploads (only its .htaccess comes with the package); .well-known/ to the host */
    private static function protectedPath(string $rel): bool
    {
        return (str_starts_with($rel, 'media/') && $rel !== 'media/.htaccess') || str_starts_with($rel, '.well-known/');
    }

    private function unpack(string $zip, string $dir): void
    {
        if (!class_exists('ZipArchive')) throw new ApiError(500, 'INTERNAL', 'PHP nema proširenje zip (hPanel → PHP konfiguracija → zip).');
        $z = new ZipArchive();
        if ($z->open($zip) !== true) throw new ApiError(502, 'INTERNAL', 'Paket stranice nije ispravan ZIP.');
        try {
            if ($z->numFiles > MAX_FILES) throw new ApiError(502, 'INTERNAL', 'Paket stranice ima previše datoteka.');
            $total = 0;
            for ($i = 0; $i < $z->numFiles; $i++) {
                $st = $z->statIndex($i);
                $name = (string) ($st['name'] ?? '');
                if (str_ends_with($name, '/')) continue;
                if (!self::validName($name) || self::protectedPath($name)) throw new ApiError(502, 'INTERNAL', 'Paket stranice ima neispravno ime datoteke: ' . mb_substr($name, 0, 100));
                $total += (int) $st['size'];
                if ($total > MAX_UNPACKED) throw new ApiError(502, 'INTERNAL', 'Paket stranice je prevelik.');
                $content = $z->getFromIndex($i);
                if ($content === false || strlen($content) !== (int) $st['size']) throw new ApiError(502, 'INTERNAL', "Paket stranice je oštećen ($name).");
                $target = "$dir/$name";
                if (!is_dir(dirname($target)) && !@mkdir(dirname($target), 0700, true) && !is_dir(dirname($target))) throw new RuntimeException("Cannot create folder for $name");
                if (file_put_contents($target, $content) !== strlen($content)) throw new RuntimeException("Cannot unpack $name");
            }
        } finally {
            $z->close();
        }
    }

    /** copies an unpacked package into public_html and removes what the previous package had and this one has not */
    public function installFolder(string $dir): void
    {
        if (!is_file("$dir/index.html") || !is_file("$dir/" . MANIFEST)) throw new ApiError(502, 'INTERNAL', 'Paket stranice nema index.html ili popis datoteka.');
        $new = read_json("$dir/" . MANIFEST)['files'] ?? null;
        if (!is_array($new)) throw new ApiError(502, 'INTERNAL', 'Paket stranice ima neispravan popis datoteka.');
        try { $old = read_json($this->public . '/' . MANIFEST)['files'] ?? []; } catch (Throwable) { $old = []; }

        $all = [];
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) if ($f->isFile()) $all[] = substr(str_replace('\\', '/', $f->getPathname()), strlen($dir) + 1);
        sort($all);
        $isApi = static fn (string $r): bool => str_starts_with($r, 'api/');
        $isLast = static fn (string $r): bool => !str_starts_with($r, 'api/') && (bool) preg_match('#(^|/)\.htaccess$|\.(html|xml|txt)$|^\.ik-paket\.json$#', $r);
        $pages = array_values(array_filter($all, $isLast));
        usort($pages, static fn ($a, $b) => [$a === '.htaccess', str_ends_with($a, '.htaccess'), $a] <=> [$b === '.htaccess', str_ends_with($b, '.htaccess'), $b]);
        foreach ([array_filter($all, static fn ($r) => !$isApi($r) && !$isLast($r)), array_filter($all, $isApi), $pages] as $group) {
            foreach ($group as $r) $this->copyFile("$dir/$r", $this->public . "/$r");
        }

        $keep = array_flip($new);
        foreach ($old as $r) {
            if (!is_string($r) || isset($keep[$r]) || !self::validName($r) || self::protectedPath($r)) continue;
            @unlink($this->public . "/$r");
            // empty folders left behind (e.g. radovi/stranica/) go too, up to public_html
            for ($d = dirname($r); $d !== '.' && $d !== ''; $d = dirname($d)) {
                if (!@rmdir($this->public . "/$d")) break;
            }
        }
    }

    private function copyFile(string $from, string $to): void
    {
        if (is_file($to) && filesize($to) === filesize($from) && hash_file('sha256', $to) === hash_file('sha256', $from)) return;
        $dir = dirname($to);
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) throw new RuntimeException("Cannot create $dir");
        $tmp = $to . '.' . bin2hex(random_bytes(6)) . '.novo';
        if (!@copy($from, $tmp)) throw new RuntimeException("Cannot write $to");
        @chmod($tmp, 0644);
        if (!@rename($tmp, $to)) { @unlink($tmp); throw new RuntimeException("Cannot replace $to"); }
    }
}
