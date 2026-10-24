import { FileText, Film } from 'lucide-react';
import type { FeedbackFile } from '@/types';

/** Screenshots and files sent with feedback: pictures as small previews, other files by name. Each opens in a new tab. */
export default function FeedbackFiles({ files }: { files: FeedbackFile[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <li key={i} className="min-w-0 max-w-full">
          <a
            href={f.url} target="_blank" rel="noopener noreferrer" title={f.name}
            className="flex max-w-[240px] items-center gap-2 rounded-2xl border border-cream-300 bg-white/70 p-1.5 pr-3 text-xs text-espresso-800 transition-colors hover:border-caramel-400 hover:bg-white"
          >
            {f.type.startsWith('image/')
              ? <img src={f.url} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-xl object-cover bg-cream-200" />
              : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream-200 text-caramel-700">
                  {f.type.startsWith('video/') ? <Film className="h-4 w-4" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
                </span>
              )}
            <span className="truncate">{f.name}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
