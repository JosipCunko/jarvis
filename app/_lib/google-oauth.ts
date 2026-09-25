import "server-only";
import { createHmac, randomBytes } from "crypto";
import { getGoogleRedirectUri } from "@/app/_lib/config";
import { getMissionStore } from "@/app/_lib/mission-store";
import type { GoogleAccount } from "@/app/_types/jarvis";

export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

export const GOOGLE_OAUTH_COOKIE = "jarvis.google.oauth";

function oauthSecret() {
  return (
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV !== "production" ? "jarvis-dev-secret" : "")
  );
}

function requireGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set.");
  }
  return { clientId, clientSecret, redirectUri: getGoogleRedirectUri() };
}

type OAuthState = { userId: string; nonce: string; exp: number };

export function signOAuthState(userId: string) {
  const payload: OAuthState = {
    userId,
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + 10 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", oauthSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readOAuthState(raw: string | undefined) {
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", oauthSecret()).update(body).digest("base64url");
  if (expected.length !== sig.length) return null;
  const match = expected.split("").every((char, index) => char === sig[index]);
  if (!match) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
    if (!parsed.userId || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function googleAuthUrl(state: string) {
  const { clientId, redirectUri } = requireGoogleConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(params: Record<string, string>) {
  const { clientId, clientSecret, redirectUri } = requireGoogleConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    ...params,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as TokenResponse;
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google token request failed.");
  }
  return json;
}

async function fetchGoogleEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Could not read the Google account email.");
  const json = (await response.json()) as { email?: string };
  if (!json.email) throw new Error("Google did not return an email address.");
  return json.email;
}

export async function exchangeGoogleCode(code: string, userId: string) {
  const json = await tokenRequest({ code, grant_type: "authorization_code" });
  const existing = await getMissionStore().getGoogleAccount(userId);
  const refreshToken = json.refresh_token || existing?.refreshToken;
  if (!refreshToken) {
    throw new Error("Google did not return a refresh token. Reconnect and grant access again.");
  }
  const email = await fetchGoogleEmail(json.access_token as string);
  const account: GoogleAccount = {
    userId,
    email,
    accessToken: json.access_token as string,
    refreshToken,
    expiry: Date.now() + Math.max(30, (json.expires_in ?? 3600) - 60) * 1000,
    scopes: json.scope || GOOGLE_SCOPES.join(" "),
    updatedAt: Date.now(),
  };
  await getMissionStore().saveGoogleAccount(account);
  return account;
}

export async function getFreshGoogleAccount(userId: string) {
  const store = getMissionStore();
  const account = await store.getGoogleAccount(userId);
  if (!account?.refreshToken) return null;
  if (account.expiry > Date.now() + 15_000) return account;
  const json = await tokenRequest({
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
  });
  const next: GoogleAccount = {
    ...account,
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token || account.refreshToken,
    expiry: Date.now() + Math.max(30, (json.expires_in ?? 3600) - 60) * 1000,
    scopes: json.scope || account.scopes,
    updatedAt: Date.now(),
  };
  await store.saveGoogleAccount(next);
  return next;
}

export async function googleApi<T>(userId: string, url: string, init: RequestInit = {}) {
  const account = await getFreshGoogleAccount(userId);
  if (!account) {
    throw new Error(
      "Google Calendar and Gmail are not connected. Ask the operator to click Connect on Google Calendar or Google Gmail in Link status.",
    );
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${account.accessToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...init, headers });
  if (response.status === 204) return null as T;
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { error: text.slice(0, 400) };
    }
  }
  if (!response.ok) {
    const err = json as { error?: { message?: string } | string };
    const message =
      typeof err?.error === "string"
        ? err.error
        : err?.error?.message || `Google API failed (${response.status})`;
    throw new Error(message);
  }
  return json as T;
}
