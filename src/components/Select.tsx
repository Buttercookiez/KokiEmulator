import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export type SelectCloseReason = 'select' | 'escape' | 'outside' | 'tab' | 'toggle';
type Option = { value: string | number; label: string };
type Props = {
  value: string | number;
  options: Option[];
  onChange: (value: string) => void;
  'aria-label': string;
  className?: string;
  disabled?: boolean;
  onClose?: (reason: SelectCloseReason) => void;
};

/** A select-only combobox; focus stays on the trigger while exploring options. */
export function Select({ value, options, onChange, 'aria-label': label, className = '', disabled, onClose }: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const search = useRef({ text: '', time: 0 });
  const selected = Math.max(0, options.findIndex(option => String(option.value) === String(value)));
  const callbacks = useRef({ onChange, onClose });
  callbacks.current = { onChange, onClose };

  function close(reason: SelectCloseReason, commit = false, index = active) {
    if (!openRef.current) return;
    openRef.current = false;
    if (commit && options[index]) callbacks.current.onChange(String(options[index].value));
    setOpen(false);
    search.current.text = '';
    callbacks.current.onClose?.(reason);
  }
  function show(index = selected) {
    openRef.current = true;
    setActive(index);
    setOpen(true);
  }
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 12;
      const width = Math.min(Math.max(rect.width, 180), window.innerWidth - margin * 2);
      const below = window.innerHeight - rect.bottom - margin - 6;
      const above = rect.top - margin - 6;
      const height = Math.min(options.length * 38 + 10, 290);
      const upwards = below < height && above > below;
      setPosition({
        width, maxHeight: Math.max(44, Math.min(290, upwards ? above : below)),
        left: Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin)),
        ...(upwards ? { bottom: window.innerHeight - rect.top + 6, top: 'auto' } : { top: rect.bottom + 6, bottom: 'auto' }),
      });
    };
    place();
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !list.current?.contains(event.target as Node)) {
        close('outside');
      }
    };
    const scrolled = (event: Event) => { if (!list.current?.contains(event.target as Node)) place(); };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', scrolled, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', scrolled, true);
    };
  }, [open, options.length]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.ctrlKey || event.metaKey || (event.altKey && !['ArrowDown', 'ArrowUp'].includes(event.key))) return;
    const navigation = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'];
    if (navigation.includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.altKey && event.key === 'ArrowUp' && open) { close('select', true); return; }
      const start = open ? active : selected;
      let next = start;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = options.length - 1;
      else if (open) next = Math.max(0, Math.min(options.length - 1, start + ({ ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[event.key] ?? 0)));
      show(next); return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); event.stopPropagation();
      if (open) close('select', true); else show();
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); close('escape'); return;
    }
    if (event.key === 'Tab' && open) { close('tab', true); return; }
    if (event.key.length === 1 && !event.altKey) {
      event.preventDefault(); event.stopPropagation();
      const now = performance.now();
      const previous = now - search.current.time < 650 ? search.current.text : '';
      const text = previous + event.key.toLocaleLowerCase();
      search.current = { text, time: now };
      const repeated = [...text].every(character => character === text[0]);
      const match = repeated ? text[0] : text;
      const start = repeated ? (open ? active : selected) + 1 : 0;
      for (let step = 0; step < options.length; step++) {
        const index = (start + step) % options.length;
        if (options[index].label.toLocaleLowerCase().startsWith(match)) { show(index); return; }
      }
    }
  }

  return <>
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? id : undefined}
      aria-activedescendant={open ? id + '-' + active : undefined}
      data-select-open={open || undefined} className={'select-trigger ' + className} disabled={disabled}
      onKeyDown={onKeyDown} onBlur={() => { if (open) close('outside', true); }}
      onClick={() => { if (open) close('toggle'); else show(); }}>
      <span className="select-value">{options[selected]?.label ?? ''}</span><ChevronDown size={13} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={list} id={id} role="listbox" aria-label={label}
      className="select-menu" style={position} onPointerDown={event => event.preventDefault()}>
      {options.map((option, index) => <div key={String(option.value)} id={id + '-' + index}
        role="option" aria-selected={index === selected} data-active={index === active}
        className="select-option" onPointerMove={() => setActive(index)}
        onClick={() => close('select', true, index)}>
        <span>{option.label}</span><span className="select-check">{index === selected && <Check size={13} aria-hidden="true" />}</span>
      </div>)}
    </div>, trigger.current?.closest('[role="dialog"]') ?? document.fullscreenElement ?? document.body)}
  </>;
}

