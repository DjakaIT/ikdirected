<?php
// Albums, photos and the homepage selection (ARCHITECTURE §6): pure operations on the store state.
// Same routes, status codes, error codes and business rules as the front-end simulation the admin UI was built
// against (git history: src/admin/mock/server.ts). Rows follow ARCHITECTURE §3.
declare(strict_types=1);

const CATEGORIES = ['vjencanja', 'eventi', 'portreti', 'iz-zraka'];
// categories, top-level routes and the pagination segment (src/lib/text/slug.ts RESERVED_SLUGS)
const RESERVED_SLUGS = ['vjencanja', 'eventi', 'portreti', 'iz-zraka', 'admin', 'api', 'stranica', 'media'];
const NEW_ALBUM_TITLE = 'Novi album';
const ALBUM_PHOTO_CAP = 400;
const FEATURED_CAP = 12;
const TRASH_MS = 7 * 24 * 3600 * 1000;
const CONTROL_RE = '/[\x{0000}-\x{0009}\x{000B}-\x{001F}\x{007F}]/u';

function invalid(): ApiError { return new ApiError(400, 'VALIDATION'); }
function not_found(): ApiError { return new ApiError(404, 'NOT_FOUND'); }

/** "Ana i Marko — Nin, 2025." → "ana-i-marko-nin-2025" (same as slugify() in src/lib/text/slug.ts) */
function slugify(string $title): string
{
    $s = mb_strtolower($title, 'UTF-8');
    $s = strtr($s, ['dž' => 'dz', 'č' => 'c', 'ć' => 'c', 'đ' => 'd', 'š' => 's', 'ž' => 'z']);
    if (class_exists('Normalizer')) $s = Normalizer::normalize($s, Normalizer::FORM_D) ?: $s;
    $s = preg_replace('/\p{M}/u', '', $s) ?? $s;
    $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
    $s = rtrim(substr(trim($s, '-'), 0, 80), '-');
    return $s !== '' ? $s : 'album';
}

function unique_slug(string $title, array $taken): string
{
    $base = slugify($title);
    $taken = array_flip($taken);
    $candidate = $base;
    for ($n = 2; in_array($candidate, RESERVED_SLUGS, true) || isset($taken[$candidate]); $n++) $candidate = "$base-$n";
    return $candidate;
}

/** a real calendar date between 2000-01-01 and two years from today */
function valid_event_date(mixed $s): bool
{
    if (!is_string($s) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) return false;
    if (!checkdate((int) $m[2], (int) $m[3], (int) $m[1])) return false;
    $max = gmdate('Y-m-d', strtotime('+2 years'));
    return $s >= '2000-01-01' && $s <= $max;
}

function clean_line(string $s): string { return preg_replace('/[\s\p{Zs}]+/u', ' ', js_trim($s)) ?? $s; }

final class Content
{
    public function __construct(private string $mediaBase) {}

    // ---------------- reading ----------------
    public static function album(array $state, string $id): ?array
    {
        foreach ($state['albums'] as $a) if ($a['id'] === $id) return $a;
        return null;
    }
    private static function albumIndex(array $state, string $id): ?int
    {
        foreach ($state['albums'] as $i => $a) if ($a['id'] === $id) return $i;
        return null;
    }
    private static function photoIndex(array $state, string $id): ?int
    {
        foreach ($state['photos'] as $i => $p) if ($p['id'] === $id) return $i;
        return null;
    }

    /** live photos of an album, by position */
    public static function livePhotos(array $state, string $albumId): array
    {
        $out = array_values(array_filter($state['photos'], fn ($p) => $p['album_id'] === $albumId && $p['deleted_at'] === null));
        usort($out, fn ($a, $b) => $a['position'] <=> $b['position']);
        return $out;
    }

    public function thumb(string $photoId): string { return "{$this->mediaBase}/p/$photoId/640.webp"; }

