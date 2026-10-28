import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';
import { DEFAULT_SETTINGS } from '../types';
import { DEFAULT_CONTROLS, normalizeControls, resolveKeyboardButton } from './controls';

const legacy = {
  a: 'KeyX', b: 'KeyZ', select: 'ShiftRight', start: 'Enter',
  right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', r: 'KeyS', l: 'KeyA',
};
const memory = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock('./storage', () => ({
  readFile: async (name: string) => memory.get(name)?.slice() ?? null,
  writeFile: async (name: string, bytes: Uint8Array) => { memory.set(name, bytes.slice()); },
  removeFile: async (name: string) => { memory.delete(name); },
  exportFile: async () => undefined,
}));
beforeEach(() => { memory.clear(); vi.resetModules(); });

describe('compact keyboard bindings', () => {
  it('supports WASD and arrow directions without requiring a function layer', () => {
    for (const [button, letter, arrow] of [
      ['up', 'KeyW', 'ArrowUp'], ['down', 'KeyS', 'ArrowDown'],
      ['left', 'KeyA', 'ArrowLeft'], ['right', 'KeyD', 'ArrowRight'],
    ]) {
      expect(resolveKeyboardButton(letter, DEFAULT_CONTROLS)).toBe(button);
      expect(resolveKeyboardButton(arrow, DEFAULT_CONTROLS)).toBe(button);
    }
    expect(resolveKeyboardButton('KeyQ', DEFAULT_CONTROLS)).toBe('l');
    expect(resolveKeyboardButton('KeyE', DEFAULT_CONTROLS)).toBe('r');
  });

  it('retains X/Z actions and provides J/K alternatives', () => {
    expect(resolveKeyboardButton('KeyX', DEFAULT_CONTROLS)).toBe('a');
    expect(resolveKeyboardButton('KeyZ', DEFAULT_CONTROLS)).toBe('b');
    expect(resolveKeyboardButton('KeyJ', DEFAULT_CONTROLS)).toBe('a');
    expect(resolveKeyboardButton('KeyK', DEFAULT_CONTROLS)).toBe('b');
    expect(resolveKeyboardButton('Unidentified', DEFAULT_CONTROLS)).toBeUndefined();
    expect(resolveKeyboardButton('F5', DEFAULT_CONTROLS)).toBeUndefined();
  });

  it('prioritizes explicit bindings over every conflicting alias', () => {
    const custom = { ...DEFAULT_CONTROLS, a: 'KeyW', b: 'ArrowLeft', l: 'KeyJ', r: 'KeyK', up: 'KeyI', left: 'KeyH' };
    expect(resolveKeyboardButton('KeyW', custom)).toBe('a');
    expect(resolveKeyboardButton('ArrowLeft', custom)).toBe('b');
    expect(resolveKeyboardButton('KeyJ', custom)).toBe('l');
    expect(resolveKeyboardButton('KeyK', custom)).toBe('r');
    expect(resolveKeyboardButton('KeyI', custom)).toBe('up');
    expect(resolveKeyboardButton('ArrowUp', custom)).toBe('up');
    expect(resolveKeyboardButton('KeyX', custom)).toBeUndefined();
  });

  it('migrates only the complete unchanged old preset', () => {
    expect(normalizeControls(legacy)).toEqual(DEFAULT_CONTROLS);
    const custom = { ...legacy, a: 'KeyC' };
    expect(normalizeControls(custom)).toEqual(custom);
    const { a: _oldA, ...partial } = legacy;
    expect(normalizeControls(partial)).toEqual(legacy);
    expect(resolveKeyboardButton('KeyA', custom)).toBe('l');
    expect(resolveKeyboardButton('KeyS', custom)).toBe('r');
  });

  it('normalizes missing and malformed values independently without changing valid custom keys', () => {
    expect(normalizeControls(null)).toEqual(DEFAULT_CONTROLS);
    expect(normalizeControls([])).toEqual(DEFAULT_CONTROLS);
    expect(normalizeControls({ up: 'KeyI', a: '', l: false, down: 'x'.repeat(60) })).toEqual({
      ...DEFAULT_CONTROLS, up: 'KeyI', down: 'x'.repeat(40),
    });
  });

  it('loads the old preset as compact controls and retains it after saving and reopening', async () => {
    memory.set('library.json', strToU8(JSON.stringify({ version: 1, games: [], snapshots: [], settings: { ...DEFAULT_SETTINGS, controls: legacy } })));
    let library = await import('./library');
    const settings = await library.getSettings();
    expect(settings.controls).toEqual(DEFAULT_CONTROLS);
    await library.saveSettings(settings);
    vi.resetModules(); library = await import('./library');
    expect((await library.getSettings()).controls).toEqual(DEFAULT_CONTROLS);
  });

  it('retains custom legacy keys across a settings reload', async () => {
    const custom = { ...legacy, a: 'KeyC', up: 'KeyI' };
    let library = await import('./library');
    await library.saveSettings({ ...DEFAULT_SETTINGS, controls: custom });
    vi.resetModules(); library = await import('./library');
    expect((await library.getSettings()).controls).toEqual(custom);
  });
});
