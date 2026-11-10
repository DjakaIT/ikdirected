<?php
// Publishing from the hosting (no Node.js there; model: CamelliaSinensis objava.php). After a change, the public
// export (export.php — metadata only, photos stay on the hosting) goes into one commit on GitHub, branch
// "sadrzaj" (also an off-site history of what was public), and a build is requested (repository_dispatch).
// GitHub Actions (.github/workflows/objava.yml, code from main) builds the site and keeps the package; this side
// downloads it and installs it into public_html (install.php) — as soon as the build is done (status polls from
// the open admin) and through /api/admin/osvjezi (postavi.yml after every build, optional hPanel Cron Job).
// Changes are batched: a build starts after QUIET_MS without further edits, or at once with "Objavi sada".
// The token is fine-grained, only for this repository (Contents: read/write, Actions: read), stored only here.
declare(strict_types=1);

const QUIET_MS = 20_000;
const EXPORT_PATH = 'sadrzaj/sadrzaj.json';

final class GitHub
{
    public ?string $expires = null;

    public function __construct(private string $api, private string $repo, private string $token) {}

    private function headers(): array
    {
        return ['Authorization: Bearer ' . $this->token, 'Accept: application/vnd.github+json', 'X-GitHub-Api-Version: 2022-11-28', 'User-Agent: ikdirected-admin'];
    }

    /** @return array{0:int, 1:mixed} status and JSON answer */
    public function request(string $method, string $path, ?array $body = null): array
    {
        $h = $this->headers();
        if ($body !== null) $h[] = 'Content-Type: application/json';
        [$status, $text, $resHeaders] = self::http($method, rtrim($this->api, '/') . "/repos/{$this->repo}$path", $h, $body !== null ? to_json($body) : null);
        if (!empty($resHeaders['github-authentication-token-expiration'])) {
            $t = strtotime($resHeaders['github-authentication-token-expiration']);
            if ($t) $this->expires = gmdate('Y-m-d\TH:i:s\Z', $t);
        }
        return [$status, $text === '' ? null : json_decode($text, true)];
    }

    /** a request that must succeed (2xx), else an error people can act on */
    public function must(string $method, string $path, ?array $body = null): mixed
    {
        [$s, $j] = $this->request($method, $path, $body);
        if ($s >= 200 && $s < 300) return $j;
        throw new ApiError(502, 'INTERNAL', match ($s) {
            401 => 'GitHub token ne vrijedi ili je istekao.',
            403 => 'GitHub token nema potrebna dopuštenja (Contents: read and write, Actions: read).',
            404 => 'Repozitorij ne postoji ili mu token nema pristup.',
            default => "GitHub je odgovorio $s" . (is_array($j) && isset($j['message']) ? ": {$j['message']}" : ''),
        });
    }

    /** a build package: GitHub answers with a redirect to temporary storage, which never gets the token */
    public function download(string $url, string $target, int $max): void
    {
        if (!str_starts_with($url, rtrim($this->api, '/') . '/')) throw new ApiError(502, 'INTERNAL', 'Neočekivana adresa paketa stranice.');
        [$s, $body, $h] = self::http('GET', $url, $this->headers(), null);
        if (in_array($s, [301, 302, 303, 307, 308], true) && preg_match('#^https?://#', $h['location'] ?? '')) {
            [$s, $body] = self::http('GET', $h['location'], ['User-Agent: ikdirected-admin'], null, 120);
        }
        if ($s === 401 || $s === 403) throw new ApiError(502, 'INTERNAL', 'GitHub token nema dopuštenje Actions: read — paket stranice se ne može preuzeti.');
        if ($s !== 200) throw new ApiError(502, 'INTERNAL', "Preuzimanje paketa stranice nije uspjelo (odgovor $s).");
        if (strlen($body) > $max) throw new ApiError(502, 'INTERNAL', 'Paket stranice je prevelik.');
        write_atomic($target, $body);
    }

