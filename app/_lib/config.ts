export function isFirebaseClientConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
}

export function isFirebaseAdminConfigured() {
  return Boolean(
    process.env.FIREBASE_ADMIN_SDK_CONFIG || process.env.FIREBASE_ADMIN_SDK_PATH,
  );
}

export function isThesysConfigured() {
  return Boolean(process.env.THESYS_API_KEY);
}

export function isDemoAuthEnabled() {
  if (process.env.ALLOW_DEMO_LOGIN === "true") return true;
  return (
    process.env.NODE_ENV !== "production" && !isFirebaseClientConfigured()
  );
}

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleRedirectUri() {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const base = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/auth/callback/google`;
}

export function getJarvisTimezone() {
  return process.env.JARVIS_TIMEZONE || "Europe/Zagreb";
}

export const DEMO_USER_ID = "demo-operator";
