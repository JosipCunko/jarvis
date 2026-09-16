import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import admin from "firebase-admin";
import { isFirebaseAdminConfigured } from "./config";

const isBuildTime =
  process.env.NEXT_PHASE === "phase-production-build" ||
  (process.env.NODE_ENV === "production" &&
    !process.env.FIREBASE_ADMIN_SDK_CONFIG &&
    !process.env.FIREBASE_ADMIN_SDK_PATH);

let cachedDb: admin.firestore.Firestore | null = null;

function parseJsonObject(raw: string): object {
  const trimmed = raw.trim();
  const candidates = [trimmed];

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    candidates.push(trimmed.slice(1, -1));
  }

  if (trimmed.includes('\\"')) {
    candidates.push(trimmed.replace(/\\"/g, '"'));
  }

  if (trimmed.includes("\n")) {
    candidates.push(trimmed.replace(/\r?\n/g, "\\n"));
  }

  for (const candidate of candidates) {
    try {
      let parsed: unknown = JSON.parse(candidate);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Try the next encoding Next.js / dotenv may have left behind.
    }
  }

  throw new SyntaxError("FIREBASE_ADMIN_SDK_CONFIG is not valid JSON");
}

function looksLikeFilePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("{")) return false;
  return (
    trimmed.endsWith(".json") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  );
}

function loadServiceAccount(): admin.ServiceAccount {
  const config = process.env.FIREBASE_ADMIN_SDK_CONFIG;
  const filePath =
    process.env.FIREBASE_ADMIN_SDK_PATH ||
    (config && looksLikeFilePath(config) ? config : undefined);

  if (filePath) {
    const absolute = resolve(process.cwd(), filePath);
    if (!existsSync(absolute)) {
      throw new Error(`Firebase Admin SDK file not found: ${absolute}`);
    }
    return parseJsonObject(readFileSync(absolute, "utf8")) as admin.ServiceAccount;
  }

  if (!config) {
    throw new Error(
      "Firebase Admin SDK is not configured. Set FIREBASE_ADMIN_SDK_PATH or FIREBASE_ADMIN_SDK_CONFIG.",
    );
  }

  return parseJsonObject(config) as admin.ServiceAccount;
}

function ensureAdminApp() {
  if (admin.apps.length) return;
  if (isBuildTime || !isFirebaseAdminConfigured()) {
    throw new Error("Firebase Admin SDK is not initialized.");
  }

  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
  });
  cachedDb = admin.firestore();
  cachedDb.settings({ ignoreUndefinedProperties: true });
}

if (!isBuildTime && isFirebaseAdminConfigured() && !admin.apps.length) {
  try {
    ensureAdminApp();
  } catch (error) {
    console.error("Firebase Admin SDK initialization error:", error);
  }
}

function getAdminAuth() {
  ensureAdminApp();
  return admin.auth();
}

function getAdminDb() {
  ensureAdminApp();
  if (!cachedDb) {
    cachedDb = admin.firestore();
    try {
      cachedDb.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Settings can only be applied once per process (e.g. after HMR).
    }
  }
  return cachedDb;
}

export const adminAuth = new Proxy({} as admin.auth.Auth, {
  get: (_target, prop: string | symbol) => {
    const authInstance = getAdminAuth();
    const value = authInstance[prop as keyof admin.auth.Auth];
    return typeof value === "function"
      ? value.bind(authInstance)
      : value;
  },
});

export const adminDb = new Proxy({} as admin.firestore.Firestore, {
  get: (_target, prop: string | symbol) => {
    const db = getAdminDb();
    const value = db[prop as keyof admin.firestore.Firestore];
    return typeof value === "function" ? value.bind(db) : value;
  },
});
