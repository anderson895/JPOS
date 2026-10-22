#!/usr/bin/env node
/**
 * npm run test:email [-- someone@example.com]
 * Sends ONE test email with the Gmail settings in .env, to check that the
 * Gmail address and app password work. With no address, it emails the Gmail
 * account itself. Nothing else is touched.
 */
import { readFileSync, existsSync } from 'node:fs';
import nodemailer from 'nodemailer';

// The few settings it needs, from .env (never printed)
const env = {};
for (const file of ['.env', '.env.local']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const user = (process.env.GMAIL_USER || env.GMAIL_USER || '').trim();
const pass = (process.env.GMAIL_APP_PASSWORD || env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
if (!user || !pass) {
  console.error('Put GMAIL_USER and GMAIL_APP_PASSWORD in .env first (see .env.example).');
  process.exit(1);
}
const to = process.argv[2] || user;

const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
try {
  await transport.verify();
  console.log(`Gmail sign-in OK for ${user}.`);
  await transport.sendMail({
    from: { name: 'JPOS', address: user },
    to,
    subject: 'JPOS test email',
    text: 'This is a test from JPOS. If you can read this, JPOS can send emails from this Gmail account.',
  });
  console.log(`Test email sent to ${to}. Check the inbox (and Spam).`);
} catch (err) {
  console.error('Could not send:', err instanceof Error ? err.message : err);
  console.error('Check the Gmail address and the 16-letter app password (2-Step Verification must be on).');
  process.exit(1);
}
