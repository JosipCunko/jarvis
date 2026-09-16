import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";

export async function getSessionUser() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return null;
    return session.user;
  } catch (error) {
    console.error("Session read failed:", error);
    return null;
  }
}

export async function requireUserId() {
  const user = await getSessionUser();
  if (!user?.id) redirect("/login");
  return user.id;
}

export async function getApiUserId() {
  const user = await getSessionUser();
  return user?.id ?? null;
}
