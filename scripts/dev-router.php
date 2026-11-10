<?php
// Local stand-in for Hostinger: `php -S 127.0.0.1:PORT scripts/dev-router.php` (started by scripts/serve.mjs).
// Emulates public/.htaccess, media/.htaccess and api/.htaccess closely enough for the e2e tests; production uses
// the .htaccess files, never this script. Security headers are read from the built .htaccess files themselves,
// so tests check the exact strings that ship. Never deployed.
// Env: IK_DIST (built site), IK_MEDIA (uploaded photos), plus the API's own (api/index.php).
declare(strict_types=1);

$dist = rtrim((string) getenv('IK_DIST'), '/\\');
$media = rtrim((string) getenv('IK_MEDIA'), '/\\');
// tests only: every e2e/API test has its own media folder (same rule as App in api/lib/app.php)
if (getenv('IK_TEST') === '1' && is_string($ns = $_COOKIE['ik-test-ns'] ?? null) && preg_match('/^[a-z0-9-]{8,64}$/', $ns)) $media .= "/ns/$ns";
$path = rawurldecode((string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH));

/**
 * `Header always set|set NAME "VALUE"` lines of an .htaccess, with the <If "%{REQUEST_URI} =~ m#re#"> / ElseIf /
 * Else chain they sit in (first matching branch wins, as in Apache).
 * @return array<string, string>
 */
function htaccess_headers(string $file, string $uri): array
{
    $out = [];
    if (!is_file($file)) return $out;
    $matched = null;   // null = no open If/ElseIf/Else chain, else: has a branch of the chain matched
    $active = null;    // null = not inside a branch, else: is the current branch taken
    $inFiles = false;  // <Files>/<FilesMatch> blocks are per-file: not emulated
    foreach (file($file) ?: [] as $line) {
        $l = trim($line);
        if ($l === '' || $l[0] === '#') continue;
        if (preg_match('#^<(If|ElseIf) "%\{REQUEST_URI\} =~ m\#(.+)\#">$#', $l, $m)) {
            if ($m[1] === 'If') $matched = false;
            $active = !$matched && preg_match('#' . str_replace('#', '\#', $m[2]) . '#', $uri) === 1;
            $matched = $matched || $active;
        } elseif ($l === '<Else>') {
            $active = !$matched;
            $matched = true;
        } elseif ($l === '</If>' || $l === '</ElseIf>') {
            $active = null;                                  // the chain may go on with ElseIf/Else
        } elseif ($l === '</Else>') {
            $active = $matched = null;
        } elseif (preg_match('#^<(Files|FilesMatch)\b#', $l)) {
            $inFiles = true;
        } elseif (preg_match('#^</(Files|FilesMatch)>$#', $l)) {
            $inFiles = false;
        } else {
            if ($active === null) $matched = null;            // any other line ends a finished chain
            if ($active === false || $inFiles) continue;
            if (preg_match('#^Header (?:always )?set (\S+) "((?:[^"\\\\]|\\\\.)*)"$#', $l, $m)) $out[$m[1]] = stripslashes($m[2]);
        }
    }
    return $out;
}

function send_headers(array $h): void { foreach ($h as $k => $v) header("$k: $v"); }

const TYPES = ['html' => 'text/html; charset=utf-8', 'css' => 'text/css; charset=utf-8', 'js' => 'text/javascript; charset=utf-8',
    'mjs' => 'text/javascript; charset=utf-8', 'json' => 'application/json', 'xml' => 'application/xml; charset=utf-8',
    'txt' => 'text/plain; charset=utf-8', 'svg' => 'image/svg+xml', 'webp' => 'image/webp', 'jpg' => 'image/jpeg', 'png' => 'image/png',
    'ico' => 'image/x-icon', 'woff2' => 'font/woff2', 'wasm' => 'application/wasm', 'webmanifest' => 'application/manifest+json'];

function serve_file(string $file, int $status, array $headers): bool
{
    http_response_code($status);
    send_headers($headers);
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    header('Content-Type: ' . (TYPES[$ext] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($file));
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') readfile($file);
    return true;
}

$siteHeaders = fn (string $uri) => htaccess_headers("$dist/.htaccess", $uri);
$notFound = function () use ($dist, $siteHeaders, $path): bool {
    return serve_file("$dist/404.html", 404, $siteHeaders($path));
};

// ---- api/.htaccess: everything under /api/ goes to the front controller ----
if ($path === '/api' || str_starts_with($path, '/api/')) {
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require dirname(__DIR__) . '/api/index.php';
    return true;
}

// ---- media/.htaccess ----
if ($path === '/media' || str_starts_with($path, '/media/')) {
    $rel = substr($path, strlen('/media/'));
    $h = htaccess_headers("$dist/media/.htaccess", $path);
    if (preg_match('#^p/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(640|1280|2400)\.webp$#', $rel) && is_file("$media/$rel")) {
        return serve_file("$media/$rel", 200, $h);
    }
    http_response_code(404);
    send_headers($h);
    return true;
}

// ---- public/.htaccess ----
if (preg_match('#(^|/)\.#', $path) && !str_starts_with($path, '/.well-known/')) return $notFound();
if ($path !== '/' && str_ends_with($path, '/')) {
    http_response_code(301);
    header('Location: ' . rtrim($path, '/') . (($q = parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_QUERY)) ? "?$q" : ''));
    return true;
}
if (preg_match('#^/admin/albumi/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$#', $path)) {
    return serve_file("$dist/admin/album.html", 200, $siteHeaders($path));
}
$file = $dist . ($path === '/' ? '/index.html' : $path);
if (!str_contains($path, '..') && is_file($file)) return serve_file($file, 200, $siteHeaders($path));
if ($path !== '/' && !str_contains($path, '..') && is_file("$file.html")) return serve_file("$file.html", 200, $siteHeaders($path));
return $notFound();