    public function photo(array $p): array
    {
        return ['id' => $p['id'], 'album_id' => $p['album_id'], 'position' => $p['position'], 'width' => $p['width'], 'height' => $p['height'],
            'alt' => $p['alt'], 'lqip' => $p['lqip'], 'featured' => (bool) $p['featured'], 'featured_position' => $p['featured_position'],
            'created_at' => $p['created_at'], 'thumb' => $this->thumb($p['id'])];
    }

    private function card(array $state, array $a): array
    {
        $photos = self::livePhotos($state, $a['id']);
        $cover = null;
        foreach ($photos as $p) if ($p['id'] === $a['cover_photo_id']) $cover = $p;
        $cover ??= $photos[0] ?? null;
        return ['id' => $a['id'], 'slug' => $a['slug'], 'title' => $a['title'], 'category' => $a['category'], 'status' => $a['status'],
            'event_date' => $a['event_date'], 'photo_count' => count($photos),
            'cover' => $cover ? ['id' => $cover['id'], 'thumb' => $this->thumb($cover['id']), 'lqip' => $cover['lqip'], 'width' => $cover['width'], 'height' => $cover['height']] : null,
            'updated_at' => $a['updated_at'], 'deleted_at' => $a['deleted_at']];
    }

    public function listAlbums(array $state): array
    {
        $live = array_values(array_filter($state['albums'], fn ($a) => $a['deleted_at'] === null));
        usort($live, fn ($a, $b) => [$b['event_date'], $b['created_at']] <=> [$a['event_date'], $a['created_at']]);
        $cutoff = now_ms() - TRASH_MS;
        $trash = array_values(array_filter($state['albums'], fn ($a) => $a['deleted_at'] !== null && iso_to_ms($a['deleted_at']) > $cutoff));
        usort($trash, fn ($a, $b) => strcmp($b['deleted_at'], $a['deleted_at']));
        return ['albums' => array_map(fn ($a) => $this->card($state, $a), $live), 'trash' => array_map(fn ($a) => $this->card($state, $a), $trash)];
    }

    public function albumDetail(array $state, string $id): array
    {
        $a = self::album($state, $id);
        if (!$a || $a['deleted_at'] !== null) throw not_found();
        return [...$a, 'photos' => array_map(fn ($p) => $this->photo($p), self::livePhotos($state, $id))];
    }

    public function featured(array $state): array
    {
        $out = [];
        foreach ($state['photos'] as $p) {
            if (!$p['featured'] || $p['deleted_at'] !== null) continue;
            $a = self::album($state, $p['album_id']);
            if (!$a || $a['deleted_at'] !== null) continue;
            $out[] = [...$this->photo($p), 'album_title' => $a['title'], 'album_status' => $a['status'], 'album_slug' => $a['slug']];
        }
        usort($out, fn ($x, $y) => ($x['featured_position'] ?? 0) <=> ($y['featured_position'] ?? 0));
        return $out;
    }

    // ---------------- albums ----------------
    public function createAlbum(array &$state, array $body): array
    {
        if (array_diff(array_keys($body), ['category'])) throw invalid();
        $category = $body['category'] ?? 'vjencanja';
        if (!in_array($category, CATEGORIES, true)) throw invalid();
        $stamp = iso_time();
        $a = ['id' => uuid4(), 'slug' => null, 'title' => NEW_ALBUM_TITLE, 'category' => $category, 'place' => '', 'event_date' => gmdate('Y-m-d'),
            'story' => '', 'cover_photo_id' => null, 'status' => 'draft', 'published_at' => null, 'created_at' => $stamp, 'updated_at' => $stamp, 'deleted_at' => null];
        $state['albums'][] = $a;
        return $a;
    }

