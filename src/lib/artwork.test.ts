import { describe, expect, it } from 'vitest';
import { getGameCover } from './artwork';
import type { Game } from '../types';

const game: Game = {
  id: 'b406300f8cd953a08663146d220bb9f540b58f8bfbd106e725ffae1b9fc53b5d',
  hash: 'b406300f8cd953a08663146d220bb9f540b58f8bfbd106e725ffae1b9fc53b5d',
  title: 'Renamed game', fileName: 'renamed.gba', code: '', size: 2097152, addedAt: 1, playTime: 0, favorite: false,
};

describe('game cover preferences', () => {
  it('keeps removed artwork hidden even when custom, bundled and screenshot artwork exist', () => {
    expect(getGameCover({ ...game, coverHidden: true, cover: 'data:image/png;base64,custom', screenshot: 'data:image/png;base64,frame' })).toBeUndefined();
    expect(getGameCover({ ...game, coverHidden: true, screenshot: 'data:image/png;base64,frame' })).toBeUndefined();
  });
  it('preserves custom priority and restores bundled artwork after a game is renamed', () => {
    expect(getGameCover({ ...game, cover: 'data:image/png;base64,custom' })).toBe('data:image/png;base64,custom');
    expect(getGameCover(game)).toBe('./covers/aunt-floras-mansion.png');
  });
});
