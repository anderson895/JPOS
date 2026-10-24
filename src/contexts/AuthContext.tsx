import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { setCurrentTenant, tenantRef } from '@/lib/tenant';
import { isSuperAdmin as checkSuperAdmin } from '@/lib/platform';
import { callPublicApi } from '@/lib/api';
import { brandingRef, storeBrand, type StoreBrand } from '@/lib/storeProfile';
import { hasFeature } from '@/lib/entitlements';
import type { StoreBranding, Tenant, User } from '@/types';

interface AuthContextType {
  currentUser: User | null;
  /** The signed-in user's shop (live). Null while loading or signed out. */
  tenant: Tenant | null;
  /** The shop's name, logo and colors (live). Null when the shop never saved any. */
  branding: StoreBranding | null;
  /** False until the shop's branding has been read (so a missing one can be told apart). */
  brandingReady: boolean;
  firebaseUser: FirebaseUser | null;
  /** Signed in, but the account has no shop yet (a new sign-up): finish at /subscribe. */
  noShop: boolean;
  /** The platform owner (platformAdmins/{uid}): reviews payments, sets prices and QR codes. */
  isSuperAdmin: boolean;
  /** False while the Super Admin check is still running (so pages can wait for it). */
  superAdminChecked: boolean;
  loading: boolean;
  /** On a shop's sign-in page (terminalSlug), only that shop's accounts get in. */
  login: (email: string, password: string, terminalSlug?: string) => Promise<void>;
  /** isNew: a Google account with no shop yet (it continues at /subscribe). */
  loginWithGoogle: (terminalSlug?: string) => Promise<{ isNew: boolean }>;
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

/**
 * The signed-in shop's name, logo and colors, or the JPOS ones. Its own logo
 * and colors need a package that has them (Business and up); the name always shows.
 */
export function useStoreBrand(): StoreBrand {
  const { branding, tenant } = useAuth();
  const own = hasFeature(tenant, 'branding');
  return useMemo(
    () => storeBrand(own || !branding ? branding : { ...branding, logoUrl: '', theme: 'espresso' }, tenant?.name),
    [branding, own, tenant?.name],
  );
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

/** A shop's sign-in page refused an account from another shop (or none). */
const OTHER_SHOP = "This account isn't part of this shop. Sign in on your own shop's page.";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [branding, setBranding] = useState<StoreBranding | null>(null);
  const [brandingReady, setBrandingReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [noShop, setNoShop] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [superAdminChecked, setSuperAdminChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  // Set while a password or Google sign-in runs on a shop's sign-in page: the
  // account must belong to that shop, so the listener refuses any other one
  // instead of briefly opening another shop's dashboard.
  const terminalSignIn = useRef<string | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let unsubTenant: (() => void) | null = null;
    let unsubBranding: (() => void) | null = null;
    // Bumped on every auth change (and on unmount). Async work started for an
    // older auth state checks it before touching anything, so a slow response
    // for a user who has since signed out can't "log them back in".
    let authVersion = 0;

    const clearState = () => {
      if (unsubTenant) { unsubTenant(); unsubTenant = null; }
      if (unsubBranding) { unsubBranding(); unsubBranding = null; }
      setCurrentTenant(null);
      setTenant(null);
      setBranding(null);
      setBrandingReady(false);
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
            // A shop's sign-in page can't open an account that has no profile
            if (terminalSignIn.current || shopId) { resetSession(); return; }
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
          // A shop's sign-in page only lets in that shop's accounts
          if (terminalSignIn.current && profile.tenantId !== terminalSignIn.current) {
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
            // The shop's name, logo and colors (Store Settings), live
            unsubBranding = onSnapshot(
              brandingRef(shopId),
              (bsnap) => {
                if (version !== authVersion) return;
                setBranding(bsnap.exists() ? (bsnap.data() as StoreBranding) : null);
                setBrandingReady(true);
              },
              (err) => {
                // Not fatal: the app falls back to the JPOS look
                console.error('Branding snapshot error:', err);
                if (version === authVersion) { setBranding(null); setBrandingReady(false); }
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
      if (unsubBranding) unsubBranding();
    };
  }, []);

  const login = async (email: string, password: string, terminalSlug?: string) => {
    const shopId = terminalSlug ? await resolveTerminalShop(terminalSlug) : null;
    terminalSignIn.current = shopId;
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const userData = await fetchUserProfile(cred.user).catch(() => null);
      if (shopId && userData?.tenantId !== shopId) {
        await signOut(auth).catch(() => { /* already signed out */ });
        throw new Error(OTHER_SHOP);
      }
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
    } finally {
      terminalSignIn.current = null;
    }
  };

  /**
   * Google sign-in. A registered account opens its shop; a new Google account
   * has no shop yet and continues at /subscribe (Google already verified the email).
   */
  const loginWithGoogle = async (terminalSlug?: string) => {
    const provider = new GoogleAuthProvider();
    // Always show the account picker — POS devices are shared
    provider.setCustomParameters({ prompt: 'select_account' });
    const shopId = terminalSlug ? await resolveTerminalShop(terminalSlug) : null;
    terminalSignIn.current = shopId;
    try {
      const cred = await signInWithPopup(auth, provider);
      const userData = await fetchUserProfile(cred.user).catch(() => null);
      // A shop's sign-in page: only that shop's accounts (no new sign-ups here)
      if (shopId && userData?.tenantId !== shopId) {
        await signOut(auth).catch(() => { /* already signed out */ });
        throw new Error(OTHER_SHOP);
      }
      if (!userData) return { isNew: true };   // new owner → /subscribe
      if (!userData.isActive) {
        await signOut(auth);
        throw new Error('This account has been deactivated. Contact your administrator.');
      }
      return { isNew: false };
    } finally {
      terminalSignIn.current = null;
    }
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
    setBranding(null);
    setBrandingReady(false);
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
      currentUser, tenant, branding, brandingReady, firebaseUser, noShop, isSuperAdmin, superAdminChecked, loading,
      login, loginWithGoogle, sendSignUpCode, finishSignUp,
      logout, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
