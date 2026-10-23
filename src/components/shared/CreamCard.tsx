import { SageBubble } from '@/components/shared/Decor';
import { cn } from '@/lib/utils';

/**
 * The cream card of the landing page's sign-in box, with soft sage circles in
 * its corner (like the landing photo). Sign-in, sign-up and the email code all
 * use it, so they match.
 */
export default function CreamCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-4xl border border-white/80 px-6 py-7 sm:px-8 sm:py-8',
        'shadow-[0_30px_60px_-28px_rgb(var(--espresso-900)/0.45)]',
        className,
      )}
      style={{ background: 'linear-gradient(165deg, #fffaf2 0%, #faf0e2 55%, #f3e3cc 100%)' }}
    >
      {/* Two overlapping circles, top-right corner */}
      <SageBubble className="-right-16 -top-20 h-44 w-44" />
      <SageBubble className="-right-4 -top-28 h-40 w-40 bg-sage-200/60" />
      <div className="relative">{children}</div>
    </div>
  );
}
