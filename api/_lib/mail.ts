import type { PaymentRequestDoc } from './store.js';
import { CODE_TTL_MS } from './signupCode.js';
import { LOGO_CID } from './emailLogo.js';

export interface Message {
  subject: string;
  text: string;
  html: string;
}

const PLAN_LABEL: Record<string, string> = { starter: 'Starter', business: 'Business', enterprise: 'Enterprise' };

/** Shop names, people's names and references come from users: never let them become HTML. */
const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
/** One short line (for subjects and greetings): no line breaks. */
const oneLine = (value: unknown, max: number) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
const peso = (amount: number) => `₱${Number(amount).toLocaleString('en-PH')}`;
/** Only a picture uploaded to JPOS's own Cloudinary account counts as a receipt link. */
export function isReceiptUrl(url: unknown, cloudName: string | undefined): url is string {
  if (typeof url !== 'string' || !cloudName) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' && !u.username && !u.password && !u.port
      && u.pathname.startsWith(`/${cloudName}/image/upload/`);
  } catch {
    return false;
  }
}

/** The JPOS colors (the app's default espresso theme). */
const C = {
  espresso: '#3f2616', ink: '#2c1a0f', caramel: '#cc8745', caramelLight: '#e9bb7e',
  paper: '#fffcf7', cream: '#fdf7ee', page: '#f8eddd', line: '#f1e0c8', muted: '#725843',
};
const SANS = 'Arial,Helvetica,sans-serif';
const SERIF = "Georgia,'Times New Roman',serif";

/**
 * A complete HTML page (charset, language, title): half-made HTML is one of the
 * things spam filters look at. The design follows the app: an espresso header
 * with the JPOS logo, a caramel line, a cream card. Tables and inline styles,
 * so it looks the same in Gmail, Outlook and phone mail apps. The logo travels
 * inside the email (cid:), so nothing is loaded from the web; no tracking.
 * `preview` is the short line inboxes show next to the subject.
 */
function layout(heading: string, inner: string, preview = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.page};font-family:${SANS};color:${C.ink}">
${preview ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page}">${esc(preview)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="background:${C.espresso};border-radius:20px 20px 0 0;padding:20px 28px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:14px;vertical-align:middle"><img src="cid:${LOGO_CID}" width="56" height="56" alt="JPOS" style="display:block;width:56px;height:56px;border:0;border-radius:50%;background:${C.cream}"></td>
<td style="vertical-align:middle"><p style="margin:0;font-family:${SERIF};font-size:26px;font-weight:bold;letter-spacing:1px;color:${C.cream}">JPOS</p>
<p style="margin:2px 0 0;font-family:${SANS};font-size:12px;letter-spacing:1px;color:${C.caramelLight}">POINT OF SALE</p></td>
</tr></table>
</td></tr>
<tr><td style="height:4px;background:${C.caramel};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="background:${C.paper};border:1px solid ${C.line};border-top:0;border-radius:0 0 20px 20px;padding:28px;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.ink}">
<h1 style="margin:0 0 14px;font-family:${SERIF};font-size:24px;line-height:1.3;font-weight:bold;color:${C.ink}">${esc(heading)}</h1>
${inner}
</td></tr>
<tr><td align="center" style="padding:20px 8px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted}">
<strong style="color:${C.espresso}">JPOS</strong> · Point of Sale for small businesses
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${esc(href)}" style="display:inline-block;background:${C.espresso};color:${C.cream};text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:bold">${esc(label)}</a></p>`;

