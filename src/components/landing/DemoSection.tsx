import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { SectionTitle } from '@/components/shared/Decor';
import { cn } from '@/lib/utils';

export interface DemoStep {
  /** Start of the chapter, in seconds. */
  at: number;
  title: string;
  text: string;
}

interface DemoSectionProps {
  /** Video URL (public/demo: recorded with sample data, so it's safe to show to everyone). */
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
 * Walkthrough video with chapter captions, on the landing page (the owner's
 * decision of 2026-10-23: it's recorded with sample data, so it's public).
 *
 * - A clean player: no control bar; a click pauses or plays it.
 * - Loads nothing until it scrolls into view (preload="none" + IntersectionObserver),
 *   plays while visible and pauses when it leaves the screen.
 * - prefers-reduced-motion: no autoplay; the poster stays until a chapter is clicked.
 * - Chapters are real text (screen readers, search); clicking one jumps to it.
 */
export default function DemoSection({
  src, poster, steps, id = 'demo',
  title = 'See JPOS in action',
  subtitle = 'From sign-up to your first sale in under a minute.',
  note = 'Recorded with sample data. Names, orders and sales are not real.',
}: DemoSectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reducedMotion] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  // Pausing by hand keeps it paused when it scrolls back into view
  const heldRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        if ((!reducedMotion || started) && !heldRef.current) video.play().catch(() => {});
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
    heldRef.current = false;
    video.currentTime = at;
    video.play().catch(() => {});
  };
  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { heldRef.current = false; video.play().catch(() => {}); }
    else { heldRef.current = true; video.pause(); }
  };

  return (
    <section id={id} className="relative bg-cream-100 py-10 sm:py-16 lg:py-20 scroll-mt-16 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        <SectionTitle title={title} subtitle={subtitle} />

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.65fr_1fr] items-start">
          {/* Player — deliberately without controls */}
          <figure>
            <div className="rounded-4xl p-1.5 sm:p-2 bg-gradient-to-br from-caramel-300/70 via-cream-300 to-caramel-500/50 shadow-lift">
              <div className="relative overflow-hidden rounded-3xl bg-espresso-950 aspect-video">
                <video
                  ref={videoRef}
                  onClick={toggle}
                  className="block w-full h-full object-cover select-none cursor-pointer"
                  muted
                  loop
                  playsInline
                  preload="none"
                  poster={poster}
                  disablePictureInPicture
                  disableRemotePlayback
                  controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
                  onContextMenu={e => e.preventDefault()}
                  aria-label="Walkthrough video: a shop owner signs up, confirms the email code, adds two products, sells them at the point of sale, gets a receipt and sees the sale on the dashboard."
                  onPlay={() => { setStarted(true); setPaused(false); }}
                  onPause={() => setPaused(true)}
                  onTimeUpdate={onTimeUpdate}
                >
                  <source src={src} type="video/mp4" />
                </video>
                {/* Paused by hand (or not started): a play button over the picture */}
                {(paused || !started) && (
                  <button
                    type="button"
                    onClick={toggle}
                    aria-label="Play the walkthrough"
                    className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-espresso-900/80 text-cream-50 shadow-lift transition-transform hover:scale-105"
                  >
                    <Play className="ml-1 h-7 w-7" fill="currentColor" aria-hidden="true" />
                  </button>
                )}
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
