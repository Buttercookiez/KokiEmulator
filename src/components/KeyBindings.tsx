import { useEffect, useRef, useState } from 'react';
import type { GbaButton, Settings } from '../types';

const labels: Record<GbaButton, string> = { a: 'A', b: 'B', l: 'L', r: 'R', start: 'Start', select: 'Select', up: 'Up', down: 'Down', left: 'Left', right: 'Right' };
const buttons: GbaButton[] = ['up', 'down', 'left', 'right', 'a', 'b', 'l', 'r', 'start', 'select'];
const reserved = ['Space', 'Backquote', 'F5', 'F8', 'ShiftLeft', 'Tab'];
function keyName(code: string) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftRight: 'R Shift', ShiftLeft: 'L Shift', Backspace: '⌫', Enter: 'Enter', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl' } as Record<string, string>)[code] ?? code;
}
type Props = { controls: Settings['controls']; onChange: (controls: Settings['controls']) => void; notify: (message: string) => void };
export function KeyBindings({ controls, onChange, notify }: Props) {
  const [listening, setListening] = useState<GbaButton | null>(null);
  const latest = useRef({ controls, onChange, notify }); latest.current = { controls, onChange, notify };
  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopPropagation();
      if (event.code === 'Escape') { setListening(null); return; }
      if (event.ctrlKey || event.metaKey || event.altKey || reserved.includes(event.code)) { latest.current.notify('That key is reserved for player shortcuts. Choose another key.'); return; }
      const duplicate = (Object.entries(latest.current.controls) as [GbaButton, string][]).find(([button, code]) => code === event.code && button !== listening);
      if (duplicate) { latest.current.notify(keyName(event.code) + ' is already assigned to ' + labels[duplicate[0]] + '. Choose another key.'); return; }
      latest.current.onChange({ ...latest.current.controls, [listening]: event.code }); setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening]);
  return <div className="key-grid" onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setListening(null); }}>{buttons.map(button => <div className="key-binding" key={button}><span>{labels[button]}</span><button type="button" className={listening === button ? 'listening' : ''} onClick={() => setListening(listening === button ? null : button)} aria-label={'Change ' + labels[button] + ' key, currently ' + keyName(controls[button])}>{listening === button ? 'Press key…' : keyName(controls[button])}</button></div>)}</div>;
}

