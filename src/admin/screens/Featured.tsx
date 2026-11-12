// Admin screen behind sign-in (AuthGate). One island per page; client:only (the content comes from the API).
import AuthGate from "../AuthGate";
import Featured from "../Featured";

export default function FeaturedScreen() {
  return (
    <AuthGate>
      <Featured />
    </AuthGate>
  );
}