    /** @return array{0:int, 1:string, 2:array<string,string>} status, body and response headers (redirects not followed) */
    private static function http(string $method, string $url, array $headers, ?string $body, int $timeout = 30): array
    {
        $res = [];
        if (function_exists('curl_init')) {
            $c = curl_init($url);
            curl_setopt_array($c, [
                CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => $timeout,
                CURLOPT_HEADERFUNCTION => function ($c, $l) use (&$res) {
                    $p = strpos($l, ':');
                    if ($p) $res[strtolower(trim(substr($l, 0, $p)))] = trim(substr($l, $p + 1));
                    return strlen($l);
                },
            ]);
            if ($body !== null) curl_setopt($c, CURLOPT_POSTFIELDS, $body);
            $text = curl_exec($c);
            $status = (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE);
            if ($text === false) throw new ApiError(502, 'INTERNAL', 'GitHub nije dostupan: ' . curl_error($c));
        } else {
            $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body,
                'timeout' => $timeout, 'ignore_errors' => true, 'follow_location' => 0]]);
            $text = @file_get_contents($url, false, $ctx);
            if ($text === false) throw new ApiError(502, 'INTERNAL', 'GitHub nije dostupan');
            $status = 0;
            foreach ($http_response_header ?? [] as $l) {
                if (preg_match('#^HTTP/\S+ (\d{3})#', $l, $m)) $status = (int) $m[1];
                elseif ($p = strpos($l, ':')) $res[strtolower(trim(substr($l, 0, $p)))] = trim(substr($l, $p + 1));
            }
        }
        return [$status, (string) $text, $res];
    }
}

final class Publisher
{
    private string $settingsFile;
    private string $stateFile;
    private string $pendingFile;
    private string $refreshFile;

    /** @param int $refreshGap least time (ms) between two GitHub checks from refresh() (tests: 0) */
    public function __construct(private string $data, private string $api, private Installer $installer, private Closure $export, private int $refreshGap = 60_000)
    {
        $this->settingsFile = $data . '/objava-postavke.json';
        $this->stateFile = $data . '/objava.json';
        $this->pendingFile = $data . '/objava-ceka.json';
        $this->refreshFile = $data . '/osvjezi.json';
    }

    private function settings(): array { return read_json($this->settingsFile, []); }
    private function github(): ?GitHub
    {
        $p = $this->settings();
        return !empty($p['token']) && !empty($p['repo']) ? new GitHub($this->api, $p['repo'], $p['token']) : null;
    }

    public function publicSettings(): array
    {
        $p = $this->settings();
        return ['repo' => $p['repo'] ?? '', 'branch' => $p['branch'] ?? 'sadrzaj', 'tokenSet' => !empty($p['token']), 'tokenExpires' => $p['tokenExpires'] ?? null];
    }

    /** save the settings and check the connection right away (the token is never sent back to the browser) */
    public function saveSettings(mixed $repo, mixed $branch, mixed $token): void
    {
        $p = $this->settings();
        $repo = is_string($repo) ? trim($repo) : '';
        $branch = is_string($branch) && trim($branch) !== '' ? trim($branch) : 'sadrzaj';
        $token = is_string($token) ? trim($token) : '';
        if (!preg_match('#^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$#', $repo)) throw new ApiError(422, 'VALIDATION', 'Repozitorij upiši kao vlasnik/repozitorij, npr. DjakaIT/ikdirected.');
        if (!preg_match('#^[A-Za-z0-9._-]{1,60}$#', $branch) || str_contains($branch, '..') || $branch === 'main') throw new ApiError(422, 'VALIDATION', 'Grana za sadržaj: slova, brojke, . _ - (ne main).');
        if ($token === '') $token = $p['token'] ?? '';
        if (!preg_match('/^(github_pat_|ghp_)[A-Za-z0-9_]{20,255}$/', $token)) throw new ApiError(422, 'VALIDATION', 'Upiši GitHub token (počinje s github_pat_).');
        $gh = new GitHub($this->api, $repo, $token);
        $gh->must('GET', '');
        write_json($this->settingsFile, ['repo' => $repo, 'branch' => $branch, 'token' => $token, 'tokenExpires' => $gh->expires]);
    }

    private function state(): array { return read_json($this->stateFile, ['state' => 'ready', 'published' => null]); }
    private function saveState(array $s): array { write_json($this->stateFile, $s); return $s; }
    private function pending(): array { return read_json($this->pendingFile, ['pending' => false, 'changedAt' => 0]); }

    /** the content changed (inside the store lock): publish after a quiet moment */
    public function changed(): void { write_json($this->pendingFile, ['pending' => true, 'changedAt' => now_ms()]); }

