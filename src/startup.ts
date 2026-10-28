import { createThemeTokens } from './lib/themes';

type StartupAppearance = { theme: 'system' | 'light' | 'dark'; lightColor: string; darkColor: string };
const root = document.documentElement;
const appRoot = document.getElementById('root');
const splash = document.querySelector<HTMLElement>('[data-startup-splash]');
const started = performance.now();
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let ready = false;
let closing = false;
let completed = !splash;
let readyTimer: ReturnType<typeof setTimeout> | undefined;
let removeTimer: ReturnType<typeof setTimeout> | undefined;
let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

function readPreference(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function reducedMotion() {
  return motionQuery.matches || root.dataset.reducedMotion === 'true';
}
function clearTimers() {
  clearTimeout(readyTimer);
  clearTimeout(removeTimer);
  clearTimeout(deadlineTimer);
}
function complete(reason: string) {
  if (completed) return;
  completed = true;
  clearTimers();
  splash?.remove();
  if (appRoot) { appRoot.inert = false; appRoot.removeAttribute('aria-busy'); }
  root.dataset.startup = 'complete';
  document.dispatchEvent(new CustomEvent('koki:startup-complete', { detail: { reason } }));
}
function dismiss(reason: string, immediate = false) {
  if (completed || closing) return;
  closing = true;
  clearTimeout(readyTimer);
  clearTimeout(deadlineTimer);
  root.dataset.startup = 'leaving';
  if (splash) splash.dataset.leaving = 'true';
  if (immediate || reducedMotion()) complete(reason);
  else removeTimer = setTimeout(() => complete(reason), 180);
}
function recovery(message: string, banner: boolean) {
  if (!appRoot) return;
  document.querySelector('[data-startup-recovery]')?.remove();
  const panel = document.createElement('section');
  panel.className = 'startup-recovery';
  panel.setAttribute('data-startup-recovery', '');
  panel.setAttribute('role', 'alert');
  if (banner) panel.dataset.banner = 'true';
  const text = document.createElement('p');
  text.textContent = message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Reload';
  retry.addEventListener('click', () => location.reload());
  panel.append(text, retry);
  if (banner) document.body.append(panel);
  else appRoot.replaceChildren(panel);
}

/** The initial library read, including its error state, has finished rendering. */
export function markStartupReady() {
  ready = true;
  document.querySelector('[data-startup-recovery]')?.remove();
  if (completed || closing) return;
  clearTimeout(deadlineTimer);
  clearTimeout(readyTimer);
  const remaining = reducedMotion() ? 0 : Math.max(0, 1100 - (performance.now() - started));
  if (!remaining) dismiss('ready');
  else readyTimer = setTimeout(() => dismiss('ready'), remaining);
}

/** Cache only appearance for the next first paint; the library remains authoritative. */
export function rememberStartupAppearance(theme: StartupAppearance['theme'], lightColor: string, darkColor: string) {
  try { localStorage.setItem('koki-startup-appearance', JSON.stringify({ theme, lightColor, darkColor })); } catch { /* Storage can be unavailable; system colors remain usable. */ }
}

if (splash) {
  // Set blocking only after bootstrap executes. If its module cannot load, the
  // static shell reveals a plain Reload link after six seconds instead.
  if (appRoot) { appRoot.inert = true; appRoot.setAttribute('aria-busy', 'true'); }
  deadlineTimer = setTimeout(() => {
    if (ready || completed) return;
    const rendered = !!appRoot?.hasChildNodes();
    dismiss('timeout', true);
    recovery(rendered ? 'Still opening your library.' : 'Koki could not finish opening.', rendered);
  }, 6000);
  splash.querySelector('[data-startup-fallback]')?.remove();
  try {
    const stored = readPreference('koki-startup-appearance');
    let appearance: Partial<StartupAppearance> = {};
    try { if (stored) appearance = JSON.parse(stored) || {}; } catch { /* Ignore an invalid appearance cache. */ }
    const theme = ['light', 'dark', 'system'].includes(appearance.theme || '') ? appearance.theme : 'system';
    const mode = theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : theme as 'light' | 'dark';
    root.dataset.theme = mode;
    root.dataset.reducedMotion = String(readPreference('koki-reduced-motion') === 'true');
    const tokens = createThemeTokens(mode, (mode === 'dark' ? appearance.darkColor : appearance.lightColor) || 'monochrome');
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens['--bg']);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!completed) document.dispatchEvent(new CustomEvent('koki:startup-painted'));
    }));
  } catch { /* Default/system CSS still renders a usable splash. */ }
  motionQuery.addEventListener('change', () => { if (ready && reducedMotion()) dismiss('ready', true); });
  void import('./main').catch(error => {
    dismiss('error', true);
    recovery('Koki could not start. Reload to try again.', false);
    console.error('Koki startup failed.', error);
  });
}
