// SPDX-License-Identifier: GPL-3.0-or-later
package com.koki.psp;

/** Buffers nonblocking PCM writes and matches the audio clock to sustained emulation speed. */
final class NativeAudioPump {
    interface Output {
        int write(short[] data, int offset, int count);
        void play();
        void setSpeed(float speed);
    }

    private static final long RATE_WINDOW_NANOS = 500_000_000L;

    private final Output output;
    private final int sampleRate;
    private final short[] pending;
    private final int preroll;
    private int queued;
    private int primed;
    private boolean started;
    private long rateWindowStart;
    private int producedFrames;
    private double estimatedPercent;
    private int playbackPercent = 100;

    NativeAudioPump(Output output, int sampleRate, int prerollSamples, int capacity) {
        this.output = output;
        this.sampleRate = sampleRate;
        this.preroll = prerollSamples;
        pending = new short[capacity];
    }

    void push(short[] data, int count, long now) {
        if (count < 0 || count > data.length || count % 2 != 0) throw new IllegalArgumentException("Invalid stereo PCM packet");
        if (started) adjustSpeed(count / 2, now);
        int firstSample = Math.max(0, count - pending.length);
        int incoming = count - firstSample;
        // Keep the newest samples after a long audio stall so latency stays bounded.
        int dropped = Math.max(0, queued + incoming - pending.length);
        if (dropped > 0) {
            queued -= dropped;
            System.arraycopy(pending, dropped, pending, 0, queued);
        }
        System.arraycopy(data, firstSample, pending, queued, incoming);
        queued += incoming;
        int offset = 0;
        while (offset < queued) {
            int length = started ? queued - offset : Math.min(queued - offset, preroll - primed);
            int written = output.write(pending, offset, length);
            if (written < 0 || written > length) throw new IllegalStateException("PSP audio write failed (" + written + ").");
            if (written == 0) break;
            offset += written;
            if (!started) {
                primed += written;
                if (primed >= preroll) {
                    output.play();
                    if (playbackPercent != 100) {
                        output.setSpeed(1);
                        playbackPercent = 100;
                    }
                    rateWindowStart = now;
                    producedFrames = 0;
                    estimatedPercent = Double.NaN;
                    started = true;
                }
            }
        }
        queued -= offset;
        if (offset > 0 && queued > 0) System.arraycopy(pending, offset, pending, 0, queued);
    }

    private void adjustSpeed(int frames, long now) {
        producedFrames += frames;
        long elapsed = now - rateWindowStart;
        if (elapsed < RATE_WINDOW_NANOS) return;

        double measured = producedFrames * 100_000_000_000.0 / (sampleRate * (double) elapsed);
        estimatedPercent = Double.isNaN(estimatedPercent) ? measured : estimatedPercent * .25 + measured * .75;
        int target = Math.max(80, Math.min(100, (int) Math.round(estimatedPercent)));
        // Recover gradually so refilling the buffer does not cause another dropout.
        int next = Math.min(target, playbackPercent + 5);
        if (next != playbackPercent) {
            output.setSpeed(next / 100f);
            playbackPercent = next;
        }
        producedFrames = 0;
        rateWindowStart = now;
    }

    void reset() {
        queued = primed = 0;
        started = false;
    }
}