    /** status for the admin; while a build runs, GitHub is asked at most every 8 s and a finished build is installed */
    public function status(): array
    {
        $s = $this->state();
        $pending = $this->pending();
        $gh = $this->github();
        if (!$gh) return ['state' => 'unconfigured', 'published' => $s['published'] ?? null, 'message' => null, 'pending' => $pending['pending']];
        if (($s['state'] ?? '') === 'building' && now_ms() - ($s['checked'] ?? 0) >= 8000) {
            $s['checked'] = now_ms();
            try {
                [$st, $j] = $gh->request('GET', '/actions/runs?event=repository_dispatch&per_page=20');
                if ($st === 403) throw new ApiError(502, 'INTERNAL', 'GitHub token nema dopuštenje Actions: read — stanje objave nije vidljivo.');
                if ($st !== 200) throw new ApiError(502, 'INTERNAL', "GitHub je odgovorio $st");
                $run = null;
                foreach ($j['workflow_runs'] ?? [] as $r) if (str_contains((string) ($r['display_title'] ?? ''), $s['sha'])) { $run = $r; break; }
                if (!$run) {
                    if (now_ms() - $s['started'] > 10 * 60_000) $s = [...$s, 'state' => 'error', 'message' => 'GitHub Actions nije pokrenuo objavu (je li objava.yml na grani main i OBJAVA_UKLJUCENA = da?).'];
                } elseif (($run['status'] ?? '') === 'completed') {
                    $s = match ($run['conclusion'] ?? '') {
                        'success' => $this->installBuild($gh, $run, $s),
                        'skipped' => [...$s, 'state' => 'error', 'message' => 'Objava je isključena na GitHubu (varijabla OBJAVA_UKLJUCENA).'],
                        default => [...$s, 'state' => 'error', 'message' => 'Izgradnja stranice nije uspjela: ' . ($run['html_url'] ?? '')],
                    };
                } elseif ($this->installer->artifact($gh, $run)) {
                    // the package is ready (last step of the job) while GitHub may report the run as running for minutes
                    $s = $this->installBuild($gh, $run, $s);
                }
            } catch (ApiError $e) {
                $s['message'] = $e->getMessage(); // a passing connection problem: checked again
            }
            $this->saveState($s);
        }
        return self::view($s, $pending['pending']);
    }

    private static function view(array $s, bool $pending): array
    {
        return ['state' => $s['state'] ?? 'ready', 'published' => $s['published'] ?? null, 'message' => $s['message'] ?? null, 'pending' => $pending];
    }

    private function installBuild(GitHub $gh, array $run, array $s): array
    {
        try {
            if (!$this->installer->installed($run)) {
                $a = $this->installer->artifact($gh, $run);
                if (!$a) return [...$s, 'state' => 'error', 'message' => 'GitHub nije spremio paket stranice — je li varijabla OBJAVA_UKLJUCENA = da?'];
                $this->installer->install($gh, $run, $a);
                if (!$this->installer->installed($run)) return $s; // another request is installing right now: checked again
            }
            return [...$s, 'state' => 'ready', 'published' => iso_time(), 'message' => null];
        } catch (Throwable $e) {
            error_log('[ikdirected] install: ' . $e->getMessage());
            return [...$s, 'state' => 'error', 'message' => 'Stranica je izgrađena, ali postavljanje na hosting nije uspjelo: ' . ($e instanceof ApiError ? $e->getMessage() : 'greška na poslužitelju')];
        }
    }

    /** publish what is waiting: after QUIET_MS without changes, or now; never while a build runs */
    public function maybePublish(bool $now = false): void
    {
        $gh = $this->github();
        if (!$gh) return;
        $p = $this->pending();
        if (!$p['pending'] || (!$now && now_ms() - $p['changedAt'] < QUIET_MS)) return;
        if (($this->state()['state'] ?? '') === 'building') return;
        $this->push($gh);
    }

