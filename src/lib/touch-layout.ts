import { IS_NDS } from '../platform';
export type TouchGroup = 'dpad'|'a'|'b'|'l'|'r'|'select'|'start'|'x'|'y';
export const TOUCH_GROUPS: readonly TouchGroup[] = IS_NDS ? ['dpad','a','b','x','y','l','r','select','start'] : ['dpad','a','b','l','r','select','start'];
export type TouchPosition = { x: number; y: number; scale: number };
export type TouchLayout = Record<TouchGroup, TouchPosition>;
export type TouchLayouts = { portrait: TouchLayout; landscape: TouchLayout };
export const TOUCH_NAMES: Record<TouchGroup, string> = { x:'X', y:'Y', dpad: 'D-pad', a: 'A', b: 'B', l: 'L', r: 'R', select: 'Select', start: 'Start' };
export const TOUCH_SIZE: Record<TouchGroup, [number, number]> = { x:[58,58], y:[58,58], dpad: [132, 132], a: [58, 58], b: [58, 58], l: [84, 44], r: [84, 44], select: [64, 44], start: [64, 44] };
export function defaultTouchLayout(landscape = false): TouchLayout {
  const p = (x: number, y: number): TouchPosition => ({ x, y, scale: 1 });
  if (IS_NDS) return landscape
    ? { dpad:{x:0,y:.54,scale:.85}, x:{x:.945,y:.29,scale:.9}, y:{x:.89,y:.54,scale:.9}, a:{x:1,y:.54,scale:.9}, b:{x:.945,y:.79,scale:.9}, l:{x:0,y:.04,scale:.9}, r:{x:1,y:.04,scale:.9}, select:{x:0,y:1,scale:.9}, start:{x:1,y:1,scale:.9} }
    : { dpad:p(0,.92), x:p(.78,.70), y:p(.59,.84), a:p(1,.84), b:p(.78,.98), l:p(0,.56), r:p(1,.56), select:p(.18,1), start:p(.48,1) };
  return { x:p(landscape ? .86 : .75,landscape ? .64 : .70), y:p(landscape?.75:.5,.77), dpad: p(0, .88), a: p(1, .78), b: p(landscape ? .87 : .75, .89), l: p(0, landscape ? .38 : IS_NDS ? .56 : .60), r: p(1, landscape ? .38 : IS_NDS ? .56 : .60), select: p(.32, 1), start: p(.68, 1) };
}
export function normalizeTouchLayouts(value: unknown): TouchLayouts {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const clamp = (n: unknown, fallback: number, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  const result = { portrait: defaultTouchLayout(), landscape: defaultTouchLayout(true) };
  for (const mode of ['portrait', 'landscape'] as const) {
    const layout = source[mode] && typeof source[mode] === 'object' ? source[mode] as Record<string, unknown> : {};
    for (const group of TOUCH_GROUPS) {
      const raw = layout[group] && typeof layout[group] === 'object' ? layout[group] as Record<string, unknown> : {};
      const fallback = result[mode][group];
      result[mode][group] = { x: clamp(raw.x, fallback.x, 0, 1), y: clamp(raw.y, fallback.y, 0, 1), scale: clamp(raw.scale, fallback.scale, .8, 1.8) };
    }
  }
  return result;
}
// Coordinates describe available travel, so resized buttons remain on-screen after rotation.
export function touchRect(group: TouchGroup, position: TouchPosition, width: number, height: number) {
  const scale = Math.min(position.scale, Math.max(0, width) / TOUCH_SIZE[group][0], Math.max(0, height) / TOUCH_SIZE[group][1]);
  const w = TOUCH_SIZE[group][0] * scale, h = TOUCH_SIZE[group][1] * scale;
  return { left: Math.max(0, width - w) * position.x, top: Math.max(0, height - h) * position.y, width: w, height: h, scale };
}

export function touchPreset(preset: string, landscape = false): TouchLayout {
  const layout = defaultTouchLayout(landscape);
  if (preset === 'large') { layout.dpad.scale = 1.2; layout.a.scale = layout.b.scale = 1.3; layout.b.x = landscape ? .84 : .64; layout.a.y = .73; layout.b.y = .92; }
  if (preset === 'left') for (const key of TOUCH_GROUPS) layout[key].x = 1 - layout[key].x;
  if (preset === 'one') {
    layout.dpad = { x: 1, y: .88, scale: .9 }; layout.a = { x: 1, y: .61, scale: 1 }; layout.b = { x: landscape ? .89 : .65, y: .66, scale: 1 };
    layout.l = { x: landscape ? .86 : .6, y: .43, scale: .9 }; layout.r = { x: 1, y: .49, scale: .9 };
    layout.select = { x: landscape ? .88 : .6, y: 1, scale: 1 }; layout.start = { x: 1, y: 1, scale: 1 };
  }
  return layout;
}
