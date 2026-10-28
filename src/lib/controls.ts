import type { GbaButton } from '../types';

export const DEFAULT_CONTROLS: Record<GbaButton, string> = {
  a: 'KeyX', b: 'KeyZ', select: 'ShiftRight', start: 'Enter',
  right: 'KeyD', left: 'KeyA', up: 'KeyW', down: 'KeyS', r: 'KeyE', l: 'KeyQ',
};

const LEGACY_CONTROLS: Record<GbaButton, string> = {
  a: 'KeyX', b: 'KeyZ', select: 'ShiftRight', start: 'Enter',
  right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', r: 'KeyS', l: 'KeyA',
};
const buttons = Object.keys(DEFAULT_CONTROLS) as GbaButton[];
const aliases: Partial<Record<string, GbaButton>> = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyJ: 'a', KeyK: 'b',
};

export function normalizeControls(value: unknown): Record<GbaButton, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_CONTROLS };
  const saved = value as Record<string, unknown>;
  // Upgrade the old preset as a whole; a changed binding means this is a custom map.
  if (Object.keys(saved).length === buttons.length && buttons.every(button => saved[button] === LEGACY_CONTROLS[button])) return { ...DEFAULT_CONTROLS };
  return Object.fromEntries(buttons.map(button => [button,
    typeof saved[button] === 'string' && saved[button].trim() ? saved[button].slice(0, 40) : DEFAULT_CONTROLS[button],
  ])) as Record<GbaButton, string>;
}

export function resolveKeyboardButton(code: string, controls: Record<GbaButton, string>): GbaButton | undefined {
  // A custom binding always takes precedence over a convenience alias.
  const explicit = buttons.find(button => controls[button] === code);
  return explicit ?? (Object.hasOwn(aliases, code) ? aliases[code] : undefined);
}
