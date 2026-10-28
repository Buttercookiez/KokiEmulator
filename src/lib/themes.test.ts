import { describe, expect, it } from 'vitest';
import { COLOR_PALETTES, createThemeTokens, normalizeThemeColor, type ThemeMode } from './themes';

const modes: ThemeMode[] = ['light', 'dark'];
const surfaceKeys = ['--bg', '--surface', '--sidebar', '--subtle', '--accent-soft'];
// Independent WCAG sRGB relative-luminance calculation for the public color output.
function ratio(first: string, second: string) {
  const luminance = (color: string) => {
    const channels = [1, 3, 5].map(offset => {
      const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
      return value > 0.04045 ? Math.pow((value + 0.055) / 1.055, 2.4) : value / 12.92;
    });
    return channels.reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function expectReadable(mode: ThemeMode, color: string) {
  const tokens = createThemeTokens(mode, color);
  const label = mode + ' ' + color;
  for (const [name, value] of Object.entries(tokens)) {
    if (name !== '--shadow') expect(value, label + ' ' + name).toMatch(/^#[a-f0-9]{6}$/);
  }
  for (const surface of surfaceKeys) {
    for (const text of ['--ink', '--muted', '--accent', '--danger']) {
      expect(ratio(tokens[text], tokens[surface]), label + ' ' + text + ' on ' + surface).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(ratio(tokens['--accent-ink'], tokens['--accent']), label + ' button text').toBeGreaterThanOrEqual(4.5);
  expect(ratio(tokens['--inverse'], tokens['--ink']), label + ' inverse controls').toBeGreaterThanOrEqual(4.5);
}

describe('light and dark color themes', () => {
  it('normalizes complete hex colors and rejects invalid settings or injected CSS', () => {
    expect(normalizeThemeColor('#AABBCC')).toBe('#aabbcc');
    expect(normalizeThemeColor(' #12aBcD ')).toBe('#12abcd');
    expect(normalizeThemeColor('monochrome')).toBe('monochrome');
    for (const value of [undefined, null, false, 123, {}, [], '', '#abc', '#12345678', 'red', '#ggffff', 'url(example)', '#ff0000; color:red']) {
      expect(normalizeThemeColor(value)).toBe('monochrome');
    }
  });

  it('offers sixteen distinct named choices with safe swatch colors', () => {
    expect(COLOR_PALETTES).toHaveLength(16);
    expect(new Set(COLOR_PALETTES.map(palette => palette.value)).size).toBe(16);
    expect(new Set(COLOR_PALETTES.map(palette => palette.name)).size).toBe(16);
    for (const palette of COLOR_PALETTES) {
      expect(palette.swatch).toMatch(/^#[a-f0-9]{6}$/);
      expect(normalizeThemeColor(palette.value)).toBe(palette.value);
    }
  });

  it('preserves the original monochrome surfaces and primary text after switching colors', () => {
    createThemeTokens('light', '#7c3aed');
    createThemeTokens('dark', '#34d399');
    const light = createThemeTokens('light', 'monochrome');
    const dark = createThemeTokens('dark', 'monochrome');
    expect([light['--bg'], light['--surface'], light['--ink'], light['--inverse']]).toEqual(['#f8f8f8', '#ffffff', '#171717', '#ffffff']);
    expect([dark['--bg'], dark['--surface'], dark['--ink'], dark['--inverse']]).toEqual(['#101010', '#181818', '#f2f2f2', '#101010']);
    expect(createThemeTokens('light', 'invalid')).toEqual(light);
  });

  it('keeps all preset surfaces, labels and selected controls readable in both modes', () => {
    for (const mode of modes) for (const palette of COLOR_PALETTES) expectReadable(mode, palette.value);
  });

  it('keeps arbitrary custom colors readable, including black, white and saturated extremes', () => {
    const colors = ['#000000', '#ffffff', '#010101', '#fefefe', '#808080', '#777777', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#fff1ab', '#0a102d'];
    let seed = 123456789;
    for (let index = 0; index < 64; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      colors.push('#' + (seed & 0xffffff).toString(16).padStart(6, '0'));
    }
    for (const mode of modes) for (const color of colors) expectReadable(mode, color);
  });
});

