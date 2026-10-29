import { IS_NDS } from '../platform';
import type { Game } from '../types';

const byHash: Record<string, string> = {
  b406300f8cd953a08663146d220bb9f540b58f8bfbd106e725ffae1b9fc53b5d: 'aunt-floras-mansion',
  '173c893f23f12f2db767fd80cf111aabde56ee6652a9b390c2f4e2aee7a4fd01': 'minicraft',
  '73050b14462c461423d5ff994fc42519784ef903fbd8a7512ab91376a37c129e': 'skyland',
  '0c4f898315b9147522ccdb1d1c234d7b43c65d40bfe21be4eedcf722e45f3e7f': 'tigermoth',
};
const byTitle: Record<string, string> = {
  auntflorasmansion: 'aunt-floras-mansion',
  minicraft: 'minicraft',
  minicraftgba: 'minicraft',
  skyland: 'skyland',
  tigermoth: 'tigermoth',
};
const normalizeTitle = (value: string) => value.replace(/\.(gba|bin|zip)$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Explicit removal hides all artwork until restored or replaced; custom art otherwise wins. */
export function getGameCover(game: Game): string | undefined {
  if (game.coverHidden === true) return undefined;
  if (game.cover) return game.cover;
  if (IS_NDS) return game.screenshot;
  const bundled = byHash[game.hash.toLowerCase()] || byTitle[normalizeTitle(game.title)] || byTitle[normalizeTitle(game.fileName)];
  return bundled ? `./covers/${bundled}.png` : game.screenshot;
}
