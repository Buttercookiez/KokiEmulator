// SPDX-License-Identifier: GPL-3.0-or-later
package com.koki.psp;

/** Buffers partial nonblocking PCM writes and keeps audio from stalling emulation. */
final class NativeAudioPump {
    interface Output {
        int write(short[] data, int offset, int count);
        void play();
    }

    private final Output output;
    private final short[] pending;
    private final int preroll;
    private int queued;
    private int primed;
    private boolean started;

    NativeAudioPump(Output output, int prerollSamples, int capacity) {
        this.output = output;
        this.preroll = prerollSamples;
        pending = new short[capacity];
    }

    void push(short[] data, int count) {
        if (count < 0 || count > data.length || count % 2 != 0) throw new IllegalArgumentException("Invalid stereo PCM packet");
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
                    started = true;
                }
            }
        }
        queued -= offset;
        if (offset > 0 && queued > 0) System.arraycopy(pending, offset, pending, 0, queued);
    }

    void reset() {
        queued = primed = 0;
        started = false;
    }
}
