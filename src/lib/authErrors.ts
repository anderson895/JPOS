import { FirebaseError } from 'firebase/app';

/**
 * Maps Firebase Auth error codes to friendly, user-facing messages.
 * Falls back to the raw message (or a generic line) for anything unmapped.
 */
const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address is not valid.',
  'auth/user-disabled': 'This account has been disabled. Contact your administrator.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-login-credentials': 'Incorrect email or password.',
  'auth/missing-password': 'Please enter your password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase (Authentication → Sign-in method).',
  // Google sign-in
  'auth/popup-blocked': 'The Google sign-in window was blocked. Allow pop-ups for this site, then try again.',
  'auth/account-exists-with-different-credential': 'This email already signs in with a password. Use your email and password instead.',
  'auth/unauthorized-domain': 'Google sign-in is not allowed on this website yet. Add the domain in Firebase → Authentication → Settings → Authorized domains.',
  'auth/operation-not-supported-in-this-environment': 'Google sign-in is not supported in this browser. Use your email and password instead.',
};

/** Error codes for a Google sign-in the user backed out of — not worth an error toast. */
export const CANCELLED_SIGN_IN_CODES = [
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
];

export function getAuthErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof FirebaseError) {
    return AUTH_MESSAGES[err.code] ?? err.message ?? fallback;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
