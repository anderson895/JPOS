import type { PaymentRequestDoc } from './store.js';
import { CODE_TTL_MS } from './signupCode.js';

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

/**
 * A complete, plain HTML page (charset, language, title): half-made HTML is one
 * of the things spam filters look at. No images, no tracking.
 */
function layout(heading: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;background:#f6efe6;font-family:Arial,Helvetica,sans-serif;color:#2b1a10">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#3b2314">JPOS</p>
<div style="background:#ffffff;border:1px solid #eadccb;border-radius:16px;padding:24px">
<h1 style="margin:0 0 12px;font-size:20px;color:#2b1a10">${esc(heading)}</h1>
${inner}
</div>
<p style="margin:16px 0 0;font-size:12px;color:#8a6f5a">JPOS · Point of Sale for small businesses</p>
</div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;background:#3b2314;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">${esc(label)}</a></p>`;

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
<p style="margin:20px 0;font-size:34px;font-weight:bold;letter-spacing:8px;color:#3b2314">${esc(code)}</p>
<p style="margin:0;font-size:13px;color:#6b5444">It works for ${minutes} minutes.</p>
<p style="margin:16px 0 0;font-size:13px;color:#6b5444">If you didn't sign up for JPOS, you can ignore this email.</p>`),
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
<table style="border-collapse:collapse;width:100%;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#6b5444;width:40%">${esc(k)}</td><td style="padding:6px 0;font-weight:bold">${esc(v)}</td></tr>`).join('\n')}
</table>
${proof
    ? `<p style="margin:12px 0 0"><a href="${esc(proof)}" style="color:#9a5b2a">View the receipt</a></p>`
    : '<p style="margin:12px 0 0;color:#6b5444">The receipt picture is in Super Admin.</p>'}
${button(adminUrl, 'Open Super Admin')}`),
  };
}
