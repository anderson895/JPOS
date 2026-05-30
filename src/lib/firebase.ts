import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

/**
 * Creates a new Firebase Auth user WITHOUT touching the current session.
 *
 * `createUserWithEmailAndPassword` automatically signs the new user in on the
 * auth instance it's given. To avoid kicking the logged-in admin out, we run it
 * on a throwaway secondary app, then tear that app down. The primary `auth`
 * (the admin's session) is never affected.
 *
 * @returns the new user's uid
 */
export async function createUserWithoutSignIn(
  email: string,
  password: string
): Promise<string> {
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  try {
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await signOut(secondaryAuth);
    return cred.user.uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

/**
 * Verifies that an email/password pair matches a real Firebase account,
 * WITHOUT touching the current (admin) session. Used before saving an RFID
 * card so we never store a password that doesn't actually work for login.
 *
 * Throws a FirebaseError (e.g. auth/invalid-credential) if the password is wrong.
 */
export async function verifyCredentials(email: string, password: string): Promise<void> {
  const secondaryApp = initializeApp(firebaseConfig, `verify-${Date.now()}`);
  try {
    const secondaryAuth = getAuth(secondaryApp);
    await signInWithEmailAndPassword(secondaryAuth, email, password);
    await signOut(secondaryAuth);
  } finally {
    await deleteApp(secondaryApp);
  }
}

export default app;