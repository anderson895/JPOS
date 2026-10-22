#!/usr/bin/env node
/**
 * npm run dev   (the real database: npm run dev:live)
 * Runs JPOS fully on this computer: Firebase emulators (fake data, never
 * production) + test data + the app in local test mode. Ctrl+C stops everything.
 */
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const kids = [];
// On Windows a child started through the shell has its own children (the
// emulators run in Java), so stop the whole tree or they keep the ports busy.
const stopTree = (k) => {
  if (k.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(k.pid), '/T', '/F'], { stdio: 'ignore' });
  else k.kill('SIGINT');
};
// The Firestore emulator (Java) can outlive Ctrl+C on Windows and keep port 8085 busy
const stopLeftoverEmulator = () => {
  if (process.platform !== 'win32') return;
  spawnSync('powershell', ['-NoProfile', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='java.exe'\" | Where-Object { $_.CommandLine -match 'cloud-firestore-emulator' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }",
  ], { stdio: 'ignore' });
};
let stopping = false;
const stopAll = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const k of kids) { try { stopTree(k); } catch { /* gone */ } }
  stopLeftoverEmulator();
  process.exit(code);
};
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

const portBusy = (port) => new Promise((resolve) => {
  const s = net.createConnection({ host: '127.0.0.1', port });
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('error', () => resolve(false));
});
if (await portBusy(8085)) {
  // Most likely the emulator from an earlier run: close it and carry on
  stopLeftoverEmulator();
  await new Promise(r => setTimeout(r, 2000));
}
const busy = [];
for (const port of [8085, 9099]) if (await portBusy(port)) busy.push(port);
if (busy.length) {
  console.error(`\nPort ${busy.join(' and ')} is already in use: an earlier local test is probably still running.`);
  console.error('Close it (or restart the computer), then run "npm run dev" again.');
  if (process.platform === 'win32') {
    console.error('To close it now, run this in PowerShell:');
    console.error(`  Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.CommandLine -match 'cloud-firestore-emulator' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`);
  }
  process.exit(1);
}

console.log('Starting the local Firebase emulators (first run can take a minute)...');
const emu = spawn('firebase', ['emulators:start', '--only', 'auth,firestore', '--project', 'demo-jpos'], { shell: true, stdio: ['ignore', 'pipe', 'inherit'] });
kids.push(emu);

let started = false;
emu.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  if (!started && /All emulators ready/i.test(text)) {
    started = true;
    const seed = spawn(process.execPath, ['scripts/seed-local.mjs'], { stdio: 'inherit' });
    seed.on('exit', (code) => {
      if (code !== 0) { console.error('Could not load the test data.'); stopAll(1); return; }
      const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'emulator'], { stdio: 'inherit' });
      kids.push(vite);
      vite.on('exit', () => stopAll(0));
    });
  }
});
emu.on('exit', (code) => {
  if (!started) console.error(`The emulators stopped (code ${code}). Is Java installed? Is port 8085 or 9099 busy?`);
  stopAll(started ? 0 : 1);
});
