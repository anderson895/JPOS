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

async function fetchOrCreateUserProfile(fbUser: FirebaseUser): Promise<User> {
  const ref = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return { id: fbUser.uid, ...snap.data() } as User;
  }

  const allUsersSnap = await getDocs(collection(db, 'users'));
  const role = allUsersSnap.empty ? 'admin' : 'staff';

  const newUser: Omit<User, 'id'> = {
    email: fbUser.email ?? '',
    displayName: fbUser.displayName ?? fbUser.email?.split('@')[0] ?? 'User',
    role,
    isActive: true,
    rfidTag: '',
    photoURL: fbUser.photoURL ?? '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await setDoc(ref, newUser);
  console.info(`Auto-created Firestore profile for ${fbUser.email} as ${role}`);
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
          // Ensure the Firestore doc exists before subscribing
          await fetchOrCreateUserProfile(fbUser);

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
                setCurrentUser(null);
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
    const userData = await fetchOrCreateUserProfile(cred.user);
    if (!userData.isActive) {
      await signOut(auth);
      throw new Error('This account has been deactivated. Contact your administrator.');
    }
    // onSnapshot will handle setting currentUser automatically
  };

  const loginWithRFID = async (rfidTag: string) => {
    const trimmed = rfidTag.trim().replace(/[\r\n]/g, '');
    const cardDoc = await getDoc(doc(db, 'rfidCards', trimmed));
    if (!cardDoc.exists()) throw new Error('RFID card not registered. Contact your administrator.');
    const { email, password } = cardDoc.data();
    if (!email || !password) throw new Error('RFID card is incomplete. Contact your administrator.');
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const userData = await fetchOrCreateUserProfile(cred.user);
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