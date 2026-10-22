import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
import toast from 'react-hot-toast';
import { auth, db } from '@/lib/firebase';
import { setCurrentTenant, tenantDoc, tenantRef } from '@/lib/tenant';
import type { Tenant, User } from '@/types';

interface AuthContextType {
  currentUser: User | null;
  /** The signed-in user's shop (live). Null while loading or signed out. */
  tenant: Tenant | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** RFID works only on a shop's own terminal page (/s/:slug), so the card lookup knows the shop. */
  loginWithRFID: (rfidTag: string, terminalSlug: string) => Promise<void>;
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

const NO_SHOP_MESSAGE = "This account isn't linked to a shop. Contact your administrator.";

/** slugs/{slug} -> the shop's id (a public lookup, so a terminal can find its shop before sign-in). */
async function resolveTerminalShop(slug: string): Promise<string> {
  const clean = slug.trim().toLowerCase();
  const invalid = "This terminal link isn't valid. Check the shop's link.";
  if (!/^[a-z0-9-]{1,60}$/.test(clean)) throw new Error(invalid);
  const snap = await getDoc(doc(db, 'slugs', clean));
  const tenantId = snap.exists() ? (snap.data() as { tenantId?: string }).tenantId : undefined;
  if (!tenantId) throw new Error(invalid);
  return tenantId;
}

/**
 * The first Google sign-in to an account whose email was never verified makes
 * Firebase drop that account's password (it keeps the same uid). RFID login
 * signs in with the password saved on the card, so put that password back —
 * otherwise the card would stop working with no way to fix it from the app.
 * Admins never use RFID, so their (legacy) cards are ignored.
 */
async function restoreRfidPassword(fbUser: FirebaseUser, profile: User) {
  const tag = profile.rfidTag?.trim();
  if (profile.role === 'admin' || !tag || !fbUser.email) return;
  if (fbUser.providerData.some(p => p.providerId === 'password')) return;
  try {
    const card = await getDoc(tenantDoc('rfidCards', tag, profile.tenantId));
    const { userId, password } = (card.data() ?? {}) as { userId?: string; password?: string };
    if (userId === fbUser.uid && password) {
      await linkWithCredential(fbUser, EmailAuthProvider.credential(fbUser.email, password));
    }
  } catch (err) {
    console.warn('Could not restore the RFID password after Google sign-in:', err);
    // Not fatal for this sign-in, but their card won't work until it's fixed
    toast.error("Your RFID card couldn't be re-linked. Ask your admin to re-enter the card password in Manage Staff.", { duration: 8000 });
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  // True while loginWithRFID is checking a card's account, so the auth listener
  // refuses an admin session from a card instead of briefly opening it.
  const rfidSignIn = useRef(false);
  // The shop whose terminal the card was tapped at; the card's account must belong to it.
  const rfidTenant = useRef<string | null>(null);

  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;
    let unsubTenant: (() => void) | null = null;
    // Bumped on every auth change (and on unmount). Async work started for an
    // older auth state checks it before touching anything, so a slow profile
    // fetch for a user who has since signed out can't attach a listener that
    // would later "log them back in" (e.g. when an admin re-activates them).
    let authVersion = 0;

    // Clears the session AND signs out of Firebase. Leaving Firebase signed in
    // with no profile would strand the user: onAuthStateChanged only fires when
    // the uid changes, so retrying the same login would never load the profile.
    const resetSession = () => {
      if (unsubTenant) { unsubTenant(); unsubTenant = null; }
      setCurrentTenant(null);
      setTenant(null);
      setCurrentUser(null);
      setFirebaseUser(null);
      setLoading(false);
      signOut(auth).catch(() => { /* already signed out */ });
    };

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      const version = ++authVersion;
      // Clean up any previous Firestore listeners when auth state changes
      if (unsubSnapshot) { unsubSnapshot(); unsubSnapshot = null; }
      if (unsubTenant) { unsubTenant(); unsubTenant = null; }

      setFirebaseUser(fbUser);

      if (!fbUser) {
        setCurrentTenant(null);
        setTenant(null);
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
        // Admins can't sign in with an RFID card, and a card only opens its own
        // shop's terminal (loginWithRFID shows the message)
        if (rfidSignIn.current && (profile.role === 'admin' || profile.tenantId !== rfidTenant.current)) {
          resetSession();
          return;
        }
        // Every account belongs to exactly one shop; per-shop paths are built from it.
        const shopId = profile.tenantId;
        if (!shopId) {
          resetSession();
          return;
        }
        setCurrentTenant(shopId);

        // Live shop document: status, package and period (read-only for shop users)
        unsubTenant = onSnapshot(
          tenantRef(shopId),
          (snap) => {
            if (version !== authVersion) return;
            if (snap.exists()) setTenant({ id: snap.id, ...snap.data() } as Tenant);
            else resetSession();   // the shop was removed
          },
          (err) => {
            console.error('Shop snapshot error:', err);
            if (version === authVersion) resetSession();
          }
        );

        // ── Real-time listener on the user's Firestore doc ──────────────
        // Any write to this doc (profile update, admin editing staff, etc.)
        // will instantly push the new data into context without a page reload.
        unsubSnapshot = onSnapshot(
          doc(db, 'users', fbUser.uid),
          (snap) => {
            if (version !== authVersion) return;
            const userData = snap.exists() ? ({ id: fbUser.uid, ...snap.data() } as User) : null;
            // Moved to another shop mid-session (never expected): start over
            if (userData && userData.tenantId !== shopId) { resetSession(); return; }
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
      if (unsubTenant) unsubTenant();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const userData = await fetchUserProfile(cred.user);
    if (!userData) {
      await signOut(auth);
      throw new Error('This account no longer has access. Contact your administrator.');
    }
    if (!userData.tenantId) {
      await signOut(auth);
      throw new Error(NO_SHOP_MESSAGE);
    }
    if (!userData.isActive) {
      await signOut(auth);
      throw new Error('This account has been deactivated. Contact your administrator.');
    }
    // onSnapshot will handle setting currentUser automatically
  };

  const loginWithRFID = async (rfidTag: string, terminalSlug: string) => {
    const trimmed = rfidTag.trim().replace(/[\r\n]/g, '');
    if (!trimmed) throw new Error('No RFID tag detected. Please scan again.');
    // A "/" would be read as a sub-path and make the lookup itself throw.
    if (trimmed.includes('/')) throw new Error('RFID card not registered. Contact your administrator.');

    // The terminal's shop: its cards live under tenants/{T}/rfidCards
    const shopId = await resolveTerminalShop(terminalSlug);
    let cardDoc;
    try {
      cardDoc = await getDoc(tenantDoc('rfidCards', trimmed, shopId));
    } catch (err) {
      // The rules hide cards when the shop's package doesn't include RFID
      if (err instanceof FirebaseError && err.code === 'permission-denied') {
        throw new Error("RFID login isn't included in this shop's package. Sign in with your email and password.");
      }
      throw err;
    }
    if (!cardDoc.exists()) throw new Error('RFID card not registered. Contact your administrator.');

    const { email, password } = cardDoc.data() as { email?: string; password?: string };
    if (!email || !password) throw new Error('RFID card is incomplete. Contact your administrator.');

    rfidSignIn.current = true;
    rfidTenant.current = shopId;
    try {
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
      // A card holds its owner's password and anyone who knows the tag can read
      // it, so admin accounts never sign in by RFID — old admin cards stop working.
      if (userData.role === 'admin') {
        await signOut(auth);
        throw new Error('RFID login is not available for admin accounts. Use your email and password.');
      }
      // A card registered in another shop can't open this shop's terminal
      if (userData.tenantId !== shopId) {
        await signOut(auth);
        throw new Error('This card belongs to a different shop.');
      }
      if (!userData.isActive) {
        await signOut(auth);
        throw new Error('This account has been deactivated. Contact your administrator.');
      }
      // onSnapshot will handle setting currentUser automatically
    } finally {
      rfidSignIn.current = false;
      rfidTenant.current = null;
    }
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
    if (!userData.tenantId) {
      await signOut(auth);
      throw new Error(NO_SHOP_MESSAGE);
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
    setCurrentTenant(null);
    setTenant(null);
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
      currentUser, tenant, firebaseUser, loading,
      login, loginWithRFID, loginWithGoogle, logout, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}