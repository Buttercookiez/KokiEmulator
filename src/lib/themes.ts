export type ThemeMode = 'light' | 'dark';

export const COLOR_PALETTES: Array<{ value: string; name: string; swatch: string }> = [
  { value: 'monochrome', name: 'Monochrome', swatch: '#858585' },
  { value: '#64748b', name: 'Slate', swatch: '#64748b' },
  { value: '#2563eb', name: 'Ocean', swatch: '#2563eb' },
  { value: '#4f46e5', name: 'Indigo', swatch: '#4f46e5' },
  { value: '#7c3aed', name: 'Violet', swatch: '#7c3aed' },
  { value: '#a78bfa', name: 'Lavender', swatch: '#a78bfa' },
  { value: '#e11d78', name: 'Rose', swatch: '#e11d78' },
  { value: '#f26a58', name: 'Coral', swatch: '#f26a58' },
  { value: '#dc2626', name: 'Ruby', swatch: '#dc2626' },
  { value: '#d97706', name: 'Amber', swatch: '#d97706' },
  { value: '#eab308', name: 'Gold', swatch: '#eab308' },
  { value: '#65a30d', name: 'Lime', swatch: '#65a30d' },
  { value: '#15803d', name: 'Forest', swatch: '#15803d' },
  { value: '#34d399', name: 'Mint', swatch: '#34d399' },
  { value: '#0d9488', name: 'Teal', swatch: '#0d9488' },
  { value: '#06b6d4', name: 'Cyan', swatch: '#06b6d4' },
];

/** Settings and backup data accept only the default or a complete sRGB hex color. */
export function normalizeThemeColor(value: unknown): string {
  if (typeof value !== 'string') return 'monochrome';
  const color = value.trim().toLowerCase();
  return /^#[a-f0-9]{6}$/.test(color) ? color : 'monochrome';
}

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)) as Rgb;
const hex = (channels: Rgb) => '#' + channels.map(channel => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('');
function mix(first: string, second: string, amount: number): string {
  const a = rgb(first), b = rgb(second);
  return hex(a.map((channel, index) => channel + (b[index] - channel) * amount) as Rgb);
}
function luminance(color: string): number {
  const channels = rgb(color).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(first: string, second: string): number {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function readable(color: string, surfaces: string[], mode: ThemeMode): string {
  const target = mode === 'light' ? '#000000' : '#ffffff';
  for (let step = 0; step <= 100; step++) {
    const candidate = mix(color, target, step / 100);
    if (surfaces.every(surface => contrast(candidate, surface) >= 4.6)) return candidate;
  }
  return target;
}

const base: Record<ThemeMode, Record<string, string>> = {
  light: {
    '--bg': '#f8f8f8', '--surface': '#ffffff', '--sidebar': '#f1f1f1',
    '--ink': '#171717', '--muted': '#707070', '--line': '#e3e3e3',
    '--subtle': '#ededed', '--inverse': '#ffffff', '--danger': '#b4232c',
    '--shadow': '0 18px 65px #00000012',
  },
  dark: {
    '--bg': '#101010', '--surface': '#181818', '--sidebar': '#141414',
    '--ink': '#f2f2f2', '--muted': '#a1a1a1', '--line': '#2c2c2c',
    '--subtle': '#242424', '--inverse': '#101010', '--danger': '#ff9ca4',
    '--shadow': '0 20px 70px #00000055',
  },
};

/** Build a complete theme, adjusting color contrast without changing the user's saved choice. */
export function createThemeTokens(mode: ThemeMode, color: string): Record<string, string> {
  const choice = normalizeThemeColor(color);
  const tokens = { ...base[mode] };
  if (choice !== 'monochrome') {
    const amounts: Record<string, number> = mode === 'light'
      ? { '--bg': 0.035, '--surface': 0.012, '--sidebar': 0.065, '--subtle': 0.09, '--line': 0.13, '--ink': 0.045, '--muted': 0.09 }
      : { '--bg': 0.045, '--surface': 0.06, '--sidebar': 0.055, '--subtle': 0.085, '--line': 0.12, '--ink': 0.045, '--muted': 0.09 };
    for (const [token, amount] of Object.entries(amounts)) tokens[token] = mix(tokens[token], choice, amount);
  }
  const surfaces = ['--bg', '--surface', '--sidebar', '--subtle'].map(token => tokens[token]);
  const target = mode === 'light' ? '#000000' : '#ffffff';
  const rawAccent = choice === 'monochrome' ? tokens['--ink'] : choice;
  let accent = target;
  let soft = tokens['--subtle'];
  for (let step = 0; step <= 100; step++) {
    const candidate = mix(rawAccent, target, step / 100);
    const candidateSoft = choice === 'monochrome' ? tokens['--subtle'] : mix(tokens['--surface'], candidate, mode === 'light' ? 0.09 : 0.12);
    if ([...surfaces, candidateSoft].every(surface => contrast(candidate, surface) >= 4.6)) {
      accent = candidate; soft = candidateSoft; break;
    }
  }
  tokens['--accent'] = accent;
  tokens['--accent-ink'] = contrast('#ffffff', accent) >= contrast('#101010', accent) ? '#ffffff' : '#101010';
  tokens['--accent-soft'] = soft;
  tokens['--accent-line'] = mix(tokens['--line'], accent, 0.35);
  const textSurfaces = [...surfaces, soft];
  tokens['--ink'] = readable(tokens['--ink'], textSurfaces, mode);
  tokens['--muted'] = readable(tokens['--muted'], textSurfaces, mode);
  tokens['--danger'] = readable(tokens['--danger'], textSurfaces, mode);
  return tokens;
}

