import { IS_NDS, NDS_ENGINE_ID } from '../platform';
import { NdsEmulator, type DsLayout } from '../lib/nds-emulator';
import type { EmulatorButton } from '../types';
import './NdsPlayer.css';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ArrowLeft, Camera, Menu, SlidersHorizontal, X, Expand, FastForward, Gamepad2, History, LoaderCircle, Pause, Play, Rewind, RotateCcw, Save, Trash2, Volume2, VolumeX } from 'lucide-react';
import type { Game, GameProfile, Settings, Snapshot } from '../types';
import { GbaEmulator } from '../lib/emulator';
import { resolveKeyboardButton } from '../lib/controls';
import { createSnapshot, prepareNdsEngine, deleteSnapshot, downloadBlob, getRom, getSnapshotData, getSnapshots, readBattery, updateGame, writeBattery } from '../lib/library';
import { Modal } from './Modal';
import { Select } from './Select';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { nativePlayerMode, touchFeedback } from '../lib/native-player';
import type { GameScreen } from '../lib/mobile-play';
import { TouchController } from './TouchController';
import './Player.css';

type Props = { game: Game; settings: Settings; initialSnapshot?: Snapshot; skipAutoResume?: boolean; registerCloseSave: (handler: (() => Promise<void>) | null) => void; onSettings: (patch: Partial<Settings>) => void; onProfileSettings: (patch: GameProfile) => void; onClose: () => void; notify: (message: string, error?: boolean) => void };
const CONTROLS_IDLE_MS = 2000;
function dataUrl(blob: Blob): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error ?? new Error('Could not read screenshot')); reader.readAsDataURL(blob); }); }
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function keyLabel(code: string) { return code.replace(/^Key|^Digit/, '').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('ShiftRight', 'R Shift').replace('ShiftLeft', 'L Shift'); }
function isEditingControl(event: KeyboardEvent) {
  const element = event.target instanceof HTMLElement ? event.target : null;
  if (element?.isContentEditable || element?.closest('textarea, select, [contenteditable="true"], [role="textbox"], [data-select-open="true"], [role="listbox"]')) return true;
  const input = element?.closest('input');
  // Volume keeps its native navigation; other game keys still work while it has focus.
  if (input?.type === 'range') return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key);
  return Boolean(input);
}

