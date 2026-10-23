// DEMO ONLY — stand-in for src/lib/firebase (no Firebase app is created).
// A signed-in demo admin, so admin-only helpers (e.g. savePaymentSettings) work.
export const auth = { currentUser: { uid: 'u1' } as { uid: string } | null };
export const db = {};
export const storage = {};
export const USE_EMULATORS = false;
// Hides the "Local test / LIVE" label from the recorded video
export const DATA_MODE = 'demo' as const;
export async function createUserWithoutSignIn() {}
export async function verifyCredentials() {}
export default {};
