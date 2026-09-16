import { NextResponse } from "next/server";
import { isGoogleConfigured } from "@/app/_lib/config";
import { googleAuthUrl, GOOGLE_OAUTH_COOKIE, signOAuthState } from "@/app/_lib/google-oauth";
import { getApiUserId } from "@/app/_lib/session";

export async function GET(request: Request) {
  const userId = await getApiUserId();
  const origin = new URL(request.url).origin;
  if (!userId) {
    return NextResponse.redirect(new URL("/login", origin));
  }
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/?google=error", origin));
  }
  const state = signOAuthState(userId);
  const response = NextResponse.redirect(googleAuthUrl(state));
  response.cookies.set(GOOGLE_OAUTH_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
