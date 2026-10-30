// SPDX-License-Identifier: GPL-3.0-or-later
package com.koki.nds;

/** Complete PCM writes and a bounded preroll before starting AudioTrack. */
final class NativeAudioPump {
 interface Output { int write(short[] data,int offset,int count); void play(); }
 private final Output output;
 private final int preroll;
 private int primed;
 private boolean started;
 private long written;
 NativeAudioPump(Output output,int prerollSamples){if(prerollSamples<2)throw new IllegalArgumentException("Invalid audio preroll");this.output=output;this.preroll=prerollSamples;}
 void push(short[] data,int count){
  if(count<0||count>data.length)throw new IllegalArgumentException("Invalid PCM packet");
  int offset=0;
  while(offset<count){
   // Never fill an unstarted track: stop at the preroll threshold and start it.
   int length=started?count-offset:Math.min(count-offset,preroll-primed);
   int n=output.write(data,offset,length);
   if(n<=0||n>length)throw new IllegalStateException("Audio output stopped accepting samples ("+n+").");
   offset+=n;written+=n;
   if(!started){primed+=n;if(primed>=preroll){output.play();started=true;}}
  }
 }
 void reset(){primed=0;started=false;}
 long samplesWritten(){return written;}
}
