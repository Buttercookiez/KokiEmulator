import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Heart, History, Library, Plus, Search, Settings2, SunMoon, Play, Trash2, Palette, LayoutGrid, List, ChevronDown, Monitor, SlidersHorizontal, Keyboard, Smartphone, HardDrive } from 'lucide-react';
import { markStartupReady, rememberStartupAppearance } from './startup';
import { createThemeTokens } from './lib/themes';
import { readPspSettings, type PspSettings } from './lib/psp-settings';
import { isPspAndroid } from './lib/psp-android';
import { PspPlayer } from './components/PspPlayer';
import { PaletteChooser } from './components/PaletteChooser';
import { Select } from './components/Select';
import { SettingRow, Switch, ThemeSwitch } from './components/SettingsControls';
import type { PspCheckpoint, PspGame, PspTiming } from './psp-types';
import pspNotice from '../licenses/psp/NOTICE.txt?raw';
import pspLicense from '../licenses/psp/GPL-3.0.txt?raw';
import pspThirdParty from '../licenses/psp/PPSSPP-COPYING.txt?raw';
import './App.css';
import './motion.css';
import './components/PspPlayer.css';

const PSP_VERSION = '0.2.3';
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
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem('koki-reduced-motion') === 'true');
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
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
    localStorage.setItem('koki-reduced-motion', String(reducedMotion));
  }, [reducedMotion]);
  function changeSettings(patch: Partial<PspSettings>) {
    setSettings(current => ({ ...current, ...patch }));
  }
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
      <nav className="nav-items" aria-label="Main navigation">{navigation.slice(0, 3).map(({ id, name, Icon }) => <button key={id} type="button" className={'nav-item' + (page === id ? ' active' : '')} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={17} /><span className="nav-label">{name}</span>{id === 'library' && <span className="nav-count">{String(games.length).padStart(2, '0')}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><button type="button" className={'nav-item' + (page === 'settings' && !colors ? ' active' : '')}
        aria-label="Settings" aria-current={page === 'settings' && !colors ? 'page' : undefined} onClick={() => navigate('settings')}>
        <Settings2 size={17} /><span className="nav-label">Settings</span>
      </button></div>
    </aside>
    <main className="main-shell"><header className="app-chrome"><span className="brand mobile-brand system-brand"><img className="dark-invert" src="./brand/koki-wordmark.svg" alt="Koki" /><span className="system-brand-label">PSP</span></span>
      <div className="chrome-actions"><button className="icon-button" aria-label="Colors" onClick={() => { setColors(value => !value); setPage('settings'); }}><Palette size={18} /></button>
        <button className="icon-button" aria-label="Toggle light or dark mode" onClick={() => setSettings(value => ({ ...value, theme: dark ? 'light' : 'dark' }))}><SunMoon size={18} /></button></div></header>
      <div className="content motion-page"><div className="page-heading"><h1>{colors ? 'Colors' : page === 'library' ? 'Your library' : page === 'favorites' ? 'Favorites' : page === 'saves' ? 'Save history' : 'Settings'}</h1>
        {!colors && (page === 'library' || page === 'favorites') && <button className="button" disabled={busy} onClick={choose}><Plus size={17} /> Add games</button>}</div>
        {busy && <p className="settings-note" role="status">{importing ? 'Adding games… Large ZIP files may take a moment.' : 'Opening game…'}</p>}
        {error && <p className="psp-library-error" role="alert">{error}</p>}
        {colors ? <div className="colors-layout"><section className="colors-section" aria-label="Color customization">
          <div className="colors-mode"><SettingRow title="Theme" description="Choose light, dark, or follow your device.">
            <ThemeSwitch theme={settings.theme} onChange={theme => changeSettings({ theme })} />
          </SettingRow></div>
          <PaletteChooser mode={dark ? 'dark' : 'light'} value={dark ? settings.darkColor : settings.lightColor}
            onChange={color => setSettings(value => ({ ...value, [dark ? 'darkColor' : 'lightColor']: color }))} />
        </section></div> : page === 'settings' ? <div className="settings-layout">
          <section className="settings-section">
            <div className="settings-section-heading"><Monitor size={20} /><div><h2>Display</h2><p>Adjust image scaling and motion.</p></div></div>
            <SettingRow title="Screen filter" description="Keep pixels crisp or soften the display.">
              <Select value={settings.smoothing ? 'smooth' : 'pixel'} onChange={value => changeSettings({ smoothing: value === 'smooth' })}
                aria-label="Screen filter" options={[{ value: 'pixel', label: 'Crisp pixels' }, { value: 'smooth', label: 'Smooth' }]} />
            </SettingRow>
            <SettingRow title="Reduced motion" description="Keep transitions and animations to a minimum.">
              <Switch checked={reducedMotion} label="Reduced motion" onChange={setReducedMotion} />
            </SettingRow>
          </section>
          <section className="settings-section">
            <div className="settings-section-heading"><SlidersHorizontal size={20} /><div><h2>Play your way</h2></div></div>
            <SettingRow title="Volume">
              <input type="range" min={0} max={1} step={.05} value={settings.volume}
                onChange={event => changeSettings({ volume: Number(event.target.value) })} aria-label="Default volume" />
              <span className="range-value">{Math.round(settings.volume * 100)}%</span>
            </SettingRow>
          </section>
          <section className="settings-section">
            <div className="settings-section-heading"><Keyboard size={20} /><div><h2>Keyboard &amp; controller</h2><p>Standard Bluetooth and USB gamepads work automatically.</p></div></div>
            <dl className="psp-key-guide">
              <div><dt>D-pad</dt><dd><kbd>Arrow keys</kbd></dd></div>
              <div><dt>Analog stick</dt><dd><kbd>I</kbd> <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd></dd></div>
              <div><dt>Cross / Circle</dt><dd><kbd>Z</kbd> <kbd>X</kbd></dd></div>
              <div><dt>Square / Triangle</dt><dd><kbd>A</kbd> <kbd>S</kbd></dd></div>
              <div><dt>L / R</dt><dd><kbd>Q</kbd> <kbd>E</kbd></dd></div>
              <div><dt>Start / Select</dt><dd><kbd>Enter</kbd> <kbd>Right Shift</kbd></dd></div>
              <div><dt>Pause</dt><dd><kbd>Esc</kbd></dd></div>
            </dl>
          </section>
          <section className="settings-section">
            <div className="settings-section-heading"><Smartphone size={20} /><div><h2>Touch controls</h2></div></div>
            <SettingRow title="On-screen controls" description="Show the touch keypad while playing on a phone.">
              <Switch checked={settings.showControls} label="On-screen controls" onChange={showControls => changeSettings({ showControls })} />
            </SettingRow>
            <SettingRow title="Button opacity">
              <input type="range" min={.15} max={1} step={.05} value={settings.touchOpacity}
                onChange={event => changeSettings({ touchOpacity: Number(event.target.value) })} aria-label="Touch button opacity" />
              <span className="range-value">{Math.round(settings.touchOpacity * 100)}%</span>
            </SettingRow>
            <p className="settings-note">Open a game and choose Edit controls to move or resize buttons. Your landscape layout applies to all PSP games.</p>
          </section>
          <section className="settings-section">
            <div className="settings-section-heading"><HardDrive size={20} /><div><h2>Your data, on your device</h2><p>Games, screenshots, and saves stay local.</p></div></div>
            <p className="settings-note">In-game saves use the PSP memory stick. Checkpoints are available in Save history.</p>
            <div className="storage-actions"><button className="button" onClick={() => void run(() => bridge.saves())} disabled={busy}>
              <FolderOpen size={15} />{isPspAndroid ? 'Export PSP memory stick' : 'Open PSP memory stick'}
            </button></div>
          </section>
          <section className="settings-section" aria-label="About Koki PSP">
            <details className="psp-license"><summary>About Koki PSP</summary>
              <p className="settings-note">Version {PSP_VERSION} · Powered by PPSSPP, GPL-2.0-or-later. Import your own PSP games.</p>
              <p className="settings-note">Support · johnfrancismarabe040905@gmail.com</p>
              <details className="psp-license"><summary>Open-source licenses</summary><pre>{pspNotice + '\n' + pspLicense + '\n' + pspThirdParty}</pre></details>
            </details>
          </section>
        </div> : page === 'saves' ? <section className="save-history">
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
    <nav className="mobile-nav" aria-label="Mobile navigation">{navigation.map(({ id, name, Icon }) => <button key={id} className={page === id && !colors ? 'active' : ''} aria-current={page === id && !colors ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={20} /><span>{name}</span></button>)}</nav>
  </div>;
}