    public function patchAlbum(array &$state, string $id, array $body): array
    {
        $i = self::albumIndex($state, $id);
        if ($i === null || $state['albums'][$i]['deleted_at'] !== null) throw not_found();
        if (array_diff(array_keys($body), ['title', 'category', 'place', 'event_date', 'story', 'status', 'cover_photo_id'])) throw invalid();
        $a = $state['albums'][$i];
        $next = $a;
        if (array_key_exists('title', $body)) {
            if (!is_string($body['title']) || preg_match(CONTROL_RE, $body['title'])) throw invalid();
            $t = clean_line($body['title']);
            if (js_length($t) < 1 || js_length($t) > 120) throw invalid();
            $next['title'] = $t;
        }
        if (array_key_exists('category', $body)) {
            if (!in_array($body['category'], CATEGORIES, true)) throw invalid();
            $next['category'] = $body['category'];
        }
        if (array_key_exists('place', $body)) {
            if (!is_string($body['place']) || preg_match(CONTROL_RE, $body['place'])) throw invalid();
            $p = clean_line($body['place']);
            if (js_length($p) > 80) throw invalid();
            $next['place'] = $p;
        }
        if (array_key_exists('event_date', $body)) {
            if (!valid_event_date($body['event_date'])) throw invalid();
            $next['event_date'] = $body['event_date'];
        }
        if (array_key_exists('story', $body)) {
            if (!is_string($body['story']) || preg_match(CONTROL_RE, $body['story'])) throw invalid();
            $s = js_trim($body['story']);
            if (js_length($s) > 600) throw invalid();
            $next['story'] = $s;
        }
        $live = self::livePhotos($state, $id);
        if (array_key_exists('cover_photo_id', $body)) {
            $pid = $body['cover_photo_id'];
            if (!is_string($pid) || !in_array($pid, array_column($live, 'id'), true)) throw invalid();
            $next['cover_photo_id'] = $pid;
        }
        if (array_key_exists('status', $body)) {
            if ($body['status'] !== 'draft' && $body['status'] !== 'published') throw invalid();
            if ($body['status'] === 'published' && $a['status'] !== 'published') {
                if (!$live) throw new ApiError(409, 'PUBLISH_BLOCKED', '', ['reason' => 'noPhotos']);
                if ($next['title'] === NEW_ALBUM_TITLE) throw new ApiError(409, 'PUBLISH_BLOCKED', '', ['reason' => 'noTitle']);
                if (!$next['slug']) $next['slug'] = unique_slug($next['title'], [...array_values(array_filter(array_column($state['albums'], 'slug'))), ...($state['retired_slugs'] ?? [])]);
                $next['published_at'] = iso_time();
            }
            $next['status'] = $body['status'];
        }
        $next['updated_at'] = iso_time();
        $state['albums'][$i] = $next;
        return $next;
    }

    public function deleteAlbum(array &$state, string $id): void
    {
        $i = self::albumIndex($state, $id);
        if ($i === null || $state['albums'][$i]['deleted_at'] !== null) throw not_found();
        $state['albums'][$i]['deleted_at'] = $state['albums'][$i]['updated_at'] = iso_time();
    }

    public function restoreAlbum(array &$state, string $id): array
    {
        $i = self::albumIndex($state, $id);
        if ($i === null) throw not_found();
        $a = $state['albums'][$i];
        if ($a['deleted_at'] === null) return $a;
        if (iso_to_ms($a['deleted_at']) < now_ms() - TRASH_MS) throw new ApiError(409, 'CONFLICT');
        $a['deleted_at'] = null;
        $a['updated_at'] = iso_time();
        return $state['albums'][$i] = $a;
    }

    // ---------------- photos ----------------
    /** checks before the media files are written (album exists, not full) */
    public function assertCanAdd(array $state, string $albumId): void
    {
        $a = self::album($state, $albumId);
        if (!$a || $a['deleted_at'] !== null) throw not_found();
        if (count(self::livePhotos($state, $albumId)) >= ALBUM_PHOTO_CAP) throw new ApiError(409, 'ALBUM_FULL');
    }

