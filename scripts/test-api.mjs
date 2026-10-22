// Runs the /api unit tests: bundles api/_tests/*.test.ts with esbuild (already
// installed as part of Vite) and hands them to Node's built-in test runner.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const testsDir = path.join(root, 'api', '_tests');
const outDir = path.join(root, 'node_modules', '.cache', 'api-tests');
mkdirSync(outDir, { recursive: true });

const entries = readdirSync(testsDir).filter(f => f.endsWith('.test.ts')).map(f => path.join(testsDir, f));
await build({
  entryPoints: entries,
  outdir: outDir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
});

const files = entries.map(e => path.join(outDir, path.basename(e).replace(/\.ts$/, '.mjs')));
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
