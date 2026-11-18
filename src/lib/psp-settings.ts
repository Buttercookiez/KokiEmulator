import { normalizeThemeColor } from './themes';

export type PspControl = 'dpad' | 'stick' | 'cross' | 'circle' | 'square' | 'triangle' | 'l' | 'r' | 'select' | 'start';
export type PspPosition = { x: number; y: number };
export type PspLayout = Record<PspControl, PspPosition>;
export type PspSettings = {
  theme: 'system' | 'light' | 'dark';
  lightColor: string;
  darkColor: string;
  volume: number;
  touchOpacity: number;
  touchScale: number;
  showControls: boolean;
  smoothing: boolean;
  layout: { portrait?: PspLayout; landscape?: PspLayout };
};
const defaults: PspSettings = { theme: 'system', lightColor: 'monochrome', darkColor: 'monochrome', volume: .8,
  touchOpacity: .7, touchScale: 1, showControls: true, smoothing: true, layout: {} };
export function readPspSettings(): PspSettings {
  try {
    const value = JSON.parse(localStorage.getItem('koki-psp-settings') || '{}');
    return { ...defaults,
      theme: ['system', 'light', 'dark'].includes(value.theme) ? value.theme :
        localStorage.getItem('koki-psp-theme') === 'dark' ? 'dark' : localStorage.getItem('koki-psp-theme') === 'light' ? 'light' : 'system',
      lightColor: normalizeThemeColor(value.lightColor), darkColor: normalizeThemeColor(value.darkColor),
      volume: bounded(value.volume, .8, 0, 1), touchOpacity: bounded(value.touchOpacity, .7, .15, 1),
      touchScale: bounded(value.touchScale, 1, .65, 1.35),
      showControls: value.showControls !== false, smoothing: value.smoothing !== false,
      layout: Object.fromEntries(['portrait', 'landscape'].flatMap(orientation => {
        const layout = value.layout?.[orientation];
        if (!layout || !controlNames.every(key => Number.isFinite(layout[key]?.x) && Number.isFinite(layout[key]?.y))) return [];
        return [[orientation, Object.fromEntries(controlNames.map(key => [key,
          { x: Math.max(4, Math.min(96, layout[key].x)), y: Math.max(7, Math.min(93, layout[key].y)) }]))]];
      })),
    };
  } catch { return { ...defaults, layout: {} }; }
}
function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export const controlNames: PspControl[] = ['dpad', 'stick', 'cross', 'circle', 'square', 'triangle', 'l', 'r', 'select', 'start'];
export function defaultPspLayout(landscape: boolean): PspLayout {
  return landscape ? {
    dpad: { x: 12, y: 44 }, stick: { x: 12, y: 78 },
    cross: { x: 87, y: 73 }, circle: { x: 94, y: 53 }, square: { x: 80, y: 53 }, triangle: { x: 87, y: 33 },
    l: { x: 11, y: 13 }, r: { x: 89, y: 13 }, select: { x: 40, y: 90 }, start: { x: 60, y: 90 },
  } : {
    dpad: { x: 21, y: 64 }, stick: { x: 21, y: 83 },
    cross: { x: 78, y: 75 }, circle: { x: 90, y: 68 }, square: { x: 66, y: 68 }, triangle: { x: 78, y: 61 },
    l: { x: 17, y: 48 }, r: { x: 83, y: 48 }, select: { x: 42, y: 92 }, start: { x: 61, y: 92 },
  };
}
