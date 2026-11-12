<?php
// Where things live on the hosting — shared by api/index.php and media/index.php.
// public_html is the Git deploy directory (hPanel → Create site → Deploy from Git, branch "hosting"): a deploy may
// replace everything in it. So everything that must survive lives OUTSIDE it, in <domain folder>/ikdirected-podaci
// (accounts, sessions, content, history, log) and ikdirected-podaci/media (uploaded photos).
// Env vars exist only for local runs and tests; the hosting sets none of them.
declare(strict_types=1);

function ik_env(string $name): ?string
{
    $v = getenv($name);
    return $v === false || $v === '' ? null : $v;
}

/** @return array{data:string, media:string, public:string, origin:string, local:bool, test:bool, githubApi:string, refreshMs:int} */
function ik_config(): array
{
    $public = ik_env('IK_JAVNO') ?? dirname(__DIR__, 2); // api/lib → public_html
    $data = ik_env('IK_PODACI') ?? dirname($public) . '/ikdirected-podaci';
    // written at package time (scripts/paket-hosting.mjs): the public address the site was built for
    $file = dirname(__DIR__) . '/konfiguracija.json';
    $konf = is_file($file) ? (json_decode((string) file_get_contents($file), true) ?: []) : [];
    $local = ik_env('IK_LOKALNO') === '1'; // tests and development on this computer only
    return [
        'data' => $data,
        'media' => ik_env('IK_MEDIA') ?? $data . '/media',
        'public' => $public,
        'origin' => ik_env('IK_ORIGIN') ?? ($konf['origin'] ?? ($local ? 'http://localhost' : 'https://ikdirected.com')),
        'local' => $local,
        'test' => $local && ik_env('IK_TEST') === '1',
        'githubApi' => ik_env('IK_GITHUB_API') ?? 'https://api.github.com',
        'refreshMs' => (int) (ik_env('IK_OSVJEZI_MS') ?? 60_000),
    ];
}

/** tests only (IK_TEST=1, never on the hosting): every e2e/API test has its own data and media folders */
function ik_test_namespace(array $c): ?string
{
    $ns = $_COOKIE['ik-test-ns'] ?? null;
    return $c['test'] && is_string($ns) && preg_match('/^[a-z0-9-]{8,64}$/', $ns) ? $ns : null;
}
