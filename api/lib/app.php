<?php
// The admin API (/api/admin/*): sign-in (password + TOTP, invites — model: CamelliaSinensis/Septillion), content
// (ARCHITECTURE §6), publishing. Rules for every request that changes something:
//  - Origin must be this site (+ Sec-Fetch-Site same-origin when sent) — CSRF protection (SEC-CSRF-01)
//  - the body is JSON (or the upload multipart) with a size limit
//  - signed-in requests carry the session's CSRF token (header X-CSRF) and the session is checked to be still valid
//  - failed sign-in answers never reveal whether a user exists
declare(strict_types=1);

const WRONG_LOGIN = 'Pogrešno korisničko ime ili lozinka.';
const LOCAL_ADDRESSES = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const PURGE_EVERY_MS = 3600 * 1000;

final class App
{
    private Users $users;
    private Sessions $sessions;
    private Store $store;
    private Content $content;
    private Media $media;
    private Limits $limits;
    private FirstSetup $setup;
    private Publisher $publisher;
    private Installer $installer;
    private bool $production;
    private string $origin;
    private string $data;
    /** @var list<Closure> work done after the answer is sent */
    private array $after = [];

    /** @param array{data:string, media:string, public:string, origin:string, local:bool, test:bool, githubApi:string, refreshMs?:int} $c */
    public function __construct(private array $c)
    {
        $this->production = !$c['local'];
        $this->data = $c['data'];
        $mediaDir = $c['media'];
        // tests only (IK_TEST=1, never on the hosting): every e2e test gets its own data and media folders
        if ($c['test'] && is_string($ns = $_COOKIE['ik-test-ns'] ?? null) && preg_match('/^[a-z0-9-]{8,64}$/', $ns)) {
            $this->data .= "/ns/$ns";
            $mediaDir .= "/ns/$ns";
        }
        if (!is_dir($this->data)) @mkdir($this->data, 0700, true);
        $this->origin = rtrim($c['origin'], '/');
        $this->users = new Users($this->data);
        $this->sessions = new Sessions($this->data . '/sesije', $this->production);
        $this->store = new Store($this->data);
        $this->content = new Content('/media');
        $this->media = new Media($mediaDir);
        // 'all': failed sign-ins from all addresses together — an attack from many IPs cannot exhaust the hosting
        // (every password check deliberately costs ~20 MB and tens of ms); past it, sign-in is refused unchecked
        $this->limits = new Limits($this->data, [
            'ip' => ['windowMs' => 15 * 60_000, 'max' => 20], 'user' => ['windowMs' => 15 * 60_000, 'max' => 5],
            'all' => ['windowMs' => 15 * 60_000, 'max' => 200], 'upload' => ['windowMs' => 24 * 3600_000, 'max' => 1500],
        ]);
        $this->setup = new FirstSetup($this->data, $this->origin);
        $this->installer = new Installer($this->data, $c['public']);
        $this->publisher = new Publisher($this->data, $c['githubApi'], $this->installer, fn () => public_export($this->store->read()), $c['refreshMs'] ?? 60_000);
        $this->store->afterChange = function (array $state): void {
            write_json($this->data . '/izvoz.json', public_export($state)); // local builds read this (npm run build:local)
            $this->publisher->changed();
        };
    }

    // ---------------- request and response ----------------
    public static function headers(bool $production): array
    {
        return [
            'Content-Type' => 'application/json; charset=utf-8',
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'DENY',
            'Referrer-Policy' => 'no-referrer',
            'X-Robots-Tag' => 'noindex, nofollow',
            'Cross-Origin-Opener-Policy' => 'same-origin',
            'Cross-Origin-Resource-Policy' => 'same-origin',
            'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
            'Permissions-Policy' => 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
        ] + ($production ? ['Strict-Transport-Security' => 'max-age=31536000'] : []);
    }

