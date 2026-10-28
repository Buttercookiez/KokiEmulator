import { useEffect, useRef, type ReactNode } from 'react';

type Props = { gameId: string; summary: ReactNode; children: ReactNode };
function reducedMotion() {
  return document.documentElement.dataset.reducedMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
/** Keep native details semantics and a closed default; animate only on user toggles. */
export function SaveGroup({ gameId, summary, children }: Props) {
  const node = useRef<HTMLDetailsElement>(null);
  const motion = useRef<Animation | null>(null);
  const intent = useRef(false);
  useEffect(() => () => { motion.current?.cancel(); }, []);
  function toggle() {
    const details = node.current; if (!details) return;
    const next = motion.current ? !intent.current : !details.open;
    intent.current = next;
    const from = details.getBoundingClientRect().height;
    motion.current?.cancel(); motion.current = null;
    if (reducedMotion() || !details.animate) { details.open = next; return; }
    details.open = true;
    const heading = details.querySelector('summary')!;
    const borders = parseFloat(getComputedStyle(details).borderTopWidth) + parseFloat(getComputedStyle(details).borderBottomWidth);
    const to = next ? details.getBoundingClientRect().height : heading.getBoundingClientRect().height + borders;
    const animation = details.animate([{ height: from + 'px' }, { height: to + 'px' }], { duration: 190, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'both' });
    motion.current = animation;
    animation.onfinish = () => {
      if (motion.current !== animation) return;
      details.open = next; motion.current = null; animation.cancel();
    };
  }
  return <details ref={node} className="save-game-group" data-game-id={gameId}>
    <summary className="save-game-heading" onClick={event => { event.preventDefault(); toggle(); }}>{summary}</summary>
    {children}
  </details>;
}