export function Player({ game, settings, initialSnapshot, skipAutoResume = false, registerCloseSave, onSettings, onProfileSettings, onClose, notify }: Props) {
  const [dsLayout,setDsLayout] = useState<DsLayout>(()=> { const x=settings.dsLayout ?? localStorage.getItem('koki-nds-layout'); return x==='horizontal'||x==='bottom'?x:'vertical'; });
  const [dsSwap,setDsSwap] = useState(settings.dsSwap === true);
  const shell = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const heldKeys = useRef(new Map<string, EmulatorButton>());
  const touchButtons = useRef(new Map<number, EmulatorButton[]>());
  const rewindPointers = useRef(new Set<number>());
  const rewindKey = useRef(false);
  const emulator = useRef<GbaEmulator | NdsEmulator | null>(null);
  const currentSettings = useRef(settings); currentSettings.current = settings;
  const [ready, setReady] = useState(false); const [error, setError] = useState(''); const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false); const [closing, setClosing] = useState(false); const [stats, setStats] = useState({ fps: 0, rewindSeconds: 0 });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pendingRestore, setPendingRestore] = useState<Snapshot | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]); const [showSaves, setShowSaves] = useState(false); const [label, setLabel] = useState('');
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width:650px), (pointer:coarse)').matches);
  const [previewScreen, setPreviewScreen] = useState<GameScreen | null>(null);
  const [menuOpen, setMenuOpen] = useState(false); const [editingTouch, setEditingTouch] = useState(false);
  const editorWasRunning = useRef(false);
  const [showTouch, setShowTouch] = useState(() => settings.touchControls && window.matchMedia('(max-width:650px), (pointer:coarse)').matches);
  const [pressed, setPressed] = useState<Set<EmulatorButton>>(new Set()); const [rewinding, setRewinding] = useState(false); const [playerNotice, setPlayerNotice] = useState('');
  const [controlsVisible, setControlsVisible] = useState(true); const [controlFocused, setControlFocused] = useState(false); const [touchCount, setTouchCount] = useState(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const idlePinned = useRef(true); const lastActivity = useRef(performance.now());
  const keyboardNavigation = useRef(false); const fullscreenExitAt = useRef(-Infinity);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const runningSince = useRef<number | null>(null); const played = useRef(0); const closingRef = useRef(false);
  const modalOpen = useRef(showSaves); modalOpen.current = showSaves || editingTouch;
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => { const media = window.matchMedia('(max-width:650px), (pointer:coarse)'); const update = () => { setMobile(media.matches); setMenuOpen(false); }; media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  function editTouchControls() { editorWasRunning.current = Boolean(emulator.current?.isRunning); emulator.current?.pause(); releaseControls(); stopClock(); setPaused(true); setMenuOpen(false); setShowTouch(true); setEditingTouch(true); }
  function finishTouchEditor() { setEditingTouch(false); setPreviewScreen(null); if (editorWasRunning.current) { emulator.current?.play(); setPaused(false); startClock(); } requestAnimationFrame(focusGame); }
  function scheduleHide() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (idlePinned.current) return;
    const delay = Math.max(0, CONTROLS_IDLE_MS - (performance.now() - lastActivity.current));
    idleTimer.current = setTimeout(() => {
      if (!idlePinned.current && !shell.current?.querySelector('[data-select-open="true"]')) setControlsVisible(false);
    }, delay);
  }
  function revealControls() { lastActivity.current = performance.now(); setControlsVisible(true); scheduleHide(); }
  function focusGame() { canvas.current?.focus({ preventScroll: true }); }
  function finishPointerAction() { if (!keyboardNavigation.current) focusGame(); }
  function syncButton(button: EmulatorButton) {
    const down = [...heldKeys.current.values(), ...[...touchButtons.current.values()].flat()].includes(button);
    emulator.current?.setButton(button, down);
    setPressed(previous => { const next = new Set(previous); down ? next.add(button) : next.delete(button); return next; });
  }
  function syncRewind() { const down = rewindKey.current || rewindPointers.current.size > 0; emulator.current?.setRewinding(down); setRewinding(down); }
  function releaseControls() {
    heldKeys.current.clear(); touchButtons.current.clear(); rewindPointers.current.clear(); rewindKey.current = false;
    const core = emulator.current; core?.releaseButtons(); core?.setRewinding(false); core?.setSpeed(currentSettings.current.speed);
    setPressed(new Set()); setRewinding(false); setTouchCount(0);
  }
  function announce(text: string) { setPlayerNotice(text); if (noticeTimer.current) clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setPlayerNotice(''), 3500); }
  function stopClock() { if (runningSince.current !== null) { played.current += (performance.now() - runningSince.current) / 1000; runningSince.current = null; } }
  function startClock() { if (runningSince.current === null) runningSince.current = performance.now(); }
  function playedSeconds() { return Math.round(game.playTime + played.current + (runningSince.current === null ? 0 : (performance.now() - runningSince.current) / 1000)); }
  async function persistBattery() { const core = emulator.current; if (!core?.loaded) return; const bytes = core.exportSave(); if (bytes?.length) await writeBattery(game.id, bytes); await updateGame(game.id, { playTime: playedSeconds(), lastPlayed: Date.now() }); setSavedAt(Date.now()); }
  async function checkpoint(kind: Snapshot['kind'], name: string) {
    const core = emulator.current; if (!core?.loaded) throw new Error('The game is still loading.');
    const bytes = core.saveState(); let thumbnail: string | undefined;
    try { thumbnail = await dataUrl(await core.screenshot()); } catch { /* The state remains useful when a screenshot is unavailable. */ }
    await createSnapshot(game.id, bytes, { label: name, kind, thumbnail });
    if (thumbnail) await updateGame(game.id, { screenshot: thumbnail });
    await persistBattery();
  }
  function queueSave(kind: Snapshot['kind'], name: string) { const next = saving.current.catch(() => undefined).then(() => checkpoint(kind, name)); saving.current = next; return next; }
  async function job(action: () => Promise<void>) { if (busy || closingRef.current) return; setBusy(true); try { await action(); } catch (failure) { notify(message(failure), true); announce(message(failure)); } finally { setBusy(false); } }
  async function quickSave() { await job(async () => { await queueSave('manual', 'Quick save'); announce('Checkpoint saved on this device'); }); finishPointerAction(); }
  async function restore(snapshot: Snapshot) { await job(async () => { await queueSave('backup', 'Before restoring a checkpoint'); const bytes = await getSnapshotData(snapshot.id); emulator.current?.loadState(bytes); await persistBattery(); setShowSaves(false); emulator.current?.play(); setPaused(false); startClock(); requestAnimationFrame(focusGame); announce(`Restored ${snapshot.label}`); }); }
  async function quickLoad() { const available = await getSnapshots(game.id); const latest = available.find(item => item.kind === 'manual') ?? available[0]; if (!latest) { announce('Create a checkpoint first'); return; } await restore(latest); }
  function togglePause() { const core = emulator.current; if (!core?.loaded) return; revealControls(); if (core.isRunning) { core.pause(); releaseControls(); setPaused(true); stopClock(); void queueSave('auto', 'Auto-save').catch(failure => notify(message(failure), true)); } else { core.play(); setPaused(false); startClock(); focusGame(); } }
  async function leaveFullscreen() { if (document.fullscreenElement?.contains(shell.current)) await document.exitFullscreen(); }
  async function toggleFullscreen() {
    revealControls();
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { /* The full-window player remains available if fullscreen is denied. */ }
    finishPointerAction();
  }
  async function closePlayer() {
    if (closingRef.current) return;
    closingRef.current = true; setClosing(true); stopClock(); emulator.current?.pause(); releaseControls(); setPaused(true);
    try {
      if (emulator.current?.loaded) await queueSave('auto', 'Auto-save');
      await leaveFullscreen().catch(() => undefined);
      emulator.current?.destroy(); onClose();
    } catch (failure) {
      closingRef.current = false; setClosing(false); notify(`Could not save before closing: ${message(failure)}. Your game is paused so you can retry.`, true); announce('Save failed. Your game is still open; try saving again.');
    }
  }
  async function showSaveHistory() { if (!ready || busy) return; setPendingRestore(null); emulator.current?.pause(); releaseControls(); stopClock(); setPaused(true); setSnapshots(await getSnapshots(game.id)); setShowSaves(true); }

  const pinControls = menuOpen || editingTouch || !ready || Boolean(error) || paused || showSaves || busy || closing || rewinding || touchCount > 0 || controlFocused;
  useEffect(() => {
    idlePinned.current = pinControls;
    if (pinControls) { if (idleTimer.current) clearTimeout(idleTimer.current); setControlsVisible(true); }
    else { lastActivity.current = performance.now(); scheduleHide(); }
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [pinControls]);
  useEffect(() => {
    document.documentElement.setAttribute('data-player-open', 'true'); nativePlayerMode(true);
    return () => { document.documentElement.removeAttribute('data-player-open'); nativePlayerMode(false); };
  }, []);
  useEffect(() => {
    const onFullscreen = () => { if (!document.fullscreenElement) fullscreenExitAt.current = performance.now(); releaseControls(); revealControls(); };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => { document.removeEventListener('fullscreenchange', onFullscreen); if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, []);
  useEffect(() => {
    let disposed = false;
    const core = new (IS_NDS ? NdsEmulator : GbaEmulator)(canvas.current!, { onStats: value => { if (!disposed) setStats(value); }, onError: failure => { if (!disposed) { setError(failure.message); releaseControls(); stopClock(); } } });
    emulator.current = core;
    void (async () => {
      try {
        const legacyCheckpoints = IS_NDS ? await prepareNdsEngine() : false;
        if (initialSnapshot && IS_NDS && initialSnapshot.engine !== NDS_ENGINE_ID) throw new Error('This checkpoint uses the earlier DS engine. It is kept in history; start the game from its in-game save.');
        const [rom, battery, saves] = await Promise.all([getRom(game.id), readBattery(game.id), getSnapshots(game.id)]);
        const resume = initialSnapshot ?? (!skipAutoResume && currentSettings.current.autoResume ? saves.find(item => item.kind === 'auto' && (!IS_NDS || item.engine === NDS_ENGINE_ID)) : undefined);
        const state = resume ? await getSnapshotData(resume.id) : undefined;
        if (disposed) return;
        await core.load(rom, battery ?? undefined, state);
        if (legacyCheckpoints && !disposed) notify('Earlier DS checkpoints are kept in history. Continuing from the in-game save.');
        if (disposed) { core.destroy(); return; }
        core.setTurbo(currentSettings.current.turbo); core.setSpeed(currentSettings.current.speed); core.setVolume(currentSettings.current.volume); core.setRewindSeconds(currentSettings.current.rewindSeconds);
        core.play(); startClock(); setReady(true); await updateGame(game.id, { lastPlayed: Date.now() });
      } catch (failure) { if (!disposed) setError(message(failure)); }
    })();
    const batteryTimer = setInterval(() => { if (core.loaded) { const task = saving.current.catch(() => undefined).then(persistBattery); saving.current = task; void task.catch(failure => { if (!disposed) notify(`Save could not be written: ${message(failure)}`, true); }); } }, 15000);
    const stateTimer = setInterval(() => { if (core.loaded && core.isRunning) void queueSave('auto', 'Auto-save').catch(failure => { if (!disposed) notify(message(failure), true); }); }, 60000);
    let lifecycleSave: Promise<void> | null = null;
    const saveBeforeSuspend = () => {
      if (lifecycleSave) return lifecycleSave;
      core.pause(); releaseControls(); stopClock(); setPaused(true);
      if (!core.loaded) return Promise.resolve();
      lifecycleSave = queueSave('auto', 'Auto-save').then(() => undefined).catch(failure => { notify(`Your progress could not be saved: ${message(failure)}`, true); throw failure; }).finally(() => { lifecycleSave = null; });
      return lifecycleSave;
    };
    registerCloseSave(saveBeforeSuspend);
    const nativeState = Capacitor.isNativePlatform() ? NativeApp.addListener('appStateChange', state => { if (!state.isActive) void saveBeforeSuspend().catch(() => undefined); }) : null;
    const onVisibility = () => { if (document.hidden && core.loaded) void saveBeforeSuspend().catch(() => undefined); };
    const onBlur = () => releaseControls();
    document.addEventListener('visibilitychange', onVisibility); window.addEventListener('blur', onBlur);
    return () => { disposed = true; registerCloseSave(null); if (nativeState) void nativeState.then(listener => listener.remove()).catch(() => undefined); clearInterval(batteryTimer); clearInterval(stateTimer); if (noticeTimer.current) clearTimeout(noticeTimer.current); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('blur', onBlur); stopClock(); core.destroy(); emulator.current = null; };
  // A player instance belongs to exactly one game. Live settings use currentSettings.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);
  useEffect(()=>{if(emulator.current instanceof NdsEmulator){emulator.current.setLayout(dsLayout,dsSwap);localStorage.setItem('koki-nds-layout',dsLayout);}},[dsLayout,dsSwap,ready]);
  useEffect(() => { if (ready) focusGame(); }, [ready]);
  useEffect(() => { const core = emulator.current; if (!core?.loaded) return; core.setTurbo(settings.turbo); core.setVolume(settings.volume); core.setSpeed(settings.speed); core.setRewindSeconds(settings.rewindSeconds); }, [settings.volume, settings.speed, settings.rewindSeconds, settings.turbo, ready]);
  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      keyboardNavigation.current = true;
      if (event.key === 'Tab' && !modalOpen.current) {
        const wasHidden = !controlsVisible;
        revealControls();
        const focusable = [...(shell.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), canvas[tabindex]') ?? [])].filter(element => element.getClientRects().length);
        if (wasHidden) { event.preventDefault(); requestAnimationFrame(() => (event.shiftKey ? focusable.at(-1) : focusable[0])?.focus()); }
        else if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
        return;
      }
      if (!ready || modalOpen.current || event.defaultPrevented || event.isComposing || isEditingControl(event)) return;
      const core = emulator.current; if (!core?.loaded || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      // Space and Enter activate a focused toolbar button through its native click behavior.
      if (target?.closest('button') && (event.code === 'Space' || event.code === 'Enter')) return;
      const button = (IS_NDS ? (event.code === (currentSettings.current.dsControls?.x ?? 'KeyI') ? 'x' : event.code === (currentSettings.current.dsControls?.y ?? 'KeyU') ? 'y' : undefined) : undefined) ?? resolveKeyboardButton(event.code, currentSettings.current.controls);
      if (button) { if (!core.isRunning) return; event.preventDefault(); heldKeys.current.set(event.code, button); syncButton(button); return; }
      if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) togglePause(); }
      if (event.code === 'ShiftLeft' && core.isRunning) { event.preventDefault(); core.setSpeed(4); }
      if (event.code === 'Backquote' && core.isRunning) { event.preventDefault(); rewindKey.current = true; syncRewind(); revealControls(); }
      if (event.code === 'F5') { event.preventDefault(); if (!event.repeat) void quickSave(); }
      if (event.code === 'F8') { event.preventDefault(); if (!event.repeat) void quickLoad().catch(failure => notify(message(failure), true)); }
      if (event.code === 'Escape' && !event.repeat) { event.preventDefault(); if (menuOpen) { setMenuOpen(false); focusGame(); return; } if (document.fullscreenElement) void toggleFullscreen(); else if (performance.now() - fullscreenExitAt.current > 400) void closePlayer(); }
    };
    const onUp = (event: KeyboardEvent) => {
      const core = emulator.current; if (!core) return;
      const button = heldKeys.current.get(event.code);
      if (button) { event.preventDefault(); heldKeys.current.delete(event.code); syncButton(button); }
      if (event.code === 'ShiftLeft') core.setSpeed(currentSettings.current.speed);
      if (event.code === 'Backquote') { rewindKey.current = false; syncRewind(); }
    };
    document.addEventListener('keydown', onDown); document.addEventListener('keyup', onUp);
    return () => { document.removeEventListener('keydown', onDown); document.removeEventListener('keyup', onUp); };
  });

  function touch(button: EmulatorButton, down: boolean, event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault(); revealControls();
    if (down) { if (!ready || paused) return; event.currentTarget.setPointerCapture(event.pointerId); touchButtons.current.set(event.pointerId, [button]); if (currentSettings.current.touchVibration) touchFeedback(); }
    else { const previous = touchButtons.current.get(event.pointerId); touchButtons.current.delete(event.pointerId); if (previous) previous.forEach(syncButton); }
    setTouchCount(touchButtons.current.size); syncButton(button);
  }
  function touchProps(button: EmulatorButton) {
    return {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => touch(button, true, event),
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => touch(button, false, event),
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => touch(button, false, event),
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => { const previous = touchButtons.current.get(event.pointerId); touchButtons.current.delete(event.pointerId); setTouchCount(touchButtons.current.size); if (previous) previous.forEach(syncButton); },
    };
  }
  function rewindHold(down: boolean, event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault(); revealControls();
    if (down) { if (!ready || paused) return; event.currentTarget.setPointerCapture(event.pointerId); rewindPointers.current.add(event.pointerId); }
    else rewindPointers.current.delete(event.pointerId);
    syncRewind();
  }
  function dpadTouch(buttons: EmulatorButton[], pointer: number) {
    const previous = touchButtons.current.get(pointer) ?? [];
    const next = ready && !paused ? buttons : [];
    if (next.length) touchButtons.current.set(pointer, next); else touchButtons.current.delete(pointer);
    new Set([...previous, ...next]).forEach(syncButton); setTouchCount(touchButtons.current.size);
    if (next.length && next.some(button => !previous.includes(button)) && currentSettings.current.touchVibration) touchFeedback();
    revealControls();
  }
  function saveTouchPreferences(patch: Partial<Settings>, scope: 'game' | 'global') {
    if (scope === 'game') { onProfileSettings(patch); if (!settings.touchControls) onSettings({touchControls:true}); }
    else { onSettings(patch); onProfileSettings({touchLayouts:undefined,touchOpacity:undefined,gameScreen:undefined,turbo:undefined,touchVibration:undefined}); }
    announce(scope === 'game' ? 'Controls saved for this game' : 'Default controls updated');
  }
  function updateControlFocus() { setControlFocused(Boolean(document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-player-chrome]'))); }

  const gamePicture = previewScreen ?? settings.gameScreen;
  const picturePosition = IS_NDS && !mobile ? 'center' : gamePicture.position;
  const dsOptions = IS_NDS && <div className="nds-screen-options"><Select aria-label="DS screen layout" value={dsLayout} onChange={v=>{setDsLayout(v as DsLayout);onSettings({dsLayout:v as DsLayout});}} options={[{value:"vertical",label:"Stacked screens"},{value:"horizontal",label:"Side by side"},{value:"bottom",label:"Touchscreen only"}]} /><button className="player-control" onClick={()=>{setDsSwap(v=>!v);onSettings({dsSwap:!dsSwap});}} aria-pressed={dsSwap}>Swap screens</button><span>X/Y keys in Settings · Touch the lower screen</span></div>;
  return <div ref={shell} className="player-shell immersive-player" style={{'--game-screen-scale': (gamePicture.scale * 100) + '%', '--game-screen-position': picturePosition, '--game-screen-align': picturePosition === 'top' ? 'flex-start' : picturePosition === 'bottom' ? 'flex-end' : 'center'} as CSSProperties} data-mobile={mobile} data-controls-visible={controlsVisible} data-player-state={error ? 'error' : !ready ? 'loading' : paused ? 'paused' : 'running'} role="dialog" aria-modal="true" aria-label={`${game.title} player`}
    onPointerMove={revealControls} onPointerDownCapture={() => { keyboardNavigation.current = false; revealControls(); }}
    onFocusCapture={() => { updateControlFocus(); revealControls(); }} onBlurCapture={() => { queueMicrotask(updateControlFocus); }}>
    <header className="player-header" data-player-chrome inert={mobile || !controlsVisible} aria-hidden={mobile || !controlsVisible}>
      <div className="player-heading"><button className="icon-button" onClick={() => void closePlayer()} disabled={closing} aria-label="Save and return to library">{closing ? <LoaderCircle size={17} className="spinner" /> : <ArrowLeft size={18} />}</button><div><h2>{game.title}</h2></div></div>
      <div className="player-header-actions"><div className="player-secondary-tools"><button className={`icon-button ${showTouch ? 'active' : ''}`} onClick={() => { setShowTouch(value => !value); finishPointerAction(); }} aria-label="Toggle on-screen controls" aria-pressed={showTouch}><Gamepad2 size={18} /></button><button className="icon-button" disabled={!ready || busy} onClick={() => void job(async () => { const blob = await emulator.current!.screenshot(); await downloadBlob(blob, `${game.title}-screenshot.png`); announce('Screenshot exported'); }).finally(finishPointerAction)} aria-label="Export screenshot"><Camera size={18} /></button></div><button className="icon-button" onClick={() => void toggleFullscreen()} aria-label="Toggle fullscreen"><Expand size={17} /></button></div>
    </header>
    {!mobile && dsOptions}
    <div className="player-screen-area"><div className={`player-screen-wrap filter-${settings.filter}`}><canvas ref={canvas} width={240} height={160} tabIndex={0} onPointerDown={focusGame} data-system={IS_NDS ? "nds" : "gba"} aria-label={`${game.title} game screen`} aria-describedby="player-keyboard" /></div>
      {!ready && !error && <div className="player-message"><LoaderCircle className="spinner" size={26} /><h3>Loading game</h3></div>}
      {error && <div className="player-message"><Gamepad2 size={28} /><h3>Couldn’t start this game</h3><p>{error}</p><div className="player-error-actions"><button className="button" onClick={() => void closePlayer()}>Return to library</button></div></div>}
      {ready && paused && !showSaves && !editingTouch && <div className="player-message"><Pause size={25} /><h3>Paused</h3><button className="button" onClick={togglePause}><Play size={15} />Keep playing</button></div>}
      {busy && <span className="player-status" role="status">Saving…</span>}
      {playerNotice && <div className="player-toast" role="status">{playerNotice}</div>}
    </div>
    {mobile && !editingTouch && <button className="mobile-game-menu-toggle" data-player-chrome aria-label={menuOpen ? 'Close game menu' : 'Open game menu'} aria-expanded={menuOpen} aria-controls="mobile-game-menu" onClick={() => { releaseControls(); setMenuOpen(value => !value); revealControls(); }}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>}
    {mobile && menuOpen && <button className="mobile-game-menu-dismiss" aria-label="Dismiss game menu" onClick={() => { setMenuOpen(false); focusGame(); }} />}
    <div id="mobile-game-menu" className="player-bottom-chrome" data-menu-open={menuOpen} data-player-chrome inert={mobile ? !menuOpen : !controlsVisible} aria-hidden={mobile ? !menuOpen : !controlsVisible}>
      {mobile && dsOptions}
      {mobile && <div className="mobile-game-menu-heading"><strong>{game.title}</strong><span>{busy ? 'Saving…' : savedAt ? 'Saved on this device' : 'Game menu'}</span></div>}
      {mobile && <div className="mobile-game-tools">
        <button className="player-control" disabled={closing} onClick={() => void closePlayer()} aria-label="Save and return to library"><ArrowLeft size={18} />Library</button>
        <button className="player-control" disabled={!ready || busy} onClick={() => { setMenuOpen(false); editTouchControls(); }}><SlidersHorizontal size={18} />Edit controls</button>
        <button className="player-control" aria-label="Toggle fullscreen" onClick={() => void toggleFullscreen()}><Expand size={18} />Fullscreen</button>
        <button className="player-control" aria-label="Toggle on-screen controls" aria-pressed={showTouch && settings.touchControls} onClick={() => { const next = !(showTouch && settings.touchControls); setShowTouch(next); if (next && !settings.touchControls) onSettings({ touchControls: true }); }}><Gamepad2 size={18} />Controls</button>
        <button className="player-control" disabled={!ready || busy} aria-label="Export screenshot" onClick={() => void job(async () => { await downloadBlob(await emulator.current!.screenshot(), game.title + '-screenshot.png'); announce('Screenshot exported'); })}><Camera size={18} />Screenshot</button>
      </div>}

      <div className="player-toolbar">
        <button className="player-control" disabled={!ready || closing} onClick={togglePause}>{paused ? <Play size={17} /> : <Pause size={17} />}{paused ? 'Resume' : 'Pause'}<kbd>Space</kbd></button>
        <button className="player-control" disabled={!ready || busy || closing} onClick={() => void quickSave()}><Save size={17} />Save<kbd>F5</kbd></button>
        <button className="player-control" disabled={!ready || busy || closing} onClick={() => void showSaveHistory().catch(failure => notify(message(failure), true))}><History size={17} />Saves</button>
        <button className={`player-control ${rewinding ? 'active' : ''}`} disabled={!ready || paused || settings.rewindSeconds === 0} onPointerDown={event => rewindHold(true, event)} onPointerUp={event => rewindHold(false, event)} onPointerCancel={event => rewindHold(false, event)} onLostPointerCapture={event => { rewindPointers.current.delete(event.pointerId); syncRewind(); }} aria-label={`Hold to rewind, ${Math.round(stats.rewindSeconds)} seconds available`}><Rewind size={17} />Rewind</button>
        <div className="player-control"><FastForward size={17} /><Select className="player-speed" aria-label="Playback speed" value={settings.speed} onChange={value => onSettings({ speed: Number(value) })} options={[0.5, 1, 1.5, 2, 3, 4].map(speed => ({ value: speed, label: `${speed}×` }))} onClose={reason => { if (reason === 'select' || reason === 'escape' || reason === 'toggle') requestAnimationFrame(focusGame); }} /></div>
        <div className="player-volume"><button className="player-control" onClick={() => { onSettings({ volume: settings.volume === 0 ? 0.7 : 0 }); finishPointerAction(); }} aria-label={settings.volume === 0 ? 'Unmute' : 'Mute'}>{settings.volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={event => onSettings({ volume: Number(event.target.value) })} onPointerUp={focusGame} aria-label="Volume" /></div>
        <button className="player-control" disabled={!ready || busy} onClick={() => void job(async () => { await queueSave('backup', 'Before restarting'); releaseControls(); emulator.current?.reset(); emulator.current?.play(); setPaused(false); startClock(); focusGame(); announce('Game restarted; recovery checkpoint saved'); })} aria-label="Restart game with recovery checkpoint"><RotateCcw size={16} /></button>
      </div>
      <div id="player-keyboard" className="player-keyboard" aria-label="Keyboard controls"><span><kbd>{[settings.controls.up, settings.controls.left, settings.controls.down, settings.controls.right].map(keyLabel).join(' ')}</kbd> Move</span><span><kbd>{keyLabel(settings.controls.a)}</kbd> A</span><span><kbd>{keyLabel(settings.controls.b)}</kbd> B</span><span><kbd>{keyLabel(settings.controls.start)}</kbd> Start</span><span><kbd>{keyLabel(settings.controls.select)}</kbd> Select</span></div>
    </div>
    {((showTouch && settings.touchControls) || editingTouch) && <TouchController settings={settings} pressed={pressed} editing={editingTouch} touchProps={touchProps} onDpad={dpadTouch} onPreview={setPreviewScreen} onSave={saveTouchPreferences} onFinish={finishTouchEditor} />}
    {showSaves && <Modal title="Checkpoints" onClose={() => setShowSaves(false)} wide>{pendingRestore ? <div className="restore-preview">{pendingRestore.thumbnail && <img src={pendingRestore.thumbnail} alt="Checkpoint preview" />}<h3>{pendingRestore.label}</h3><p>{new Date(pendingRestore.createdAt).toLocaleString()}</p><p>A recovery checkpoint will keep your current progress.</p><div className="button-row"><button className="button" onClick={() => setPendingRestore(null)}>Cancel</button><button className="button button-primary" disabled={busy} onClick={() => void restore(pendingRestore)}>Restore checkpoint</button></div></div> : <><form onSubmit={event => { event.preventDefault(); void job(async () => { await queueSave('manual', label.trim() || 'Named checkpoint'); setLabel(''); setSnapshots(await getSnapshots(game.id)); announce('Checkpoint saved'); }); }}><label className="field"><span className="field-label">New checkpoint</span><input value={label} maxLength={70} onChange={event => setLabel(event.target.value)} placeholder="Checkpoint name" /></label><button className="button button-primary" disabled={busy}><Save size={15} />Save checkpoint</button></form><div className="modal-divider" /><div className="snapshot-list">{snapshots.length ? snapshots.map(snapshot => <div className="snapshot-row" key={snapshot.id}>{snapshot.thumbnail ? <img className="snapshot-thumb" src={snapshot.thumbnail} alt="" /> : <div className="snapshot-thumb"><Gamepad2 size={20} /></div>}<div className="snapshot-info"><strong>{snapshot.label}</strong><span>{new Date(snapshot.createdAt).toLocaleString()} · {snapshot.kind}</span></div><div className="snapshot-actions"><button className="icon-button" aria-label={`Restore ${snapshot.label}`} disabled={busy} onClick={() => setPendingRestore(snapshot)}><RotateCcw size={14} /></button><button className="icon-button" aria-label={`Delete ${snapshot.label}`} disabled={busy} onClick={() => void job(async () => { await deleteSnapshot(snapshot.id); setSnapshots(await getSnapshots(game.id)); })}><Trash2 size={14} /></button></div></div>) : <div className="section-empty">No checkpoints yet</div>}</div></>}</Modal>}
  </div>;
}



