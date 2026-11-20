// SPDX-License-Identifier: GPL-3.0-or-later
package com.koki.psp;

final class NativeAudioPumpTest {
    // At 1 kHz, each millisecond consumes one stereo frame at normal speed.
    private static final class Track implements NativeAudioPump.Output {
        int buffered;
        int underruns;
        boolean playing;
        float speed = 1;
        int speedChanges;

        public int write(short[] data, int offset, int count) {
            int accepted = Math.min(180 - buffered, count / 2);
            buffered += accepted;
            return accepted * 2;
        }

        public void play() { playing = true; }

        public void setSpeed(float speed) {
            this.speed = speed;
            speedChanges++;
        }

        void advance(int milliseconds) {
            if (!playing) return;
            int consumed = Math.round(milliseconds * speed);
            if (consumed > buffered) underruns++;
            buffered = Math.max(0, buffered - consumed);
        }

        void flush() {
            playing = false;
            buffered = 0;
        }
    }

    public static void main(String[] args) {
        Track track = new Track();
        NativeAudioPump pump = new NativeAudioPump(track, 1000, 180, 500);
        short[] pcm = new short[80];
        for (int time = 20; time <= 5000; time += 20) {
            track.advance(20);
            pump.push(pcm, 36, time * 1_000_000L);
        }
        if (track.underruns != 0 || track.speed != .90f || track.speedChanges != 1)
            throw new AssertionError("Sustained slow production should play continuously");
        for (int time = 5020; time <= 6800; time += 20) {
            track.advance(20);
            pump.push(pcm, 40, time * 1_000_000L);
        }
        if (track.underruns != 0 || track.speed != 1)
            throw new AssertionError("Full-speed production should restore normal audio speed");

        for (int time = 6820; time <= 8000; time += 20) {
            track.advance(20);
            pump.push(pcm, 36, time * 1_000_000L);
        }
        if (track.speed == 1) throw new AssertionError("Test should slow audio before pause");
        track.flush();
        pump.reset();
        for (int time = 60_020; time <= 60_100; time += 20) {
            track.advance(20);
            pump.push(pcm, 40, time * 1_000_000L);
        }
        if (!track.playing || track.speed != 1 || track.buffered < 90)
            throw new AssertionError("Resuming should prebuffer and reset the audio speed");
        Track nearlyFull = new Track();
        NativeAudioPump nearPump = new NativeAudioPump(nearlyFull, 1000, 180, 500);
        short[] nearPcm = new short[98];
        for (int time = 50; time <= 8000; time += 50) {
            nearlyFull.advance(50);
            nearPump.push(nearPcm, 98, time * 1_000_000L);
        }
        if (nearlyFull.underruns != 0 || nearlyFull.speed != .98f)
            throw new AssertionError("A small sustained slowdown should not drain the buffer");
        System.out.println("PSP audio passed sustained slowdown, recovery, and pause/resume.");
    }
}
