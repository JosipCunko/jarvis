import "server-only";
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeGoogleCode,
  GOOGLE_OAUTH_COOKIE,
  readOAuthState,
} from "./google-oauth";

export async function handleGoogleCallback(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const fail = (code: string) => {
    const response = NextResponse.redirect(new URL(`/?google=${code}`, origin));
    response.cookies.delete(GOOGLE_OAUTH_COOKIE);
    return response;
  };

  if (request.nextUrl.searchParams.get("error")) {
    return fail("denied");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get(GOOGLE_OAUTH_COOKIE)?.value;
  const parsed = readOAuthState(state ?? undefined);
  const cookieParsed = readOAuthState(cookieState);
  if (
    !code ||
    !parsed ||
    !cookieParsed ||
    parsed.nonce !== cookieParsed.nonce ||
    parsed.userId !== cookieParsed.userId
  ) {
    return fail("error");
  }

  try {
    await exchangeGoogleCode(code, parsed.userId);
    const response = NextResponse.redirect(new URL("/?google=connected", origin));
    response.cookies.delete(GOOGLE_OAUTH_COOKIE);
    return response;
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return fail("error");
  }
}
