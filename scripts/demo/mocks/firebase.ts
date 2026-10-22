// DEMO ONLY — stand-in for src/lib/firebase (no Firebase app is created).
// A signed-in demo admin, so admin-only helpers (e.g. savePaymentSettings) work.
export const auth = { currentUser: { uid: 'u1' } as { uid: string } | null };
export const db = {};
export const storage = {};
export async function createUserWithoutSignIn() {}
export async function verifyCredentials() {}
export default {};
