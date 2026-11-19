import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { ArrowLeft, Camera, Maximize, Menu, Pause, Play, Save, SlidersHorizontal, Upload, Volume2, VolumeX, X } from 'lucide-react';
import type { PspBridge, PspGame, PspTiming } from '../psp-types';
import type { PspSettings } from '../lib/psp-settings';
import { nativePsp } from '../lib/psp-android';
import { nativePlayerMode } from '../lib/native-player';
import { PspTouchController } from './PspTouchController';
import './PspPlayer.css';

const keyMap: Record<string, number> = { ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyZ: 0, KeyX: 8, KeyA: 1, KeyS: 9, KeyQ: 10, KeyE: 11, Enter: 3, ShiftRight: 2 };
const gamepadMap = [0, 8, 1, 9, 10, 11, -1, -1, 2, 3, -1, -1, 4, 5, 6, 7];
function axis(value: number) { return Math.abs(value) < .14 ? 0 : Math.round(Math.max(-1, Math.min(1, value)) * 32767); }
export function PspPlayer({ bridge, game, timing, restore, settings, onSettings, onExit }: {
  bridge: PspBridge; game: PspGame; timing: PspTiming; restore?: string; settings: PspSettings;
  onSettings: (settings: PspSettings) => void; onExit: () => Promise<void>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const openedAt = useRef(performance.now());
  const frameReady = useRef(false);
  const screen = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const sound = useRef<GainNode | null>(null);
  const request = useRef<Promise<void>>(Promise.resolve());
  const blocked = useRef(!!restore);
  const halted = useRef(false);
  const onTouchChange = useRef<(buttonsChanged: boolean) => void>(() => {});
  const tapEdges = useRef(0);
  const touch = useRef({ buttons: 0, x: 0, y: 0 });
  const [paused, setPaused] = useState(!!restore);
  const [muted, setMuted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Starting ' + game.title + '…');
  const action = useRef(false);
  const touchInput = useCallback((buttons: number, x: number, y: number) => {
    const buttonsChanged = touch.current.buttons !== buttons;
    if (!timing.native && !blocked.current) tapEdges.current |= buttons & ~touch.current.buttons;
    touch.current = { buttons, x, y };
    onTouchChange.current(buttonsChanged || (!x && !y));
  }, [timing.native]);
  const [coarse] = useState(() => timing.native || matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    const controller = new AbortController();
    const keys = new Set<string>();
    let active = true, animation = 0, deadline = 0, nextAudio = 0;
    let image: ImageData | undefined;
    const context = canvas.current?.getContext('2d', { alpha: false });
    const audioContext = timing.native ? null : new AudioContext({ latencyHint: 'interactive' });
    const volume = audioContext?.createGain();
    if (audioContext && volume) { volume.connect(audioContext.destination); audio.current = audioContext; sound.current = volume; volume.gain.value = settings.volume; void audioContext.resume().catch(() => {}); }
    nativePlayerMode(true);
    if (timing.native) document.documentElement.classList.add('psp-native-playing');
    let lastInput = { buttons: 0, x: 0, y: 0 };
    function readInput() {
      let buttons = touch.current.buttons;
      for (const code of keys) if (code in keyMap) buttons |= 1 << keyMap[code];
      const gamepads = navigator.getGamepads?.() ?? [];
      let pad: Gamepad | null = null;
      for (const candidate of gamepads) {
        if (candidate?.mapping === 'standard') { pad = candidate; break; }
      }
      if (pad) gamepadMap.forEach((button, index) => { if (button >= 0 && pad.buttons[index]?.pressed) buttons |= 1 << button; });
      const x = touch.current.x || axis(Number(keys.has('KeyL')) - Number(keys.has('KeyJ')) || pad?.axes[0] || 0);
      const y = touch.current.y || axis(Number(keys.has('KeyK')) - Number(keys.has('KeyI')) || pad?.axes[1] || 0);
      return { buttons, x, y };
    }
    function sendNativeInput() {
      const input = blocked.current ? { buttons: 0, x: 0, y: 0 } : readInput();
      if (input.buttons === lastInput.buttons && input.x === lastInput.x && input.y === lastInput.y) return;
      lastInput = input;
      void nativePsp.input(input).catch(error => { if (active) setNotice(error.message); });
    }
    onTouchChange.current = immediate => { if (timing.native && immediate) sendNativeInput(); };
    function keyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement) return;
      if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) setPaused(value => !value); }
      else if (event.code in keyMap || ['KeyI', 'KeyJ', 'KeyK', 'KeyL'].includes(event.code)) { event.preventDefault(); keys.add(event.code); if (timing.native) sendNativeInput(); }
    }
    window.addEventListener('keydown', keyDown, { signal: controller.signal });
    window.addEventListener('keyup', event => { keys.delete(event.code); if (timing.native) sendNativeInput(); }, { signal: controller.signal });
    window.addEventListener('blur', () => { keys.clear(); touchInput(0, 0, 0); tapEdges.current = 0; if (!timing.native) setPaused(true); }, { signal: controller.signal });
    window.addEventListener('pointerdown', () => { void audioContext?.resume().catch(() => {}); }, { signal: controller.signal });
    canvas.current?.focus();
    function receive(bytes: Uint8Array) {
      if (!active || !context || !audioContext || !volume) return;
      if (bytes.byteLength < 16) throw new Error('The PSP player returned an incomplete frame.');
      const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = header.getUint32(0, true), height = header.getUint32(4, true), pitch = header.getUint32(8, true), length = header.getUint32(12, true);
      if (width && height) {
        if (width > 480 || height > 272 || pitch < width * 4 || pitch * height !== length || length > bytes.length - 16) throw new Error('PPSSPP returned an invalid video frame.');
        if (!image || image.width !== width || image.height !== height) { image = context.createImageData(width, height); context.canvas.width = width; context.canvas.height = height; setNotice(''); }
        const pixels = new Uint32Array(image.data.buffer);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const pixel = header.getUint32(16 + y * pitch + x * 4, true);
            pixels[y * width + x] = 0xff000000 | ((pixel & 0xff) << 16) | (pixel & 0xff00) | ((pixel >> 16) & 0xff);
          }
        }
        context.putImageData(image, 0, 0); frameReady.current = true;
      }
      const audioStart = 16 + length, samples = Math.floor((bytes.length - audioStart) / 4);
      if (!samples || blocked.current || audioContext.state !== 'running') return;
      const chunk = audioContext.createBuffer(2, samples, timing.sampleRate);
      for (let channel = 0; channel < 2; channel++) { const target = chunk.getChannelData(channel); for (let i = 0; i < samples; i++) target[i] = header.getInt16(audioStart + i * 4 + channel * 2, true) / 32768; }
      const output = audioContext.createBufferSource(); output.buffer = chunk; output.connect(volume);
      if (nextAudio < audioContext.currentTime || nextAudio > audioContext.currentTime + .2) nextAudio = audioContext.currentTime + .065;
      output.start(nextAudio); nextAudio += chunk.duration;
    }
    function step(now: number) {
      if (!active || halted.current) return;
      if (timing.native) {
        sendNativeInput();
        animation = requestAnimationFrame(step);
        return;
      }
      if (blocked.current || now + 1 < deadline) { animation = requestAnimationFrame(step); return; }
      const interval = 1000 / timing.fps; deadline = (now - deadline > interval ? now : deadline) + interval;
      const { buttons, x, y } = readInput();
      const edges = tapEdges.current;
      tapEdges.current = 0;
      request.current = bridge.frame(buttons | edges, x, y).then(receive).catch(error => {
        if (active) { halted.current = true; setNotice(error instanceof Error ? error.message : String(error)); }
      });
      void request.current.then(() => { if (active) animation = requestAnimationFrame(step); });
    }
    let listener: Promise<{ remove(): Promise<void> }> | undefined;
    let appListener: Promise<{ remove(): Promise<void> }> | undefined;
    let backListener: Promise<{ remove(): Promise<void> }> | undefined;
    if (timing.native) {
      listener = nativePsp.addListener('error', event => { if (active) { setPaused(true); setNotice(event.message || 'The PSP player stopped.'); } });
      appListener = App.addListener('appStateChange', event => { if (!event.isActive && active) setPaused(true); });
      backListener = App.addListener('backButton', () => { if (active) { setMenu(true); } });
      setNotice('');
    }
    request.current = (restore ? bridge.checkpoint(true, restore).then(() => { if (active) { blocked.current = false; setPaused(false); setNotice(''); } }) : Promise.resolve()).catch(error => { if (active) setNotice(error.message); });
    void request.current.then(() => { if (active) animation = requestAnimationFrame(step); });
    return () => {
      active = false; cancelAnimationFrame(animation); controller.abort(); keys.clear(); touchInput(0, 0, 0); onTouchChange.current = () => {};
      void audioContext?.close().catch(() => {}); nativePlayerMode(false);
      document.documentElement.classList.remove('psp-native-playing');
      if (timing.native) { void nativePsp.play({ paused: true, volume: 0 }); void listener?.then(handle => handle.remove()); void appListener?.then(handle => handle.remove()); void backListener?.then(handle => handle.remove()); }
    };
  }, [bridge, game.id, timing, restore, touchInput]);
  useEffect(() => {
    blocked.current = paused || editing || menu;
    if (blocked.current) tapEdges.current = 0;
    if (sound.current) sound.current.gain.value = paused || muted || editing || menu ? 0 : settings.volume;
    if (timing.native) void nativePsp.play({ paused: paused || editing || menu, volume: muted ? 0 : settings.volume, smoothing: settings.smoothing }).catch(error => setNotice(error.message));
  }, [paused, muted, editing, menu, settings.volume, settings.smoothing, timing.native]);
  useEffect(() => {
    if (!timing.native || !screen.current) return;
    let active = true;
    let lastViewport = '';
    const update = () => {
      if (!active || !screen.current) return;
      const rect = screen.current.getBoundingClientRect();
      const viewport = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, dpr: devicePixelRatio };
      const key = Object.values(viewport).join(',');
      if (key === lastViewport) return;
      lastViewport = key;
      void nativePsp.viewport(viewport).catch(error => { if (active) setNotice(error.message); });
    };
    const observer = new ResizeObserver(update); observer.observe(screen.current);
    visualViewport?.addEventListener('resize', update); update();
    return () => { active = false; observer.disconnect(); visualViewport?.removeEventListener('resize', update); };
  }, [timing.native]);
  async function perform(operation: () => Promise<void>, message?: string) {
    if (action.current) return;
    action.current = true; setBusy(true); blocked.current = true; setPaused(true);
    await request.current;
    try { await operation(); if (message) setNotice(message); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { action.current = false; setBusy(false); }
  }
  async function screenshot() {
    if (performance.now() - openedAt.current < 1000 || !timing.native && !frameReady.current) throw new Error('Wait for the game screen to load before taking a screenshot.');
    await bridge.screenshot(timing.native ? '' : canvas.current?.toDataURL('image/png') || '');
  }
  return <section className={'psp-stage' + (timing.native ? ' psp-native' : '') + (coarse ? ' psp-mobile' : '')} ref={stage} aria-label="PSP player">
    <header className="psp-stage-bar"><button className="icon-button" aria-label="Return to library" disabled={busy} onClick={() => void perform(async () => { await screenshot().catch(() => {}); await onExit(); })}><ArrowLeft size={19} /></button><h1>{game.title}</h1>
      <button className="icon-button" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
      <button className="icon-button" aria-label="Toggle fullscreen" onClick={() => { const operation = document.fullscreenElement ? document.exitFullscreen() : stage.current?.requestFullscreen(); void operation?.catch(error => setNotice(error.message)); }}><Maximize size={18} /></button>
      <button className="icon-button" aria-label="Player menu" aria-expanded={menu} onClick={() => setMenu(value => !value)}><Menu size={19} /></button></header>
    <div className="psp-play-area"><div className="psp-screen" ref={screen}>{!timing.native && <canvas ref={canvas} width={480} height={272} tabIndex={0} style={{ imageRendering: settings.smoothing ? 'auto' : 'pixelated' }} aria-label={'Gameplay for ' + game.title} />}</div>
      {coarse && (settings.showControls || editing) && <PspTouchController settings={settings} editing={editing} onInput={touchInput} onSave={onSettings} onFinish={() => setEditing(false)} />}
      {notice && !editing && <p role="status" className="psp-notice">{notice}<button className="icon-button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={15} /></button></p>}
      {menu && !editing && <section className="psp-player-menu" aria-label="Player actions"><div className="button-row"><strong>PSP player</strong><button className="icon-button" aria-label="Close player menu" onClick={() => setMenu(false)}><X size={18} /></button></div>
        <button className="button" disabled={busy} onClick={() => { setPaused(false); setMenu(false); setNotice(''); }}><Play size={17} />Resume</button>
        <button className="button" disabled={busy} onClick={() => void perform(() => bridge.checkpoint(false), 'Checkpoint saved. Choose Resume to play.')}><Save size={17} />Save checkpoint</button>
        <button className="button" disabled={busy} onClick={() => void perform(() => bridge.checkpoint(true), 'Checkpoint loaded. Choose Resume to play.')}><Upload size={17} />Load latest checkpoint</button>
        <button className="button" disabled={busy} onClick={() => void perform(screenshot, 'Screenshot saved to your game library.')}><Camera size={17} />Screenshot</button>
        {coarse && <button className="button" disabled={busy} onClick={() => { setEditing(true); setMenu(false); }}><SlidersHorizontal size={17} />Edit controls</button>}
        <button className="button" disabled={busy} onClick={() => void perform(async () => { await screenshot().catch(() => {}); await onExit(); })}><ArrowLeft size={17} />Return to library</button>
      </section>}
    </div>
    <footer className="psp-stage-bar psp-actions"><button className="button" disabled={busy || editing} onClick={() => { setPaused(value => !value); setNotice(''); canvas.current?.focus(); }}>{paused ? <Play size={15} /> : <Pause size={15} />}{paused ? 'Resume' : 'Pause'}</button><button className="button" disabled={busy || editing} onClick={() => void perform(() => bridge.checkpoint(false), 'Checkpoint saved. Choose Resume to play.')}><Save size={15} />Save</button><button className="button" disabled={busy || editing} onClick={() => void perform(() => bridge.checkpoint(true), 'Checkpoint loaded. Choose Resume to play.')}><Upload size={15} />Load</button></footer>
  </section>;
}
