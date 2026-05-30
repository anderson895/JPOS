import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  getDocs,
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
 * Returns `null` when the user has NO profile and is not the first-ever account.
 * This is the key security guard: deleting a staff removes their Firestore doc,
 * but their Firebase Auth credentials still exist. Without this check, logging
 * back in would silently re-create their profile (and even grant admin if the
 * collection were empty). Returning null lets callers deny access instead.
 *
 * The only time a missing profile is auto-created is to bootstrap the very first
 * admin on a brand-new project (empty `users` collection).
 */
async function fetchUserProfile(fbUser: FirebaseUser): Promise<User | null> {
  const ref = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return { id: fbUser.uid, ...snap.data() } as User;
  }

  // No profile. Only bootstrap when there are zero users at all (first admin).
  const allUsersSnap = await getDocs(collection(db, 'users'));
  if (!allUsersSnap.empty) {
    // This account was removed (or never provisioned) → no access.
    return null;
  }

  const newUser: Omit<User, 'id'> = {
    email: fbUser.email ?? '',
    displayName: fbUser.displayName ?? fbUser.email?.split('@')[0] ?? 'User',
    role: 'admin',
    isActive: true,
    rfidTag: '',
    photoURL: fbUser.photoURL ?? '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await setDoc(ref, newUser);
  console.info(`Bootstrapped first admin profile for ${fbUser.email}`);
  return { id: fbUser.uid, ...newUser };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      // Clean up any previous Firestore listener when auth state changes
      if (unsubSnapshot) { unsubSnapshot(); unsubSnapshot = null; }

      setFirebaseUser(fbUser);

      if (fbUser) {
        try {
          // Deny access if this account has no profile (e.g. it was deleted but
          // still has Firebase Auth credentials).
          const profile = await fetchUserProfile(fbUser);
          if (!profile) {
            await signOut(auth);
            setCurrentUser(null);
            setFirebaseUser(null);
            setLoading(false);
            return;
          }

          // ── Real-time listener on the user's Firestore doc ──────────────
          // Any write to this doc (profile update, admin editing staff, etc.)
          // will instantly push the new data into context without a page reload.
          unsubSnapshot = onSnapshot(
            doc(db, 'users', fbUser.uid),
            (snap) => {
              if (snap.exists()) {
                const userData = { id: fbUser.uid, ...snap.data() } as User;
                if (!userData.isActive) {
                  // Deactivated mid-session — force logout
                  signOut(auth);
                  setCurrentUser(null);
                  setFirebaseUser(null);
                } else {
                  setCurrentUser(userData);
                }
              } else {
                // Profile deleted mid-session — force logout
                signOut(auth);
                setCurrentUser(null);
                setFirebaseUser(null);
              }
              setLoading(false);
            },
            (err) => {
              console.error('User snapshot error:', err);
              setCurrentUser(null);
              setLoading(false);
            }
          );
        } catch (err) {
          console.error('Error loading user profile:', err);
          setCurrentUser(null);
          setLoading(false);
        }
      } else {
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return () => {
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
      login, loginWithRFID, logout, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}