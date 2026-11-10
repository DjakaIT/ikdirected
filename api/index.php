<?php
// ikdirected admin API on the hosting (Hostinger: LiteSpeed/Apache + PHP 8.1+, no database): every /api/* address
// comes here (api/.htaccess). Data lives OUTSIDE the public folder: <domain folder>/ikdirected-podaci (accounts,
// sessions, content, history, log); photos in public_html/media. See docs/ARCHITECTURE.md §1.
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');
header_remove('X-Powered-By');

$missing = array_values(array_filter(['mbstring', 'json', 'zip'], fn ($e) => !extension_loaded($e)));
if (!extension_loaded('curl') && !ini_get('allow_url_fopen')) $missing[] = 'curl';
if (PHP_VERSION_ID < 80100 || $missing) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Administracija treba PHP 8.1 ili noviji s proširenjima mbstring, json, zip i curl.\n"
        . 'Sada: PHP ' . PHP_VERSION . ($missing ? ', nedostaje: ' . implode(', ', $missing) : '')
        . "\nHostinger: hPanel -> Napredno -> PHP konfiguracija -> PHP 8.3 ili 8.4, pa PHP proširenja.";
    exit;
}

foreach (['base', 'passwords', 'users', 'sessions', 'limits', 'store', 'content', 'media', 'export', 'install', 'publish', 'app'] as $f) require __DIR__ . "/lib/$f.php";

$env = static fn (string $name): ?string => ($v = getenv($name)) === false || $v === '' ? null : $v;
// written at package time (scripts/paket-hosting.mjs): the public address the site was built for
$config = is_file(__DIR__ . '/konfiguracija.json') ? (json_decode((string) file_get_contents(__DIR__ . '/konfiguracija.json'), true) ?: []) : [];
$local = $env('IK_LOKALNO') === '1'; // tests and development on this computer only; never set on the hosting
(new App([
    'data' => $env('IK_PODACI') ?? dirname(__DIR__, 2) . '/ikdirected-podaci',
    'media' => $env('IK_MEDIA') ?? dirname(__DIR__) . '/media',
    'public' => $env('IK_JAVNO') ?? dirname(__DIR__),
    'origin' => $env('IK_ORIGIN') ?? ($config['origin'] ?? ($local ? 'http://localhost' : 'https://ikdirected.com')),
    'local' => $local,
    'test' => $local && $env('IK_TEST') === '1',
    'githubApi' => $env('IK_GITHUB_API') ?? 'https://api.github.com',
    'refreshMs' => (int) ($env('IK_OSVJEZI_MS') ?? 60_000),
]))->handle();
