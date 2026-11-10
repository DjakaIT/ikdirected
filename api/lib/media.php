<?php
// Uploaded photos: three WebP variants made in the admin's browser (ARCHITECTURE §8.1) are checked here byte by
// byte and stored as media/p/<photoId>/{2400,1280,640}.webp. The server never decodes or transforms an image
// (no image library touches untrusted bytes, SECURITY §7); it only parses the RIFF/WebP container.
declare(strict_types=1);

const VARIANTS = [2400 => 2 * 1024 * 1024, 1280 => 700 * 1024, 640 => 220 * 1024]; // byte caps (§8.2)
const UPLOAD_REQUEST_CAP = 4 * 1024 * 1024;

/**
 * parseWebp (ARCHITECTURE §8.4): plain still WebP only. Every RIFF chunk is walked and must be one of
 * VP8X/ICCP/ALPH/VP8 /VP8L; EXIF, XMP, animation and unknown chunks are refused, as are size fields that lie.
 * @return array{width:int, height:int}
 */
function parse_webp(string $b): array
{
    $len = strlen($b);
    $bad = fn () => new ApiError(415, 'UNSUPPORTED_MEDIA');
    if ($len < 30 || substr($b, 0, 4) !== 'RIFF' || substr($b, 8, 4) !== 'WEBP') throw $bad();
    $riff = unpack('V', substr($b, 4, 4))[1] + 8;
    if ($riff !== $len && $riff + 1 !== $len) throw $bad();

    $w = $h = null;
    $first = substr($b, 12, 4);
    if ($first === 'VP8 ') {
        if (substr($b, 23, 3) !== "\x9d\x01\x2a") throw $bad();
        $w = unpack('v', substr($b, 26, 2))[1] & 0x3FFF;
        $h = unpack('v', substr($b, 28, 2))[1] & 0x3FFF;
    } elseif ($first === 'VP8L') {
        if (ord($b[20]) !== 0x2F) throw $bad();
        $bits = unpack('V', substr($b, 21, 4))[1];
        $w = ($bits & 0x3FFF) + 1;
        $h = (($bits >> 14) & 0x3FFF) + 1;
    } elseif ($first === 'VP8X') {
        $flags = ord($b[20]);
        if ($flags & (0x02 | 0x04 | 0x08)) throw $bad(); // animation, XMP, EXIF
        $w = (ord($b[24]) | (ord($b[25]) << 8) | (ord($b[26]) << 16)) + 1;
        $h = (ord($b[27]) | (ord($b[28]) << 8) | (ord($b[29]) << 16)) + 1;
    } else {
        throw $bad();
    }

    // chunk walk: known chunk types only, sizes inside the file, exactly one image bitstream
    $allowed = $first === 'VP8X' ? ['VP8X', 'ICCP', 'ALPH', 'VP8 ', 'VP8L'] : [$first];
    $images = 0;
    for ($o = 12; $o < $riff - ($riff % 2); ) {
        if ($o + 8 > $len) throw $bad();
        $type = substr($b, $o, 4);
        $size = unpack('V', substr($b, $o + 4, 4))[1];
        if (!in_array($type, $allowed, true)) throw $bad();
        if ($type === 'VP8 ' || $type === 'VP8L') $images++;
        $o += 8 + $size + ($size % 2);
        if ($o > $len) throw $bad();
    }
    if ($images !== 1) throw $bad();
    if ($w < 1 || $h < 1 || $w > 2400 || $h > 2400) throw new ApiError(422, 'DIMENSION_MISMATCH');
    return ['width' => $w, 'height' => $h];
}

/**
 * Checks one upload (§8.2 order after the album checks): field set, meta, byte caps, container, dimensions.
 * @param array<string,mixed> $post  $_POST
 * @param array<string,mixed> $files $_FILES
 * @return array{meta: array{w:int,h:int,lqip:string}, bytes: array<int,string>}
 */
function check_upload(array $post, array $files): array
{
    $keys = array_keys($post);
    $fileKeys = array_keys($files);
    sort($fileKeys);
    if ($keys !== ['meta'] || $fileKeys !== ['v1280', 'v2400', 'v640']) throw new ApiError(400, 'VALIDATION');
    try { $meta = is_string($post['meta']) ? from_json($post['meta']) : null; } catch (JsonException) { $meta = null; }
    $metaKeys = is_array($meta) ? array_keys($meta) : [];
    sort($metaKeys);
    if ($metaKeys !== ['h', 'lqip', 'w']) throw new ApiError(400, 'VALIDATION');
    $mw = $meta['w']; $mh = $meta['h']; $lqip = $meta['lqip'];
    if (!is_int($mw) || !is_int($mh) || $mw < 1 || $mh < 1 || $mw > 2400 || $mh > 2400) throw new ApiError(400, 'VALIDATION');
    if (!is_string($lqip) || !str_starts_with($lqip, 'data:image/webp;base64,') || strlen($lqip) > 2000
        || !preg_match('#^data:image/webp;base64,[A-Za-z0-9+/]+={0,2}$#', $lqip)) throw new ApiError(400, 'VALIDATION');

    $bytes = [];
    foreach (VARIANTS as $edge => $cap) {
        $f = $files["v$edge"];
        if (!is_array($f) || is_array($f['tmp_name'] ?? null) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            if (in_array($f['error'] ?? null, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) throw new ApiError(413, 'TOO_LARGE');
            throw new ApiError(400, 'VALIDATION');
        }
        if ((int) $f['size'] > $cap) throw new ApiError(413, 'TOO_LARGE');
        $b = (string) file_get_contents($f['tmp_name']);
        if (strlen($b) > $cap) throw new ApiError(413, 'TOO_LARGE');
        $bytes[$edge] = $b;
    }

    $long = max($mw, $mh);
    foreach ($bytes as $edge => $b) {
        $d = parse_webp($b);
        $want = min($edge, $long);
        if (max($d['width'], $d['height']) !== $want) throw new ApiError(422, 'DIMENSION_MISMATCH');
        if (abs(($d['width'] / $d['height']) / ($mw / $mh) - 1) > 0.01) throw new ApiError(422, 'DIMENSION_MISMATCH');
        if ($edge === 2400 && ($d['width'] !== $mw || $d['height'] !== $mh)) throw new ApiError(422, 'DIMENSION_MISMATCH');
    }
    return ['meta' => ['w' => $mw, 'h' => $mh, 'lqip' => $lqip], 'bytes' => $bytes];
}

final class Media
{
    public function __construct(private string $dir) {}

    private function photoDir(string $id): string
    {
        if (!is_uuid($id)) throw new RuntimeException('bad photo id');
        return "{$this->dir}/p/$id";
    }

    /** writes the three variants into a temp folder, then moves it into place in one rename */
    public function store(string $id, array $bytes): void
    {
        $final = $this->photoDir($id);
        $tmp = "{$this->dir}/p/.tmp-" . bin2hex(random_bytes(8));
        if (!@mkdir($tmp, 0755, true) && !is_dir($tmp)) throw new RuntimeException('Cannot create media folder');
        try {
            foreach ($bytes as $edge => $b) {
                if (file_put_contents("$tmp/$edge.webp", $b) !== strlen($b)) throw new RuntimeException('Cannot write media');
                @chmod("$tmp/$edge.webp", 0644);
            }
            if (!@rename($tmp, $final)) throw new RuntimeException('Cannot move media into place');
        } finally {
            if (is_dir($tmp)) remove_dir($tmp);
        }
    }

    public function delete(string $id): void { remove_dir($this->photoDir($id)); }

    public function exists(string $id): bool { return is_file($this->photoDir($id) . '/640.webp'); }
}