    private function send(int $status, mixed $body): void
    {
        http_response_code($status);
        foreach (self::headers($this->production) as $k => $v) header("$k: $v");
        if ($status === 204) return;
        $s = to_json($body);
        header('Content-Length: ' . strlen($s));
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') echo $s;
    }
    private function fail(ApiError $e): void
    {
        $body = ['error' => ['code' => $e->errorCode, 'message' => $e->getMessage(), ...$e->extra]];
        if ($e->status === 429 && isset($e->extra['retryAfter'])) header('Retry-After: ' . $e->extra['retryAfter']);
        $this->send($e->status, $body);
    }

    private static function header(string $name): ?string
    {
        $k = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return isset($_SERVER[$k]) ? (string) $_SERVER[$k] : null;
    }
    private static function ip(): string { return (string) ($_SERVER['REMOTE_ADDR'] ?? '?'); }
    private function background(): bool { return self::header('X-Background') === '1'; }
    /** first setup without the code only locally (tests) and from this computer */
    private function codeRequired(): bool { return $this->production || !in_array(self::ip(), LOCAL_ADDRESSES, true); }

    /** allowed hosts: the public address (and www.), locally also localhost/127.0.0.1 */
    private function allowedHost(?string $host): bool
    {
        if (!$host) return false;
        $public = parse_url($this->origin, PHP_URL_HOST);
        $h = strtolower(preg_replace('/:\d+$/', '', $host));
        if ($h === $public || $h === "www.$public") return true;
        return !$this->production && in_array($h, ['localhost', '127.0.0.1'], true);
    }
    private function sameOrigin(): bool
    {
        $o = self::header('Origin');
        $sfs = self::header('Sec-Fetch-Site');
        if (!$o || ($sfs !== null && $sfs !== 'same-origin')) return false;
        $u = parse_url($o);
        if (!$u || empty($u['host']) || empty($u['scheme'])) return false;
        if ($this->production) return $u['scheme'] === 'https' && $this->allowedHost($u['host']) && !isset($u['port']);
        $originHost = $u['host'] . (isset($u['port']) ? ":{$u['port']}" : '');
        return $this->allowedHost($u['host']) && strtolower($originHost) === strtolower((string) self::header('Host'));
    }

