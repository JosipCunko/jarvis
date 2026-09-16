import { redirect } from "next/navigation";
import { isDemoAuthEnabled, isFirebaseClientConfigured } from "@/app/_lib/config";
import LoginForm from "@/app/_components/LoginForm";
import { getSessionUser } from "@/app/_lib/session";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user?.id) redirect("/");
  return (
    <LoginForm
      firebaseReady={isFirebaseClientConfigured()}
      demoReady={isDemoAuthEnabled()}
    />
  );
}
