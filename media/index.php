<?php
// public_html/media/ — the photo route. Uploaded photos live OUTSIDE public_html (ikdirected-podaci/media, see
// api/lib/config.php), so a Git deploy of public_html can never delete them. Only
// /media/p/<uuid>/<640|1280|2400>.webp exists: a plain WebP the API parsed and stored under an id it generated
// (ARCHITECTURE §8.4, §9). The bytes are sent as they are — never decoded, never interpreted.
declare(strict_types=1);

ini_set('display_errors', '0');
header_remove('X-Powered-By');
require dirname(__DIR__) . '/api/lib/config.php';

$c = ik_config();
$dir = $c['media'];
$ns = ik_test_namespace($c);
if ($ns) $dir .= "/ns/$ns";
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);

// also sent by media/.htaccess; repeated here so they hold even where .htaccess headers are not applied
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; sandbox");
header('Cross-Origin-Resource-Policy: same-origin');

$notFound = static function (): void {
    http_response_code(404);
    header('Cache-Control: no-store');
    header('Content-Type: text/plain; charset=utf-8');
};

if (($method !== 'GET' && $method !== 'HEAD')
    || !preg_match('#^/media/p/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/(640|1280|2400)\.webp$#', $path, $m)) {
    $notFound();
    exit;
}
$file = "$dir/p/{$m[1]}/{$m[2]}.webp";

// tests only: photos of the seeded demo content are the placeholder images of the build
if ($ns && !is_file($file) && is_file("$dir/seed-map.json")) {
    $map = json_decode((string) file_get_contents("$dir/seed-map.json"), true) ?: [];
    $ph = $map[$m[1]] ?? null;
    $dist = ik_env('IK_DIST') ?? $c['public'];
    if (is_string($ph) && preg_match('/^ph-\d{2}$/', $ph)) $file = "$dist/placeholder/p/$ph/{$m[2]}.webp";
}

if (!is_file($file)) {
    $notFound();
    exit;
}

$size = (int) filesize($file);
$mtime = (int) filemtime($file);
$etag = '"' . substr(sha1("{$m[1]}/{$m[2]}/$size/$mtime"), 0, 20) . '"';
header('Content-Type: image/webp');
header('Content-Disposition: inline');
// a photo id is never reused: a new upload is a new address
header('Cache-Control: public, max-age=31536000, immutable');
header("ETag: $etag");
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}
header("Content-Length: $size");
if ($method !== 'HEAD') readfile($file);
