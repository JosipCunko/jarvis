import { redirect } from "next/navigation";
import CommandCenter from "@/app/_components/CommandCenter";
import { isGoogleConfigured, isSpeechCloudConfigured, isThesysConfigured } from "@/app/_lib/config";
import { getMissionStore } from "@/app/_lib/mission-store";
import { getSessionUser } from "@/app/_lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user?.id) redirect("/login");
  const store = getMissionStore();
  const [snapshot, google] = await Promise.all([
    store.loadSnapshot(user.id),
    store.getGoogleAccount(user.id),
  ]);
  return (
    <CommandCenter
      operatorName={user.name || snapshot.user.displayName || "Operator"}
      initialSnapshot={snapshot}
      thesysReady={isThesysConfigured()}
      googleConfigured={isGoogleConfigured()}
      googleEmail={google?.email ?? null}
      speechCloud={isSpeechCloudConfigured()}
    />
  );
}
