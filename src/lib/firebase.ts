import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
  connectAuthEmulator,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
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
 * Local test mode (`npm run dev`): everything runs against the Firebase
 * emulators on this computer, with fake data. Production is never touched.
 */
export const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
if (USE_EMULATORS) {
  connectAuthEmulator(auth, AUTH_EMULATOR, { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
}

/**
 * A throwaway app whose auth session lives only in memory, so nothing it signs
 * in is ever written to IndexedDB or mixed up with the admin's own session.
 */
function createSecondaryAuth(prefix: string) {
  const secondaryApp = initializeApp(firebaseConfig, `${prefix}-${Date.now()}`);
  const secondaryAuth = initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
  if (USE_EMULATORS) connectAuthEmulator(secondaryAuth, AUTH_EMULATOR, { disableWarnings: true });
  return { secondaryApp, secondaryAuth };
}

/**
 * Creates a new Firebase Auth user WITHOUT touching the current session.
 *
 * `createUserWithEmailAndPassword` automatically signs the new user in on the
 * auth instance it's given. To avoid kicking the logged-in admin out, we run it
 * on a throwaway secondary app, then tear that app down. The primary `auth`
 * (the admin's session) is never affected.
 *
 * `onCreated` runs while the new account still exists in isolation (e.g. to
 * write its Firestore profile). If it throws, the new login is deleted again,
 * so a failed save never leaves an orphan account whose email can't be reused.
 *
 * @returns the new user's uid
 */
export async function createUserWithoutSignIn(
  email: string,
  password: string,
  onCreated?: (uid: string) => Promise<void>
): Promise<string> {
  const { secondaryApp, secondaryAuth } = createSecondaryAuth('secondary');
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    if (onCreated) {
      try {
        await onCreated(cred.user.uid);
      } catch (err) {
        await deleteUser(cred.user).catch(() => { /* best effort */ });
        throw err;
      }
    }
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
  const { secondaryApp, secondaryAuth } = createSecondaryAuth('verify');
  try {
    await signInWithEmailAndPassword(secondaryAuth, email, password);
    await signOut(secondaryAuth);
  } finally {
    await deleteApp(secondaryApp);
  }
}

export default app;
