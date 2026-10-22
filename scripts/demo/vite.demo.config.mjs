// DEMO ONLY — dev server for recording the landing-page demo video with fake data.
// Swaps Firebase/auth for scripts/demo/mocks/*. Never used by `npm run build`.
// Run from the repo root:  npx vite --config scripts/demo/vite.demo.config.mjs
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const mocks = resolve(here, 'mocks');

export default {
  root,
  plugins: [react()],
  cacheDir: resolve(root, 'node_modules/.vite-demo'),
  resolve: {
    alias: [
      // Catch both '@/contexts/AuthContext' and './contexts/AuthContext'
      { find: /^(?:@|\.{1,2})\/(?:.*\/)?contexts\/AuthContext$/, replacement: resolve(mocks, 'AuthContext.ts') },
      { find: /^(?:@|\.{1,2})\/(?:.*\/)?lib\/firebase$/, replacement: resolve(mocks, 'firebase.ts') },
      { find: /^firebase\/firestore$/, replacement: resolve(mocks, 'firestore.ts') },
      { find: /^(?:@|\.{1,2})\/(?:.*\/)?lib\/cloudinary$/, replacement: resolve(mocks, 'cloudinary.ts') },
      { find: '@', replacement: resolve(root, 'src') },
    ],
  },
  server: { port: Number(process.env.DEMO_PORT || 5399), strictPort: true },
};
