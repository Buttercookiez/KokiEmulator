import { Capacitor, registerPlugin } from '@capacitor/core';
const playerUi = registerPlugin<{ setImmersive(options: { active: boolean }): Promise<void>; haptic(): Promise<void> }>('PlayerUi');
export function nativePlayerMode(active: boolean) { if (Capacitor.getPlatform() === 'android') void playerUi.setImmersive({ active }).catch(() => {}); }
let lastFeedback = 0;
export function touchFeedback() {
  const now = performance.now(); if (now - lastFeedback < 45) return; lastFeedback = now;
  if (Capacitor.getPlatform() === 'android') void playerUi.haptic().catch(() => {});
  else if (typeof navigator.vibrate === 'function') navigator.vibrate(8);
}