    private function rawBody(int $limit): string
    {
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) throw new ApiError(413, 'TOO_LARGE');
        $s = (string) file_get_contents('php://input', false, null, 0, $limit + 1);
        if (strlen($s) > $limit) throw new ApiError(413, 'TOO_LARGE');
        return $s;
    }
    /** a JSON object (never a list) */
    private function json(int $limit = 64 * 1024): array
    {
        if (!preg_match('#^application/json\b#', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))) throw new ApiError(415, 'UNSUPPORTED_MEDIA', 'Očekuje se JSON.');
        $s = $this->rawBody($limit);
        if (trim($s) === '') return [];
        try { $o = json_decode($s, false, 32, JSON_THROW_ON_ERROR); } catch (JsonException) { throw new ApiError(400, 'VALIDATION', 'Neispravan JSON.'); }
        if (!$o instanceof stdClass) throw new ApiError(400, 'VALIDATION');
        return json_decode($s, true, 32);
    }

    private static function expired(?string $reason): ApiError { return new ApiError(401, 'UNAUTHORIZED', 'Prijava je istekla.', ['reason' => $reason ?? 'nema']); }

    /** the signed-in user (session 'in', user exists, same session version) */
    private function signedIn(bool $csrf, bool $admin = false): array
    {
        $ses = $this->sessions->read($this->background());
        if (!$ses || ($ses['s']['step'] ?? '') !== 'in') throw self::expired($this->sessions->expired);
        $u = $this->users->find($ses['s']['name']);
        if (!$u || ($u['sessionVersion'] ?? 1) !== ($ses['s']['sessionVersion'] ?? null)) { $this->sessions->delete($ses['id'], false); throw self::expired('odjavljen'); }
        if ($csrf && !same((string) self::header('X-CSRF'), $ses['s']['csrf'])) throw new ApiError(403, 'FORBIDDEN', 'Neispravan zahtjev (CSRF).');
        if ($admin && ($u['role'] ?? 'urednik') !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Samo administrator.');
        // signed-in work: publish what waits, clean the trash now and then
        $this->after[] = fn () => $this->publisher->maybePublish();
        $this->after[] = fn () => $this->purgeSometimes();
        return [$ses, $u];
    }

    /** @param list<array{0:string, 1:string}> $keys [kind, key] */
    private function throttled(array $keys): void
    {
        $s = max(array_map(fn ($x) => $this->limits->wait($x[0], $x[1]), $keys));
        if ($s > 0) throw new ApiError(429, 'RATE_LIMITED', 'Previše pokušaja. Pokušaj ponovno za ' . max(1, (int) ceil($s / 60)) . ' min.', ['retryAfter' => $s]);
    }

    private function start2fa(string $name, ?string $oldId): array
    {
        $secret = new_totp_secret();
        $this->sessions->create(['name' => $name, 'step' => 'setup-2fa', 'totpSecret' => $secret, 'tries' => 0], $oldId);
        return ['step' => 'setup-2fa', 'uri' => otpauth_uri($secret, $name), 'key' => trim(chunk_split($secret, 4, ' '))];
    }
    private function signInFully(array $u, ?string $oldId): array
    {
        $s = $this->sessions->create(['name' => $u['name'], 'step' => 'in', 'sessionVersion' => $u['sessionVersion'] ?? 1], $oldId);
        return ['step' => 'in', 'name' => $u['name'], 'role' => $u['role'] ?? 'urednik', 'csrf' => $s['csrf']];
    }
    private function setPassword(string $name, string $hash): void
    {
        $this->users->update($name, fn ($u) => array_merge($u, ['password' => $hash, 'invite' => null, 'totp' => null, 'recovery' => [], 'lastStep' => -1,
            'sessionVersion' => ($u['sessionVersion'] ?? 1) + 1]));
        $this->sessions->signOutUser($name);
    }
    private function log(string $name, string $action, array $extra = []): void
    {
        $this->store->log(['actor' => $name, 'ip' => self::ip(), 'action' => $action, ...$extra]);
    }

    private function purgeSometimes(): void
    {
        $f = $this->data . '/ciscenje.json';
        if (now_ms() - (read_json($f, [])['at'] ?? 0) < PURGE_EVERY_MS) return;
        write_json($f, ['at' => now_ms()]);
        $gone = $this->store->mutate(fn (array &$s) => $this->content->purge($s));
        foreach ($gone as $id) $this->media->delete($id);
        if ($gone) $this->log('-', 'purge', ['photos' => count($gone)]);
    }

    // ---------------- routes ----------------
    private function route(string $method, string $path): void
    {
        $seg = array_values(array_filter(explode('/', $path), fn ($x) => $x !== ''));
        $id = $seg[1] ?? null;
        if (in_array($seg[0] ?? '', ['albums', 'photos'], true) && $id !== null && !is_uuid($id)) throw new ApiError(400, 'VALIDATION');

        switch ("$method $path") {
            // ===== sign-in =====
            case 'GET /auth/state': {
                $ses = $this->sessions->read($this->background());
                $u = ($ses['s']['step'] ?? '') === 'in' ? $this->users->find($ses['s']['name']) : null;
                $in = $u && ($u['sessionVersion'] ?? 1) === ($ses['s']['sessionVersion'] ?? null);
                $reason = $ses ? null : $this->sessions->expired;
                if ($ses && $ses['s']['step'] === 'in' && !$in) { $this->sessions->delete($ses['id']); $reason = 'odjavljen'; }
                $first = $this->users->count() === 0;
                if ($first && $this->codeRequired()) $this->setup->code(); // the code file exists as soon as the admin is opened
                $this->send(200, [
                    'step' => $in ? 'in' : ($ses && $ses['s']['step'] !== 'in' ? $ses['s']['step'] : null),
                    'name' => $in ? $u['name'] : null, 'role' => $in ? ($u['role'] ?? 'urednik') : null, 'csrf' => $in ? $ses['s']['csrf'] : null,
                    'reason' => $reason, 'firstSetup' => $first,
                ] + ($first ? ['codeRequired' => $this->codeRequired()] : []));
                return;
            }
            case 'POST /auth/setup': {
                $this->throttled([['ip', self::ip()]]);
                $b = $this->json(8192);
                if ($this->users->count() > 0) throw new ApiError(409, 'CONFLICT', 'Administracija je već postavljena. Prijavi se.');
                if ($this->codeRequired() && !$this->setup->check($b['code'] ?? '')) {
                    $this->limits->record('ip', self::ip());
                    $this->log('-', 'wrong setup code');
                    throw new ApiError(403, 'FORBIDDEN', 'Kod za postavljanje nije ispravan.');
                }
                $n = normalize_name($b['name'] ?? '');
                if (!valid_name($n)) throw new ApiError(422, 'VALIDATION', NAME_RULE);
                if ($bad = check_new_password($b['password'] ?? null, $n)) throw new ApiError(422, 'VALIDATION', $bad);
                $hash = hash_password($b['password']);
                $this->users->createFirst($n);
                $this->setPassword($n, $hash);
                $this->setup->remove();
                $this->log($n, 'first setup: password set');
                $this->send(200, $this->start2fa($n, $this->sessions->read()['id'] ?? null));
                return;
            }
            case 'POST /auth/invite/check': {
                $this->throttled([['ip', self::ip()]]);
                $u = $this->users->byInvite($this->json(4096)['token'] ?? null);
                if (!$u) { $this->limits->record('ip', self::ip()); throw new ApiError(404, 'NOT_FOUND', 'Pozivnica ne vrijedi ili je istekla.'); }
                $this->send(200, ['name' => $u['name']]);
                return;
            }
            case 'POST /auth/invite': {
                $this->throttled([['ip', self::ip()]]);
                $b = $this->json(8192);
                $u = $this->users->byInvite($b['token'] ?? null);
                if (!$u) { $this->limits->record('ip', self::ip()); throw new ApiError(404, 'NOT_FOUND', 'Pozivnica ne vrijedi ili je istekla.'); }
                if ($bad = check_new_password($b['password'] ?? null, $u['name'])) throw new ApiError(422, 'VALIDATION', $bad);
                $this->setPassword($u['name'], hash_password($b['password']));
                $this->log($u['name'], 'invite: password set');
                $this->send(200, $this->start2fa($u['name'], $this->sessions->read()['id'] ?? null));
                return;
            }
            case 'POST /auth/2fa/confirm': {
                $ses = $this->sessions->read();
                if (!$ses || $ses['s']['step'] !== 'setup-2fa') throw new ApiError(401, 'UNAUTHORIZED', 'Postavljanje je isteklo, prijavi se ponovno.', ['reason' => $this->sessions->expired ?? 'nema']);
                $step = verify_totp($ses['s']['totpSecret'], $this->json(1024)['code'] ?? null);
                if ($step === null) {
                    if (++$ses['s']['tries'] >= 5) { $this->sessions->delete($ses['id']); throw new ApiError(429, 'RATE_LIMITED', 'Previše pogrešnih kodova. Prijavi se ponovno.'); }
                    $this->sessions->save($ses);
                    throw new ApiError(400, 'VALIDATION', 'Kod nije ispravan. Upiši šesteroznamenkasti kod iz aplikacije.');
                }
                ['codes' => $codes, 'hashes' => $hashes] = new_recovery_codes();
                $secret = $ses['s']['totpSecret'];
                $u = $this->users->update($ses['s']['name'], fn ($x) => array_merge($x, ['totp' => ['secret' => $secret], 'lastStep' => $step, 'recovery' => $hashes, 'lastLogin' => iso_time()]));
                $this->log($u['name'], '2fa on');
                $this->send(200, [...$this->signInFully($u, $ses['id']), 'recoveryCodes' => $codes]);
                return;
            }
            case 'POST /auth/login': {
                $b = $this->json(4096);
                $n = mb_substr(normalize_name($b['name'] ?? ''), 0, 64);
                $this->throttled([['ip', self::ip()], ['user', $n], ['all', 'all']]);
                $u = $this->users->find($n);
                $password = mb_substr(is_string($b['password'] ?? null) ? $b['password'] : '', 0, 200);
                $ok = verify_password($password, $u['password'] ?? dummy_hash()) && !empty($u['password']);
                if (!$ok) {
                    $this->limits->record('ip', self::ip()); $this->limits->record('user', $n); $this->limits->record('all', 'all');
                    $this->log($n, 'failed sign-in');
                    throw new ApiError(401, 'UNAUTHORIZED', WRONG_LOGIN);
                }
                $oldId = $this->sessions->read()['id'] ?? null;
                if (empty($u['totp'])) { $this->send(200, $this->start2fa($u['name'], $oldId)); return; }
                $this->sessions->create(['name' => $u['name'], 'step' => '2fa', 'tries' => 0], $oldId);
                $this->send(200, ['step' => '2fa']);
                return;
            }
            case 'POST /auth/login/2fa': {
                $ses = $this->sessions->read();
                if (!$ses || $ses['s']['step'] !== '2fa') throw new ApiError(401, 'UNAUTHORIZED', 'Prijava je istekla, upiši lozinku ponovno.', ['reason' => $this->sessions->expired ?? 'nema']);
                $name = $ses['s']['name'];
                $this->throttled([['user', $name]]);
                $code = $this->json(1024)['code'] ?? null;
                $u = $this->users->find($name);
                $recovery = -1;
                $step = !empty($u['totp']) ? verify_totp($u['totp']['secret'], $code, $u['lastStep'] ?? -1) : null;
                if ($step === null && $u) $recovery = find_recovery_code($code, $u['recovery'] ?? []);
                if (!$u || ($step === null && $recovery < 0)) {
                    $this->limits->record('user', $name);
                    $this->log($name, 'wrong 2fa code');
                    if (++$ses['s']['tries'] >= 5) { $this->sessions->delete($ses['id']); throw new ApiError(429, 'RATE_LIMITED', 'Previše pogrešnih kodova. Prijavi se ponovno.'); }
                    $this->sessions->save($ses);
                    throw new ApiError(400, 'VALIDATION', 'Kod nije ispravan.');
                }
                $nu = $this->users->update($u['name'], function ($x) use ($step, $recovery) {
                    if ($step !== null) $x['lastStep'] = $step;
                    else $x['recovery'] = array_values(array_filter($x['recovery'], fn ($_, $i) => $i !== $recovery, ARRAY_FILTER_USE_BOTH));
                    $x['lastLogin'] = iso_time();
                    return $x;
                });
                $this->limits->reset('user', $u['name']);
                $this->log($u['name'], $step !== null ? 'sign-in' : 'sign-in with recovery code');
                $this->send(200, [...$this->signInFully($nu, $ses['id']), ...($recovery >= 0 ? ['recoveryLeft' => count($nu['recovery'])] : [])]);
                return;
            }
            case 'POST /auth/logout': {
                $ses = $this->sessions->read();
                if ($ses) $this->log($ses['s']['name'], 'sign-out');
                $this->sessions->delete($ses['id'] ?? null);
                $this->send(200, ['ok' => true]);
                return;
            }
            case 'POST /auth/password': {
                [$ses, $u] = $this->signedIn(true);
                $this->throttled([['user', $u['name']]]);
                $b = $this->json(4096);
                if (!verify_password(mb_substr(is_string($b['old'] ?? null) ? $b['old'] : '', 0, 200), $u['password'])) {
                    $this->limits->record('user', $u['name']);
                    throw new ApiError(400, 'VALIDATION', 'Trenutna lozinka nije ispravna.');
                }
                if ($bad = check_new_password($b['new'] ?? null, $u['name'])) throw new ApiError(422, 'VALIDATION', $bad);
                $hash = hash_password($b['new']);
                $nu = $this->users->update($u['name'], fn ($x) => array_merge($x, ['password' => $hash, 'sessionVersion' => ($x['sessionVersion'] ?? 1) + 1]));
                $this->sessions->signOutUser($u['name'], $ses['id']); // other devices are signed out
                $ses['s']['sessionVersion'] = $nu['sessionVersion'];
                $this->sessions->save($ses);
                $this->log($u['name'], 'password changed');
                $this->send(200, ['ok' => true]);
                return;
            }

            // ===== users (administrator only) =====
            case 'GET /users': {
                $this->signedIn(false, true);
                $this->send(200, ['users' => array_map(fn ($x) => ['name' => $x['name'], 'role' => $x['role'] ?? 'urednik', 'state' => account_state($x),
                    'lastLogin' => $x['lastLogin'] ?? null, 'recoveryLeft' => count($x['recovery'] ?? [])], $this->users->all()['users'])]);
                return;
            }
            case 'POST /users/invite': {
                [, $u] = $this->signedIn(true, true);
                $b = $this->json(1024);
                $n = normalize_name($b['name'] ?? '');
                $reset = ($b['reset'] ?? false) === true;
                if (!valid_name($n)) throw new ApiError(422, 'VALIDATION', NAME_RULE);
                if ($n === $u['name']) throw new ApiError(422, 'VALIDATION', 'Za svoj račun upotrijebi "Promijeni lozinku".');
                $existed = $this->users->find($n);
                $token = $this->users->invite($n, $reset);
                if ($reset) $this->sessions->signOutUser($n);
                $this->log($u['name'], ($reset && $existed ? 'new invite (reset): ' : 'invite: ') . $n);
                $this->send(200, ['name' => $n, 'link' => $this->address() . "/admin#pozivnica=$token"]);
                return;
            }
            case 'POST /users/remove': {
                [, $u] = $this->signedIn(true, true);
                $n = normalize_name($this->json(1024)['name'] ?? '');
                if ($n === $u['name']) throw new ApiError(422, 'VALIDATION', 'Ne možeš ukloniti svoj račun.');
                $this->users->remove($n);
                $this->sessions->signOutUser($n);
                $this->log($u['name'], "user removed: $n");
                $this->send(200, ['ok' => true]);
                return;
            }

            // ===== publishing =====
            case 'GET /publish': {
                $this->signedIn(false);
                $this->send(200, $this->publisher->status());
                return;
            }
            case 'POST /publish/now': {
                [, $u] = $this->signedIn(true);
                $this->log($u['name'], 'publish now');
                $this->after[] = fn () => $this->publisher->maybePublish(true);
                $this->send(200, ['ok' => true]);
                return;
            }
            case 'GET /publish/settings': {
                $this->signedIn(false, true);
                $this->send(200, $this->publisher->publicSettings());
                return;
            }
            case 'POST /publish/settings': {
                [, $u] = $this->signedIn(true, true);
                $b = $this->json(4096);
                $this->publisher->saveSettings($b['repo'] ?? null, $b['branch'] ?? null, $b['token'] ?? null);
                $this->log($u['name'], 'publish settings changed');
                $this->send(200, $this->publisher->publicSettings());
                return;
            }
            // postavi.yml after every build, or an hPanel Cron Job: install the newest build; no sign-in
            case 'GET /osvjezi': {
                $this->send(200, $this->publisher->refresh());
                return;
            }

            // ===== content (ARCHITECTURE §6) =====
            case 'GET /albums': {
                $this->signedIn(false);
                $this->send(200, $this->content->listAlbums($this->store->read()));
                return;
            }
            case 'POST /albums': {
                [, $u] = $this->signedIn(true);
                $b = $this->json();
                $a = $this->store->mutate(fn (array &$s) => $this->content->createAlbum($s, $b));
                $this->log($u['name'], 'album.create', ['target' => $a['id']]);
                $this->send(201, $a);
                return;
            }
            case 'GET /featured': {
                $this->signedIn(false);
                $this->send(200, ['photos' => $this->content->featured($this->store->read())]);
                return;
            }
            case 'PUT /featured/order': {
                [, $u] = $this->signedIn(true);
                $b = $this->json();
                $this->store->mutate(fn (array &$s) => $this->content->reorderFeatured($s, $b));
                $this->log($u['name'], 'featured.order');
                $this->send(204, null);
                return;
            }
        }

        // ----- /albums/:id… and /photos/:id… -----
        $sub = $seg[2] ?? null;
        if (($seg[0] ?? '') === 'albums' && $id !== null && count($seg) <= 3) {
            if ($sub === null && $method === 'GET') { $this->signedIn(false); $this->send(200, $this->content->albumDetail($this->store->read(), $id)); return; }
            if ($sub === null && $method === 'PATCH') {
                [, $u] = $this->signedIn(true);
                $b = $this->json();
                $a = $this->store->mutate(fn (array &$s) => $this->content->patchAlbum($s, $id, $b));
                $this->log($u['name'], isset($b['status']) ? "album.status.{$b['status']}" : 'album.update', ['target' => $id]);
                $this->send(200, $a);
                return;
            }
            if ($sub === null && $method === 'DELETE') {
                [, $u] = $this->signedIn(true);
                $this->store->mutate(fn (array &$s) => $this->content->deleteAlbum($s, $id));
                $this->log($u['name'], 'album.delete', ['target' => $id]);
                $this->send(204, null);
                return;
            }
            if ($sub === 'restore' && $method === 'POST') {
                [, $u] = $this->signedIn(true);
                $a = $this->store->mutate(fn (array &$s) => $this->content->restoreAlbum($s, $id));
                $this->log($u['name'], 'album.restore', ['target' => $id]);
                $this->send(200, $a);
                return;
            }
            if ($sub === 'order' && $method === 'PUT') {
                [, $u] = $this->signedIn(true);
                $b = $this->json();
                $this->store->mutate(fn (array &$s) => $this->content->reorderPhotos($s, $id, $b));
                $this->log($u['name'], 'photo.order', ['target' => $id]);
                $this->send(204, null);
                return;
            }
            if ($sub === 'photos' && $method === 'POST') { $this->upload($id); return; }
        }
        if (($seg[0] ?? '') === 'photos' && $id !== null && count($seg) <= 3) {
            if ($sub === null && $method === 'PATCH') {
                [, $u] = $this->signedIn(true);
                $b = $this->json();
                $p = $this->store->mutate(fn (array &$s) => $this->content->patchPhoto($s, $id, $b));
                $this->log($u['name'], 'photo.update', ['target' => $id]);
                $this->send(200, $p);
                return;
            }
            if ($sub === null && $method === 'DELETE') {
                [, $u] = $this->signedIn(true);
                $this->store->mutate(fn (array &$s) => $this->content->deletePhoto($s, $id));
                $this->log($u['name'], 'photo.delete', ['target' => $id]);
                $this->send(204, null);
                return;
            }
            if ($sub === 'restore' && $method === 'POST') {
                [, $u] = $this->signedIn(true);
                $p = $this->store->mutate(fn (array &$s) => $this->content->restorePhoto($s, $id));
                $this->log($u['name'], 'photo.restore', ['target' => $id]);
                $this->send(200, $p);
                return;
            }
        }
        throw new ApiError(404, 'NOT_FOUND');
    }

    /** POST /albums/:id/photos (ARCHITECTURE §8.2) */
    private function upload(string $albumId): void
    {
        [, $u] = $this->signedIn(true);
        $this->throttled([['upload', $u['name']]]);
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > UPLOAD_REQUEST_CAP) throw new ApiError(413, 'TOO_LARGE');
        if (!preg_match('#^multipart/form-data\b#', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))) throw new ApiError(400, 'VALIDATION');
        $checked = check_upload($_POST, $_FILES);
        $this->content->assertCanAdd($this->store->read(), $albumId);
        $photoId = uuid4();
        $this->media->store($photoId, $checked['bytes']);
        try {
            $photo = $this->store->mutate(fn (array &$s) => $this->content->addPhoto($s, $albumId, $photoId, $checked['meta']));
        } catch (Throwable $e) {
            $this->media->delete($photoId); // no orphan files when the row could not be added
            throw $e;
        }
        $this->limits->record('upload', $u['name']);
        $this->log($u['name'], 'photo.upload', ['target' => $photoId, 'album' => $albumId]);
        $this->send(201, $photo);
    }

    /** test only (IK_TEST=1): fresh namespace with an optional seed and a signed-in admin "test" */
    private function testSeed(): void
    {
        if (!isset($_COOKIE['ik-test-ns']) || !str_contains($this->data, '/ns/')) throw new ApiError(400, 'VALIDATION', 'test namespace cookie missing');
        $b = $this->json(64 * 1024 * 1024);
        remove_dir($this->data);
        @mkdir($this->data, 0700, true);
        if (is_array($b['state'] ?? null)) write_json($this->data . '/sadrzaj.json', $b['state']);
        if (($b['user'] ?? true) !== false) {
            $this->users->createFirst('test');
            $this->setPassword('test', hash_password('test-lozinka-dovoljno-duga'));
            $this->users->update('test', fn ($x) => array_merge($x, ['totp' => ['secret' => 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'], 'recovery' => []]));
            $u = $this->users->find('test');
            $this->send(200, $this->signInFully($u, null));
            return;
        }
        $this->send(200, ['ok' => true]);
    }

    /** public address for links: the site's address in production, the address in use locally */
    private function address(): string
    {
        return $this->production ? $this->origin : 'http://' . self::header('Host');
    }

    /** the answer reaches the browser first; GitHub calls and cleanup run after (they take seconds) */
    private function runAfter(): void
    {
        if (!$this->after) return;
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
        else flush();
        ignore_user_abort(true);
        @set_time_limit(120);
        foreach ($this->after as $fn) {
            try { $fn(); } catch (Throwable $e) { error_log('[ikdirected] after: ' . $e->getMessage()); }
        }
    }

    // ---------------- entry ----------------
    public function handle(): void
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
        try {
            if (!in_array($method, ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], true)) throw new ApiError(405, 'NOT_FOUND');
            // only through the real address (protects against DNS rebinding)
            if (!$this->allowedHost(self::header('Host'))) throw new ApiError(421, 'FORBIDDEN');
            if (!str_starts_with($path, '/api/admin/')) throw new ApiError(404, 'NOT_FOUND');
            $sub = substr($path, strlen('/api/admin'));
            if ($method !== 'GET' && $method !== 'HEAD' && !$this->sameOrigin()) throw new ApiError(403, 'ORIGIN', 'Zahtjev nije s ove stranice.');
            if ($this->c['test'] && $sub === '/__test/seed' && $method === 'POST') $this->testSeed();
            else $this->route($method === 'HEAD' ? 'GET' : $method, $sub);
        } catch (ApiError $e) {
            if (!headers_sent()) $this->fail($e);
        } catch (Throwable $e) {
            error_log('[ikdirected] ' . $e); // details only in the server log (SEC-ERR-01)
            if (!headers_sent()) $this->fail(new ApiError(500, 'INTERNAL', 'Greška na poslužitelju.'));
        }
        $this->runAfter();
    }
}
