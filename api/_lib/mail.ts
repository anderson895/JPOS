import type { PaymentRequestDoc } from './store.js';

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
const isHttps = (url: unknown): url is string => typeof url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(url);

function layout(heading: string, inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6efe6;font-family:Arial,Helvetica,sans-serif;color:#2b1a10">
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

/** Sent when a new shop owner signs up (and on "Send the email again"). */
export function verifyEmailMessage({ name, link }: { name?: string; link: string }): Message {
  const first = oneLine(name, 60);
  const hi = first ? `Hi ${first},` : 'Hi,';
  return {
    subject: 'Confirm your email for JPOS',
    text: [
      hi,
      '',
      'Open this link to confirm your email and finish setting up your shop:',
      link,
      '',
      "If you didn't sign up for JPOS, you can ignore this email.",
      '',
      'JPOS',
    ].join('\n'),
    html: layout('Confirm your email', `
<p style="margin:0 0 8px">${esc(hi)}</p>
<p style="margin:0">Tap the button to confirm your email and finish setting up your shop.</p>
${button(link, 'Confirm my email')}
<p style="margin:0;font-size:13px;color:#6b5444">If the button doesn't work, copy this link into your browser:<br>
<a href="${esc(link)}" style="color:#9a5b2a;word-break:break-all">${esc(link)}</a></p>
<p style="margin:16px 0 0;font-size:13px;color:#6b5444">If you didn't sign up for JPOS, you can ignore this email.</p>`),
  };
}

/** Sent to the Super Admin when a shop sends a payment and receipt. */
export function paymentNoticeMessage(request: PaymentRequestDoc, adminUrl: string): Message {
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
  const proof = isHttps(request.proofUrl) ? request.proofUrl : null;
  return {
    subject: `New payment: ${oneLine(shop, 40)} · ${plan} · ${peso(request.amount)}`,
    text: [
      'A shop sent a payment. Check it in your e-wallet, then approve or reject it in Super Admin.',
      '',
      ...rows.map(([k, v]) => `${k}: ${v}`),
      ...(proof ? ['', `Receipt: ${proof}`] : []),
      '',
      `Open Super Admin: ${adminUrl}`,
    ].join('\n'),
    html: layout('New payment to check', `
<p style="margin:0 0 12px">A shop sent a payment. Check it in your e-wallet, then approve or reject it in Super Admin.</p>
<table style="border-collapse:collapse;width:100%;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#6b5444;width:40%">${esc(k)}</td><td style="padding:6px 0;font-weight:bold">${esc(v)}</td></tr>`).join('\n')}
</table>
${proof ? `<p style="margin:12px 0 0"><a href="${esc(proof)}" style="color:#9a5b2a">View the receipt</a></p>` : ''}
${button(adminUrl, 'Open Super Admin')}`),
  };
}
