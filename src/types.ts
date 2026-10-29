import { IS_NDS } from './platform';
import { normalizeScreen, normalizeTurbo, type GameScreen, type TurboSettings } from './lib/mobile-play';
import { normalizeTouchLayouts, type TouchLayouts } from './lib/touch-layout';
import { DEFAULT_CONTROLS } from './lib/controls';

export type GbaButton = 'a' | 'b' | 'select' | 'start' | 'right' | 'left' | 'up' | 'down' | 'r' | 'l';
export type EmulatorButton = GbaButton | 'x' | 'y';
export interface Game {
  id: string;
  title: string;
  fileName: string;
  size: number;
  code: string;
  hash: string;
  addedAt: number;
  lastPlayed?: number;
  playTime: number;
  favorite: boolean;
  cover?: string;
  coverHidden?: boolean;
  screenshot?: string;
  profile?: GameProfile;
}
export interface Snapshot {
  engine?: string;
  id: string;
  gameId: string;
  label: string;
  createdAt: number;
  kind: 'auto' | 'manual' | 'backup';
  thumbnail?: string;
}
export interface Settings {
  theme: 'system' | 'light' | 'dark';
  lightColor: string;
  darkColor: string;
  artworkColor: boolean;
  volume: number;
  speed: number;
  autoResume: boolean;
  rewindSeconds: number;
  touchOpacity: number;
  touchLayouts: TouchLayouts;
  gameScreen: GameScreen;
  turbo: TurboSettings;
  touchVibration: boolean;
  filter: 'pixel' | 'smooth' | 'lcd';
  controls: Record<GbaButton, string>;
  dsEngine?: 'native'|'compatibility';
  dsLayout?: 'vertical'|'horizontal'|'bottom';
  dsSwap?: boolean;
  dsControls?: {x:string;y:string};
  touchControls: boolean;
}
export type GameProfile = Partial<Pick<Settings, 'speed' | 'filter' | 'controls' | 'dsControls' | 'touchLayouts' | 'touchOpacity' | 'gameScreen' | 'turbo' | 'touchVibration'>>;
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system', lightColor: 'monochrome', darkColor: 'monochrome', artworkColor: true, volume: 0.7, speed: 1,
  autoResume: true, rewindSeconds: IS_NDS ? 0 : 10, touchOpacity: 0.75, touchLayouts: normalizeTouchLayouts(undefined), gameScreen: normalizeScreen(undefined), turbo: normalizeTurbo(undefined), touchVibration: false, filter: 'pixel', touchControls: true,
  controls: { ...DEFAULT_CONTROLS },
};
export interface NativeStorage {
  read(path: string): Promise<Uint8Array | null>;
  write(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  revealDataDirectory(): Promise<void>;
  exportFile(name: string, bytes: Uint8Array): Promise<boolean>;
  onBeforeClose?(handler: () => Promise<void>): () => void;
}
declare global { interface Window { kokiNative?: NativeStorage } }
