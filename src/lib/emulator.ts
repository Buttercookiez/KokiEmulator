import { normalizeTurbo, turboMask, type TurboSettings } from './mobile-play';
import type { GbaButton } from '../types';
import { EmulatorAudio } from '../emulator/audio';
export type { GbaButton } from '../types';

interface MgbaModule {
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _mgbawasm_init(): void;
  _mgbawasm_unload(): void;
  _mgbawasm_set_log_level(level: number): void;
  _mgbawasm_load(rom: number, length: number, bios: number, biosLength: number, platform: number, model: number, skipBios: number): number;
  _mgbawasm_reset(): void;
  _mgbawasm_run_frame(): void;
  _mgbawasm_video_ptr(): number;
  _mgbawasm_video_width(): number;
  _mgbawasm_video_height(): number;
  _mgbawasm_framerate_micro(): number;
  _mgbawasm_sample_rate(): number;
  _mgbawasm_read_audio(pointer: number, frames: number): number;
  _mgbawasm_set_keys(mask: number): void;
  _mgbawasm_state_size(): number;
  _mgbawasm_state_save(pointer: number): number;
  _mgbawasm_state_load(pointer: number): number;
  _mgbawasm_sram_save(): number;
  _mgbawasm_sram_ptr(): number;
  _mgbawasm_sram_load(pointer: number, bytes: number): number;
  _mgbawasm_set_idle_optimization?(mode: number): void;
  _mgbawasm_set_allow_opposing_directions?(allow: number): void;
}

type Factory = (options: Record<string, unknown>) => Promise<MgbaModule>;
const KEY: Record<GbaButton, number> = { a: 0, b: 1, select: 2, start: 3, right: 4, left: 5, up: 6, down: 7, r: 8, l: 9 };
const AUDIO_FRAMES = 4096;
const MAX_REWIND_BYTES = 16 * 1024 * 1024;
let factoryPromise: Promise<Factory> | null = null;

/** Loads the bundled classic script, never a CDN. Each instance receives its own WASM memory. */
function loadFactory(): Promise<Factory> {
  if (factoryPromise) return factoryPromise;
  factoryPromise = new Promise<Factory>((resolve, reject) => {
    const runtime = globalThis as typeof globalThis & { createMgbaModule?: Factory };
    if (runtime.createMgbaModule) { resolve(runtime.createMgbaModule); return; }
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      script.remove();
      factoryPromise = null;
      reject(new Error('The local emulator engine did not load. Reinstall or rebuild the app.'));
    }, 20_000);
    script.src = new URL('vendor/mgba/mgba.js', document.baseURI).href;
    script.async = true;
    script.onload = () => {
      clearTimeout(timeout);
      if (runtime.createMgbaModule) resolve(runtime.createMgbaModule);
      else { factoryPromise = null; reject(new Error('The local emulator engine is incomplete.')); }
    };
    script.onerror = () => {
      clearTimeout(timeout);
      script.remove();
      factoryPromise = null;
      reject(new Error('The local emulator files are missing. Run npm install and rebuild the app.'));
    };
    document.head.append(script);
  });
  return factoryPromise;
}

export interface EmulatorStats { fps: number; rewindSeconds: number }
export interface EmulatorOptions {
  onStats?: (stats: EmulatorStats) => void;
  onError?: (error: Error) => void;
}

export class GbaEmulator {
  private core: MgbaModule | null = null;
  private initialization: Promise<void> | null = null;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private options: EmulatorOptions;
  private audio: EmulatorAudio | null = null;
  private audioPointer = 0;
  private volume = 0.7;
  private speed = 1;
  private running = false;
  private ready = false;
  private destroyed = false;
  private animation = 0;
  private previousTime = 0;
  private accumulated = 0;
  private targetFps = 59.7275;
  private turbo = normalizeTurbo(undefined);
  setTurbo(settings: TurboSettings): void { this.turbo = normalizeTurbo(settings); this.pushInput(); }
  private inputMask = 0;
  private padMask = 0;
  private sentMask = -1;
  private pixels: ImageData | null = null;
  private frames = 0;
  private statsFrames = 0;
  private statsTime = 0;
  private rewindLength = 10;
  private rewinding = false;
  private rewindClock = 0;
  private nextCapture = 0;
  private history: Array<{ data: Uint8Array; frame: number }> = [];
  private readonly resumeAudio = () => { if (this.running) this.audio?.resume(); };
  private readonly clearOnBlur = () => this.releaseButtons();

