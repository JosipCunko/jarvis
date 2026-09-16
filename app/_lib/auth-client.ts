"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import { signIn as nextAuthSignIn, signOut as nextAuthSignOut } from "next-auth/react";
import { auth } from "./firebase";

const POST_AUTH_CALLBACK_URL = "/";

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
  if (!auth) throw new Error("Firebase is not configured.");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  const idToken = await credential.user.getIdToken(true);
  await signIntoNextAuthWithIdToken(idToken);
}

export async function signInWithEmailAndPasswordFirebase(
  email: string,
  password: string,
) {
  if (!auth) throw new Error("Firebase is not configured.");
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const idToken = await credential.user.getIdToken(true);
  await signIntoNextAuthWithIdToken(idToken);
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
