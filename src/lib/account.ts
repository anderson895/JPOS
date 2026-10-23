import { EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { callApi, callPublicApi } from '@/lib/api';

/**
 * The Super Admin's sign-in email, in two steps: type the password again and
 * get a 6-digit code at the new address, then the code changes it.
 */
export async function sendEmailChangeCode(newEmail: string, password: string) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('Sign in again, then try once more.');
  // Proves it's really you: the server wants a password typed in the last few minutes
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  await user.getIdToken(true);
  await callApi('account/email-code', { email: newEmail.trim() });
}

export async function finishEmailChange(newEmail: string, code: string, password: string) {
  await callApi('account/email-finish', { email: newEmail.trim(), code });
  // A new email ends the old sign-in on Firebase's side: sign in again with it right away
  await signInWithEmailAndPassword(auth, newEmail.trim(), password);
}

/** "Forgot password?" step 1: emails a 6-digit code when a JPOS login has this email. */
export async function sendPasswordResetCode(email: string) {
  await callPublicApi('password/code', { email: email.trim() });
}

/** Step 2: the code sets the new password (the person's RFID card gets it too). */
export async function resetPassword(email: string, code: string, password: string) {
  await callPublicApi('password/reset', { email: email.trim(), code, password });
}
