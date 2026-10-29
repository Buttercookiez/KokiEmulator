import { IS_NDS, SYSTEM } from '../platform';
import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ButtonHTMLAttributes } from 'react';
import { Check, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import type { EmulatorButton, Settings } from '../types';
import { defaultTouchLayout, touchPreset, normalizeTouchLayouts, touchRect, TOUCH_GROUPS, TOUCH_NAMES, type TouchGroup } from '../lib/touch-layout';
import { Select } from './Select';
import { dpadDirections, type GameScreen } from '../lib/mobile-play';
import './TouchController.css';

type Props = {
  settings: Settings; pressed: Set<EmulatorButton>; editing: boolean;
  touchProps: (button: EmulatorButton) => ButtonHTMLAttributes<HTMLButtonElement>;
  onDpad: (buttons: EmulatorButton[], pointer: number) => void;
  onPreview: (screen: GameScreen) => void;
  onSave: (patch: Partial<Settings>, scope: 'game' | 'global') => void; onFinish: () => void;
};
const directions = { up: ChevronUp, left: ChevronLeft, right: ChevronRight, down: ChevronDown };
export function TouchController({ settings, pressed, editing, touchProps, onDpad, onPreview, onSave, onFinish }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState(() => normalizeTouchLayouts(settings.touchLayouts));
  const [scope, setScope] = useState<'game' | 'global'>('game');
  const [preset, setPreset] = useState('custom');
  const [screen, setScreen] = useState(settings.gameScreen);
  const [turbo, setTurbo] = useState(settings.turbo);
  const [vibration, setVibration] = useState(settings.touchVibration);
  const [opacity, setOpacity] = useState(settings.touchOpacity);
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<TouchGroup>('dpad');
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number; group: TouchGroup } | null>(null);
  const mode = bounds.width > bounds.height ? 'landscape' : 'portrait';
  const layouts = editing ? draft : settings.touchLayouts;
  const layout = layouts[mode];
  useLayoutEffect(() => {
    const observer = new ResizeObserver(entries => { const box = entries[0].contentRect; drag.current = null; setBounds({ width: box.width, height: box.height }); });
    observer.observe(area.current!); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => { if (editing) { setDraft(normalizeTouchLayouts(settings.touchLayouts)); setOpacity(settings.touchOpacity); setScreen(settings.gameScreen); setTurbo(settings.turbo); setVibration(settings.touchVibration); setPreset('custom'); } }, [editing]);
  function move(group: TouchGroup, patch: Partial<{ x: number; y: number; scale: number }>) {
    setPreset('custom'); setDraft(previous => ({ ...previous, [mode]: { ...previous[mode], [group]: { ...previous[mode][group], ...patch } } }));
  }
  function begin(group: TouchGroup, event: PointerEvent<HTMLDivElement>) {
    if (!editing) return;
    event.preventDefault(); event.stopPropagation(); setSelected(group);
    // A second finger must not steal the active edit gesture.
    if (drag.current) return;
    const rect = touchRect(group, layout[group], bounds.width, bounds.height);
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, group };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function dragMove(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current; if (!editing || !active || active.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const rect = touchRect(active.group, layout[active.group], bounds.width, bounds.height);
    move(active.group, { x: Math.min(1, Math.max(0, (active.left + event.clientX - active.x) / Math.max(1, bounds.width - rect.width))), y: Math.min(1, Math.max(0, (active.top + event.clientY - active.y) / Math.max(1, bounds.height - rect.height))) });
  }
  function finishDrag(event: PointerEvent<HTMLDivElement>) { if (drag.current?.pointer === event.pointerId) drag.current = null; }
  function dpadGesture(event: PointerEvent<HTMLDivElement>, end = false) {
    if (editing) return;
    event.preventDefault();
    if (end) { onDpad([], event.pointerId); return; }
    const box = event.currentTarget.getBoundingClientRect();
    onDpad(dpadDirections((event.clientX - box.left - box.width / 2) / (box.width / 2), (event.clientY - box.top - box.height / 2) / (box.height / 2)), event.pointerId);
  }
  function button(key: EmulatorButton, label: string, content: React.ReactNode, className = '') {
    return <button key={key} type="button" className={['touch-button', className, pressed.has(key) ? 'pressed' : ''].join(' ')} aria-label={label} data-gba-button={key} tabIndex={editing ? -1 : 0} {...(editing || key in directions ? {} : touchProps(key))}>{content}{(key === 'a' || key === 'b') && !editing && settings.turbo[key] && <small className="turbo-badge">T</small>}</button>;
  }
  return <>
    <div className={`custom-touch-controller ${editing ? 'editing' : ''}`} aria-label={`${SYSTEM} touch controls`} style={{ '--touch-opacity': editing ? opacity : settings.touchOpacity } as CSSProperties}>
      <div className="touch-layout-area" ref={area}>
        {TOUCH_GROUPS.map(group => {
          const rect = touchRect(group, layout[group], bounds.width, bounds.height);
          return <div key={group} className={`touch-piece piece-${group} ${editing && selected === group ? 'selected' : ''}`} data-touch-group={group}
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            onPointerDownCapture={event => begin(group, event)} onPointerMove={dragMove} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}>
            <div className="touch-piece-inner" style={{ transform: `scale(${rect.scale})` }}>
              {group === 'dpad' ? <div className="touch-dpad" onPointerDown={event => { if (editing) return; event.currentTarget.setPointerCapture(event.pointerId); dpadGesture(event); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) dpadGesture(event); }} onPointerUp={event => dpadGesture(event, true)} onPointerCancel={event => dpadGesture(event, true)} onLostPointerCapture={event => dpadGesture(event, true)}>{Object.entries(directions).map(([key, Icon]) => button(key as EmulatorButton, key[0].toUpperCase() + key.slice(1), <Icon size={22} />, key))}<span className="dpad-center" /></div>
                : button(group, group === 'l' || group === 'r' ? `${group.toUpperCase()} shoulder` : group === 'a' || group === 'b' ? `${group.toUpperCase()} button` : TOUCH_NAMES[group], TOUCH_NAMES[group].toUpperCase(), group === 'l' || group === 'r' ? 'shoulder-button' : '')}
            </div>
          </div>;
        })}
      </div>
    </div>
    {editing && <section className="touch-editor" role="region" aria-label="Customize touch controls" data-player-chrome>
      <div className="touch-editor-heading"><strong>Touch layout <small>{mode}</small></strong><button className="icon-button" aria-label="Cancel control changes" onClick={onFinish}><X size={18} /></button></div>
      <button className="touch-editor-collapse" onClick={() => setCollapsed(value => !value)}>{collapsed ? 'Show size & opacity' : 'Hide panel to move controls'}</button>
      {!collapsed && <><p>Drag a control to move it.</p>
      <div className="touch-editor-choices"><label>Save for<Select aria-label="Save controls for" value={scope} onChange={value => setScope(value as 'game' | 'global')} options={[{value:'game',label:'This game'},{value:'global',label:'All games'}]} /></label>
      <label>Preset<Select aria-label="Control preset" value={preset} onChange={value => { setPreset(value); if(value !== 'custom') setDraft(previous => ({...previous,[mode]:touchPreset(value,mode === 'landscape')})); }} options={[{value:'custom',label:'Custom'},{value:'classic',label: IS_NDS ? 'Classic DS' : 'Classic GBA'},{value:'large',label:'Large buttons'},{value:'left',label:'Left-handed'},{value:'one',label:'One hand'}]} /></label></div>
      <div className="touch-editor-size"><Select aria-label="Control to resize" value={selected} onChange={value => setSelected(value as TouchGroup)} options={TOUCH_GROUPS.map(value => ({ value, label: TOUCH_NAMES[value] }))} />
        <label>Size <output>{Math.round(layout[selected].scale * 100)}%</output><input aria-label="Control size" type="range" min={.8} max={1.8} step={.05} value={layout[selected].scale} onChange={event => move(selected, { scale: Number(event.target.value) })} /></label></div>
      <label className="touch-opacity-label">Opacity <output>{Math.round(opacity * 100)}%</output><input aria-label="Control opacity" type="range" min={.2} max={1} step={.05} value={opacity} onChange={event => setOpacity(Number(event.target.value))} /></label>
      <details className="touch-editor-advanced"><summary>Screen & button options</summary>
        <label>Screen position<Select aria-label="Game screen position" value={screen.position} onChange={value => { const next = {...screen,position:value as GameScreen['position']}; setScreen(next); onPreview(next); }} options={[{value:'top',label:'Top'},{value:'center',label:'Center'},{value:'bottom',label:'Bottom'}]} /></label>
        <label>Screen size <output>{Math.round(screen.scale*100)}%</output><input type="range" aria-label="Game screen size" min={.6} max={1} step={.05} value={screen.scale} onChange={event => { const next = {...screen,scale:Number(event.target.value)}; setScreen(next); onPreview(next); }} /></label>
        <label className="touch-check"><input type="checkbox" checked={vibration} onChange={event=>setVibration(event.target.checked)} />Touch vibration</label>
        <div className="touch-turbo-options"><label className="touch-check"><input type="checkbox" checked={turbo.a} onChange={event=>setTurbo({...turbo,a:event.target.checked})} />Turbo A</label><label className="touch-check"><input type="checkbox" checked={turbo.b} onChange={event=>setTurbo({...turbo,b:event.target.checked})} />Turbo B</label></div>
        {(turbo.a || turbo.b) && <label>Turbo rate <output>{turbo.rate}/s</output><input type="range" aria-label="Turbo rate" min={3} max={15} step={1} value={turbo.rate} onChange={event=>setTurbo({...turbo,rate:Number(event.target.value)})} /></label>}
      </details>
      </>}
      <div className="touch-editor-actions"><button className="player-control" onClick={() => setDraft(previous => ({ ...previous, [mode]: defaultTouchLayout(mode === 'landscape') }))}><RotateCcw size={15} />Reset layout</button><button className="button button-primary" onClick={() => { onSave({ touchLayouts: draft, touchOpacity: opacity, touchControls: true, gameScreen: screen, turbo, touchVibration: vibration }, scope); onFinish(); }}><Check size={16} />Done</button></div>
    </section>}
  </>;
}
