import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PspBridge, PspGame, PspCheckpoint, PspTiming } from '../psp-types';

interface NativePsp {
  games(): Promise<{ games: PspGame[] }>;
  choose(): Promise<{ games: PspGame[]; errors: string[] }>;
  favorite(options: { id: string }): Promise<{ games: PspGame[] }>;
  remove(options: { id: string }): Promise<{ games: PspGame[] }>;
  saves(): Promise<void>;
  start(options: { id: string }): Promise<PspTiming>;
  input(options: { buttons: number; x: number; y: number }): Promise<void>;
  play(options: { paused: boolean; volume: number; smoothing?: boolean }): Promise<void>;
  viewport(options: { x: number; y: number; width: number; height: number; dpr: number }): Promise<void>;
  checkpoint(options: { restore: boolean; id?: string }): Promise<void>;
  checkpoints(): Promise<{ checkpoints: PspCheckpoint[] }>;
  deleteCheckpoint(options: { id: string }): Promise<void>;
  screenshot(): Promise<void>;
  stop(): Promise<void>;
  addListener(event: string, callback: (event: { message?: string }) => void): Promise<{ remove(): Promise<void> }>;
}
export const nativePsp = registerPlugin<NativePsp>('NativePsp');
export const isPspAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
export function installPspAndroid() {
  if (!isPspAndroid) return;
  window.kokiPsp = {
    games: async () => (await nativePsp.games()).games.map(image),
    choose: async () => { const result = await nativePsp.choose(); return { ...result, games: result.games.map(image) }; },
    favorite: async id => (await nativePsp.favorite({ id })).games.map(image),
    remove: async id => (await nativePsp.remove({ id })).games.map(image),
    saves: () => nativePsp.saves(),
    start: id => nativePsp.start({ id }),
    frame: async () => new Uint8Array(),
    checkpoint: (restore, id) => nativePsp.checkpoint({ restore, id }),
    checkpoints: async () => (await nativePsp.checkpoints()).checkpoints,
    deleteCheckpoint: id => nativePsp.deleteCheckpoint({ id }),
    screenshot: () => nativePsp.screenshot(),
    stop: () => nativePsp.stop(),
  } satisfies PspBridge;
}
function image(game: PspGame) {
  return game.screenshot ? { ...game, screenshot: Capacitor.convertFileSrc(game.screenshot) + '?t=' + game.lastPlayed } : game;
}
