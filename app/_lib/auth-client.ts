"use client";

import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
  updateProfile,
  type User,
} from "firebase/auth";
import { signIn as nextAuthSignIn, signOut as nextAuthSignOut } from "next-auth/react";
import { auth } from "./firebase";

const POST_AUTH_CALLBACK_URL = "/";

function requireAuth() {
  if (!auth) throw new Error("Firebase is not configured.");
  return auth;
}

function waitForFirebaseUser() {
  const firebaseAuth = requireAuth();
  if (firebaseAuth.currentUser) return Promise.resolve(firebaseAuth.currentUser);
  return new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

function readableAuthError(error: unknown, fallback: string) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  if (
    code === "auth/invalid-credential" ||
    code === "auth/wrong-password" ||
    code === "auth/invalid-login-credentials"
  ) {
    return "Current password is incorrect";
  }
  if (code === "auth/weak-password") return "Use at least 6 characters";
  if (code === "auth/too-many-requests") return "Too many attempts. Try again later";
  if (code === "auth/requires-recent-login") return "Sign in again, then retry";
  if (code === "auth/user-not-found") return "No account uses that email";
  if (code === "auth/invalid-email") return "Enter a valid email";
  if (code === "auth/email-already-in-use") {
    return "That email is already registered. Confirm it, then sign in";
  }
  if (error instanceof Error && error.message && !error.message.startsWith("Firebase:")) {
    return error.message;
  }
  return fallback;
}

async function signIntoNextAuthWithIdToken(idToken: string) {
  const result = await nextAuthSignIn("firebase", {
    idToken,
    redirect: false,
    callbackUrl: POST_AUTH_CALLBACK_URL,
  });
  if (result?.error) {
    if (auth) await firebaseSignOut(auth);
    throw new Error(result.error);
  }
}

export async function signUpWithEmailAndPasswordFirebase(
  email: string,
  password: string,
  displayName?: string,
) {
  const firebaseAuth = requireAuth();
  try {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    if (displayName) {
      await updateProfile(credential.user, { displayName });
    }
    await sendEmailVerification(credential.user);
    await firebaseSignOut(firebaseAuth);
  } catch (error) {
    if (firebaseAuth.currentUser) await firebaseSignOut(firebaseAuth);
    throw new Error(readableAuthError(error, "Could not create that account"));
  }
}

export async function signInWithEmailAndPasswordFirebase(
  email: string,
  password: string,
) {
  const firebaseAuth = requireAuth();
  try {
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    if (!credential.user.emailVerified) {
      let notice = "Confirm your email first. We sent another link";
      try {
        await sendEmailVerification(credential.user);
      } catch (error) {
        notice = readableAuthError(error, "Confirm your email before signing in");
      }
      await firebaseSignOut(firebaseAuth);
      throw new Error(notice);
    }
    const idToken = await credential.user.getIdToken(true);
    await signIntoNextAuthWithIdToken(idToken);
  } catch (error) {
    if (firebaseAuth.currentUser) await firebaseSignOut(firebaseAuth);
    throw new Error(readableAuthError(error, "Could not sign in"));
  }
}

export async function signInDemo() {
  const result = await nextAuthSignIn("demo", {
    demo: "1",
    redirect: false,
    callbackUrl: POST_AUTH_CALLBACK_URL,
  });
  if (result?.error) {
    throw new Error(result.error);
  }
}

export async function signOut() {
  await nextAuthSignOut({ redirect: false, callbackUrl: "/login" });
  if (auth) await firebaseSignOut(auth);
}

export async function updateOperatorName(displayName: string) {
  const user = await waitForFirebaseUser();
  if (!user) throw new Error("Sign in again to update your name.");
  await updateProfile(user, { displayName });
}

export async function sendOperatorPasswordReset(email: string) {
  const firebaseAuth = requireAuth();
  try {
    await sendPasswordResetEmail(firebaseAuth, email);
  } catch (error) {
    throw new Error(readableAuthError(error, "Could not send the reset email"));
  }
}

export async function changeOperatorPassword(currentPassword: string, nextPassword: string) {
  const user = await waitForFirebaseUser();
  if (!user?.email) throw new Error("Sign in again to change your password.");
  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, nextPassword);
  } catch (error) {
    throw new Error(readableAuthError(error, "Could not change the password"));
  }
}
