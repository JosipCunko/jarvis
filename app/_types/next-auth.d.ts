import { DefaultSession, DefaultUser } from "next-auth";
import { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      provider?: string;
      createdAt: number;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    createdAt: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    uid: string;
    provider?: string;
    createdAt: number;
  }
}
