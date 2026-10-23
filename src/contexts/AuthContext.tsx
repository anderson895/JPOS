import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  EmailAuthProvider,
  linkWithCredential,
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
import { isSuperAdmin as checkSuperAdmin } from '@/lib/platform';
import { callPublicApi } from '@/lib/api';
import type { Tenant, User } from '@/types';

interface AuthContextType {
  currentUser: User | null;
  /** The signed-in user's shop (live). Null while loading or signed out. */
  tenant: Tenant | null;
  firebaseUser: FirebaseUser | null;
  /** Signed in, but the account has no shop yet (a new sign-up): finish at /subscribe. */
  noShop: boolean;
  /** The platform owner (platformAdmins/{uid}): reviews payments, sets prices and QR codes. */
  isSuperAdmin: boolean;
  /** False while the Super Admin check is still running (so pages can wait for it). */
  superAdminChecked: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** RFID works only on a shop's own staff sign-in page (/s/:slug), so the card lookup knows the shop. */
  loginWithRFID: (rfidTag: string, terminalSlug: string) => Promise<void>;
  /** isNew: a Google account with no shop yet (it continues at /subscribe). */
  loginWithGoogle: () => Promise<{ isNew: boolean }>;
  /** Sign-up step 1: emails a 6-digit code (from JPOS's Gmail). No account is made yet. */
  sendSignUpCode: (email: string) => Promise<void>;
  /** Sign-up step 2: a right code makes the account (email already confirmed), then signs in. */
  finishSignUp: (input: { email: string; code: string; password: string; name: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

async function fetchUserProfile(fbUser: FirebaseUser): Promise<User | null> {
  const snap = await getDoc(doc(db, 'users', fbUser.uid));
  return snap.exists() ? ({ id: fbUser.uid, ...snap.data() } as User) : null;
}

/**
 * A password login whose email was never confirmed and that has no shop: only
 * the old sign-up (before the email code) made these. Staff logins aren't
 * confirmed either, but they always have a profile, so they never count.
 */
const isUnconfirmedSignUp = (u: FirebaseUser) =>
  !u.emailVerified && u.providerData.length > 0 && u.providerData.every(p => p.providerId === 'password');

/** slugs/{slug} -> the shop's id (a public lookup, so the staff sign-in page can find its shop). */
async function resolveTerminalShop(slug: string): Promise<string> {
  const clean = slug.trim().toLowerCase();
  const invalid = "This sign-in page doesn't belong to any shop.";
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
  const [noShop, setNoShop] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [superAdminChecked, setSuperAdminChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  // True while loginWithRFID is checking a card's account, so the auth listener
  // refuses an admin session from a card instead of briefly opening it.
  const rfidSignIn = useRef(false);
  // The shop whose staff sign-in page the card was tapped at; the card's account must belong to it.
  const rfidTenant = useRef<string | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let unsubTenant: (() => void) | null = null;
    // Bumped on every auth change (and on unmount). Async work started for an
    // older auth state checks it before touching anything, so a slow response
    // for a user who has since signed out can't "log them back in".
    let authVersion = 0;

    const clearState = () => {
      if (unsubTenant) { unsubTenant(); unsubTenant = null; }
      setCurrentTenant(null);
      setTenant(null);
      setCurrentUser(null);
      setNoShop(false);
    };
    // Clears the session AND signs out of Firebase.
    const resetSession = () => {
      clearState();
      setFirebaseUser(null);
      setIsSuperAdmin(false);
      setSuperAdminChecked(true);
      setLoading(false);
      signOut(auth).catch(() => { /* already signed out */ });
    };

    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      const version = ++authVersion;
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      clearState();
      setFirebaseUser(fbUser);

      if (!fbUser) {
        setIsSuperAdmin(false);
        setSuperAdminChecked(true);
        setLoading(false);
        return;
      }
      setLoading(true);
      setSuperAdminChecked(false);
      checkSuperAdmin(fbUser.uid)
        .then(v => { if (version === authVersion) setIsSuperAdmin(v); })
        .catch(() => { if (version === authVersion) setIsSuperAdmin(false); })
        .finally(() => { if (version === authVersion) setSuperAdminChecked(true); });

      let shopId: string | null = null;
      // The user's own profile, live: it appears when a new owner creates their
      // shop, changes when an admin edits them, and disappears if they're removed.
      unsubProfile = onSnapshot(
        doc(db, 'users', fbUser.uid),
        { includeMetadataChanges: true },
        (snap) => {
          if (version !== authVersion) return;
          // A profile this browser just wrote (creating the shop) isn't saved yet:
          // reading the shop now would be refused, so wait for the server to confirm it.
          if (snap.metadata.hasPendingWrites) return;
          if (!snap.exists()) {
            // A card can't open an account that has no profile
            if (rfidSignIn.current || shopId) { resetSession(); return; }
            // Left behind by the old sign-up (email never confirmed): it can't
            // create a shop. Signing up again with the same email replaces it.
            if (isUnconfirmedSignUp(fbUser)) { resetSession(); return; }
            // A new sign-up (no shop yet): they finish at /subscribe.
            clearState();
            setNoShop(true);
            setLoading(false);
            return;
          }
          const profile = { id: fbUser.uid, ...snap.data() } as User;
          // Admins can't sign in with an RFID card, and a card only opens its own shop
          if (rfidSignIn.current && (profile.role === 'admin' || profile.tenantId !== rfidTenant.current)) {
            resetSession();
            return;
          }
          // Every account belongs to exactly one shop, and can't move to another
          if (!profile.tenantId || (shopId && profile.tenantId !== shopId) || !profile.isActive) {
            resetSession();
            return;
          }
          if (!shopId) {
            shopId = profile.tenantId;
            setCurrentTenant(shopId);
            // Live shop document: status, package and period
            unsubTenant = onSnapshot(
              tenantRef(shopId),
              (tsnap) => {
                if (version !== authVersion) return;
                if (tsnap.exists()) setTenant({ id: tsnap.id, ...tsnap.data() } as Tenant);
                else resetSession();   // the shop was removed
              },
              (err) => {
                console.error('Shop snapshot error:', err);
                if (version === authVersion) resetSession();
              }
            );
          }
          setNoShop(false);
          setCurrentUser(profile);
          setLoading(false);
        },
        (err) => {
          console.error('Profile snapshot error:', err);
          if (version === authVersion) resetSession();
        }
      );
    });

    return () => {
      authVersion++;
      unsubAuth();
      if (unsubProfile) unsubProfile();
      if (unsubTenant) unsubTenant();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const userData = await fetchUserProfile(cred.user);
    if (!userData && isUnconfirmedSignUp(cred.user)) {
      await signOut(auth);
      throw new Error("This email was never confirmed. Sign up again with it and we'll send you a code.");
    }
    // No profile = an owner who hasn't finished setting up their shop: the app
    // takes them to /subscribe to continue.
    if (userData && !userData.isActive) {
      await signOut(auth);
      throw new Error('This account has been deactivated. Contact your administrator.');
    }
  };

  const loginWithRFID = async (rfidTag: string, terminalSlug: string) => {
    const trimmed = rfidTag.trim().replace(/[\r\n]/g, '');
    if (!trimmed) throw new Error('No RFID tag detected. Please scan again.');
    // A "/" would be read as a sub-path and make the lookup itself throw.
    if (trimmed.includes('/')) throw new Error('RFID card not registered. Contact your administrator.');

    // The page's shop: its cards live under tenants/{T}/rfidCards
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
      if (userData.tenantId !== shopId) {
        await signOut(auth);
        throw new Error('This card belongs to a different shop.');
      }
      if (!userData.isActive) {
        await signOut(auth);
        throw new Error('This account has been deactivated. Contact your administrator.');
      }
    } finally {
      rfidSignIn.current = false;
      rfidTenant.current = null;
    }
  };

  /**
   * Google sign-in. A registered account opens its shop; a new Google account
   * has no shop yet and continues at /subscribe (Google already verified the email).
   */
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    // Always show the account picker — POS devices are shared
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);

    const userData = await fetchUserProfile(cred.user);
    if (!userData) return { isNew: true };   // new owner → /subscribe
    if (!userData.isActive) {
      await signOut(auth);
      throw new Error('This account has been deactivated. Contact your administrator.');
    }
    await restoreRfidPassword(cred.user, userData);
    return { isNew: false };
  };

  const sendSignUpCode = async (email: string) => {
    await callPublicApi('signup/code', { email: email.trim() });
  };

  const finishSignUp = async ({ email, code, password, name }: { email: string; code: string; password: string; name: string }) => {
    await callPublicApi('signup/finish', { email: email.trim(), code, password, name: name.trim() });
    // The account was made with its email confirmed, so the shop can be created right away
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const logout = async () => {
    try { await signOut(auth); } catch { /* already signed out */ }
    setCurrentTenant(null);
    setTenant(null);
    setCurrentUser(null);
    setFirebaseUser(null);
    setNoShop(false);
    setIsSuperAdmin(false);
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
      currentUser, tenant, firebaseUser, noShop, isSuperAdmin, superAdminChecked, loading,
      login, loginWithRFID, loginWithGoogle, sendSignUpCode, finishSignUp,
      logout, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
