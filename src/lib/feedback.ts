import {
  addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FILE_MAX_BYTES, uploadFeedbackFile } from '@/lib/cloudinary';
import type { Feedback, FeedbackFile, FeedbackKind, Tenant, User } from '@/types';

/**
 * Feedback: anyone in a shop reports a problem or suggests an idea, and the
 * Super Admin reads them (Super Admin → Feedback). Same limits as firestore.rules.
 */
export const FEEDBACK_MAX = 2000;
/** Screenshots or files per message, and their size (pictures are made smaller first). */
export const FEEDBACK_FILES_MAX = 3;
export const FEEDBACK_FILE_MB = FILE_MAX_BYTES / (1024 * 1024);
/** The file picker's filter: pictures, videos, PDFs and common documents. */
export const FEEDBACK_ACCEPT = 'image/*,video/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx';
const DOCUMENT = /\.(pdf|txt|csv|docx?|xlsx?)$/i;
// Pictures bigger than this can't be made small enough reliably
const PICTURE_MAX_BYTES = 30 * 1024 * 1024;

/** Why this file can't be attached (plain words), or null. */
export function fileProblem(file: File): string | null {
  const picture = file.type.startsWith('image/') && file.type !== 'image/svg+xml';
  if (!picture && !file.type.startsWith('video/') && !DOCUMENT.test(file.name)) {
    return `${file.name} can't be added. Use a picture, a video, a PDF or a document.`;
  }
  if (file.size > (picture ? PICTURE_MAX_BYTES : FILE_MAX_BYTES)) return `${file.name} is too big. Use files of ${FEEDBACK_FILE_MB} MB or less.`;
  return null;
}

const col = () => collection(db, 'feedback');
const newestFirst = (a: Feedback, b: Feedback) => (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now());
const rows = (docs: { id: string; data(): object }[]) => docs.map(d => ({ id: d.id, ...d.data() }) as Feedback).sort(newestFirst);

/**
 * Uploads the files one by one (`onUpload`: the file being uploaded, 1, 2, 3,
 * then 0), then saves the message. A failed upload stops before anything is
 * saved, so the person can try again.
 */
export async function sendFeedback(
  user: User, shop: Pick<Tenant, 'id' | 'name'>, kind: FeedbackKind, message: string,
  files: File[] = [], onUpload?: (n: number) => void,
) {
  const text = message.trim();
  if (!text) throw new Error('Write a few words first.');
  if (text.length > FEEDBACK_MAX) throw new Error(`Keep it to ${FEEDBACK_MAX.toLocaleString()} letters or fewer.`);
  if (files.length > FEEDBACK_FILES_MAX) throw new Error(`You can add up to ${FEEDBACK_FILES_MAX} files.`);
  for (const f of files) { const problem = fileProblem(f); if (problem) throw new Error(problem); }
  const attachments: FeedbackFile[] = [];
  for (const [i, f] of files.entries()) {
    onUpload?.(i + 1);
    const { url, bytes } = await uploadFeedbackFile(f);
    attachments.push({ url, name: f.name.slice(0, 120) || 'file', type: (f.type || 'application/octet-stream').slice(0, 100), bytes });
  }
  onUpload?.(0);
  await addDoc(col(), {
    kind,
    message: text,
    tenantId: user.tenantId,
    shopName: (shop.name ?? '').slice(0, 80),
    uid: user.id,
    name: (user.displayName ?? '').slice(0, 60),
    email: (user.email ?? '').slice(0, 254),
    role: user.role,
    ...(attachments.length ? { attachments } : {}),
    status: 'new',
    createdAt: serverTimestamp(),
  });
}

/** What this person sent, newest first (sorted here, so no extra database index is needed). */
export function watchMyFeedback(uid: string, cb: (rows: Feedback[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(query(col(), where('uid', '==', uid)), snap => cb(rows(snap.docs)), e => onError?.(e));
}

/** Super Admin: the latest messages from every shop. */
export function watchAllFeedback(cb: (rows: Feedback[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(query(col(), orderBy('createdAt', 'desc'), limit(200)), snap => cb(rows(snap.docs)), e => onError?.(e));
}

/** Super Admin: how many messages aren't handled yet. */
export function watchNewFeedbackCount(cb: (count: number) => void): Unsubscribe {
  return onSnapshot(query(col(), where('status', '==', 'new')), snap => cb(snap.size), () => cb(0));
}

export const setFeedbackStatus = (id: string, status: Feedback['status']) => updateDoc(doc(db, 'feedback', id), { status });
export const deleteFeedback = (id: string) => deleteDoc(doc(db, 'feedback', id));
