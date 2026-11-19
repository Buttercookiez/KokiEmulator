import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, RotateCcw, Square, Triangle, X } from 'lucide-react';
import { dpadDirections } from '../lib/mobile-play';
import { controlNames, defaultPspLayout, type PspControl, type PspSettings } from '../lib/psp-settings';

const directions = { up: ChevronUp, left: ChevronLeft, right: ChevronRight, down: ChevronDown };
const directionMasks = { up: 16, down: 32, left: 64, right: 128 };
const buttonMasks: Partial<Record<PspControl, number>> = { cross: 1, circle: 256, square: 2, triangle: 512, l: 1024, r: 2048, select: 4, start: 8 };
export function PspTouchController({ settings, editing, onInput, onSave, onFinish }: {
  settings: PspSettings; editing: boolean;
  onInput: (buttons: number, x: number, y: number) => void;
  onSave: (settings: PspSettings) => void; onFinish: () => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const fingers = useRef(new Map<number, { key: PspControl; mask: number; x: number; y: number }>());
  const knob = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ pointer: number; key: PspControl; left: number; top: number; x: number; y: number } | undefined>(undefined);
  const [pressed, setPressed] = useState(0);
  const [draft, setDraft] = useState(settings.layout.landscape);
  const [opacity, setOpacity] = useState(settings.touchOpacity);
  const [scale, setScale] = useState(settings.touchScale);
  const layout = (editing ? draft : settings.layout.landscape) || defaultPspLayout();
  function sendInput() {
    let mask = 0, x = 0, y = 0;
    for (const input of fingers.current.values()) {
      mask |= input.mask;
      if (input.key === 'stick') { x = input.x; y = input.y; }
    }
    setPressed(mask);
    if (knob.current) knob.current.style.transform = `translate(${x / 32767 * 32}%, ${y / 32767 * 32}%)`;
    onInput(mask, x, y);
  }
  useLayoutEffect(() => {
    const reset = () => { fingers.current.clear(); sendInput(); };
    window.addEventListener('blur', reset);
    return () => { window.removeEventListener('blur', reset); fingers.current.clear(); onInput(0, 0, 0); };
  }, [onInput]);
  useLayoutEffect(() => {
    if (!editing) return;
    fingers.current.clear();
    sendInput();
    setDraft(settings.layout.landscape);
    setOpacity(settings.touchOpacity);
    setScale(settings.touchScale);
  }, [editing]);
  function updateInput(event: PointerEvent<HTMLDivElement>, key: PspControl) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    let mask = buttonMasks[key] || 0, stickX = 0, stickY = 0;
    if (key === 'dpad') {
      for (const direction of dpadDirections(x, y)) mask |= directionMasks[direction as keyof typeof directionMasks] ?? 0;
    }
    if (key === 'stick') {
      const radius = Math.max(1, Math.hypot(x, y));
      stickX = Math.round(x / radius * 32767);
      stickY = Math.round(y / radius * 32767);
    }
    fingers.current.set(event.pointerId, { key, mask, x: stickX, y: stickY });
    sendInput();
  }
  function start(event: PointerEvent<HTMLDivElement>, key: PspControl) {
    event.preventDefault();
    if (editing ? drag.current : (key === 'stick' && [...fingers.current.values()].some(input => input.key === 'stick'))) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!editing) return updateInput(event, key);
    drag.current = { pointer: event.pointerId, key, left: layout[key].x, top: layout[key].y, x: event.clientX, y: event.clientY };
  }
  function move(event: PointerEvent<HTMLDivElement>, key: PspControl) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (!editing) { if (fingers.current.has(event.pointerId)) updateInput(event, key); return; }
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    const bounds = area.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    const position = {
      x: Math.max(7, Math.min(93, active.left + (event.clientX - active.x) / bounds.width * 100)),
      y: Math.max(9, Math.min(91, active.top + (event.clientY - active.y) / bounds.height * 100)),
    };
    setDraft(value => ({ ...(value || defaultPspLayout()), [key]: position }));
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointer === event.pointerId) drag.current = undefined;
    if (fingers.current.delete(event.pointerId)) sendInput();
  }
  const icons = { cross: X, circle: Circle, square: Square, triangle: Triangle };
  return <>
    <div ref={area} className={'psp-touch-controls' + (editing ? ' editing' : '')} aria-label="PSP touch controls"
      style={{ '--psp-control-opacity': opacity, '--psp-control-scale': scale } as CSSProperties}>
      {controlNames.map(key => {
        const position = layout[key];
        const Icon = icons[key as keyof typeof icons];
        return <div key={key} role="button" aria-label={key === 'stick' ? 'Analog stick' : key === 'dpad' ? 'D-pad' : key}
          tabIndex={-1} className={'psp-touch-piece psp-touch-' + key + (key === 'dpad' ? ' touch-dpad' : '') + ((pressed & (buttonMasks[key] || 0)) ? ' pressed' : '')} data-psp-control={key}
          style={{ left: position.x + '%', top: position.y + '%' }}
          onPointerDown={event => start(event, key)} onPointerMove={event => move(event, key)}
          onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
          {key === 'dpad' ? <>{Object.entries(directions).map(([direction, Arrow]) =>
            <span key={direction} className={`touch-button ${direction}${pressed & directionMasks[direction as keyof typeof directionMasks] ? ' pressed' : ''}`} aria-hidden="true"><Arrow size={22} /></span>)}
            <span className="dpad-center" /></> :
            key === 'stick' ? <span ref={knob} /> : Icon ? <Icon size={23} strokeWidth={1.8} /> : key.toUpperCase()}
        </div>;
      })}
    </div>
    {editing && <section className="psp-control-editor" aria-label="Edit PSP controls">
      <div className="button-row"><strong>Touch layout</strong><button className="icon-button" aria-label="Cancel controller edits" onClick={onFinish}><X size={17} /></button></div>
      <p>Drag controls to move them. Changes apply to all PSP games.</p>
      <label>Button size<input type="range" min=".65" max="1.35" step=".05" value={scale} onChange={event => setScale(Number(event.target.value))} /></label>
      <label>Opacity<input type="range" min=".15" max="1" step=".05" value={opacity} onChange={event => setOpacity(Number(event.target.value))} /></label>
      <div className="button-row"><button className="button" onClick={() => setDraft(defaultPspLayout())}><RotateCcw size={15} />Reset</button>
        <button className="button button-primary" onClick={() => { onSave({ ...settings, layout: { landscape: draft }, touchOpacity: opacity, touchScale: scale }); onFinish(); }}><Check size={16} />Save for all games</button></div>
    </section>}
  </>;
}