    /** @param array{w:int,h:int,lqip:string} $meta */
    public function addPhoto(array &$state, string $albumId, string $photoId, array $meta): array
    {
        $this->assertCanAdd($state, $albumId);
        $i = self::albumIndex($state, $albumId);
        $a = $state['albums'][$i];
        $positions = array_column(array_filter($state['photos'], fn ($p) => $p['album_id'] === $albumId), 'position');
        $p = ['id' => $photoId, 'album_id' => $albumId, 'position' => ($positions ? max($positions) : 0) + 1, 'width' => $meta['w'], 'height' => $meta['h'],
            'alt' => implode(', ', array_filter([$a['title'], $a['place']], fn ($x) => $x !== '')), // AC-UP-07
            'lqip' => $meta['lqip'], 'featured' => false, 'featured_position' => null, 'created_at' => iso_time(), 'deleted_at' => null];
        $state['photos'][] = $p;
        if (!$a['cover_photo_id']) $state['albums'][$i]['cover_photo_id'] = $photoId; // AC-ALBED-07
        $state['albums'][$i]['updated_at'] = iso_time();
        return $this->photo($p);
    }

    public function reorderPhotos(array &$state, string $albumId, array $body): void
    {
        $ai = self::albumIndex($state, $albumId);
        if ($ai === null || $state['albums'][$ai]['deleted_at'] !== null) throw not_found();
        if (array_diff(array_keys($body), ['ids'])) throw invalid();
        $ids = $body['ids'] ?? null;
        $live = array_column(self::livePhotos($state, $albumId), 'id');
        if (!is_array($ids) || !array_is_list($ids) || count($ids) !== count($live) || count(array_unique($ids, SORT_REGULAR)) !== count($ids)) throw invalid();
        foreach ($ids as $x) if (!is_string($x) || !in_array($x, $live, true)) throw invalid(); // SEC-IDOR-01
        $pos = array_flip($ids);
        $deleted = 0;
        foreach ($state['photos'] as $k => $p) {
            if ($p['album_id'] !== $albumId) continue;
            // deleted photos keep slots after the live ones so a restore never collides
            $state['photos'][$k]['position'] = $p['deleted_at'] === null ? $pos[$p['id']] + 1 : count($live) + (++$deleted);
        }
        $state['albums'][$ai]['updated_at'] = iso_time();
    }

    private function liveTarget(array $state, string $photoId): array
    {
        $pi = self::photoIndex($state, $photoId);
        $p = $pi === null ? null : $state['photos'][$pi];
        $ai = $p ? self::albumIndex($state, $p['album_id']) : null;
        if ($pi === null || $p['deleted_at'] !== null || $ai === null || $state['albums'][$ai]['deleted_at'] !== null) throw not_found();
        return [$pi, $ai];
    }

    private static function compactFeatured(array &$state): void
    {
        $f = array_keys(array_filter($state['photos'], fn ($p) => $p['featured'] && $p['deleted_at'] === null));
        usort($f, fn ($x, $y) => ($state['photos'][$x]['featured_position'] ?? 0) <=> ($state['photos'][$y]['featured_position'] ?? 0));
        foreach ($f as $n => $k) $state['photos'][$k]['featured_position'] = $n + 1;
    }

    public function patchPhoto(array &$state, string $photoId, array $body): array
    {
        [$pi, $ai] = $this->liveTarget($state, $photoId);
        if (array_diff(array_keys($body), ['alt', 'featured'])) throw invalid();
        $p = &$state['photos'][$pi];
        if (array_key_exists('alt', $body)) {
            if (!is_string($body['alt']) || preg_match(CONTROL_RE, $body['alt']) || js_length(js_trim($body['alt'])) > 200) throw invalid();
            $p['alt'] = js_trim($body['alt']);
        }
        if (array_key_exists('featured', $body)) {
            if (!is_bool($body['featured'])) throw invalid();
            if ($body['featured'] && !$p['featured']) {
                $count = count(array_filter($state['photos'], fn ($x) => $x['featured'] && $x['deleted_at'] === null));
                if ($count >= FEATURED_CAP) throw new ApiError(409, 'FEATURED_FULL');
                $p['featured'] = true;
                $p['featured_position'] = $count + 1;
            } elseif (!$body['featured'] && $p['featured']) {
                $p['featured'] = false;
                $p['featured_position'] = null;
                unset($p);
                self::compactFeatured($state);
            }
        }
        unset($p);
        $state['albums'][$ai]['updated_at'] = iso_time();
        return $this->photo($state['photos'][$pi]);
    }

