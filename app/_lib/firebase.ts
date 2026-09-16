import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import {
  Firestore,
  getFirestore,
  initializeFirestore,
} from "firebase/firestore";
import { isFirebaseClientConfigured } from "./config";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseClientConfigured()) return null;
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

function getFirestoreDb(firebaseApp: FirebaseApp): Firestore {
  try {
    return initializeFirestore(firebaseApp, {
      ignoreUndefinedProperties: true,
    });
  } catch {
    return getFirestore(firebaseApp);
  }
}

export const app = getFirebaseApp();
export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestoreDb(app) : null;
