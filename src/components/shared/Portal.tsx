import { createPortal } from 'react-dom';

/**
 * Renders children directly into <body>, escaping any ancestor that creates a
 * containing block (transform / filter / animation), which would otherwise clip
 * a `position: fixed` overlay and leave it not covering the full viewport.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}
