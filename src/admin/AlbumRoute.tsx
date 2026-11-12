// /admin/albumi/{id} is one static page (public/.htaccess maps every id to admin/album.html);
// the id comes from the address. Anything that is not a UUID asks the API anyway and gets the
// editor's own "album does not exist" state from the 404.
import AlbumEditor from "./AlbumEditor";

const PATH = /^\/admin\/albumi\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/;

export function albumIdFromPath(path: string): string {
  return PATH.exec(path)?.[1] ?? "nepostojeci";
}

export default function AlbumRoute() {
  return <AlbumEditor id={albumIdFromPath(location.pathname)} />;
}
