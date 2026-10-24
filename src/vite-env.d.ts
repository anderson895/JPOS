/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUDINARY_CLOUD_NAME: string;
  readonly VITE_CLOUDINARY_UPLOAD_PRESET: string;
  readonly VITE_CLOUDINARY_API_URL: string;
  /** The separate Cloudinary account for feedback screenshots and files. */
  readonly VITE_CLOUDINARY_ISSUES_CLOUD_NAME?: string;
  readonly VITE_CLOUDINARY_ISSUES_UPLOAD_PRESET?: string;

  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
  /** Local test only: 'true' = real addresses also get a real email from Gmail */
  readonly VITE_LOCAL_REAL_EMAIL?: string;
  /** Local test only: other emulator addresses (default 127.0.0.1:9099 and :8085) */
  readonly VITE_AUTH_EMULATOR_HOST?: string;
  readonly VITE_FIRESTORE_EMULATOR_HOST?: string;
  /** 'true' only in local test mode (npm run dev) */
  readonly VITE_USE_EMULATORS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
