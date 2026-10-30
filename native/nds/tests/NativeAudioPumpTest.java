package com.koki.nds;
import java.util.*;
public final class NativeAudioPumpTest {
 public static void main(String[] args){
  List<Short> received=new ArrayList<>();final int[] starts={0},queued={0};final boolean[] playing={false};
  NativeAudioPump pump=new NativeAudioPump(new NativeAudioPump.Output(){public int write(short[] data,int offset,int count){int n=Math.min(count,3);if(!playing[0]&&queued[0]+n>8)throw new AssertionError("Blocked before starting playback");for(int i=0;i<n;i++)received.add(data[offset+i]);queued[0]+=n;return n;}public void play(){if(queued[0]!=8)throw new AssertionError("Incorrect preroll");starts[0]++;playing[0]=true;}},8);
  short[] data=new short[32];for(short i=0;i<data.length;i++)data[i]=i;
  pump.push(data,32);if(starts[0]!=1||pump.samplesWritten()!=32||received.size()!=32)throw new AssertionError("Incomplete audio");for(int i=0;i<32;i++)if(received.get(i)!=i)throw new AssertionError("Sample lost/reordered");
  pump.reset();playing[0]=false;queued[0]=0;pump.push(data,8);if(starts[0]!=2)throw new AssertionError("Resume was not primed");
  for(int failure:new int[]{0,-6,100}){NativeAudioPump bad=new NativeAudioPump(new NativeAudioPump.Output(){public int write(short[]d,int o,int n){return failure;}public void play(){}},8);boolean rejected=false;try{bad.push(data,8);}catch(IllegalStateException e){rejected=true;}if(!rejected)throw new AssertionError("Invalid write accepted");}
  System.out.println("PCM partial-write preservation, bounded preroll, resume priming and output-error tests passed.");
 }
}