/** The 6-digit code, big, in a cream box in the middle. */
const codeBlock = (code: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${C.cream};border:1px solid ${C.line};border-bottom:3px solid ${C.caramel};border-radius:16px;padding:16px 26px;font-family:${SANS};font-size:34px;font-weight:bold;letter-spacing:10px;color:${C.espresso}">${esc(code)}</td></tr></table>
</td></tr></table>`;

const small = (text: string) => `<p style="margin:0 0 6px;font-size:13px;color:${C.muted}">${text}</p>`;

/**
 * The 6-digit code a new shop owner types to finish signing up (and on "Send a
 * new code"). Nobody has confirmed this address yet, so the email carries no
 * text from the sign-up form: it can't be used to send someone else's message.
 */
export function signupCodeMessage({ code }: { code: string }): Message {
  const minutes = Math.round(CODE_TTL_MS / 60_000);
  return {
    subject: `Your JPOS code: ${code}`,
    text: [
      'Hi,',
      '',
      'Enter this code on the JPOS sign-up page to finish creating your account:',
      '',
      code,
      '',
      `It works for ${minutes} minutes.`,
      "If you didn't sign up for JPOS, you can ignore this email.",
      '',
      'JPOS',
    ].join('\n'),
    html: layout('Your sign-up code', `
<p style="margin:0 0 8px">Hi,</p>
<p style="margin:0">Enter this code on the JPOS sign-up page to finish creating your account:</p>
${codeBlock(code)}
${small(`It works for ${minutes} minutes.`)}
${small("If you didn't sign up for JPOS, you can ignore this email.")}`, `Your code is ${code}. It works for ${minutes} minutes.`),
  };
}

/**
 * Sent to the new address when the Super Admin changes their sign-in email.
 * No links, and no text from the request (like the sign-up code).
 */
export function emailChangeCodeMessage({ code }: { code: string }): Message {
  const minutes = Math.round(CODE_TTL_MS / 60_000);
  return {
    subject: `Your JPOS code: ${code}`,
    text: [
      'Hi,',
      '',
      'Enter this code in JPOS to make this your new sign-in email:',
      '',
      code,
      '',
      `It works for ${minutes} minutes.`,
      "If you didn't ask to change your JPOS email, you can ignore this email.",
      '',
      'JPOS',
    ].join('\n'),
    html: layout('Confirm your new email', `
<p style="margin:0 0 8px">Hi,</p>
<p style="margin:0">Enter this code in JPOS to make this your new sign-in email:</p>
${codeBlock(code)}
${small(`It works for ${minutes} minutes.`)}
${small("If you didn't ask to change your JPOS email, you can ignore this email.")}`, `Your code is ${code}. It works for ${minutes} minutes.`),
  };
}

/** Sent to the Super Admin when a shop sends a payment and receipt. */
export function paymentNoticeMessage(request: PaymentRequestDoc, adminUrl: string, cloudName?: string): Message {
  const plan = PLAN_LABEL[request.plan] ?? oneLine(request.plan, 20);
  const shop = oneLine(request.tenantName, 60);
  const rows: [string, string][] = [
    ['Shop', shop],
    ['Package', plan],
    ['Amount', peso(request.amount)],
    ['Paid with', oneLine(request.channelLabel, 40)],
    ['Reference no.', oneLine(request.reference, 40)],
    ['Sent by', oneLine(request.requesterName, 60)],
  ];
  const proof = isReceiptUrl(request.proofUrl, cloudName) ? request.proofUrl : null;
  return {
    subject: `New payment: ${oneLine(shop, 40)} · ${plan} · ${peso(request.amount)}`,
    text: [
      'A shop sent a payment. Check it in your e-wallet, then approve or reject it in Super Admin.',
      '',
      ...rows.map(([k, v]) => `${k}: ${v}`),
      '', proof ? `Receipt: ${proof}` : 'The receipt picture is in Super Admin.',
      '',
      `Open Super Admin: ${adminUrl}`,
    ].join('\n'),
    html: layout('New payment to check', `
<p style="margin:0 0 12px">A shop sent a payment. Check it in your e-wallet, then approve or reject it in Super Admin.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${C.cream};border:1px solid ${C.line};border-radius:14px;font-size:14px">
${rows.map(([k, v], i) => `<tr><td style="padding:9px 14px;color:${C.muted};width:40%;${i ? `border-top:1px solid ${C.line};` : ''}">${esc(k)}</td><td style="padding:9px 14px;font-weight:bold;${i ? `border-top:1px solid ${C.line};` : ''}">${esc(v)}</td></tr>`).join('\n')}
</table>
${proof
    ? `<p style="margin:14px 0 0"><a href="${esc(proof)}" style="color:${C.caramel};font-weight:bold">View the receipt</a></p>`
    : `<p style="margin:14px 0 0;color:${C.muted}">The receipt picture is in Super Admin.</p>`}
${button(adminUrl, 'Open Super Admin')}`, `${shop} · ${plan} · ${peso(request.amount)}`),
  };
}
