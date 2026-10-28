import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Check, Pipette } from 'lucide-react';
import { COLOR_PALETTES, createThemeTokens, type ThemeMode } from '../lib/themes';

type Props = { mode: ThemeMode; value: string; onChange: (value: string) => void };
function customHex(value: string): string | null {
  let hex = value.trim().replace(/^#/, '');
  if (/^[a-f0-9]{3}$/i.test(hex)) hex = hex.split('').map(character => character + character).join('');
  return /^[a-f0-9]{6}$/i.test(hex) ? '#' + hex.toLowerCase() : null;
}
export function PaletteChooser({ mode, value, onChange }: Props) {
  const current = COLOR_PALETTES.find(palette => palette.value === value);
  const color = value === 'monochrome' ? (mode === 'dark' ? '#f2f2f2' : '#171717') : value;
  const [draft, setDraft] = useState(color);
  const [error, setError] = useState('');
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => { setDraft(color); setError(''); }, [mode, color]);
  const selectedIndex = COLOR_PALETTES.findIndex(palette => palette.value === value);
  const previews = useMemo(() => COLOR_PALETTES.map(palette => createThemeTokens(mode, palette.value)), [mode]);
  function choose(next: string) { setDraft(next === 'monochrome' ? (mode === 'dark' ? '#f2f2f2' : '#171717') : next); setError(''); onChange(next); }
  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % COLOR_PALETTES.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + COLOR_PALETTES.length - 1) % COLOR_PALETTES.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = COLOR_PALETTES.length - 1;
    else return;
    event.preventDefault(); choose(COLOR_PALETTES[next].value); options.current[next]?.focus();
  }
  function applyCustom() {
    const next = customHex(draft);
    if (!next) { setError('Enter a color like #7C3AED.'); return; }
    setDraft(next); choose(next);
  }
  return <div className="palette-picker">
    <div className="palette-heading"><div><strong>Color for {mode} mode</strong><p>Light and dark mode remember their own colors.</p></div><span className="palette-current">{current?.name ?? 'Custom color'}</span></div>
    <div className="palette-grid" role="radiogroup" aria-label={mode === 'dark' ? 'Dark mode colors' : 'Light mode colors'} data-palette-choice={value}>
      {COLOR_PALETTES.map((palette, index) => {
        const selected = value === palette.value;
        return <button key={palette.value} ref={element => { options.current[index] = element; }}
          type="button" role="radio" aria-label={palette.name} aria-checked={selected}
          tabIndex={index === (selectedIndex < 0 ? 0 : selectedIndex) ? 0 : -1}
          className={'palette-option' + (selected ? ' selected' : '')} onClick={() => choose(palette.value)} onKeyDown={event => onKey(event, index)}>
          <span className="palette-sample" aria-hidden="true" style={previews[index] as CSSProperties}>
            <span className="palette-mini-sidebar"><i /><i /><i /></span><span className="palette-mini-content"><i /><i /><b /></span>
          </span>
          <span className="palette-name"><i style={{ background: palette.swatch }} aria-hidden="true" />{palette.name}</span>
          {selected && <span className="palette-check" aria-hidden="true"><Check size={10} strokeWidth={3} /></span>}
        </button>;
      })}
    </div>
    <form className="custom-palette" onSubmit={event => { event.preventDefault(); applyCustom(); }}>
      <div className="custom-palette-title"><Pipette size={15} /><div><strong>Your own color</strong><span>Pick any shade or enter a hex color.</span></div></div>
      <div className="custom-palette-fields">
        <label className="color-well" title="Choose a custom color"><input type="color" value={customHex(draft) ?? color} aria-label={'Custom ' + mode + ' color'} onChange={event => { setDraft(event.target.value); choose(event.target.value); }} /></label>
        <input className="hex-input" type="text" value={draft} onChange={event => { setDraft(event.target.value); setError(''); }} aria-label="Custom color hex" aria-invalid={Boolean(error)} aria-describedby={error ? 'custom-color-error' : undefined} maxLength={7} spellCheck={false} autoComplete="off" />
        <button type="submit" className="button button-small">Apply</button>
      </div>
      {error && <p id="custom-color-error" className="field-error" role="alert">{error}</p>}
    </form>
  </div>;
}