    /** the export in one commit on the content branch, then the build request */
    private function push(GitHub $gh): void
    {
        $branch = $this->settings()['branch'] ?? 'sadrzaj';
        $lock = @fopen($this->data . '/objava.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { if ($lock) fclose($lock); return; } // another request is pushing
        $started = now_ms();
        try {
            if (($this->state()['state'] ?? '') === 'building' || !$this->pending()['pending']) return;
            write_json($this->pendingFile, ['pending' => false, 'changedAt' => 0]); // a change from now on waits for the next build
            $export = ($this->export)();
            [$st, $ref] = $gh->request('GET', '/git/ref/heads/' . rawurlencode($branch));
            if ($st !== 200 && $st !== 404) $gh->must('GET', '/git/ref/heads/' . rawurlencode($branch));
            $parent = $st === 200 ? $ref['object']['sha'] : null;
            $baseTree = $parent ? $gh->must('GET', "/git/commits/$parent")['tree']['sha'] : null;
            $blob = $gh->must('POST', '/git/blobs', ['content' => to_json($export, true) . "\n", 'encoding' => 'utf-8'])['sha'];
            $tree = $gh->must('POST', '/git/trees', array_filter(['base_tree' => $baseTree, 'tree' => [['path' => EXPORT_PATH, 'mode' => '100644', 'type' => 'blob', 'sha' => $blob]]]))['sha'];
            $commit = $gh->must('POST', '/git/commits', ['message' => 'Administracija: objava sadržaja (' . count($export['albums']) . ' albuma)', 'tree' => $tree, 'parents' => $parent ? [$parent] : []])['sha'];
            if ($parent) $gh->must('PATCH', '/git/refs/heads/' . rawurlencode($branch), ['sha' => $commit]);
            else $gh->must('POST', '/git/refs', ['ref' => "refs/heads/$branch", 'sha' => $commit]);
            $gh->must('POST', '/dispatches', ['event_type' => 'sadrzaj', 'client_payload' => ['sha' => $commit, 'grana' => $branch]]);
            $this->saveState(['state' => 'building', 'sha' => $commit, 'started' => $started, 'checked' => 0, 'published' => $this->state()['published'] ?? null, 'message' => null]);
            if ($gh->expires) write_json($this->settingsFile, [...$this->settings(), 'tokenExpires' => $gh->expires]);
        } catch (Throwable $e) {
            // every failure must show in the admin, else it would say "published" while nothing was sent
            if (!$e instanceof ApiError) error_log('[ikdirected] publish: ' . $e->getMessage());
            write_json($this->pendingFile, ['pending' => true, 'changedAt' => now_ms()]);
            try {
                $this->saveState(['state' => 'error', 'message' => $e instanceof ApiError ? $e->getMessage() : 'Slanje na GitHub nije uspjelo (greška na poslužitelju).',
                    'started' => $started, 'published' => $this->state()['published'] ?? null]);
            } catch (Throwable) { /* nothing more to do */ }
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /**
     * /api/admin/osvjezi (postavi.yml after each build; hPanel Cron Job as a safety net): install the newest
     * successful build of objava.yml on main if it is newer than the installed one (code changes, or an edit whose
     * browser closed before the build finished), and publish waiting changes. Public (no sign-in): installs only
     * builds of this repository; asks GitHub at most once per refreshGap.
     */
    public function refresh(): array
    {
        $gh = $this->github();
        if (!$gh) return ['state' => 'nije-postavljeno'];
        $o = read_json($this->refreshFile, []);
        if (now_ms() - ($o['checked'] ?? 0) < $this->refreshGap) return ['state' => 'pricekaj'];
        write_json($this->refreshFile, ['checked' => now_ms()]);
        try {
            $repo = strtolower((string) ($this->settings()['repo'] ?? ''));
            [$st, $j] = $gh->request('GET', '/actions/runs?branch=main&status=success&per_page=20');
            if ($st !== 200) throw new ApiError(502, 'INTERNAL', "GitHub je odgovorio $st");
            $tried = 0;
            foreach ($j['workflow_runs'] ?? [] as $run) {
                if (!in_array($run['event'] ?? '', ['push', 'repository_dispatch', 'workflow_dispatch'], true) || ($run['head_branch'] ?? '') !== 'main'
                    || ($run['conclusion'] ?? '') !== 'success' || strtolower((string) ($run['head_repository']['full_name'] ?? '')) !== $repo
                    || !preg_match('#(^|/)objava\.yml(@|$)#', (string) ($run['path'] ?? ''))) continue;
                if ($this->installer->installed($run)) { $this->maybePublish(); return ['state' => 'aktualno']; }
                if (++$tried > 5) break;
                $a = $this->installer->artifact($gh, $run);
                if (!$a) continue; // publishing was off for that build: an older one
                if (!$this->installer->install($gh, $run, $a)) return ['state' => 'u-tijeku'];
                $s = $this->state();
                $startedRun = strtotime((string) ($run['created_at'] ?? '')) ?: 0;
                if (($s['state'] ?? '') === 'building' && $startedRun * 1000 >= ($s['started'] ?? PHP_INT_MAX) - 1000) {
                    $this->saveState([...$s, 'state' => 'ready', 'published' => iso_time(), 'message' => null]);
                }
                $this->maybePublish();
                return ['state' => 'postavljeno'];
            }
            $this->maybePublish();
            return ['state' => 'aktualno'];
        } catch (Throwable $e) {
            error_log('[ikdirected] refresh: ' . $e->getMessage());
            return ['state' => 'greska'];
        }
    }
}
