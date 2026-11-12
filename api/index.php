<?php
// ikdirected admin API on the hosting (Hostinger: LiteSpeed/Apache + PHP 8.1+, no database): every /api/* address
// comes here (api/.htaccess). Data and photos live OUTSIDE the public folder: <domain folder>/ikdirected-podaci
// (lib/config.php) — a Git deploy of public_html never touches them. See docs/ARCHITECTURE.md §1.
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

foreach (['config', 'base', 'passwords', 'users', 'sessions', 'limits', 'store', 'content', 'media', 'export', 'publish', 'app'] as $f) require __DIR__ . "/lib/$f.php";

(new App(ik_config()))->handle();
