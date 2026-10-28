import type { GbaButton } from '../types';
export type GameScreen = { position: 'top' | 'center' | 'bottom'; scale: number };
export type TurboSettings = { a: boolean; b: boolean; rate: number };
export function normalizeScreen(value: unknown): GameScreen {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { position: v.position === 'top' || v.position === 'bottom' ? v.position : 'center', scale: typeof v.scale === 'number' && Number.isFinite(v.scale) ? Math.min(1, Math.max(.6, v.scale)) : 1 };
}
export function normalizeTurbo(value: unknown): TurboSettings {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { a: v.a === true, b: v.b === true, rate: typeof v.rate === 'number' && Number.isFinite(v.rate) ? Math.min(15, Math.max(3, Math.round(v.rate))) : 8 };
}
export function dpadDirections(x: number, y: number): GbaButton[] {
  const distance = Math.hypot(x, y);
  if (!Number.isFinite(distance) || distance < .22 || Math.max(Math.abs(x), Math.abs(y)) > 1.35) return [];
  const result: GbaButton[] = [];
  // Eight sectors with a small neutral center; corners support one-thumb diagonals.
  if (Math.abs(x) >= Math.abs(y) * .45) result.push(x < 0 ? 'left' : 'right');
  if (Math.abs(y) >= Math.abs(x) * .45) result.push(y < 0 ? 'up' : 'down');
  return result;
}
export function turboMask(mask: number, turbo: TurboSettings, nowMs: number): number {
  if ((nowMs * turbo.rate / 1000) % 1 >= .5) { if (turbo.a) mask &= ~1; if (turbo.b) mask &= ~2; }
  return mask;
}
