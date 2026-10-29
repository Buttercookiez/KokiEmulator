import type { Settings } from '../types';
import { defaultTouchLayout, type TouchLayout } from './touch-layout';
// 0.1.0–0.1.3 stored stock DS positions as ordinary settings. Upgrade only
// untouched layouts; a user's moved or resized controls must remain intact.
export function legacyNdsTouchLayout(landscape = false): TouchLayout {
  const p = (x: number, y: number) => ({ x, y, scale: 1 });
  return { x:p(landscape ? .86 : .75,landscape ? .64 : .70), y:p(landscape ? .75 : .5,.77), dpad:p(0,.88), a:p(1,.78), b:p(landscape ? .87 : .75,.89), l:p(0,landscape ? .38 : .56), r:p(1,landscape ? .38 : .56), select:p(.32,1), start:p(.68,1) };
}
export function upgradeNdsPlayerDefaults(settings: Settings): Settings {
  const next = structuredClone(settings);
  for (const mode of ['portrait', 'landscape'] as const) {
    const old = legacyNdsTouchLayout(mode === 'landscape');
    if (Object.entries(old).every(([key, value]) => {
      const current = next.touchLayouts[mode][key as keyof TouchLayout];
      return current.x === value.x && current.y === value.y && current.scale === value.scale;
    })) next.touchLayouts[mode] = defaultTouchLayout(mode === 'landscape');
  }
  if (next.gameScreen.scale === .7 && next.gameScreen.position === 'top') next.gameScreen = {scale:1,position:'center'};
  if (next.rewindSeconds === 10) next.rewindSeconds = 0;
  return next;
}
