// Admin screen behind sign-in (AuthGate). One island per page; client:only (the content comes from the API).
import AuthGate from "../AuthGate";
import AlbumRoute from "../AlbumRoute";

export default function AlbumScreen() {
  return (
    <AuthGate>
      <AlbumRoute />
    </AuthGate>
  );
}