  constructor(canvas: HTMLCanvasElement, options: EmulatorOptions = {}) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This device cannot create the game display.');
    this.context = context;
    this.options = options;
    canvas.width = 240;
    canvas.height = 160;
    window.addEventListener('pointerdown', this.resumeAudio);
    window.addEventListener('keydown', this.resumeAudio);
    window.addEventListener('blur', this.clearOnBlur);
  }

  get loaded(): boolean { return this.ready && !this.destroyed; }
  get isRunning(): boolean { return this.running; }

  private async initialize(): Promise<void> {
    if (this.destroyed) throw new Error('This emulator has been closed.');
    if (this.initialization) return this.initialization;
    this.initialization = (async () => {
      const factory = await loadFactory();
      if (this.destroyed) return;
      const core = await factory({
        locateFile: (name: string) => new URL(`vendor/mgba/${name}`, document.baseURI).href,
        print: () => {},
        printErr: (message: unknown) => console.warn('[mGBA]', message),
      });
      core._mgbawasm_init();
      if (this.destroyed) { core._mgbawasm_unload(); return; }
      this.core = core;
      core._mgbawasm_set_log_level(1);
      this.audioPointer = core._malloc(AUDIO_FRAMES * 4);
      if (!this.audioPointer) throw new Error('There is not enough memory for the emulator audio buffer.');
      try {
        const audio = new EmulatorAudio();
        this.audio = audio;
        await audio.initialize();
        if (this.destroyed) { audio.dispose(); return; }
        audio.setVolume(this.volume);
      } catch (error) {
        this.audio?.dispose();
        this.audio = null;
        console.warn('Audio output is unavailable; emulation will continue silently.', error);
      }
    })();
    try { await this.initialization; }
    catch (error) { this.initialization = null; throw error; }
  }

  async load(rom: Uint8Array, save?: Uint8Array | null, state?: Uint8Array | null): Promise<void> {
    if (rom.byteLength < 192 || rom.byteLength > 32 * 1024 * 1024 || rom[0xb2] !== 0x96) {
      throw new Error('This is not a valid GBA cartridge image. Choose an uncompressed .gba file.');
    }
    this.pause();
    await this.initialize();
    if (this.destroyed || !this.core) throw new Error('The emulator was closed while loading.');
    this.core._mgbawasm_unload();
    this.ready = false;
    this.history = [];
    this.pixels = null;
    const pointer = this.allocate(rom);
    try {
      if (!this.core._mgbawasm_load(pointer, rom.length, 0, 0, 0, 0, 1)) {
        throw new Error('The emulator could not start this GBA cartridge.');
      }
    } finally { this.core._free(pointer); }
    this.ready = true;
    this.core._mgbawasm_set_idle_optimization?.(1);
    this.core._mgbawasm_set_allow_opposing_directions?.(0);
    this.targetFps = this.core._mgbawasm_framerate_micro() / 1e6 || 59.7275;
    this.frames = 0;
    this.nextCapture = Math.ceil(this.targetFps / 2);
    this.sentMask = -1;
    this.releaseButtons();
    // Restoring a raw state establishes the cartridge's save-memory type.
    // Importing before that can succeed without copying bytes into the core.
    if (state?.length) {
      this.loadState(state);
      if (save?.length) this.importSave(save);
    } else {
      this.core._mgbawasm_run_frame();
      if (save?.length) {
        this.importSave(save);
        this.core._mgbawasm_reset();
        this.core._mgbawasm_run_frame();
      }
      this.frames++;
      this.drainAudio(false);
      this.render();
    }
    this.audio?.clear();
    this.options.onStats?.({ fps: 0, rewindSeconds: 0 });
  }

  play(): void {
    this.requireCore();
    if (this.running) return;
    this.running = true;
    this.previousTime = performance.now();
    this.accumulated = 0;
    this.statsFrames = 0;
    this.statsTime = this.previousTime;
    this.audio?.clear();
    this.audio?.resume();
    this.animation = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this.running = false;
    this.rewinding = false;
    if (this.animation) cancelAnimationFrame(this.animation);
    this.animation = 0;
    this.audio?.suspend();
    this.audio?.clear();
    this.releaseButtons();
  }

  reset(): void {
    const core = this.requireCore();
    core._mgbawasm_reset();
    this.history = [];
    this.frames = 0;
    this.nextCapture = Math.ceil(this.targetFps / 2);
    this.audio?.clear();
    this.sentMask = -1;
    this.pushInput();
    core._mgbawasm_run_frame();
    this.drainAudio(false);
    this.render();
  }

  setButton(button: GbaButton, pressed: boolean): void {
    const bit = KEY[button];
    if (bit === undefined) return;
    this.inputMask = pressed ? this.inputMask | (1 << bit) : this.inputMask & ~(1 << bit);
    this.pushInput();
  }

  releaseButtons(): void {
    this.inputMask = this.padMask = 0;
    this.pushInput();
  }

  setSpeed(multiplier: number): void {
    if (!Number.isFinite(multiplier)) return;
    this.speed = Math.max(0.25, Math.min(4, multiplier));
    this.accumulated = 0;
    this.audio?.clear();
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    this.audio?.setVolume(this.volume);
  }

  setRewindSeconds(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.rewindLength = Math.max(0, Math.min(20, seconds));
    if (!this.rewindLength) { this.history = []; this.setRewinding(false); }
    else this.trimHistory();
  }

  setRewinding(enabled: boolean): void {
    if (enabled === this.rewinding) return;
    this.rewinding = enabled && this.running && this.rewindLength > 0;
    this.rewindClock = 0;
    this.audio?.clear();
    this.releaseButtons();
    if (!this.rewinding) this.nextCapture = this.frames + Math.ceil(this.targetFps / 2);
  }

  saveState(): Uint8Array {
    const core = this.requireCore();
    const length = core._mgbawasm_state_size();
    if (!length) throw new Error('The emulator could not create a checkpoint.');
    const pointer = core._malloc(length);
    if (!pointer) throw new Error('There is not enough memory to save a checkpoint.');
    try {
      if (!core._mgbawasm_state_save(pointer)) throw new Error('The checkpoint could not be saved.');
      return core.HEAPU8.slice(pointer, pointer + length);
    } finally { core._free(pointer); }
  }

  loadState(bytes: Uint8Array): void {
    this.restoreState(bytes);
    this.history = [];
    this.nextCapture = this.frames + Math.ceil(this.targetFps / 2);
  }

  exportSave(): Uint8Array | null {
    const core = this.requireCore();
    const length = core._mgbawasm_sram_save();
    const pointer = core._mgbawasm_sram_ptr();
    return length && pointer ? core.HEAPU8.slice(pointer, pointer + length) : null;
  }

  importSave(bytes: Uint8Array): void {
    const core = this.requireCore();
    if (!bytes.length || bytes.length > 1024 * 1024) throw new Error('This game-save file has an invalid size.');
    const pointer = this.allocate(bytes);
    try {
      if (!core._mgbawasm_sram_load(pointer, bytes.length)) throw new Error('The game-save file could not be imported.');
    } finally { core._free(pointer); }
  }

  screenshot(): Promise<Blob> {
    this.requireCore();
    this.render();
    return new Promise((resolve, reject) => this.canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The screenshot could not be created.'));
    }, 'image/png'));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.pause();
    this.destroyed = true;
    this.ready = false;
    this.history = [];
    window.removeEventListener('pointerdown', this.resumeAudio);
    window.removeEventListener('keydown', this.resumeAudio);
    window.removeEventListener('blur', this.clearOnBlur);
    this.audio?.dispose();
    this.audio = null;
    if (this.core) {
      if (this.audioPointer) this.core._free(this.audioPointer);
      this.core._mgbawasm_unload();
    }
    this.audioPointer = 0;
    this.core = null;
  }

  private requireCore(): MgbaModule {
    if (!this.loaded || !this.core) throw new Error('Load a game before using the emulator.');
    return this.core;
  }

  private allocate(bytes: Uint8Array): number {
    if (!this.core) throw new Error('The emulator engine is not ready.');
    const pointer = this.core._malloc(bytes.length);
    if (!pointer) throw new Error('This device does not have enough memory for the selected file.');
    this.core.HEAPU8.set(bytes, pointer);
    return pointer;
  }

  private pushInput(): void {
    const mask = turboMask(this.inputMask | this.padMask, this.turbo, performance.now());
    if (this.ready && this.core && mask !== this.sentMask) {
      this.core._mgbawasm_set_keys(mask);
      this.sentMask = mask;
    }
  }

  private pollGamepad(): void {
    const pad = navigator.getGamepads?.().find((item) => item?.connected);
    let mask = 0;
    if (pad) {
      const pressed = (index: number) => !!pad.buttons[index]?.pressed;
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      if (pressed(0)) mask |= 1 << KEY.a;
      if (pressed(1)) mask |= 1 << KEY.b;
      if (pressed(4)) mask |= 1 << KEY.l;
      if (pressed(5)) mask |= 1 << KEY.r;
      if (pressed(8)) mask |= 1 << KEY.select;
      if (pressed(9)) mask |= 1 << KEY.start;
      if (pressed(12) || y < -0.4) mask |= 1 << KEY.up;
      if (pressed(13) || y > 0.4) mask |= 1 << KEY.down;
      if (pressed(14) || x < -0.4) mask |= 1 << KEY.left;
      if (pressed(15) || x > 0.4) mask |= 1 << KEY.right;
    }
    this.padMask = mask;
    this.pushInput();
  }

  private render(): void {
    if (!this.core || !this.ready) return;
    const width = this.core._mgbawasm_video_width();
    const height = this.core._mgbawasm_video_height();
    if (!width || !height) return;
    if (!this.pixels || this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.pixels = this.context.createImageData(width, height);
    }
    const pointer = this.core._mgbawasm_video_ptr();
    this.pixels.data.set(this.core.HEAPU8.subarray(pointer, pointer + width * height * 4));
    this.context.putImageData(this.pixels, 0, 0);
  }

  private drainAudio(audible: boolean): void {
    if (!this.core || !this.audioPointer) return;
    this.audio?.setRate(this.core._mgbawasm_sample_rate() * this.speed);
    for (let count = 0; count < 8; count++) {
      const frames = this.core._mgbawasm_read_audio(this.audioPointer, AUDIO_FRAMES);
      if (frames <= 0) break;
      if (audible && this.audio) {
        const start = this.audioPointer >> 1;
        this.audio.push(this.core.HEAP16.slice(start, start + frames * 2));
      }
      if (frames < AUDIO_FRAMES) break;
    }
  }

  private restoreState(bytes: Uint8Array): void {
    const core = this.requireCore();
    // Raw mGBA snapshots exclude battery files. Keep the current save across
    // restored cartridge/save-type metadata, which can otherwise reset SRAM.
    const battery = this.exportSave();
    if (bytes.length !== core._mgbawasm_state_size()) {
      throw new Error('This checkpoint belongs to a different emulator build or system. Import an ordinary .sav file instead.');
    }
    const pointer = this.allocate(bytes);
    try {
      if (!core._mgbawasm_state_load(pointer)) throw new Error('The emulator could not restore this checkpoint.');
      if (battery?.length) this.importSave(battery);
    } finally { core._free(pointer); }
    this.audio?.clear();
    // Snapshot input must not override the buttons currently held by the host.
    this.sentMask = -1;
    this.pushInput();
    core._mgbawasm_run_frame();
    this.drainAudio(false);
    this.render();
  }

  private trimHistory(): void {
    const stateSize = this.history[0]?.data.length || this.core?._mgbawasm_state_size() || 1;
    const count = Math.min(Math.ceil(this.rewindLength * 2), Math.floor(MAX_REWIND_BYTES / stateSize));
    if (this.history.length > count) this.history.splice(0, this.history.length - count);
  }

  private readonly tick = (now: number): void => {
    if (!this.running || !this.core || this.destroyed) return;
    try {
      const elapsed = Math.max(0, Math.min(100, now - this.previousTime));
      this.previousTime = now;
      if (this.rewinding) {
        this.rewindClock += elapsed;
        while (this.rewindClock >= 1000 / 8 && this.history.length) {
          this.rewindClock -= 1000 / 8;
          const previous = this.history.pop()!;
          this.restoreState(previous.data);
          this.frames = previous.frame;
        }
      } else {
        this.pollGamepad();
        this.accumulated += elapsed * this.targetFps * this.speed / 1000;
        const due = Math.min(24, Math.floor(this.accumulated));
        this.accumulated -= due;
        if (this.accumulated > 24) this.accumulated = 0;
        for (let index = 0; index < due; index++) {
          this.pushInput();
          this.core._mgbawasm_run_frame();
          this.frames++;
          this.statsFrames++;
          this.drainAudio(true);
          if (this.rewindLength && this.frames >= this.nextCapture) {
            this.history.push({ data: this.saveState(), frame: this.frames });
            this.trimHistory();
            this.nextCapture = this.frames + Math.ceil(this.targetFps / 2);
          }
        }
        if (due) this.render();
      }
      if (now - this.statsTime >= 1000) {
        this.options.onStats?.({ fps: this.statsFrames * 1000 / (now - this.statsTime), rewindSeconds: this.history.length / 2 });
        this.statsFrames = 0;
        this.statsTime = now;
      }
      this.animation = requestAnimationFrame(this.tick);
    } catch (error) {
      this.pause();
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };
}
