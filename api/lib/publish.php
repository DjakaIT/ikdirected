<?php
// Publishing from the hosting (no Node.js there; model: CamelliaSinensis objava.php, deploy through hPanel Git).
// After a change, the public export (export.php — metadata only, photos stay on the hosting) goes into one commit
// on GitHub branch "sadrzaj" and a build is requested (repository_dispatch). GitHub Actions (objava.yml, code from
// main) builds the site and commits it to branch "hosting"; hPanel's Git deployment (Deploy from Git, auto-deploy)
// pulls that branch into public_html. A publish is done when the deployed public_html/.ik-paket.json names the
// content commit that was sent. Changes are batched: a build starts after QUIET_MS without edits, or at once
// with "Objavi sada". The token is fine-grained, only for this repository (Contents: read/write, Actions: read).
declare(strict_types=1);

const QUIET_MS = 20_000;
const EXPORT_PATH = 'sadrzaj/sadrzaj.json';
const PACKAGE_MANIFEST = '.ik-paket.json';
/** after a successful build, how long Hostinger may take to pull the hosting branch */
const DEPLOY_WAIT_MS = 15 * 60_000;

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

    /** @param int $refreshGap least time (ms) between two runs of refresh() (Cron; tests: 0) */
    public function __construct(private string $data, private string $public, private string $api, private Closure $export, private int $refreshGap = 60_000)
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
        return ['repo' => $p['repo'] ?? '', 'branch' => $p['branch'] ?? 'sadrzaj', 'tokenSet' => !empty($p['token']), 'tokenExpires' => $p['tokenExpires'] ?? null,
            'deployed' => $this->deployed()];
    }

    /** save the settings and check the connection right away (the token is never sent back to the browser) */
    public function saveSettings(mixed $repo, mixed $branch, mixed $token): void
    {
        $p = $this->settings();
        $repo = is_string($repo) ? trim($repo) : '';
        $branch = is_string($branch) && trim($branch) !== '' ? trim($branch) : 'sadrzaj';
        $token = is_string($token) ? trim($token) : '';
        if (!preg_match('#^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$#', $repo)) throw new ApiError(422, 'VALIDATION', 'Repozitorij upiši kao vlasnik/repozitorij, npr. DjakaIT/ikdirected.');
        if (!preg_match('#^[A-Za-z0-9._-]{1,60}$#', $branch) || str_contains($branch, '..') || in_array($branch, ['main', 'hosting'], true)) {
            throw new ApiError(422, 'VALIDATION', 'Grana za sadržaj: slova, brojke, . _ - (ne main ni hosting).');
        }
        if ($token === '') $token = $p['token'] ?? '';
        if (!preg_match('/^(github_pat_|ghp_)[A-Za-z0-9_]{20,255}$/', $token)) throw new ApiError(422, 'VALIDATION', 'Upiši GitHub token (počinje s github_pat_).');
        $gh = new GitHub($this->api, $repo, $token);
        $gh->must('GET', '');
        write_json($this->settingsFile, ['repo' => $repo, 'branch' => $branch, 'token' => $token, 'tokenExpires' => $gh->expires]);
    }

    /** what hPanel deployed into public_html: {built, sha, content, origin} of the package, or null */
    public function deployed(): ?array
    {
        try {
            $m = read_json($this->public . '/' . PACKAGE_MANIFEST);
        } catch (Throwable) {
            return null;
        }
        return is_array($m) ? ['built' => $m['built'] ?? null, 'content' => $m['content'] ?? null, 'sha' => $m['sha'] ?? null] : null;
    }

    private function state(): array { return read_json($this->stateFile, ['state' => 'ready', 'published' => null]); }
    private function saveState(array $s): array { write_json($this->stateFile, $s); return $s; }
    private function pending(): array { return read_json($this->pendingFile, ['pending' => false, 'changedAt' => 0]); }

    /** the content changed (inside the store lock): publish after a quiet moment */
    public function changed(): void { write_json($this->pendingFile, ['pending' => true, 'changedAt' => now_ms()]); }

    /**
     * status for the admin. While a publish runs: done as soon as public_html holds the package built from the
     * content commit that was sent; meanwhile GitHub is asked at most every 8 s whether the build failed.
     */
    public function status(): array
    {
        $s = $this->state();
        $pending = $this->pending();
        $gh = $this->github();
        if (!$gh) return ['state' => 'unconfigured', 'published' => $s['published'] ?? null, 'message' => null, 'pending' => $pending['pending']];
        if (($s['state'] ?? '') === 'building') {
            if (($this->deployed()['content'] ?? null) === $s['sha']) {
                $s = $this->saveState([...$s, 'state' => 'ready', 'published' => iso_time(), 'message' => null]);
            } elseif (now_ms() - ($s['checked'] ?? 0) >= 8000) {
                $s['checked'] = now_ms();
                try {
                    $s = $this->checkRun($gh, $s);
                } catch (ApiError $e) {
                    $s['message'] = $e->getMessage(); // a passing connection problem: checked again
                }
                $this->saveState($s);
            }
        }
        return ['state' => $s['state'] ?? 'ready', 'published' => $s['published'] ?? null, 'message' => $s['message'] ?? null, 'pending' => $pending['pending']];
    }

    /** the GitHub side of a running publish: not started, failed, or built and waiting for hPanel's Git deploy */
    private function checkRun(GitHub $gh, array $s): array
    {
        [$st, $j] = $gh->request('GET', '/actions/runs?event=repository_dispatch&per_page=20');
        if ($st === 403) throw new ApiError(502, 'INTERNAL', 'GitHub token nema dopuštenje Actions: read — stanje objave nije vidljivo.');
        if ($st !== 200) throw new ApiError(502, 'INTERNAL', "GitHub je odgovorio $st");
        $run = null;
        foreach ($j['workflow_runs'] ?? [] as $r) if (str_contains((string) ($r['display_title'] ?? ''), $s['sha'])) { $run = $r; break; }
        if (!$run) {
            if (now_ms() - $s['started'] > 10 * 60_000) return [...$s, 'state' => 'error', 'message' => 'GitHub Actions nije pokrenuo objavu (je li objava.yml na grani main i OBJAVA_UKLJUCENA = da?).'];
            return $s;
        }
        if (($run['status'] ?? '') !== 'completed') return $s;
        return match ($run['conclusion'] ?? '') {
            'success' => (function () use ($s) {
                $s['builtAt'] ??= now_ms();
                if (now_ms() - $s['builtAt'] > DEPLOY_WAIT_MS) {
                    return [...$s, 'state' => 'error', 'message' => 'Stranica je izgrađena (grana hosting), ali Hostinger još nije preuzeo novu verziju. hPanel → Git: je li uključeno automatsko postavljanje grane hosting?'];
                }
                return [...$s, 'message' => null];
            })(),
            'skipped' => [...$s, 'state' => 'error', 'message' => 'Objava je isključena na GitHubu (varijabla OBJAVA_UKLJUCENA).'],
            default => [...$s, 'state' => 'error', 'message' => 'Izgradnja stranice nije uspjela: ' . ($run['html_url'] ?? '')],
        };
    }

    /** publish what is waiting: after QUIET_MS without changes, or now; never while a publish runs */
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
            write_json($this->pendingFile, ['pending' => false, 'changedAt' => 0]); // a change from now on waits for the next publish
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
     * /api/admin/osvjezi (optional hPanel Cron Job): publishes what waits and finishes a running publish even when
     * no admin page is open (an edit whose browser closed before the build). Public, at most once per refreshGap.
     */
    public function refresh(): array
    {
        if (!$this->github()) return ['state' => 'nije-postavljeno'];
        $o = read_json($this->refreshFile, []);
        if (now_ms() - ($o['checked'] ?? 0) < $this->refreshGap) return ['state' => 'pricekaj'];
        write_json($this->refreshFile, ['checked' => now_ms()]);
        try {
            $st = $this->status();
            $this->maybePublish();
            return ['state' => match ($st['state']) { 'building' => 'u-tijeku', 'error' => 'greska', default => 'aktualno' }];
        } catch (Throwable $e) {
            error_log('[ikdirected] refresh: ' . $e->getMessage());
            return ['state' => 'greska'];
        }
    }
}
