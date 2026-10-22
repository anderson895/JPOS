import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer, { type Transporter } from 'nodemailer';
import { ApiError } from './http.js';
import { firestoreStore, type Store } from './store.js';
import type { Message } from './mail.js';

export type Env = Record<string, string | undefined>;

export interface Mailer {
  send(to: string[], message: Message): Promise<void>;
}

export interface AuthUser {
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  disabled: boolean;
}

/** The parts of Firebase Auth (Admin SDK) the handlers use. */
export interface AuthLike {
  verifyIdToken(token: string): Promise<{ uid: string }>;
  getUser(uid: string): Promise<AuthUser>;
  generateEmailVerificationLink(email: string): Promise<string>;
}

/** Everything the handlers touch outside their own code, so tests can swap it out. */
export interface Deps {
  env: Env;
  auth: AuthLike;
  store: Store;
  /** Built on first use, so a missing Gmail setting only fails the calls that send email. */
  mailer: () => Mailer;
  now: () => Date;
}

export const notSetUp = () => new ApiError(503, 'not_configured', "Email isn't set up on the server yet. Please contact us.");

/**
 * Local test mode only (npm run dev): the Firebase emulators, which need
 * no key. Never on Vercel, and only for a "demo-" project, so a stray setting
 * can't make production trust the emulator's unsigned sign-ins.
 */
export const isLocalTest = (env: Env) =>
  !env.VERCEL && !!env.FIREBASE_AUTH_EMULATOR_HOST && (env.FIREBASE_PROJECT_ID ?? '').startsWith('demo-');

function adminApp(env: Env): App {
  const existing = getApps()[0];
  if (existing) return existing;
  if (isLocalTest(env)) return initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
  // The Admin SDK would trust the emulator's unsigned sign-ins: never on a real server
  if (env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST) {
    console.error('[api] emulator settings found outside local test mode; refusing to start');
    throw notSetUp();
  }

  // Vercel: the service account JSON (as is, or base64) in FIREBASE_SERVICE_ACCOUNT
  const raw = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (raw) {
    let account: { project_id?: string; client_email?: string; private_key?: string };
    try {
      account = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      console.error('[api] FIREBASE_SERVICE_ACCOUNT is not valid JSON');
      throw notSetUp();
    }
    return initializeApp({ credential: cert(account as Parameters<typeof cert>[0]), projectId: account.project_id });
  }
  // This computer, against production: a key file path in GOOGLE_APPLICATION_CREDENTIALS
  if (env.GOOGLE_APPLICATION_CREDENTIALS) return initializeApp({ credential: applicationDefault() });
  throw notSetUp();
}

// Module scope so a warm serverless instance reuses the open Gmail connection settings
let gmail: Transporter | undefined;

function gmailMailer(env: Env): Mailer {
  const user = env.GMAIL_USER?.trim();
  const pass = env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
  if (!user || !pass) throw notSetUp();
  // Time limits well inside the function's own, so a stalled Gmail fails fast and cleanly
  gmail ??= nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass },
    dnsTimeout: 5_000, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
  const from = { name: env.MAIL_FROM_NAME?.trim() || 'JPOS', address: user };
  return {
    async send(to, message) {
      await gmail!.sendMail({ from, to, subject: message.subject, text: message.text, html: message.html });
    },
  };
}

export interface OutboxItem extends Message {
  to: string[];
  at: string;
}

/**
 * Local test mode: emails are kept in memory (the dev server shows them at
 * /__dev/outbox) and printed, never sent. Fake test addresses never reach Gmail.
 */
export function localOutbox(): OutboxItem[] {
  const g = globalThis as { __jposOutbox?: OutboxItem[] };
  return (g.__jposOutbox ??= []);
}

function outboxMailer(): Mailer {
  return {
    async send(to, message) {
      const box = localOutbox();
      box.push({ ...message, to, at: new Date().toISOString() });
      if (box.length > 50) box.shift();
      console.log(`[local email, not sent] to ${to.join(', ')}: ${message.subject}`);
    },
  };
}

/** Made-up test addresses (juan@shop.test…) that Gmail could never deliver to. */
const isFakeAddress = (address: string) => /\.(test|example|invalid|localhost)$/i.test(address.split('@')[1] ?? '');

/**
 * Local test mode: every email lands in the local inbox. With
 * VITE_LOCAL_REAL_EMAIL=true (and Gmail set up), real addresses ALSO get a real
 * email from Gmail, so the owner can try the whole sign-up from their own inbox.
 */
function localTestMailer(env: Env): Mailer {
  const local = outboxMailer();
  if (env.VITE_LOCAL_REAL_EMAIL !== 'true' || !env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) return local;
  const real = gmailMailer(env);
  return {
    async send(to, message) {
      await local.send(to, message);
      const reachable = to.filter(a => !isFakeAddress(a));
      if (reachable.length) await real.send(reachable, message);
    },
  };
}

export function defaultDeps(env: Env = process.env): Deps {
  const app = adminApp(env);
  const auth = getAuth(app);
  return {
    env,
    auth: {
      verifyIdToken: token => auth.verifyIdToken(token),
      getUser: uid => auth.getUser(uid),
      generateEmailVerificationLink: email => auth.generateEmailVerificationLink(email),
    },
    store: firestoreStore(getFirestore(app)),
    mailer: () => (isLocalTest(env) ? localTestMailer(env) : gmailMailer(env)),
    now: () => new Date(),
  };
}
