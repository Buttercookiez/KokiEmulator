import { IS_NDS } from '../platform';
import { useEffect, useRef, useState } from 'react';
import type { GbaButton, EmulatorButton, Settings } from '../types';

const labels: Record<EmulatorButton, string> = { x:'X',y:'Y', a: 'A', b: 'B', l: 'L', r: 'R', start: 'Start', select: 'Select', up: 'Up', down: 'Down', left: 'Left', right: 'Right' };
const buttons: EmulatorButton[] = [...(IS_NDS ? ['x','y'] as const : []), 'up', 'down', 'left', 'right', 'a', 'b', 'l', 'r', 'start', 'select'];
const reserved = ['Space', 'Backquote', 'F5', 'F8', 'ShiftLeft', 'Tab'];
function keyName(code: string) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftRight: 'R Shift', ShiftLeft: 'L Shift', Backspace: '⌫', Enter: 'Enter', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl' } as Record<string, string>)[code] ?? code;
}
type Props = { controls: Settings['controls']; onChange: (controls: Settings['controls']) => void; notify: (message: string) => void; dsControls?:{x:string;y:string}; onDsChange?:(value:{x:string;y:string})=>void };
export function KeyBindings({ controls, onChange, notify, dsControls={x:'KeyI',y:'KeyU'}, onDsChange }: Props) {
  const [listening, setListening] = useState<EmulatorButton | null>(null);
  const merged = {...controls,...dsControls};
  const latest = useRef({ controls, onChange, notify, dsControls, onDsChange, merged }); latest.current = { controls, onChange, notify, dsControls, onDsChange, merged };
  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopPropagation();
      if (event.code === 'Escape') { setListening(null); return; }
      if (event.ctrlKey || event.metaKey || event.altKey || reserved.includes(event.code)) { latest.current.notify('That key is reserved for player shortcuts. Choose another key.'); return; }
      const duplicate = (Object.entries(IS_NDS ? latest.current.merged : latest.current.controls) as [EmulatorButton, string][]).find(([button, code]) => code === event.code && button !== listening);
      if (duplicate) { latest.current.notify(keyName(event.code) + ' is already assigned to ' + labels[duplicate[0]] + '. Choose another key.'); return; }
      if(listening==='x'||listening==='y')latest.current.onDsChange?.({...latest.current.dsControls,[listening]:event.code});else latest.current.onChange({ ...latest.current.controls, [listening]: event.code }); setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening]);
  return <div className="key-grid" onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setListening(null); }}>{buttons.map(button => <div className="key-binding" key={button}><span>{labels[button]}</span><button type="button" className={listening === button ? 'listening' : ''} onClick={() => setListening(listening === button ? null : button)} aria-label={'Change ' + labels[button] + ' key, currently ' + keyName(merged[button])}>{listening === button ? 'Press key…' : keyName(merged[button])}</button></div>)}</div>;
}