    public function deletePhoto(array &$state, string $photoId): void
    {
        [$pi, $ai] = $this->liveTarget($state, $photoId);
        $state['photos'][$pi]['deleted_at'] = iso_time();
        if ($state['photos'][$pi]['featured']) { // AC-DEL-03
            $state['photos'][$pi]['featured'] = false;
            $state['photos'][$pi]['featured_position'] = null;
            self::compactFeatured($state);
        }
        $a = &$state['albums'][$ai];
        $live = array_column(self::livePhotos($state, $a['id']), 'id');
        if (!$a['cover_photo_id'] || !in_array($a['cover_photo_id'], $live, true)) $a['cover_photo_id'] = $live[0] ?? null; // AC-DEL-03
        $a['updated_at'] = iso_time();
    }

    public function restorePhoto(array &$state, string $photoId): array
    {
        $pi = self::photoIndex($state, $photoId);
        $p = $pi === null ? null : $state['photos'][$pi];
        $ai = $p ? self::albumIndex($state, $p['album_id']) : null;
        if ($pi === null || $ai === null || $state['albums'][$ai]['deleted_at'] !== null) throw not_found();
        if ($p['deleted_at'] !== null) {
            if (iso_to_ms($p['deleted_at']) < now_ms() - TRASH_MS) throw not_found();
            // back to its original slot; photos at or after it shift right
            foreach ($state['photos'] as $k => $o) {
                if ($o['album_id'] === $p['album_id'] && $o['deleted_at'] === null && $o['position'] >= $p['position']) $state['photos'][$k]['position']++;
            }
            $state['photos'][$pi]['deleted_at'] = null;
            if (!$state['albums'][$ai]['cover_photo_id']) $state['albums'][$ai]['cover_photo_id'] = $photoId;
            $state['albums'][$ai]['updated_at'] = iso_time();
        }
        return $this->photo($state['photos'][$pi]);
    }

    public function reorderFeatured(array &$state, array $body): void
    {
        if (array_diff(array_keys($body), ['ids'])) throw invalid();
        $ids = $body['ids'] ?? null;
        $current = array_column($this->featured($state), 'id');
        if (!is_array($ids) || !array_is_list($ids) || count($ids) !== count($current) || count(array_unique($ids, SORT_REGULAR)) !== count($ids)) throw invalid();
        foreach ($ids as $x) if (!is_string($x) || !in_array($x, $current, true)) throw invalid();
        $pos = array_flip($ids);
        foreach ($state['photos'] as $k => $p) if (isset($pos[$p['id']])) $state['photos'][$k]['featured_position'] = $pos[$p['id']] + 1;
    }

    /**
     * Removes for good what was deleted more than 7 days ago (ARCHITECTURE §11): photos, and albums with all their
     * photos. Returns the photo ids whose media files must go.
     */
    public function purge(array &$state): array
    {
        $cutoff = now_ms() - TRASH_MS;
        $goneAlbums = [];
        foreach ($state['albums'] as $a) if ($a['deleted_at'] !== null && iso_to_ms($a['deleted_at']) < $cutoff) $goneAlbums[$a['id']] = true;
        $gone = [];
        $keep = [];
        foreach ($state['photos'] as $p) {
            if (isset($goneAlbums[$p['album_id']]) || ($p['deleted_at'] !== null && iso_to_ms($p['deleted_at']) < $cutoff)) $gone[] = $p['id'];
            else $keep[] = $p;
        }
        if ($gone || $goneAlbums) {
            $state['photos'] = $keep;
            // a removed album's address is never given to another album
            foreach ($state['albums'] as $a) if (isset($goneAlbums[$a['id']]) && $a['slug']) $state['retired_slugs'][] = $a['slug'];
            $state['albums'] = array_values(array_filter($state['albums'], fn ($a) => !isset($goneAlbums[$a['id']])));
        }
        return $gone;
    }
}
