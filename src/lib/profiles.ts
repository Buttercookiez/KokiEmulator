import type { GameProfile, Settings } from '../types';
import { normalizeControls } from './controls';
import { normalizeTouchLayouts } from './touch-layout';
import { normalizeScreen, normalizeTurbo } from './mobile-play';

export function normalizeGameProfile(value: unknown): GameProfile | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const profile: GameProfile = {};
  if (typeof input.speed === 'number' && Number.isFinite(input.speed)) profile.speed = Math.max(.5, Math.min(4, input.speed));
  if (input.filter === 'pixel' || input.filter === 'smooth' || input.filter === 'lcd') profile.filter = input.filter;
  if (input.controls && typeof input.controls === 'object' && !Array.isArray(input.controls)) profile.controls = normalizeControls(input.controls);
  const ds = input.dsControls as Record<string,unknown>|undefined;
  if(ds && typeof ds.x==='string' && ds.x.trim() && typeof ds.y==='string' && ds.y.trim()) profile.dsControls={x:ds.x.slice(0,40),y:ds.y.slice(0,40)};
  if (input.touchLayouts && typeof input.touchLayouts === 'object' && !Array.isArray(input.touchLayouts)) profile.touchLayouts = normalizeTouchLayouts(input.touchLayouts);
  if (input.gameScreen && typeof input.gameScreen === 'object' && !Array.isArray(input.gameScreen)) profile.gameScreen = normalizeScreen(input.gameScreen);
  if (input.turbo && typeof input.turbo === 'object' && !Array.isArray(input.turbo)) profile.turbo = normalizeTurbo(input.turbo);
  if (typeof input.touchOpacity === 'number' && Number.isFinite(input.touchOpacity)) profile.touchOpacity = Math.min(1, Math.max(.2, input.touchOpacity));
  if (typeof input.touchVibration === 'boolean') profile.touchVibration = input.touchVibration;
  return Object.keys(profile).length ? profile : undefined;
}

export function gameSettings(settings: Settings, profile?: GameProfile): Settings {
  const custom = normalizeGameProfile(profile);
  return structuredClone({ ...settings, ...custom, controls: { ...(custom?.controls ?? settings.controls) } });
}

// A shared touch save must remove earlier game overrides as well as set defaults.
export function withoutTouchOverrides(profile?: GameProfile): GameProfile | undefined {
  if (!profile) return undefined;
  const { touchLayouts, touchOpacity, gameScreen, turbo, touchVibration, ...rest } = profile;
  return normalizeGameProfile(rest);
}
