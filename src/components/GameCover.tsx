import { useState } from 'react';
import type { Game } from '../types';
import { getGameCover } from '../lib/artwork';
import { useGamePreview } from '../lib/use-game-preview';

export function GameCover({ game }: { game: Game }) {
  const originalCover = getGameCover(game);
  const screenshotPreview = useGamePreview(originalCover === game.screenshot ? game.screenshot : undefined);
  const cover = originalCover === game.screenshot ? screenshotPreview : originalCover;
  const [failedCover, setFailedCover] = useState<string>();
  const artwork = cover && cover !== failedCover ? cover : undefined;
  const artworkClass = artwork ? `has-artwork${artwork.startsWith('./covers/') ? ' bundled-artwork' : ''}` : 'fallback';
  return <div className={`game-cover ${artworkClass}`}>
    {artwork ? <><img className="cover-art" src={artwork} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailedCover(artwork)} /><span className="cover-shade" /></> : <><span className="cover-pattern" /><img className="cover-logo dark-invert" src="./brand/koki-symbol.svg" alt="" /></>}
    <span className="cover-title">{game.title}</span>
  </div>;
}
