import type { EmulatorButton } from '../types';
import type { EmulatorOptions } from './emulator';
import { EmulatorAudio } from '../emulator/audio';
import { normalizeTurbo, turboMask, type TurboSettings } from './mobile-play';
import { inspectNdsRom } from './nds-rom';
export type DsLayout = 'vertical' | 'horizontal' | 'bottom';
type Core = {
    HEAPU8: Uint8Array;
    HEAP16: Int16Array;
    UTF8ToString(p: number): string;
} & Record<string, (...args: number[]) => number>;
const KEYS: Record<EmulatorButton, number> = { a: 0, b: 1, select: 2, start: 3, right: 4, left: 5, up: 6, down: 7, r: 8, l: 9, x: 10, y: 11 };
export function dsTouchPoint(x: number, y: number, width: number, height: number, layout: DsLayout, swapped: boolean, align: 'top' | 'center' | 'bottom' = 'center'): [
    number,
    number
] | null {
    const panelW = layout === 'horizontal' ? 256 : 256, panelH = layout === 'vertical' ? 384 : 192;
    const scale = Math.min(width / (layout === 'horizontal' ? 512 : panelW), height / panelH);
    const left = (width - (layout === 'horizontal' ? 512 : 256) * scale) / 2, top = (height - panelH * scale) * (align === 'top' ? 0 : align === 'bottom' ? 1 : .5);
    x = (x - left) / scale;
    y = (y - top) / scale;
    if (layout === 'vertical') {
        const bottom = swapped ? 0 : 192;
        if (x < 0 || x >= 256 || y < bottom || y >= bottom + 192)
            return null;
        return [Math.floor(x), Math.floor(y - bottom)];
    }
    if (layout === 'horizontal') {
        const bottom = swapped ? 0 : 256;
        if (x < bottom || x >= bottom + 256 || y < 0 || y >= 192)
            return null;
        return [Math.floor(x - bottom), Math.floor(y)];
    }
    return x >= 0 && x < 256 && y >= 0 && y < 192 ? [Math.floor(x), Math.floor(y)] : null;
}
export class NdsEmulator {
    private core: Core | null = null;
    private instance = 0;
    private pen: number | null = null;
    private running = false;
    private dead = false;
    private frame = 0;
    private raf = 0;
    private previous = 0;
    private accrued = 0;
    private speed = 1;
    private volume = .7;
    private mask = 0;
    private turbo = normalizeTurbo(undefined);
    private audio: EmulatorAudio | null = null;
    private audioPtr = 0;
    private rom = new Uint8Array();
    private history: Uint8Array[] = [];
    private rewind = 0;
    private rewinding = false;
    private lastStats = 0;
    private statsFrames = 0;
    private layout: DsLayout = 'vertical';
    private swapped = false;
    private image: ImageData | null = null;
    private buffer = document.createElement('canvas');
    constructor(private canvas: HTMLCanvasElement, private options: EmulatorOptions = {}) { this.buffer.width = 256; this.buffer.height = 384; canvas.width = 256; canvas.height = 384; canvas.style.touchAction = 'none'; for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture'] as const)
        canvas.addEventListener(type, this.pointer); window.addEventListener('blur', this.blur); }
    get loaded() { return !!this.instance && !this.dead && !!this.rom.length; }
    get isRunning() { return this.running; }
    private blur = () => this.releaseButtons();
    private alloc(bytes: Uint8Array) { const c = this.core!; const p = c._malloc(Math.max(1, bytes.length)); if (!p)
        throw Error('Not enough memory for this DS game.'); c.HEAPU8.set(bytes, p); return p; }
    private error() { return new Error(this.core?.UTF8ToString(this.core._pilas_last_error(this.instance)) || 'The DS core could not perform this operation.'); }
    async load(rom: Uint8Array, save?: Uint8Array | null, state?: Uint8Array | null) {
        inspectNdsRom(rom, 'game.nds');
        this.pause();
        if (this.dead)
            throw Error('The DS player is closed.');
        if (!this.core) {
            const url = new URL('vendor/melonds/pilas-melonds-core.js', document.baseURI).href;
            const factory = (await import(/* @vite-ignore */ url)).default;
            const c = await factory({ locateFile: (name: string) => new URL('vendor/melonds/' + name, document.baseURI).href, print: () => { }, printErr: (s: string) => console.warn('[melonDS]', s) }) as Core;
            if (this.dead)
                return;
            this.core = c;
            this.instance = c._pilas_create(48000);
            if (!this.instance)
                throw Error('The DS core could not start.');
            c._pilas_set_console_mode(this.instance, 0, 1);
            c._pilas_set_direct_boot(this.instance, 1);
            c._pilas_set_wifi_bridge_enabled(this.instance, 0);
            this.audioPtr = c._malloc(4096 * 4);
            try {
                this.audio = new EmulatorAudio();
                await this.audio.initialize();
                this.audio.setVolume(this.volume);
            }
            catch {
                this.audio?.dispose();
                this.audio = null;
            }
        }
        if (this.dead)
            throw Error('The DS player closed while loading.');
        this.rom = rom.slice();
        this.loadRom(save);
        if (state?.length)
            this.loadState(state);
        else {
            this.core!._pilas_run_frame(this.instance);
            this.render();
        }
        this.options.onStats?.({ fps: 0, rewindSeconds: 0 });
    }
    private loadRom(save?: Uint8Array | null) { const c = this.core!, r = this.alloc(this.rom), s = save?.length ? this.alloc(save) : 0, n = this.alloc(new TextEncoder().encode('game.nds\0')); try {
        if (!c._pilas_load_rom(this.instance, r, this.rom.length, s, save?.length || 0, n))
            throw this.error();
    }
    finally {
        c._free(r);
        if (s)
            c._free(s);
        c._free(n);
    } const now = new Date(); c._pilas_set_rtc(this.instance, now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()); this.history = []; this.releaseButtons(); }
    setLayout(layout: DsLayout, swapped = false) { this.layout = layout; this.swapped = swapped; this.render(); }
    setButton(button: EmulatorButton, down: boolean) { if (down)
        this.audio?.resume(); const bit = KEYS[button]; this.mask = down ? this.mask | (1 << bit) : this.mask & ~(1 << bit); this.pushInput(); }
    releaseButtons() { this.pen = null; this.mask = 0; this.pushInput(); this.core?._pilas_set_touch(this.instance, 0, 0, 0); }
    private pushInput() { if (this.instance)
        this.core!._pilas_set_key_mask(this.instance, (~turboMask(this.mask, this.turbo, performance.now())) & 4095); }
    setTurbo(value: TurboSettings) { this.turbo = normalizeTurbo(value); }
    setSpeed(n: number) { if (Number.isFinite(n))
        this.speed = Math.max(.25, Math.min(4, n)); this.audio?.clear(); }
    setVolume(n: number) { this.volume = n; this.audio?.setVolume(n); }
    setRewindSeconds(n: number) { this.rewind = Math.max(0, Math.min(20, n)); if (!this.rewind)
        this.history = []; }
    setRewinding(value: boolean) { this.rewinding = value; this.audio?.clear(); }
    play() { if (!this.loaded)
        throw Error('Load a DS game first.'); if (this.running)
        return; this.running = true; this.previous = performance.now(); this.lastStats = this.previous; this.accrued = 0; this.audio?.resume(); this.raf = requestAnimationFrame(this.tick); }
    pause() { this.running = false; cancelAnimationFrame(this.raf); this.audio?.suspend(); this.audio?.clear(); this.releaseButtons(); }
    reset() { if (!this.loaded)
        return; if (!this.core!._pilas_reset(this.instance))
        throw this.error(); this.history = []; this.core!._pilas_run_frame(this.instance); this.render(); }
    exportSave() { if (!this.loaded)
        return null; const c = this.core!, p = c._pilas_get_nds_save_ptr(this.instance), n = c._pilas_get_nds_save_length(this.instance); return p && n ? c.HEAPU8.slice(p, p + n) : null; }
    importSave(bytes: Uint8Array) { this.loadRom(bytes); }
    saveState() { const c = this.core!; if (!this.loaded || !c._pilas_save_state(this.instance))
        throw this.error(); const p = c._pilas_get_state_ptr(this.instance), n = c._pilas_get_state_length(this.instance); if (!p || !n || n > 64 * 1024 * 1024)
        throw Error('Invalid DS checkpoint.'); return c.HEAPU8.slice(p, p + n); }
    loadState(bytes: Uint8Array) { if (!bytes.length || bytes.length > 64 * 1024 * 1024)
        throw Error('Invalid DS checkpoint.'); const c = this.core!, p = this.alloc(bytes); try {
        if (!c._pilas_load_state(this.instance, p, bytes.length))
            throw this.error();
    }
    finally {
        c._free(p);
    } this.audio?.clear(); this.pushInput(); this.render(); }
    screenshot(): Promise<Blob> { return new Promise((resolve, reject) => this.canvas.toBlob(b => b ? resolve(b) : reject(Error('Could not capture screens.')), 'image/png')); }
    destroy() { this.pause(); this.dead = true; for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture'] as const)
        this.canvas.removeEventListener(type, this.pointer); window.removeEventListener('blur', this.blur); this.audio?.dispose(); if (this.core) {
        if (this.audioPtr)
            this.core._free(this.audioPtr);
        if (this.instance)
            this.core._pilas_destroy(this.instance);
    } this.instance = 0; this.core = null; this.history = []; }
    private pointer = (event: PointerEvent) => { if (!this.loaded || !this.running)
        return; const end = ['pointerup', 'pointercancel', 'lostpointercapture'].includes(event.type); if (this.pen !== null && this.pen !== event.pointerId)
        return; if (event.type === 'pointerdown') {
        this.pen = event.pointerId;
        this.canvas.setPointerCapture(event.pointerId);
        this.audio?.resume();
    } if (event.type === 'pointermove' && !this.canvas.hasPointerCapture(event.pointerId))
        return; const r = this.canvas.getBoundingClientRect(), point = end ? null : dsTouchPoint(event.clientX - r.left, event.clientY - r.top, r.width, r.height, this.layout, this.swapped, /(?:top| 0%)$/.test(getComputedStyle(this.canvas).objectPosition) ? 'top' : /(?:bottom|100%)$/.test(getComputedStyle(this.canvas).objectPosition) ? 'bottom' : 'center'); this.core!._pilas_set_touch(this.instance, point?.[0] || 0, point?.[1] || 0, point ? 1 : 0); if (end)
        this.pen = null; if (point)
        event.preventDefault(); };
    private render() { if (!this.loaded)
        return; const c = this.core!, p = c._pilas_get_framebuffer_ptr(this.instance); if (!p)
        return; const b = this.buffer.getContext('2d')!; this.image ??= b.createImageData(256, 384); this.image.data.set(c.HEAPU8.subarray(p, p + 256 * 384 * 4)); b.putImageData(this.image, 0, 0); const w = this.layout === 'horizontal' ? 512 : 256, h = this.layout === 'vertical' ? 384 : 192; if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
    } const ctx = this.canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false; if (this.layout === 'bottom') {
        ctx.drawImage(this.buffer, 0, 192, 256, 192, 0, 0, 256, 192);
        return;
    } for (let i = 0; i < 2; i++) {
        const source = this.swapped ? 1 - i : i;
        ctx.drawImage(this.buffer, 0, source * 192, 256, 192, this.layout === 'horizontal' ? i * 256 : 0, this.layout === 'vertical' ? i * 192 : 0, 256, 192);
    } }
    private tick = (now: number) => {
        if (!this.running || !this.core)
            return;
        try {
            this.accrued += Math.min(100, now - this.previous) * 59.8261 * this.speed / 1000;
            this.previous = now;
            const pads = navigator.getGamepads?.();
            const pad = pads && Array.from(pads).find(p => p?.connected);
            let mask = this.mask;
            if (pad) {
                for (const [button, index] of Object.entries({ a: 0, b: 1, x: 2, y: 3, l: 4, r: 5, select: 8, start: 9, up: 12, down: 13, left: 14, right: 15 })) {
                    if (pad.buttons[index]?.pressed)
                        mask |= 1 << KEYS[button as EmulatorButton];
                }
                if ((pad.axes[0] || 0) < -.4)
                    mask |= 32;
                if ((pad.axes[0] || 0) > .4)
                    mask |= 16;
                if ((pad.axes[1] || 0) < -.4)
                    mask |= 64;
                if ((pad.axes[1] || 0) > .4)
                    mask |= 128;
            }
            this.core._pilas_set_key_mask(this.instance, (~turboMask(mask, this.turbo, now)) & 4095);
            const due = Math.min(4, Math.floor(this.accrued));
            this.accrued = Math.min(4, this.accrued - due);
            for (let i = 0; i < due; i++) {
                if (this.rewinding) {
                    const s = this.history.pop();
                    if (s)
                        this.loadState(s);
                }
                else {
                    this.core._pilas_run_frame(this.instance);
                    this.frame++;
                    if (this.rewind && this.frame % 30 === 0) {
                        const s = this.saveState();
                        this.history.push(s);
                        const max = Math.min(this.rewind * 2, Math.floor(32 * 1024 * 1024 / s.length));
                        if (this.history.length > max)
                            this.history.splice(0, this.history.length - max);
                    }
                }
                const n = this.core._pilas_pull_audio(this.instance, this.audioPtr, 4096);
                if (n > 0 && this.audio && !this.rewinding) {
                    this.audio.setRate(48000 * this.speed);
                    this.audio.push(this.core.HEAP16.slice(this.audioPtr >> 1, (this.audioPtr >> 1) + n * 2));
                }
                this.statsFrames++;
            }
            if (due)
                this.render();
            if (now - this.lastStats >= 1000) {
                this.options.onStats?.({ fps: this.statsFrames * 1000 / (now - this.lastStats), rewindSeconds: this.history.length / 2 });
                this.statsFrames = 0;
                this.lastStats = now;
            }
            this.raf = requestAnimationFrame(this.tick);
        }
        catch (e) {
            this.pause();
            this.options.onError?.(e instanceof Error ? e : Error(String(e)));
        }
    };
}
