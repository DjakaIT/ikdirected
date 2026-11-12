<?php
// Public export: what the static site is built from (src/lib/data/source.ts validates the same shape).
// Only published, non-deleted albums that still have a live photo, and only their live photos (SECURITY T8):
// drafts, the trash and the audit trail never leave the hosting. Deterministic: same content → same bytes.
declare(strict_types=1);

const EXPORT_FORMAT = 1;

function public_export(array $state): array
{
    $albums = [];
    $photos = [];
    foreach ($state['albums'] as $a) {
        if ($a['status'] !== 'published' || $a['deleted_at'] !== null || !$a['slug']) continue;
        $live = Content::livePhotos($state, $a['id']);
        if (!$live) continue;
        $ids = array_column($live, 'id');
        $albums[] = ['id' => $a['id'], 'slug' => $a['slug'], 'title' => $a['title'], 'category' => $a['category'], 'place' => $a['place'],
            'event_date' => $a['event_date'], 'story' => $a['story'],
            'cover_photo_id' => in_array($a['cover_photo_id'], $ids, true) ? $a['cover_photo_id'] : $ids[0],
            'published_at' => $a['published_at'], 'updated_at' => $a['updated_at']];
        foreach ($live as $n => $p) {
            $photos[] = ['id' => $p['id'], 'album_id' => $a['id'], 'position' => $n + 1, 'width' => $p['width'], 'height' => $p['height'],
                'alt' => $p['alt'], 'lqip' => $p['lqip'], 'featured_position' => $p['featured'] ? (int) $p['featured_position'] : null];
        }
    }
    // homepage order 1..n among what is public
    $featured = array_keys(array_filter($photos, fn ($p) => $p['featured_position'] !== null));
    usort($featured, fn ($x, $y) => $photos[$x]['featured_position'] <=> $photos[$y]['featured_position']);
    foreach ($featured as $n => $k) $photos[$k]['featured_position'] = $n + 1;

    usort($albums, fn ($x, $y) => strcmp($x['id'], $y['id']));
    usort($photos, fn ($x, $y) => [$x['album_id'], $x['position']] <=> [$y['album_id'], $y['position']]);
    return ['format' => EXPORT_FORMAT, 'albums' => $albums, 'photos' => $photos];
}
