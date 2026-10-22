import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  EmailAuthProvider,
  linkWithCredential,
  getAdditionalUserInfo,
  deleteUser,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { auth, db } from '@/lib/firebase';
import type { User } from '@/types';

interface AuthContextType {
  currentUser: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithRFID: (rfidTag: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * Resolves the Firestore profile for an authenticated Firebase user.
 *
 * Returns `null` when the user has NO profile, and callers then deny access.
 * This is the key security guard: deleting a staff removes their Firestore doc,
 * but their Firebase Auth credentials still exist, and anyone can create a
 * Google login. A missing profile is never created here — accounts only come
 * from an admin (Manage Staff), and the first admin is set up by hand in the
 * Firebase Console (README §4).
 */
async function fetchUserProfile(fbUser: FirebaseUser): Promise<User | null> {
  const snap = await getDoc(doc(db, 'users', fbUser.uid));
  return snap.exists() ? ({ id: fbUser.uid, ...snap.data() } as User) : null;
}

/**
 * The first Google sign-in to an account whose email was never verified makes
 * Firebase drop that account's password (it keeps the same uid). RFID login
 * signs in with the password saved on the card, so put that password back —
 * otherwise the card would stop working with no way to fix it from the app.
 */
async function restoreRfidPassword(fbUser: FirebaseUser, profile: User) {
  const tag = profile.rfidTag?.trim();
  if (!tag || !fbUser.email || fbUser.providerData.some(p => p.providerId === 'password')) return;
  try {
    const card = await getDoc(doc(db, 'rfidCards', tag));
    const { userId, password } = (card.data() ?? {}) as { userId?: string; password?: string };
    if (userId === fbUser.uid && password) {
      await linkWithCredential(fbUser, EmailAuthProvider.credential(fbUser.email, password));
    }
  } catch (err) {
    console.warn('Could not restore the RFID password after Google sign-in:', err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;
    // Bumped on every auth change (and on unmount). Async work started for an
    // older auth state checks it before touching anything, so a slow profile
    // fetch for a user who has since signed out can't attach a listener that
    // would later "log them back in" (e.g. when an admin re-activates them).
    let authVersion = 0;

    // Clears the session AND signs out of Firebase. Leaving Firebase signed in
    // with no profile would strand the user: onAuthStateChanged only fires when
    // the uid changes, so retrying the same login would never load the profile.
    const resetSession = () => {
      setCurrentUser(null);
      setFirebaseUser(null);
      setLoading(false);
      signOut(auth).catch(() => { /* already signed out */ });
    };

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      const version = ++authVersion;
      // Clean up any previous Firestore listener when auth state changes
      if (unsubSnapshot) { unsubSnapshot(); unsubSnapshot = null; }

      setFirebaseUser(fbUser);

      if (!fbUser) {
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      try {
        // Deny access if this account has no profile (e.g. it was deleted but
        // still has Firebase Auth credentials).
        const profile = await fetchUserProfile(fbUser);
        if (version !== authVersion) return;
        if (!profile) {
          resetSession();
          return;
        }

        // ── Real-time listener on the user's Firestore doc ──────────────
        // Any write to this doc (profile update, admin editing staff, etc.)
        // will instantly push the new data into context without a page reload.
        unsubSnapshot = onSnapshot(
          doc(db, 'users', fbUser.uid),
          (snap) => {
            if (version !== authVersion) return;
            const userData = snap.exists() ? ({ id: fbUser.uid, ...snap.data() } as User) : null;
            if (userData?.isActive) {
              setCurrentUser(userData);
              setLoading(false);
            } else {
              // Deactivated or deleted mid-session — force logout
              resetSession();
            }
          },
          (err) => {
            console.error('User snapshot error:', err);
            if (version === authVersion) resetSession();
          }
        );
      } catch (err) {
        console.error('Error loading user profile:', err);
        if (version === authVersion) resetSession();
      }
    });

    return () => {
      authVersion++;
      unsubAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const userData = await fetchUserProfile(cred.user);
    if (!userData) {
      await signOut(auth);
      throw new Error('This account no longer has access. Contact your administrator.');
    }
    if (!userData.isActive) {
      await signOut(auth);
      throw new Error('This account has been deactivated. Contact your administrator.');
    }
    // onSnapshot will handle setting currentUser automatically
  };

  const loginWithRFID = async (rfidTag: string) => {
    const trimmed = rfidTag.trim().replace(/[\r\n]/g, '');
    if (!trimmed) throw new Error('No RFID tag detected. Please scan again.');
    // A "/" would be read as a sub-path and make the lookup itself throw.
    if (trimmed.includes('/')) throw new Error('RFID card not registered. Contact your administrator.');

    const cardDoc = await getDoc(doc(db, 'rfidCards', trimmed));
    if (!cardDoc.exists()) throw new Error('RFID card not registered. Contact your administrator.');

    const { email, password } = cardDoc.data() as { email?: string; password?: string };
    if (!email || !password) throw new Error('RFID card is incomplete. Contact your administrator.');

    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      console.error('RFID sign-in failed for', email, err);
      if (err instanceof FirebaseError) {
        // Firebase temporarily locks out an account after too many failures.
        if (err.code === 'auth/too-many-requests') {
          throw new Error('Too many login attempts. Please wait a few minutes, then try again.');
        }
        if (err.code === 'auth/user-not-found') {
          throw new Error('This RFID card is linked to a deleted account. Contact your administrator.');
        }
        if (
          err.code === 'auth/wrong-password' ||
          err.code === 'auth/invalid-credential' ||
          err.code === 'auth/invalid-login-credentials'
        ) {
          throw new Error(
            "This RFID card's saved password is incorrect. Ask your administrator to re-enter the RFID password for this staff."
          );
        }
      }
      throw new Error('RFID login failed. Please try again or contact your administrator.');
    }

    const userData = await fetchUserProfile(cred.user);
    if (!userData) {
      await signOut(auth);
      throw new Error('This account no longer has access. Contact your administrator.');
    }
    if (!userData.isActive) {
      await signOut(auth);
      throw new Error('This account has been deactivated. Contact your administrator.');
    }
    // onSnapshot will handle setting currentUser automatically
  };

  /**
   * Only for accounts an admin has already added: a Gmail address signs in to
   * the existing JPOS account with the same email. Unknown Google accounts are
   * turned away.
   */
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    // Always show the account picker — POS terminals are shared
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);

    const userData = await fetchUserProfile(cred.user);
    if (!userData) {
      // Firebase has just created a login for this stranger; remove it again so
      // it doesn't linger in the Authentication user list.
      if (getAdditionalUserInfo(cred)?.isNewUser) {
        await deleteUser(cred.user).catch(() => { /* best effort */ });
      }
      await signOut(auth).catch(() => { /* already signed out */ });
      throw new Error("This Google account isn't registered in JPOS. Ask your administrator to add your email first.");
    }
    if (!userData.isActive) {
      await signOut(auth);
      throw new Error('This account has been deactivated. Contact your administrator.');
    }
    await restoreRfidPassword(cred.user, userData);
    // onSnapshot will handle setting currentUser automatically
  };

  const logout = async () => {
    try { await signOut(auth); } catch { /* already signed out */ }
    setCurrentUser(null);
    setFirebaseUser(null);
  };

  // Manual refresh — still useful if you want to force a re-fetch outside of the snapshot
  const refreshUser = async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    const snap = await getDoc(doc(db, 'users', fbUser.uid));
    if (snap.exists()) {
      setCurrentUser({ id: fbUser.uid, ...snap.data() } as User);
    }
  };

  return (
    <AuthContext.Provider value={{
      currentUser, firebaseUser, loading,
      login, loginWithRFID, loginWithGoogle, logout, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}