import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

type Props = { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean; className?: string };

export function Modal({ title, description, children, onClose, wide, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('button, input, select, textarea, a[href]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && event.target instanceof HTMLElement && event.target.closest('[role="combobox"][aria-expanded="true"]')) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') ?? [])].filter(node => node.getClientRects().length);
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-heading"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></header>
      {children}
    </div>
  </div>;
}
