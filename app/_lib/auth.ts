import type { NextAuthOptions, User as NextAuthUser } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { adminAuth } from "@/app/_lib/admin";
import {
  DEMO_USER_ID,
  isDemoAuthEnabled,
  isFirebaseAdminConfigured,
} from "@/app/_lib/config";
import type { AppUser } from "@/app/_types/jarvis";
import { getMissionStore } from "@/app/_lib/mission-store";

async function persistUser(user: AppUser) {
  await getMissionStore().upsertUser(user);
}

export const authOptions: NextAuthOptions = {
  secret:
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV !== "production" ? "jarvis-dev-secret" : undefined),
  providers: [
    CredentialsProvider({
      id: "firebase",
      name: "Firebase",
      credentials: {
        idToken: { label: "Firebase ID Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.idToken || !isFirebaseAdminConfigured()) return null;
        try {
          const decoded = await adminAuth.verifyIdToken(credentials.idToken);
          if (!decoded?.uid) return null;

          const existing = await getMissionStore().getUser(decoded.uid);
          const now = Date.now();
          const user: AppUser = {
            uid: decoded.uid,
            email: decoded.email ?? existing?.email ?? "",
            displayName:
              decoded.name ||
              existing?.displayName ||
              decoded.email?.split("@")[0] ||
              "Operator",
            createdAt: existing?.createdAt ?? now,
            lastLoginAt: now,
            provider: "firebase",
          };
          await persistUser(user);
          return {
            id: user.uid,
            name: user.displayName,
            email: user.email,
            createdAt: user.createdAt,
          } as NextAuthUser;
        } catch (error) {
          console.error("Firebase authorize failed:", error);
          return null;
        }
      },
    }),
    CredentialsProvider({
      id: "demo",
      name: "Demo operator",
      credentials: {
        demo: { label: "Demo", type: "text" },
      },
      async authorize() {
        if (!isDemoAuthEnabled()) return null;
        const now = Date.now();
        const user: AppUser = {
          uid: DEMO_USER_ID,
          displayName: "Operator",
          email: "operator@jarvis.local",
          createdAt: now,
          lastLoginAt: now,
          provider: "demo",
        };
        await persistUser(user);
        await getMissionStore().ensureSeedData(user.uid);
        return {
          id: user.uid,
          name: user.displayName,
          email: user.email,
          createdAt: user.createdAt,
        } as NextAuthUser;
      },
    }),
  ],
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      name: "jarvis.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    callbackUrl: {
      name: "jarvis.callback-url",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    csrfToken: {
      name: "jarvis.csrf-token",
      options: { httpOnly: false, sameSite: "lax", path: "/", secure: false },
    },
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        token.uid = user.id;
        token.provider = account.provider;
        token.createdAt = user.createdAt;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.uid) session.user.id = token.uid;
        if (token.provider) session.user.provider = token.provider;
        if (token.createdAt) session.user.createdAt = token.createdAt;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
