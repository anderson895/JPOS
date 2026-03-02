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
  collection,
  query,
  where,
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
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * Fetch user profile from Firestore.
 * If no document exists for the UID (first-time login before profile was created),
 * auto-create a basic admin profile so the app is never stuck.
 */
async function fetchOrCreateUserProfile(fbUser: FirebaseUser): Promise<User> {
  const ref = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return { id: fbUser.uid, ...snap.data() } as User;
  }

  // No profile yet — create one automatically.
  // First-ever user gets admin role; subsequent users get staff role.
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
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        try {
          const userData = await fetchOrCreateUserProfile(fbUser);
          if (!userData.isActive) {
            await signOut(auth);
            setCurrentUser(null);
            setFirebaseUser(null);
          } else {
            setCurrentUser(userData);
          }
        } catch (err: any) {
          console.error('Error loading user profile:', err);
          // Still let loading finish so UI isn't stuck
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }

      setLoading(false);
    });

    return unsub;
  }, []);

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const userData = await fetchOrCreateUserProfile(cred.user);
    if (!userData.isActive) {
      await signOut(auth);
      throw new Error('This account has been deactivated. Contact your administrator.');
    }
    setCurrentUser(userData);
  };

  const loginWithRFID = async (rfidTag: string) => {
    const q = query(
      collection(db, 'users'),
      where('rfidTag', '==', rfidTag.trim()),
      where('isActive', '==', true)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      throw new Error('RFID card not recognized. Assign it under Staff Management first.');
    }
    const userDoc = snap.docs[0];
    const userData = { id: userDoc.id, ...userDoc.data() } as User;
    setCurrentUser(userData);
    setFirebaseUser({ uid: userDoc.id } as FirebaseUser);
  };

  const logout = async () => {
    try { await signOut(auth); } catch { /* already signed out */ }
    setCurrentUser(null);
    setFirebaseUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, firebaseUser, loading, login, loginWithRFID, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
