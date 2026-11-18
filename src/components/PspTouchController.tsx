import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, RotateCcw, Square, Triangle, X } from 'lucide-react';
import { controlNames, defaultPspLayout, type PspControl, type PspSettings } from '../lib/psp-settings';

const buttonMasks: Partial<Record<PspControl, number>> = { cross: 1, circle: 256, square: 2, triangle: 512, l: 1024, r: 2048, select: 4, start: 8 };
export function PspTouchController({ settings, editing, onInput, onSave, onFinish }: {
  settings: PspSettings; editing: boolean;
  onInput: (buttons: number, x: number, y: number) => void;
  onSave: (settings: PspSettings) => void; onFinish: () => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const fingers = useRef(new Map<number, { mask: number; x: number; y: number }>());
  const drag = useRef<{ pointer: number; key: PspControl; left: number; top: number; x: number; y: number } | undefined>(undefined);
  const [bounds, setBounds] = useState({ width: innerWidth, height: innerHeight });
  const mode = bounds.width > bounds.height ? 'landscape' : 'portrait';
  const [draft, setDraft] = useState(settings.layout);
  const [opacity, setOpacity] = useState(settings.touchOpacity);
  const [scale, setScale] = useState(settings.touchScale);
  const layout = (editing ? draft : settings.layout)[mode] || defaultPspLayout(mode === 'landscape');
  useLayoutEffect(() => {
    const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; setBounds({ width, height }); });
    if (area.current) observer.observe(area.current);
    const reset = () => { fingers.current.clear(); onInput(0, 0, 0); };
    window.addEventListener('blur', reset);
    return () => { observer.disconnect(); window.removeEventListener('blur', reset); reset(); };
  }, [onInput]);
  useLayoutEffect(() => { if (editing) { fingers.current.clear(); onInput(0, 0, 0); setDraft(settings.layout); setOpacity(settings.touchOpacity); setScale(settings.touchScale); } }, [editing]);
  function updateInput(event: PointerEvent<HTMLDivElement>, key: PspControl, end = false) {
    event.preventDefault();
    if (end) fingers.current.delete(event.pointerId);
    else {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)));
      const y = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height / 2)));
      let mask = buttonMasks[key] || 0;
      if (key === 'dpad') mask = (x < -.25 ? 64 : x > .25 ? 128 : 0) | (y < -.25 ? 16 : y > .25 ? 32 : 0);
      fingers.current.set(event.pointerId, { mask, x: key === 'stick' ? Math.round(x * 32767) : 0, y: key === 'stick' ? Math.round(y * 32767) : 0 });
    }
    let mask = 0, x = 0, y = 0;
    for (const input of fingers.current.values()) { mask |= input.mask; x ||= input.x; y ||= input.y; }
    onInput(mask, x, y);
  }
  function start(event: PointerEvent<HTMLDivElement>, key: PspControl) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!editing) return updateInput(event, key);
    if (drag.current) return;
    drag.current = { pointer: event.pointerId, key, left: layout[key].x, top: layout[key].y, x: event.clientX, y: event.clientY };
  }
  function move(event: PointerEvent<HTMLDivElement>, key: PspControl) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (!editing) return updateInput(event, key);
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    const position = {
      x: Math.max(7, Math.min(93, active.left + (event.clientX - active.x) / bounds.width * 100)),
      y: Math.max(9, Math.min(91, active.top + (event.clientY - active.y) / bounds.height * 100)),
    };
    setDraft(value => ({ ...value, [mode]: { ...layout, [key]: position } }));
  }
  function finish(event: PointerEvent<HTMLDivElement>, key: PspControl) {
    if (drag.current?.pointer === event.pointerId) drag.current = undefined;
    if (!editing) updateInput(event, key, true);
  }
  const icons = { cross: X, circle: Circle, square: Square, triangle: Triangle };
  return <>
    <div ref={area} className={'psp-touch-controls' + (editing ? ' editing' : '')} aria-label="PSP touch controls"
      style={{ '--psp-control-opacity': opacity, '--psp-control-scale': scale } as CSSProperties}>
      {controlNames.map(key => {
        const position = layout[key];
        const Icon = icons[key as keyof typeof icons];
        return <div key={key} role="button" aria-label={key === 'stick' ? 'Analog stick' : key === 'dpad' ? 'D-pad' : key}
          tabIndex={-1} className={'psp-touch-piece psp-touch-' + key} data-psp-control={key}
          style={{ left: position.x + '%', top: position.y + '%' }}
          onPointerDown={event => start(event, key)} onPointerMove={event => move(event, key)}
          onPointerUp={event => finish(event, key)} onPointerCancel={event => finish(event, key)} onLostPointerCapture={event => finish(event, key)}>
          {key === 'dpad' ? <><ChevronUp className="up" /><ChevronLeft className="left" /><ChevronRight className="right" /><ChevronDown className="down" /></> :
            key === 'stick' ? <span /> : Icon ? <Icon size={23} strokeWidth={1.8} /> : key.toUpperCase()}
        </div>;
      })}
    </div>
    {editing && <section className="psp-control-editor" aria-label="Edit PSP controls">
      <div className="button-row"><strong>Touch layout · {mode}</strong><button className="icon-button" aria-label="Cancel controller edits" onClick={onFinish}><X size={17} /></button></div>
      <p>Drag controls to move them. Changes apply to all PSP games.</p>
      <label>Button size<input type="range" min=".65" max="1.35" step=".05" value={scale} onChange={event => setScale(Number(event.target.value))} /></label>
      <label>Opacity<input type="range" min=".15" max="1" step=".05" value={opacity} onChange={event => setOpacity(Number(event.target.value))} /></label>
      <div className="button-row"><button className="button" onClick={() => setDraft(value => ({ ...value, [mode]: defaultPspLayout(mode === 'landscape') }))}><RotateCcw size={15} />Reset</button>
        <button className="button button-primary" onClick={() => { onSave({ ...settings, layout: draft, touchOpacity: opacity, touchScale: scale }); onFinish(); }}><Check size={16} />Save for all games</button></div>
    </section>}
  </>;
}
