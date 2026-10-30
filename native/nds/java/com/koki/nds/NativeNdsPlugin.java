// SPDX-License-Identifier: GPL-3.0-or-later
package com.koki.nds;
import android.graphics.*;
import android.media.*;
import android.net.Uri;
import android.os.*;
import android.util.Base64;
import android.view.*;
import android.webkit.WebView;
import android.widget.FrameLayout;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;

@CapacitorPlugin(name="NativeNds")
public class NativeNdsPlugin extends Plugin {
 static { System.loadLibrary("koki_nds"); }
 private final HandlerThread thread=new HandlerThread("KokiNativeNds");
 private Handler handler; private long core;
 private volatile boolean playing,rewinding,penDown,turboA,turboB;
 private volatile int keys,penX,penY,turboRate=8;
 private volatile double speed=1,volume=.7;
 private AudioTrack audio; private NativeAudioPump audioPump; private final short[] pcm=new short[8192];
 private TextureView picture; private FrameLayout container; private Surface surface;
 private long deadline,statsStart; private int statsFrames; private int layoutValue; private String gameId;
 private static native long nativeCreate(String rom,String save,String hash,String root);
 private static native void nativeDestroy(long h);
 private static native void nativeSurface(long h,Surface surface);
 private static native void nativeLayout(long h,int layout,boolean swap);
 private static native int nativeFrame(long h,int keys,int x,int y,boolean pen,boolean rewind);
 private static native int nativeAudio(long h,short[] data);
 private static native int nativeSave(long h,String path);
 private static native void nativeState(long h,String path,boolean saving);
 private static native void nativeRewind(long h,int seconds);
 private static native int nativeHistory(long h);
 private static native void nativeReset(long h);
 @Override public void load(){thread.start();handler=new Handler(thread.getLooper());}
 private File local(String uri,boolean exists)throws Exception{
  Uri u=Uri.parse(uri);if(!"file".equals(u.getScheme()))throw new Exception("Choose a private local game file.");
  File f=new File(u.getPath()).getCanonicalFile();String p=f.getPath();
  if(!p.startsWith(getContext().getFilesDir().getCanonicalPath()+"/")&&!p.startsWith(getContext().getCacheDir().getCanonicalPath()+"/"))throw new Exception("Invalid native game path.");
  if(exists&&(!f.isFile()||!f.canRead()))throw new Exception("The local game data is missing.");return f;
 }
 private File output(String name)throws Exception{File d=new File(getContext().getCacheDir(),"native-nds");if(!d.isDirectory()&&!d.mkdirs())throw new Exception("Could not prepare native storage.");return new File(d,name);}
 private void fail(PluginCall c,Throwable e){c.reject(e.getMessage()==null?"The native player could not perform this operation.":e.getMessage());}
 private void attached(){
  if(picture!=null)return;WebView web=getBridge().getWebView();
  if(container==null){ViewGroup p=(ViewGroup)web.getParent();int i=p.indexOfChild(web);ViewGroup.LayoutParams old=web.getLayoutParams();p.removeView(web);container=new FrameLayout(getContext());p.addView(container,i,old);container.addView(web,new FrameLayout.LayoutParams(-1,-1));}
  picture=new TextureView(getContext());picture.setOpaque(true);picture.setClickable(false);container.setBackgroundColor(Color.BLACK);container.addView(picture,0,new FrameLayout.LayoutParams(1,1));web.setBackgroundColor(Color.TRANSPARENT);
  picture.setSurfaceTextureListener(new TextureView.SurfaceTextureListener(){
   public void onSurfaceTextureAvailable(SurfaceTexture t,int w,int h){Surface next=new Surface(t);surface=next;handler.post(()->{if(core!=0)nativeSurface(core,next);});}
   public void onSurfaceTextureSizeChanged(SurfaceTexture t,int w,int h){}
   public boolean onSurfaceTextureDestroyed(SurfaceTexture t){Surface previous=surface;surface=null;handler.post(()->{if(core!=0)nativeSurface(core,null);if(previous!=null)previous.release();});return true;}
   public void onSurfaceTextureUpdated(SurfaceTexture t){}
  });
 }
 private void detached(){if(picture==null)return;container.removeView(picture);picture=null;getBridge().getWebView().setBackgroundColor(Color.BLACK);}
 private void flushAudio(){if(audio!=null){audio.pause();audio.flush();}if(audioPump!=null)audioPump.reset();}
 private void releaseCore(){playing=false;handler.removeCallbacks(tick);if(audio!=null){audio.pause();audio.flush();audio.release();audio=null;audioPump=null;}if(core!=0){nativeDestroy(core);core=0;}}
 private void prepareAudio(){try{int min=AudioTrack.getMinBufferSize(48000,AudioFormat.CHANNEL_OUT_STEREO,AudioFormat.ENCODING_PCM_16BIT);audio=new AudioTrack.Builder().setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build()).setAudioFormat(new AudioFormat.Builder().setSampleRate(48000).setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build()).setBufferSizeInBytes(Math.max(16384,min*2)).setTransferMode(AudioTrack.MODE_STREAM).build();audio.setVolume((float)volume);audioPump=new NativeAudioPump(new NativeAudioPump.Output(){public int write(short[] data,int offset,int count){return audio.write(data,offset,count,AudioTrack.WRITE_BLOCKING);}public void play(){audio.play();}},Math.min(2400,audio.getBufferSizeInFrames()/2)*2);}catch(Exception e){if(audio!=null)audio.release();audio=null;audioPump=null;}}
 private final Runnable tick=new Runnable(){public void run(){if(!playing||core==0)return;try{
  int mask=keys;double phase=(SystemClock.elapsedRealtime()*turboRate/1000.0)%1;if(phase>=.5){if(turboA)mask&=~1;if(turboB)mask&=~2;}
  if(nativeFrame(core,mask,penX,penY,penDown,rewinding)<0)throw new Exception("The native DS engine stopped.");
  int count=nativeAudio(core,pcm);if(audio!=null&&count>0&&!rewinding)audioPump.push(pcm,count);
  statsFrames++;long now=SystemClock.uptimeMillis();if(now-statsStart>=1000){JSObject stats=new JSObject();stats.put("fps",statsFrames*1000.0/(now-statsStart));stats.put("rewindSeconds",nativeHistory(core));stats.put("audioUnderruns",audio==null?0:audio.getUnderrunCount());stats.put("audioSamplesWritten",audioPump==null?0:audioPump.samplesWritten());notifyListeners("stats",stats);statsFrames=0;statsStart=now;}
  deadline+=Math.round(1000000000.0/(59.8261*speed));long ns=System.nanoTime();if(deadline<ns-100000000L)deadline=ns;handler.postDelayed(this,Math.max(0,(deadline-ns)/1000000));
 }catch(Throwable e){playing=false;JSObject data=new JSObject();data.put("message",e.getMessage());notifyListeners("error",data);}}};
 @PluginMethod public void open(PluginCall call){try{
  String id=call.getString("gameId","");if(!id.matches("[a-f0-9]{64}"))throw new Exception("Invalid game identity.");File rom=local(call.getString("rom",""),true);File root=new File(getContext().getFilesDir(),"library/nds/roms").getCanonicalFile();if(!rom.getParentFile().equals(root)||!rom.getName().equals(id+".nds"))throw new Exception("Choose a game from your NDS library.");
  String save=call.getString("save","");if(!save.isEmpty())save=local(save,true).getPath();final String savePath=save;gameId=id;
  getActivity().runOnUiThread(this::attached);handler.post(()->{try{releaseCore();core=nativeCreate(rom.getPath(),savePath,id,output("runtime").getParentFile().getPath());if(core==0)throw new Exception("Native DS engine could not start.");if(surface!=null)nativeSurface(core,surface);prepareAudio();JSObject result=new JSObject();result.put("engine","melonds-431ab4b-android-v1");result.put("jit",true);call.resolve(result);}catch(Throwable e){fail(call,e);}});
 }catch(Throwable e){fail(call,e);}}
 @PluginMethod public void viewport(PluginCall call){final double d=call.getDouble("dpr",1.0),x=call.getDouble("x",0.0),y=call.getDouble("y",0.0),w=call.getDouble("width",1.0),h=call.getDouble("height",1.0);if(!Double.isFinite(d)||d<.25||d>8||!Double.isFinite(x+y+w+h)||w<1||h<1){call.reject("Invalid game viewport.");return;}getActivity().runOnUiThread(()->{if(picture!=null){FrameLayout.LayoutParams p=new FrameLayout.LayoutParams(Math.max(1,Math.min(container.getWidth(),(int)Math.round(w*d))),Math.max(1,Math.min(container.getHeight(),(int)Math.round(h*d))));p.leftMargin=Math.max(0,(int)Math.round(x*d));p.topMargin=Math.max(0,(int)Math.round(y*d));picture.setLayoutParams(p);}call.resolve();});}
 @PluginMethod public void input(PluginCall c){keys=c.getInt("keys",0)&4095;penX=Math.max(0,Math.min(255,c.getInt("x",0)));penY=Math.max(0,Math.min(191,c.getInt("y",0)));penDown=c.getBoolean("pen",false);c.resolve();}
 @PluginMethod public void configure(PluginCall c){speed=Math.max(.5,Math.min(4,c.getDouble("speed",speed)));volume=Math.max(0,Math.min(1,c.getDouble("volume",volume)));turboA=c.getBoolean("turboA",turboA);turboB=c.getBoolean("turboB",turboB);turboRate=Math.max(3,Math.min(15,c.getInt("turboRate",turboRate)));boolean audioTransition=c.getBoolean("rewinding",rewinding)!=rewinding;rewinding=c.getBoolean("rewinding",rewinding);int layout=c.getInt("layout",0),rewind=c.getInt("rewind",0);boolean swap=c.getBoolean("swapped",false);layoutValue=layout;handler.post(()->{try{if(core!=0){nativeLayout(core,layout,swap);nativeRewind(core,rewind);}if(audioTransition)flushAudio();if(audio!=null){audio.setVolume((float)volume);try{audio.setPlaybackRate((int)(48000*speed));}catch(Exception ignored){}}c.resolve();}catch(Throwable e){fail(c,e);}});}
 @PluginMethod public void play(PluginCall c){handler.post(()->{if(core==0){c.reject("Load a game first.");return;}if(!playing){playing=true;deadline=System.nanoTime();statsStart=SystemClock.uptimeMillis();statsFrames=0;handler.post(tick);}c.resolve();});}
 @PluginMethod public void pause(PluginCall c){playing=false;handler.post(()->{handler.removeCallbacks(tick);flushAudio();c.resolve();});}
 @PluginMethod public void battery(PluginCall c){handler.post(()->{try{File f=output(gameId+".sav");int n=nativeSave(core,f.getPath());JSObject r=new JSObject();r.put("bytes",n);if(n>0)r.put("uri",Uri.fromFile(f).toString());c.resolve(r);}catch(Throwable e){fail(c,e);}});}
 @PluginMethod public void checkpoint(PluginCall c){handler.post(()->{try{File f=output(gameId+".state");nativeState(core,f.getPath(),true);JSObject r=new JSObject();r.put("uri",Uri.fromFile(f).toString());c.resolve(r);}catch(Throwable e){fail(c,e);}});}
 @PluginMethod public void restore(PluginCall c){try{File f=local(c.getString("uri",""),true);handler.post(()->{try{nativeState(core,f.getPath(),false);flushAudio();c.resolve();}catch(Throwable e){fail(c,e);}});}catch(Throwable e){fail(c,e);}}
 @PluginMethod public void reset(PluginCall c){handler.post(()->{try{nativeReset(core);flushAudio();c.resolve();}catch(Throwable e){fail(c,e);}});}
 @PluginMethod public void screenshot(PluginCall c){getActivity().runOnUiThread(()->{try{if(picture==null||!picture.isAvailable())throw new Exception("The game screen is not ready.");Bitmap image=picture.getBitmap(layoutValue==1?512:256,layoutValue==0?384:192);if(image==null)throw new Exception("Could not capture the game screen.");ByteArrayOutputStream b=new ByteArrayOutputStream();image.compress(Bitmap.CompressFormat.PNG,100,b);image.recycle();JSObject r=new JSObject();r.put("data",Base64.encodeToString(b.toByteArray(),Base64.NO_WRAP));c.resolve(r);}catch(Throwable e){fail(c,e);}});}
 @PluginMethod public void close(PluginCall c){playing=false;handler.post(()->{releaseCore();getActivity().runOnUiThread(()->{detached();c.resolve();});});}
 @Override protected void handleOnPause(){playing=false;if(handler!=null)handler.post(()->{handler.removeCallbacks(tick);flushAudio();});}
 @Override protected void handleOnDestroy(){playing=false;if(handler!=null)handler.post(()->{releaseCore();thread.quitSafely();});}
}
