// Admin screen behind sign-in (AuthGate). One island per page; client:only (the content comes from the API).
import AuthGate from "../AuthGate";
import AlbumList from "../AlbumList";

export default function AlbumsScreen() {
  return (
    <AuthGate>
      <AlbumList />
    </AuthGate>
  );
}
