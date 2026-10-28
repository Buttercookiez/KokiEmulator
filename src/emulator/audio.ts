/** Local Web Audio output. No threads, SharedArrayBuffer, or remote resources. */
const WORKLET = `
class KokiAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 32768;
    this.samples = new Float32Array(this.capacity * 2);
    this.read = 0;
    this.written = 0;
    this.rate = 32768 / sampleRate;
    this.port.onmessage = ({data}) => {
      if (data.clear) { this.read = 0; this.written = 0; return; }
      if (data.rate) { this.rate = data.rate / sampleRate; return; }
      const frames = data.length / 2;
      for (let frame = 0; frame < frames; frame++) {
        const index = (this.written % this.capacity) * 2;
        this.samples[index] = data[frame * 2] / 32768;
        this.samples[index + 1] = data[frame * 2 + 1] / 32768;
        this.written++;
      }
      if (this.written - this.read >= this.capacity) this.read = this.written - this.capacity + 2;
    };
  }
  process(_inputs, outputs) {
    const left = outputs[0][0];
    const right = outputs[0][1] || left;
    for (let index = 0; index < left.length; index++) {
      if (this.read + 1 >= this.written) { left[index] = right[index] = 0; continue; }
      const integer = Math.floor(this.read);
      const fraction = this.read - integer;
      const a = (integer % this.capacity) * 2;
      const b = ((integer + 1) % this.capacity) * 2;
      left[index] = this.samples[a] + (this.samples[b] - this.samples[a]) * fraction;
      right[index] = this.samples[a + 1] + (this.samples[b + 1] - this.samples[a + 1]) * fraction;
      this.read += this.rate;
    }
    return true;
  }
}
registerProcessor('koki-mgba-audio', KokiAudio);
`;

export class EmulatorAudio {
  private context: AudioContext;
  private gain: GainNode;
  private worklet: AudioWorkletNode | null = null;
  private fallback: ScriptProcessorNode | null = null;
  private ring = new Float32Array(32768 * 2);
  private written = 0;
  private read = 0;
  private ratio = 1;
  private rate = 0;
  private disposed = false;

  constructor() {
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.gain = this.context.createGain();
    this.gain.connect(this.context.destination);
  }

  async initialize(): Promise<void> {
    if (this.context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      try {
        await this.context.audioWorklet.addModule(url);
        if (this.disposed) return;
        this.worklet = new AudioWorkletNode(this.context, 'koki-mgba-audio', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        this.worklet.connect(this.gain);
        return;
      } catch {
        // Older WebViews can still play through the local ScriptProcessor fallback.
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (this.disposed) return;
    this.fallback = this.context.createScriptProcessor(2048, 0, 2);
    this.fallback.onaudioprocess = (event) => {
      const left = event.outputBuffer.getChannelData(0);
      const right = event.outputBuffer.getChannelData(1);
      for (let sample = 0; sample < left.length; sample++) {
        if (this.read + 1 >= this.written) {
          left[sample] = right[sample] = 0;
          continue;
        }
        const whole = Math.floor(this.read);
        const fraction = this.read - whole;
        const a = (whole % 32768) * 2;
        const b = ((whole + 1) % 32768) * 2;
        left[sample] = this.ring[a] + (this.ring[b] - this.ring[a]) * fraction;
        right[sample] = this.ring[a + 1] + (this.ring[b + 1] - this.ring[a + 1]) * fraction;
        this.read += this.ratio;
      }
    };
    this.fallback.connect(this.gain);
  }

  get isSuspended(): boolean { return this.context.state === 'suspended'; }

  resume(): void {
    if (!this.disposed && this.context.state === 'suspended') void this.context.resume().catch(() => {});
  }

  suspend(): void {
    if (!this.disposed && this.context.state === 'running') void this.context.suspend().catch(() => {});
  }

  setVolume(volume: number): void {
    if (this.disposed) return;
    const value = Math.max(0, Math.min(1, volume));
    this.gain.gain.setTargetAtTime(value, this.context.currentTime, 0.015);
  }

  setRate(rate: number): void {
    if (this.disposed || rate <= 0 || rate === this.rate) return;
    this.rate = rate;
    this.ratio = rate / this.context.sampleRate;
    this.worklet?.port.postMessage({ rate });
  }

  push(samples: Int16Array): void {
    if (this.disposed) return;
    if (this.worklet) {
      this.worklet.port.postMessage(samples, [samples.buffer]);
      return;
    }
    for (let frame = 0; frame < samples.length / 2; frame++) {
      const index = (this.written % 32768) * 2;
      this.ring[index] = samples[frame * 2] / 32768;
      this.ring[index + 1] = samples[frame * 2 + 1] / 32768;
      this.written++;
    }
    if (this.written - this.read >= 32768) this.read = this.written - 32768 + 2;
  }

  clear(): void {
    this.written = this.read = 0;
    this.worklet?.port.postMessage({ clear: true });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.fallback) this.fallback.onaudioprocess = null;
    this.fallback?.disconnect();
    this.worklet?.disconnect();
    this.gain.disconnect();
    void this.context.close().catch(() => {});
  }
}
