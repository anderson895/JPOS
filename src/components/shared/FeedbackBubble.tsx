import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { FirebaseError } from 'firebase/app';
import { Bug, FileText, Film, Lightbulb, Loader2, MessageSquarePlus, Paperclip, Send, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import Portal from '@/components/shared/Portal';
import FeedbackFiles from '@/components/shared/FeedbackFiles';
import {
  FEEDBACK_ACCEPT, FEEDBACK_FILE_MB, FEEDBACK_FILES_MAX, FEEDBACK_MAX, fileProblem, sendFeedback, watchMyFeedback,
} from '@/lib/feedback';
import { feedbackFilesReady } from '@/lib/cloudinary';
import { formatBytes } from '@/lib/usage';
import { cn } from '@/lib/utils';
import type { Feedback, FeedbackKind } from '@/types';

const KINDS: { id: FeedbackKind; label: string; icon: typeof Bug }[] = [
  { id: 'bug', label: 'Report a problem', icon: Bug },
  { id: 'idea', label: 'Suggest an idea', icon: Lightbulb },
];

/** What's being written: kept while the window is closed, so a click outside it loses nothing. */
interface Draft { kind: FeedbackKind; message: string; files: File[] }
const EMPTY: Draft = { kind: 'bug', message: '', files: [] };

/**
 * The round feedback button in the corner of every admin and staff page: it
 * opens a window to report a problem or suggest an idea, with screenshots or
 * files. Messages go to the Super Admin (Super Admin → Feedback). Under the
 * form: what this person sent before, and whether it was handled.
 */
export default function FeedbackBubble() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Send feedback"
        aria-label="Send feedback: report a problem or suggest an idea"
        className="fixed right-4 bottom-[calc(var(--tabbar-h,0px)+1rem)] lg:right-6 lg:bottom-6 z-20 w-14 h-14 rounded-full espresso-surface text-caramel-200 shadow-lift ring-1 ring-caramel-300/30 flex items-center justify-center hover:scale-105 hover:text-cream-50 active:scale-95 transition-transform"
      >
        <MessageSquarePlus className="w-6 h-6" aria-hidden="true" />
      </button>
      {open && <FeedbackModal draft={draft} setDraft={setDraft} onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackModal({ draft, setDraft, onClose }: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onClose: () => void;
}) {
  const { currentUser, tenant } = useAuth();
  const { kind, message, files } = draft;
  const [sending, setSending] = useState(false);
  // The file being uploaded (1, 2, 3), or 0
  const [uploading, setUploading] = useState(0);
  const [mine, setMine] = useState<Feedback[] | null>(null);
  const pickRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentUser?.id) return;
    return watchMyFeedback(currentUser.id, setMine, () => setMine([]));
  }, [currentUser?.id]);

  // Esc closes, unless a message is on its way
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  // From the file picker, or a screenshot pasted into the message box
  function addFiles(picked: File[]) {
    if (!picked.length) return;
    const next = [...files];
    for (const f of picked) {
      const problem = fileProblem(f);
      if (problem) { toast.error(problem, { id: problem }); continue; }
      if (next.length >= FEEDBACK_FILES_MAX) { toast.error(`You can add up to ${FEEDBACK_FILES_MAX} files.`, { id: 'feedback-files-max' }); break; }
      next.push(f);
    }
    set({ files: next });
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser || !tenant || !message.trim()) return;
    setSending(true);
    try {
      await sendFeedback(currentUser, tenant, kind, message, files, setUploading);
      setDraft({ ...EMPTY, kind });
      toast.success('Thank you! We got your message.');
    } catch (err) {
      console.error('[Feedback] send', err);
      toast.error(err instanceof Error && !(err instanceof FirebaseError) ? err.message : "Couldn't send. Please try again.");
    } finally {
      setSending(false);
      setUploading(0);
    }
  }

  return (
    <Portal>
      <div className="modal-backdrop" onClick={() => { if (!sending) onClose(); }}>
        <div className="modal-panel max-w-lg max-h-[92vh] overflow-y-auto" role="dialog" aria-labelledby="feedback-title" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h2 id="feedback-title" className="font-display text-2xl text-espresso-900">Feedback</h2>
              <p className="text-sm text-bark-500">Found a problem or have an idea? Tell us.</p>
            </div>
            <button onClick={onClose} disabled={sending} className="icon-btn" title="Close"><X className="w-5 h-5" /></button>
          </div>

          <form onSubmit={send} className="p-6 space-y-5">
            <div className="segmented" role="radiogroup" aria-label="What is it about?">
              {KINDS.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" role="radio" aria-checked={kind === id} disabled={sending}
                  className={cn('segmented-item min-w-0 px-2 gap-1.5 text-[13px] sm:px-4 sm:text-sm', kind === id && 'active')} onClick={() => set({ kind: id })}>
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="feedback-message" className="label">{kind === 'bug' ? 'What happened?' : "What's your idea?"}</label>
              <textarea
                id="feedback-message" rows={4} className="input min-h-28 rounded-3xl" autoFocus
                maxLength={FEEDBACK_MAX} value={message} onChange={e => set({ message: e.target.value })} disabled={sending}
                onPaste={e => {
                  const pasted = feedbackFilesReady ? Array.from(e.clipboardData.files) : [];
                  if (pasted.length) { e.preventDefault(); addFiles(pasted); }
                }}
                placeholder={kind === 'bug' ? "e.g. The receipt didn't print after a GCash sale." : 'e.g. Let me add a note to each sale.'}
              />
              {kind === 'bug' && <p className="mt-1.5 px-1 text-xs text-bark-500">Tell us what you did and what went wrong.</p>}
            </div>

            {/* Screenshots or files (hidden until the feedback Cloudinary account is set up) */}
            {feedbackFilesReady && <div className="space-y-2">
              {files.length > 0 && (
                <ul className="space-y-2">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-3 rounded-2xl border border-cream-300 bg-white/70 p-1.5 pr-2">
                      {f.type.startsWith('image/') ? <Preview file={f} /> : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream-200 text-caramel-700">
                          {f.type.startsWith('video/') ? <Film className="h-4 w-4" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-espresso-900">{f.name}</p>
                        <p className="text-xs text-bark-500">{uploading === i + 1 ? 'Uploading...' : formatBytes(f.size)}</p>
                      </div>
                      {uploading === i + 1
                        ? <Loader2 className="mx-2 h-4 w-4 animate-spin text-caramel-600" aria-hidden="true" />
                        : (
                          <button type="button" onClick={() => set({ files: files.filter((_, n) => n !== i) })} disabled={sending}
                            className="icon-btn h-8 w-8" title="Remove" aria-label={`Remove ${f.name}`}>
                            <X className="h-4 w-4" />
                          </button>
                        )}
                    </li>
                  ))}
                </ul>
              )}
              {files.length < FEEDBACK_FILES_MAX && (
                <button type="button" onClick={() => pickRef.current?.click()} disabled={sending} className="btn-secondary w-full">
                  <Paperclip className="h-4 w-4" aria-hidden="true" /> Add screenshots or files
                </button>
              )}
              <p className="px-1 text-xs text-bark-500">Up to {FEEDBACK_FILES_MAX} files, {FEEDBACK_FILE_MB} MB each.</p>
              <input
                ref={pickRef} type="file" multiple accept={FEEDBACK_ACCEPT} className="hidden" tabIndex={-1}
                onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
              />
            </div>}

            <button type="submit" className="btn-primary w-full" disabled={sending || !message.trim()}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
              {uploading ? `Uploading ${uploading} of ${files.length}...` : sending ? 'Sending...' : 'Send'}
            </button>
          </form>

          {/* What this person sent before */}
          {mine === null ? (
            <div className="flex justify-center pb-6" role="status" aria-label="Loading"><Loader2 className="w-5 h-5 animate-spin text-caramel-600" /></div>
          ) : mine.length > 0 && (
            <section className="px-6 pb-6 space-y-3">
              <h3 className="text-sm font-semibold text-espresso-800">You sent</h3>
              <ul className="space-y-2">
                {mine.map(f => (
                  <li key={f.id} className="rounded-3xl border border-cream-300 bg-white/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={f.kind === 'bug' ? 'badge-warning' : 'badge-info'}>{f.kind === 'bug' ? 'Problem' : 'Idea'}</span>
                      <span className={f.status === 'done' ? 'badge-success' : 'badge-info'}>{f.status === 'done' ? 'Done' : 'Received'}</span>
                      {f.createdAt && <span className="ml-auto text-xs text-bark-500">{format(f.createdAt.toDate(), 'MMM d, h:mm a')}</span>}
                    </div>
                    <p className="mt-2 text-sm text-espresso-900 whitespace-pre-wrap break-words">{f.message}</p>
                    {f.attachments?.length ? <div className="mt-3"><FeedbackFiles files={f.attachments} /></div> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </Portal>
  );
}

/** A small preview of a picture that hasn't been sent yet. */
function Preview({ file }: { file: File }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return src
    ? <img src={src} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover bg-cream-200" />
    : <span className="h-10 w-10 shrink-0 rounded-xl bg-cream-200" />;
}
