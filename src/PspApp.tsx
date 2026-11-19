import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Heart, History, Library, Plus, Search, Settings2, SunMoon, Play, Trash2, Palette, LayoutGrid, List, ChevronDown } from 'lucide-react';
import { markStartupReady, rememberStartupAppearance } from './startup';
import { createThemeTokens } from './lib/themes';
import { readPspSettings, type PspSettings } from './lib/psp-settings';
import { isPspAndroid } from './lib/psp-android';
import { PspPlayer } from './components/PspPlayer';
import { PaletteChooser } from './components/PaletteChooser';
import { Select } from './components/Select';
import type { PspCheckpoint, PspGame, PspTiming } from './psp-types';
import pspNotice from '../licenses/psp/NOTICE.txt?raw';
import pspLicense from '../licenses/psp/GPL-3.0.txt?raw';
import pspThirdParty from '../licenses/psp/PPSSPP-COPYING.txt?raw';
import './App.css';
import './motion.css';
import './components/PspPlayer.css';

const navigation = [
  { id: 'library', name: 'Library', Icon: Library }, { id: 'favorites', name: 'Favorites', Icon: Heart },
  { id: 'saves', name: 'Saves', Icon: History }, { id: 'settings', name: 'Settings', Icon: Settings2 },
] as const;
type Page = typeof navigation[number]['id'];
const date = (time: number) => new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export default function PspApp() {
  const bridge = window.kokiPsp;
  const [games, setGames] = useState<PspGame[]>([]);
  const [checkpoints, setCheckpoints] = useState<PspCheckpoint[]>([]);
  const [page, setPage] = useState<Page>('library');
  const [colors, setColors] = useState(false);
  const [query, setQuery] = useState('');
  const [settings, setSettings] = useState(readPspSettings);
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  const [view, setView] = useState(() => localStorage.getItem('koki-psp-view') || 'grid');
  const [sort, setSort] = useState('recent');
  const [current, setCurrent] = useState<{ game: PspGame; timing: PspTiming; restore?: string }>();
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const working = useRef(false);
  const dark = settings.theme === 'dark' || settings.theme === 'system' && systemDark;
  const visible = useMemo(() => games
    .filter(game => (page !== 'favorites' || game.favorite) && game.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'size' ? b.bytes - a.bytes : (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || a.title.localeCompare(b.title)), [games, page, query, sort]);
  const recent = games.filter(game => game.lastPlayed).sort((a, b) => b.lastPlayed! - a.lastPlayed!)[0];
  async function refresh() {
    if (!bridge) return;
    const [items, states] = await Promise.all([bridge.games(), bridge.checkpoints()]);
    setGames(items); setCheckpoints(states);
  }
  useEffect(() => {
    let active = true;
    if (bridge) void Promise.all([bridge.games(), bridge.checkpoints()]).then(([items, states]) => {
      if (active) { setGames(items); setCheckpoints(states); }
    }).catch(failure => { if (active) setError(failure.message); }).finally(() => { if (active) markStartupReady(); });
    else markStartupReady();
    const off = window.kokiNative?.onBeforeClose?.(async () => { await bridge?.stop(); });
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change);
    return () => { active = false; off?.(); media.removeEventListener('change', change); };
  }, [bridge]);
  useEffect(() => {
    const theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    for (const [key, value] of Object.entries(createThemeTokens(theme, dark ? settings.darkColor : settings.lightColor))) document.documentElement.style.setProperty(key, value);
    localStorage.setItem('koki-psp-settings', JSON.stringify(settings));
    rememberStartupAppearance(settings.theme, settings.lightColor, settings.darkColor);
  }, [settings, dark]);
  async function run(operation: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await operation(); markStartupReady(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); working.current = false; }
  }
  function launch(game: PspGame, restore?: string) {
    if (!bridge) return;
    void run(async () => setCurrent({ game, timing: await bridge.start(game.id), restore }));
  }
  function navigate(id: Page) { setPage(id); setQuery(''); setColors(false); }
  if (!bridge) return <main className="content"><h1>Koki PSP</h1><p>Open the Koki PSP Windows or Android app to play.</p></main>;
  if (current) return <PspPlayer bridge={bridge} game={current.game} timing={current.timing} restore={current.restore} settings={settings} onSettings={setSettings} onExit={async () => {
    await bridge.stop(); setCurrent(undefined); navigate('library'); await refresh();
  }} />;
  const choose = () => void run(async () => {
    setImporting(true);
    try { const result = await bridge.choose(); setGames(await bridge.games()); setError(result.errors.join('\n')); navigate('library'); }
    finally { setImporting(false); }
  });
  function artwork(game: PspGame) {
    return <div className="game-cover fallback">{game.screenshot ? <img className="psp-game-art" src={game.screenshot} alt="" /> : <>
      <span className="cover-pattern" /><img className="cover-logo dark-invert" src="./brand/koki-symbol.svg" alt="" /></>}<span className="cover-title">{game.title}</span></div>;
  }
  return <div className="app psp-app">
    <aside className="sidebar"><div className="sidebar-header"><a className="brand sidebar-brand system-brand" href="#" onClick={event => { event.preventDefault(); navigate('library'); }}>
      <img className="dark-invert" src="./brand/koki-wordmark.svg" alt="Koki" /><span className="system-brand-label">PSP</span></a></div>
      <nav className="nav-items" aria-label="Main navigation">{navigation.map(({ id, name, Icon }) => <button key={id} type="button" className={'nav-item' + (page === id ? ' active' : '')} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={17} /><span className="nav-label">{name}</span></button>)}</nav>
      <div className="sidebar-bottom"><p className="muted">Koki PSP · 0.2.0</p></div>
    </aside>
    <main className="main-shell"><header className="app-chrome"><span className="brand mobile-brand system-brand"><img className="dark-invert" src="./brand/koki-wordmark.svg" alt="Koki" /><span className="system-brand-label">PSP</span></span>
      <div className="chrome-actions"><button className="icon-button" aria-label="Colors" onClick={() => { setColors(value => !value); setPage('settings'); }}><Palette size={18} /></button>
        <button className="icon-button" aria-label="Toggle light or dark mode" onClick={() => setSettings(value => ({ ...value, theme: dark ? 'light' : 'dark' }))}><SunMoon size={18} /></button></div></header>
      <div className="content motion-page"><div className="page-heading"><h1>{colors ? 'Colors' : page === 'library' ? 'Your library' : page === 'favorites' ? 'Favorites' : page === 'saves' ? 'Save history' : 'Settings'}</h1>
        {!colors && (page === 'library' || page === 'favorites') && <button className="button" disabled={busy} onClick={choose}><Plus size={17} /> Add games</button>}</div>
        {busy && <p className="settings-note" role="status">{importing ? 'Adding games… Large ZIP files may take a moment.' : 'Opening game…'}</p>}
        {error && <p className="psp-library-error" role="alert">{error}</p>}
        {colors ? <div className="colors-layout"><section className="colors-section" aria-label="Color customization">
          <div className="colors-mode"><div className="setting-row"><div className="setting-label"><h3>Theme</h3><p>Choose light, dark, or follow your device.</p></div><div className="theme-switch">{(['light', 'dark', 'system'] as const).map(theme => <button key={theme} aria-pressed={settings.theme === theme} className={settings.theme === theme ? 'active' : ''} onClick={() => setSettings(value => ({ ...value, theme }))}>{theme[0].toUpperCase() + theme.slice(1)}</button>)}</div></div></div>
          <PaletteChooser mode={dark ? 'dark' : 'light'} value={dark ? settings.darkColor : settings.lightColor}
            onChange={color => setSettings(value => ({ ...value, [dark ? 'darkColor' : 'lightColor']: color }))} />
        </section></div> : page === 'settings' ? <section className="settings-section psp-settings">
          <h2>Playback</h2><label className="setting-row"><span>Volume</span><input aria-label="Volume" type="range" min="0" max="1" step=".05" value={settings.volume} onChange={event => setSettings(value => ({ ...value, volume: Number(event.target.value) }))} /></label>
            <label className="setting-row"><span>Smooth image scaling</span><input type="checkbox" checked={settings.smoothing} onChange={event => setSettings(value => ({ ...value, smoothing: event.target.checked }))} /></label>
            <label className="setting-row"><span>Show touch controls</span><input type="checkbox" checked={settings.showControls} onChange={event => setSettings(value => ({ ...value, showControls: event.target.checked }))} /></label>
            <h2>Controller layouts</h2><p className="settings-note">Open a game and choose Edit controls to move buttons. Your landscape layout applies to all PSP games.</p>
            <h2>Keyboard and gamepad</h2><p className="settings-note">Arrow keys · D-pad. I J K L · analog stick. Z X A S · Cross, Circle, Square, Triangle. Q E · shoulders. Enter · Start. Right Shift · Select. Escape · pause. Standard Bluetooth and USB gamepads are supported.</p>
            <h2>Game saves</h2><p className="settings-note">In-game saves use the PSP memory stick. Checkpoints are available in Save history.</p>
            <button className="button" onClick={() => void run(() => bridge.saves())} disabled={busy}><FolderOpen size={16} />{isPspAndroid ? 'Export PSP memory stick' : 'Open PSP memory stick'}</button>
            <h2>About Koki PSP</h2><p className="settings-note">Version 0.2.1 · Powered by PPSSPP, GPL-2.0-or-later. PPSSPP and its contributors are credited in the bundled license notices. Import your own PSP games. Games are supplied separately.</p>
            <p className="settings-note">Support · johnfrancismarabe040905@gmail.com</p>
            <details className="psp-license"><summary>Open-source licenses</summary><pre>{pspNotice + '\n' + pspLicense + '\n' + pspThirdParty}</pre></details>
        </section> : page === 'saves' ? <section className="save-history">
          {!checkpoints.length && <section className="welcome"><div className="welcome-copy"><h2>Your progress, saved</h2><p>Save a checkpoint while playing to find it here.</p></div></section>}
          {games.filter(game => checkpoints.some(state => state.gameId === game.id)).map(game => <details className="save-game-group" key={game.id}><summary className="save-game-heading"><span className="save-game-art">{artwork(game)}</span><span className="save-game-heading-copy"><span className="save-game-title">{game.title}</span><span className="save-game-count">{checkpoints.filter(state => state.gameId === game.id).length} checkpoints</span></span><ChevronDown size={17} /></summary>
            {checkpoints.filter(state => state.gameId === game.id).map(state => <div className="psp-checkpoint-row" key={state.id}><span>{date(state.created)}<small>{(state.bytes / 1048576).toFixed(1)} MB</small></span><button className="button" disabled={busy} onClick={() => launch(game, state.id)}><Play size={15} />Load</button><button className="icon-button" disabled={busy} aria-label="Delete checkpoint" onClick={() => { if (confirm('Delete this checkpoint?')) void run(async () => { await bridge.deleteCheckpoint(state.id); await refresh(); }); }}><Trash2 size={16} /></button></div>)}</details>)}
        </section> : <>
          {page === 'library' && recent && !query && <section className="resume-card psp-resume">{recent.screenshot && <img src={recent.screenshot} alt="" />}<div className="resume-copy"><span className="eyebrow">Continue playing</span><h2>{recent.title}</h2><p>{date(recent.lastPlayed!)}</p><button className="button button-primary" disabled={busy} onClick={() => launch(recent, checkpoints.find(state => state.gameId === recent.id)?.id)}><Play size={16} fill="currentColor" />Resume game</button></div></section>}
          {games.length > 0 && <><div className="psp-library-heading"><h2>{page === 'favorites' ? 'Favorites' : 'All games'} <span className="badge">{visible.length}</span></h2></div><div className="library-toolbar"><label className="search-field"><Search size={17} /><input aria-label="Find a PSP game" placeholder="Find a game…" value={query} onChange={event => setQuery(event.target.value)} /></label><Select aria-label="Sort PSP games" value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Recently played' }, { value: 'title', label: 'Name' }, { value: 'size', label: 'Largest first' }]} /><div className="psp-view-switch">{[{ value: 'grid', Icon: LayoutGrid }, { value: 'list', Icon: List }].map(({ value, Icon }) => <button key={value} className={'icon-button' + (view === value ? ' active' : '')} aria-label={value + ' view'} aria-pressed={view === value} onClick={() => { setView(value); localStorage.setItem('koki-psp-view', value); }}><Icon size={17} /></button>)}</div></div></>}
          {!visible.length && <section className="welcome"><div className="welcome-copy"><h2>{games.length ? page === 'favorites' && !query ? 'Your favorites, together' : 'No games found' : 'Add your PSP games'}</h2><p>{games.length ? 'Mark a game with a heart or try another search.' : 'Import a ZIP, ISO, CSO, CHD, or PSP homebrew file to start playing.'}</p>{!games.length && <button className="button button-primary" onClick={choose} disabled={busy}><Plus size={16} />Add your first game</button>}</div></section>}
          <div className={'psp-games psp-view-' + view}>{visible.map(game => <article className="psp-game" key={game.id}>
            <button className="psp-game-launch" aria-label={'Play ' + game.title} disabled={busy} onClick={() => launch(game)}>{artwork(game)}</button>
            <div className="psp-game-actions"><span>{(game.bytes / 1048576).toFixed(1)} MB</span><button className="icon-button" aria-label={'Favorite ' + game.title} aria-pressed={game.favorite} onClick={() => void run(async () => { await bridge.favorite(game.id); setGames(await bridge.games()); })} disabled={busy}><Heart size={16} fill={game.favorite ? 'currentColor' : 'none'} /></button><button className="icon-button" aria-label={'Remove ' + game.title} onClick={() => { if (confirm('Remove ' + game.title + ' from your library?')) void run(async () => { await bridge.remove(game.id); setGames(await bridge.games()); }); }} disabled={busy}><Trash2 size={15} /></button></div>
          </article>)}</div>
        </>}
      </div>
    </main>
    <nav className="mobile-nav" aria-label="Mobile navigation">{navigation.map(({ id, name, Icon }) => <button key={id} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={20} /><span>{name}</span></button>)}</nav>
  </div>;
}
