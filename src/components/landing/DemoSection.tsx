import { useEffect, useRef, useState } from 'react';
import { SectionTitle } from '@/components/shared/Decor';
import { cn } from '@/lib/utils';

export interface DemoStep {
  /** Start of the chapter, in seconds. */
  at: number;
  title: string;
  text: string;
}

interface DemoSectionProps {
  /** Video URL. The tutorial is CONFIDENTIAL: serve it from protected storage, never from public/. */
  src: string;
  poster: string;
  steps: DemoStep[];
  id?: string;
  title?: string;
  subtitle?: string;
  /** Small note under the player, e.g. "Recorded with sample data." */
  note?: string;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Tutorial video with chapter captions.
 * NOT on the public landing page: the video shows the admin side and is for
 * subscribers only (kept for the in-app Help page; see docs/frontend/CHANGELOG.md §16).
 *
 * - No player controls (no download, speed, picture-in-picture or play/pause menu),
 *   and right-click is disabled on the video. That only hides the UI: anyone with
 *   the URL can still fetch the file, which is why it must stay behind login.
 * - Loads nothing until it scrolls into view (preload="none" + IntersectionObserver),
 *   plays while visible and pauses when it leaves the screen.
 * - prefers-reduced-motion: no autoplay; the poster stays until a chapter is clicked.
 * - Chapters are real text (screen readers, search); clicking one jumps to it.
 */
export default function DemoSection({
  src, poster, steps, id = 'demo',
  title = 'See JPOS in action',
  subtitle = 'A one-minute tour, from sign-in to sales reports.',
  note = 'Recorded with sample data. Names, orders and sales are not real.',
}: DemoSectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reducedMotion] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        if (!reducedMotion || started) video.play().catch(() => {});
      } else if (!video.paused) {
        video.pause();
      }
    }, { threshold: [0, 0.5] });
    io.observe(video);
    return () => io.disconnect();
  }, [reducedMotion, started]);

  const onTimeUpdate = () => {
    const t = videoRef.current?.currentTime ?? 0;
    let i = 0;
    steps.forEach((s, idx) => { if (s.at <= t) i = idx; });
    setStep(i);
  };
  const seek = (at: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = at;
    video.play().catch(() => {});
  };

  return (
    <section id={id} className="relative bg-cream-100 py-16 lg:py-20 scroll-mt-16 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        <SectionTitle title={title} subtitle={subtitle} />

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.65fr_1fr] items-start">
          {/* Player — deliberately without controls */}
          <figure>
            <div className="rounded-4xl p-1.5 sm:p-2 bg-gradient-to-br from-caramel-300/70 via-cream-300 to-caramel-500/50 shadow-lift">
              <div className="relative overflow-hidden rounded-3xl bg-espresso-950 aspect-video">
                <video
                  ref={videoRef}
                  className="block w-full h-full object-cover select-none"
                  muted
                  loop
                  playsInline
                  preload="none"
                  poster={poster}
                  disablePictureInPicture
                  disableRemotePlayback
                  controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
                  onContextMenu={e => e.preventDefault()}
                  aria-label="Tutorial video: a cashier signs in, takes an order with a discount, checks out with cash and prints a receipt; then the dashboard, reports and staff pages."
                  onPlay={() => setStarted(true)}
                  onTimeUpdate={onTimeUpdate}
                >
                  <source src={src} type="video/mp4" />
                </video>
              </div>
            </div>
            {note && <figcaption className="mt-3 text-center text-xs text-bark-500">{note}</figcaption>}
          </figure>

          {/* Chapters: real text for screen readers and search engines; click to jump */}
          <ol className="space-y-1.5" aria-label="What the video shows">
            {steps.map((s, i) => (
              <li key={s.title}>
                <button
                  onClick={() => seek(s.at)}
                  aria-current={started && i === step ? 'step' : undefined}
                  className={cn(
                    'w-full text-left flex items-start gap-3 rounded-2xl px-3 py-2.5 border transition-all',
                    started && i === step
                      ? 'bg-cream-50 border-caramel-400/70 shadow-card'
                      : 'border-transparent hover:bg-cream-50/70 hover:border-cream-300',
                  )}
                >
                  <span className={cn(
                    'mt-0.5 w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold',
                    started && i === step ? 'bg-espresso-800 text-caramel-200' : 'bg-cream-200 text-bark-600',
                  )}>
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-sm text-espresso-900">{s.title}</span>
                      <span className="font-mono text-[11px] text-bark-400">{fmt(s.at)}</span>
                    </span>
                    <span className="block text-xs text-bark-500 leading-relaxed">{s.text}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
