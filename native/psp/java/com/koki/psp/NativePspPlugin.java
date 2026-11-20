// SPDX-License-Identifier: GPL-2.0-or-later
package com.koki.psp;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.SurfaceTexture;
import android.media.PlaybackParams;
import android.media.*;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.*;

@CapacitorPlugin(name="NativePsp")
public class NativePspPlugin extends Plugin {
    static { System.loadLibrary("koki_psp"); }
    private final HandlerThread engineThread=new HandlerThread("KokiPSP");
    private final ExecutorService files=Executors.newSingleThreadExecutor();
    private Handler engine;
    private PspLibrary library;
    private long core;
    private volatile boolean playing;
    private final Object inputLock = new Object();
    private int buttons, stickX, stickY, pendingPresses, lastPresses;
    private Integer libraryOrientation;
    private volatile float volume=.8f;
    private long deadline;
    private int rate=44100;
    private String currentGame;
    private AudioTrack audio;
    private NativeAudioPump pump;
    private final short[] pcm=new short[65536];
    private FrameLayout container;
    private TextureView picture;
    private Surface surface;
    private static native long nativeCreate(String libs,String system,String saves,String rom);
    private static native void nativeDestroy(long core);
    private static native void nativeSurface(long core,Surface surface);
    private static native int nativeRate(long core);
    private static native void nativeSmoothing(long core,boolean enabled);
    private static native double nativeFrame(long core,int buttons,int x,int y);
    private static native int nativeAudio(long core,short[] pcm);
    private static native void nativeState(long core,String file,boolean saving);
    @Override public void load() { library=new PspLibrary(getContext());engineThread.start();engine=new Handler(engineThread.getLooper()); }
    private interface Work { void run() throws Exception; }
    private void work(PluginCall call,Work work) {
        files.execute(()->{try { work.run(); } catch(Throwable error) { reject(call,error); }});
    }
    private void reject(PluginCall call,Throwable error) { call.reject(error.getMessage()==null?"The PSP operation failed.":error.getMessage()); }
    private JSObject gamesResult() throws Exception { JSObject result=new JSObject();result.put("games",new JSArray(library.presented().toString()));return result; }
    private File directory(String name) throws Exception { File folder=new File(library.root(),name);PspLibrary.ensure(folder);return folder; }
    @PluginMethod public void games(PluginCall call) { work(call,()->call.resolve(gamesResult())); }
    @PluginMethod public void favorite(PluginCall call) { work(call,()->{library.favorite(call.getString("id",""));call.resolve(gamesResult());}); }
    @PluginMethod public void remove(PluginCall call) { work(call,()->{String id=call.getString("id","");if(id.equals(currentGame))throw new IOException("Close this game before removing it.");library.remove(id);call.resolve(gamesResult());}); }
    @PluginMethod public void choose(PluginCall call) {
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.setType("*/*");intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);
        startActivityForResult(call,intent,"picked");
    }
    @ActivityCallback private void picked(PluginCall call,ActivityResult result) {
        if(call==null)return;
        work(call,()->{
            JSONArray errors=new JSONArray();
            Intent intent=result.getData();
            if(result.getResultCode()==Activity.RESULT_OK && intent!=null) {
                List<Uri> uris=new ArrayList<>();
                if(intent.getClipData()!=null) for(int n=0;n<intent.getClipData().getItemCount();n++) uris.add(intent.getClipData().getItemAt(n).getUri());
                else if(intent.getData()!=null) uris.add(intent.getData());
                for(Uri uri:uris) { try { library.add(uri); } catch(Exception error) { errors.put(error.getMessage()); } }
            }
            JSObject response=gamesResult();response.put("errors",new JSArray(errors.toString()));call.resolve(response);
        });
    }
    private void attach() {
        if(picture!=null)return;
        Activity activity = getActivity();
        libraryOrientation = activity.getRequestedOrientation();
        activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        WebView web=getBridge().getWebView();
        if(container==null) {
            ViewGroup parent=(ViewGroup)web.getParent();int position=parent.indexOfChild(web);ViewGroup.LayoutParams params=web.getLayoutParams();
            parent.removeView(web);container=new FrameLayout(getContext());container.setBackgroundColor(Color.BLACK);
            parent.addView(container,position,params);container.addView(web,new FrameLayout.LayoutParams(-1,-1));
        }
        picture=new TextureView(getContext());picture.setOpaque(true);picture.setClickable(false);
        container.addView(picture,0,new FrameLayout.LayoutParams(1,1));web.setBackgroundColor(Color.TRANSPARENT);
        picture.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            public void onSurfaceTextureAvailable(SurfaceTexture texture,int w,int h) {
                Surface next=new Surface(texture);surface=next;
                engine.post(()->{try { if(core!=0)nativeSurface(core,next); } catch(Throwable error) { playerError(error); }});
            }
            public void onSurfaceTextureSizeChanged(SurfaceTexture texture,int w,int h) {}
            public boolean onSurfaceTextureDestroyed(SurfaceTexture texture) {
                Surface previous=surface;surface=null;
                engine.post(()->{try { if(core!=0)nativeSurface(core,null); } finally { if(previous!=null)previous.release(); }});
                return true;
            }
            public void onSurfaceTextureUpdated(SurfaceTexture texture) {}
        });
    }
    private void detach() {
        if (picture != null) {
            container.removeView(picture);
            picture = null;
        }
        getBridge().getWebView().setBackgroundColor(getContext().getColor(com.koki.psp.R.color.koki_background));
        if (libraryOrientation != null) {
            getActivity().setRequestedOrientation(libraryOrientation);
            libraryOrientation = null;
        }
    }
    private void playerError(Throwable error) {
        playing=false;flushAudio();
        JSObject message=new JSObject();message.put("message",error.getMessage()==null?"The PSP engine stopped.":error.getMessage());notifyListeners("error",message);
    }
    private void flushAudio() { if(audio!=null){audio.pause();audio.flush();}if(pump!=null)pump.reset(); }
    private void closeCore() {
        playing=false;engine.removeCallbacks(tick);resetInput();
        if(audio!=null){audio.pause();audio.flush();audio.release();audio=null;pump=null;}
        if(core!=0){nativeDestroy(core);core=0;}currentGame=null;
    }
    private void prepareAudio() {
        int minimum=AudioTrack.getMinBufferSize(rate,AudioFormat.CHANNEL_OUT_STEREO,AudioFormat.ENCODING_PCM_16BIT);
        if(minimum<0)throw new IllegalStateException("Could not initialize PSP audio.");
        audio=new AudioTrack.Builder().setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            .setAudioFormat(new AudioFormat.Builder().setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
            .setBufferSizeInBytes(Math.max(minimum * 3, rate * 18 / 100 * 4)).setTransferMode(AudioTrack.MODE_STREAM).build();
        if(audio.getState()!=AudioTrack.STATE_INITIALIZED)throw new IllegalStateException("Could not start PSP audio.");
        audio.setVolume(volume);
        int prerollFrames = Math.min(rate * 9 / 100, audio.getBufferSizeInFrames() / 2);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) audio.setStartThresholdInFrames(prerollFrames);
        pump=new NativeAudioPump(new NativeAudioPump.Output() {
            public int write(short[] data,int offset,int count) { return audio.write(data,offset,count,AudioTrack.WRITE_NON_BLOCKING); }
            public void play() { audio.play(); }
            public void setSpeed(float speed) {
                try {
                    audio.setPlaybackParams(new PlaybackParams().setSpeed(speed).setPitch(1)
                        .setAudioFallbackMode(PlaybackParams.AUDIO_FALLBACK_MODE_FAIL));
                } catch (IllegalArgumentException ignored) {
                    // Keep buffering on output routes that cannot apply time stretching.
                }
            }
        }, rate, prerollFrames * 2, rate / 4 * 2);
    }
    private final Runnable tick=new Runnable() { public void run() {
        if(!playing || core==0)return;
        long started = System.nanoTime();
        try {
            int frameButtons, x, y;
            synchronized (inputLock) {
                frameButtons = buttons | pendingPresses | lastPresses;
                lastPresses = pendingPresses;
                pendingPresses = 0;
                x = stickX;
                y = stickY;
            }
            double fps = nativeFrame(core, frameButtons, x, y);
            pump.push(pcm, nativeAudio(core, pcm), System.nanoTime());
            long interval = Math.round(1_000_000_000.0 / fps);
            // Preserve cadence for small scheduling jitter. Rebase after a
            // stall so overdue frames do not run in a burst.
            if (started - deadline > interval / 2) deadline = started;
            deadline += interval;
            long remaining = deadline - System.nanoTime();
            engine.postDelayed(this, Math.max(0, (remaining + 500_000L) / 1_000_000L));
        } catch(Throwable error) { playerError(error); }
    }};
    private void copyAssets(String path,File destination) throws Exception {
        String[] names=getContext().getAssets().list(path);
        if(names!=null && names.length>0) {
            PspLibrary.ensure(destination);
            for(String name:names) copyAssets(path+"/"+name,new File(destination,name));
        } else {
            PspLibrary.ensure(destination.getParentFile());
            try(InputStream in=getContext().getAssets().open(path);OutputStream out=new FileOutputStream(destination)) { byte[] block=new byte[65536];int count;while((count=in.read(block))!=-1)out.write(block,0,count); }
        }
    }
    @PluginMethod public void start(PluginCall call) {
        work(call,()->{
            if(currentGame!=null)throw new IOException("Close the current PSP game first.");
            JSONObject game=library.game(call.getString("id",""));
            File rom=new File(game.getString("file")).getCanonicalFile();
            if(!rom.isFile() || !rom.getPath().startsWith(new File(library.root(),"imports").getCanonicalPath()+"/"))throw new IOException("The imported game is missing. Add it again.");
            File system=directory("system");
            File marker=new File(system,"assets-0.2.0");
            if(!marker.isFile()){copyAssets("psp-system",system);Files.write(marker.toPath(),new byte[]{1});}
            File saves=directory("memory-stick");
            getActivity().runOnUiThread(this::attach);
            engine.post(()->{
                try {
                    closeCore();
                    core=nativeCreate(getContext().getApplicationInfo().nativeLibraryDir,system.getPath(),saves.getPath(),rom.getPath());
                    if(core==0)throw new IOException("Could not open the native PSP engine.");
                    currentGame=game.getString("id");
                    if(surface!=null)nativeSurface(core,surface);
                    rate=nativeRate(core);prepareAudio();library.played(currentGame);
                    JSObject timing=new JSObject();timing.put("fps",60);timing.put("sampleRate",rate);timing.put("native",true);call.resolve(timing);
                } catch(Throwable error) {
                    closeCore();getActivity().runOnUiThread(this::detach);reject(call,error);
                }
            });
        });
    }
    @PluginMethod public void viewport(PluginCall call) {
        double dpr=call.getDouble("dpr",1.0),x=call.getDouble("x",0.0),y=call.getDouble("y",0.0),w=call.getDouble("width",1.0),h=call.getDouble("height",1.0);
        if(!Double.isFinite(dpr+x+y+w+h)||dpr<.25||dpr>8||w<1||h<1){call.reject("Invalid PSP viewport.");return;}
        getActivity().runOnUiThread(()->{
            if(picture!=null){
                FrameLayout.LayoutParams params=new FrameLayout.LayoutParams(Math.max(1,(int)Math.round(w*dpr)),Math.max(1,(int)Math.round(h*dpr)));
                params.leftMargin=Math.max(0,(int)Math.round(x*dpr));params.topMargin=Math.max(0,(int)Math.round(y*dpr));picture.setLayoutParams(params);
            }
            call.resolve();
        });
    }
    private void resetInput() {
        synchronized (inputLock) { buttons = stickX = stickY = pendingPresses = lastPresses = 0; }
    }
    @PluginMethod public void input(PluginCall call) {
        int next = call.getInt("buttons", 0) & 0x0fff;
        int x = Math.max(-32767, Math.min(32767, call.getInt("x", 0)));
        int y = Math.max(-32767, Math.min(32767, call.getInt("y", 0)));
        synchronized (inputLock) {
            // Keep quick presses visible across PSP controller sampling boundaries.
            pendingPresses |= next & ~buttons;
            buttons = next;
            stickX = x;
            stickY = y;
        }
        call.resolve();
    }
    @PluginMethod public void play(PluginCall call) {
        boolean paused=call.getBoolean("paused",true);boolean smoothing=call.getBoolean("smoothing",true);double requested=call.getDouble("volume",.8);
        volume=(float)(Double.isFinite(requested)?Math.max(0,Math.min(1,requested)):.8);
        engine.post(()->{
            try {
                if(core==0){call.resolve();return;}
                audio.setVolume(volume);nativeSmoothing(core,smoothing);
                if(paused){playing=false;engine.removeCallbacks(tick);resetInput();flushAudio();}
                else if(!playing){playing=true;deadline=System.nanoTime();engine.post(tick);}
                call.resolve();
            } catch(Throwable error) { reject(call,error); }
        });
    }
    private File stateFile(String id) throws Exception {
        if(id==null || !id.matches("[a-f0-9]{64}\\.[0-9]{13}\\.[a-f0-9-]{36}\\.state"))throw new IOException("Invalid checkpoint identity.");
        return new File(directory("checkpoints"),id);
    }
    private JSArray states() throws Exception {
        File[] files=directory("checkpoints").listFiles((dir,name)->name.matches("[a-f0-9]{64}\\.[0-9]{13}\\.[a-f0-9-]{36}\\.state"));
        List<File> ordered=files==null?new ArrayList<>():new ArrayList<>(Arrays.asList(files));
        ordered.sort((a,b)->Long.compare(b.lastModified(),a.lastModified()));
        JSArray result=new JSArray();
        for(File file:ordered) { String[] parts=file.getName().split("\\.");result.put(new JSONObject().put("id",file.getName()).put("gameId",parts[0]).put("created",Long.parseLong(parts[1])).put("bytes",file.length())); }
        return result;
    }
    @PluginMethod public void checkpoints(PluginCall call) { work(call,()->{JSObject result=new JSObject();result.put("checkpoints",states());call.resolve(result);}); }
    @PluginMethod public void deleteCheckpoint(PluginCall call) { work(call,()->{Files.deleteIfExists(stateFile(call.getString("id")).toPath());call.resolve();}); }
    @PluginMethod public void checkpoint(PluginCall call) {
        engine.post(()->{try {
            if(core==0||currentGame==null)throw new IOException("Open a PSP game first.");
            boolean resume=playing;playing=false;engine.removeCallbacks(tick);flushAudio();
            if(call.getBoolean("restore",false)) {
                String id=call.getString("id");
                if(id==null) { JSArray states=states();for(int n=0;n<states.length();n++) if(states.getJSONObject(n).getString("gameId").equals(currentGame)){id=states.getJSONObject(n).getString("id");break;} }
                if(id==null || !id.startsWith(currentGame+"."))throw new IOException("This game has no checkpoint yet.");
                nativeState(core,stateFile(id).getPath(),false);
            } else {
                File destination=stateFile(currentGame+"."+System.currentTimeMillis()+"."+UUID.randomUUID()+".state");
                File temporary=new File(destination.getPath()+".tmp");
                try { nativeState(core,temporary.getPath(),true);Files.move(temporary.toPath(),destination.toPath(),StandardCopyOption.ATOMIC_MOVE); }
                finally { Files.deleteIfExists(temporary.toPath()); }
            }
            if(resume){playing=true;deadline=System.nanoTime();engine.post(tick);}
            call.resolve();
        } catch(Throwable error) { reject(call,error); }});
    }
    @PluginMethod public void screenshot(PluginCall call) {
        getActivity().runOnUiThread(()->{try {
            if(picture==null||!picture.isAvailable()||currentGame==null)throw new IOException("The PSP screen is not ready.");
            Bitmap bitmap=picture.getBitmap(480,272);if(bitmap==null)throw new IOException("Could not capture the PSP screen.");
            File file=new File(directory("screenshots"),currentGame+".png"),temporary=new File(file.getPath()+".tmp");
            try(OutputStream output=new FileOutputStream(temporary)) { if(!bitmap.compress(Bitmap.CompressFormat.PNG,100,output))throw new IOException("Could not save the screenshot."); }
            finally { bitmap.recycle(); }
            Files.move(temporary.toPath(),file.toPath(),StandardCopyOption.REPLACE_EXISTING);call.resolve();
        } catch(Throwable error) { reject(call,error); }});
    }
    private void zipFolder(ZipOutputStream zip,File root,File file) throws Exception {
        File[] children=file.listFiles();
        if(children!=null){for(File child:children)zipFolder(zip,root,child);return;}
        zip.putNextEntry(new ZipEntry(root.toPath().relativize(file.toPath()).toString().replace('\\','/')));
        try(InputStream in=new FileInputStream(file)) {byte[] block=new byte[65536];int count;while((count=in.read(block))!=-1)zip.write(block,0,count);}
        zip.closeEntry();
    }
    @PluginMethod public void saves(PluginCall call) {
        work(call,()->{
            if(playing)throw new IOException("Close the game before exporting saves.");
            File stick=directory("memory-stick"),cache=new File(getContext().getCacheDir(),"psp-exports");PspLibrary.ensure(cache);
            File archive=new File(cache,"Koki-PSP-memory-stick.zip");
            try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(archive))){File[] children=stick.listFiles();if(children!=null)for(File child:children)zipFolder(zip,stick,child);}
            Uri uri=FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".fileprovider",archive);
            Intent share=new Intent(Intent.ACTION_SEND);share.setType("application/zip");share.putExtra(Intent.EXTRA_STREAM,uri);share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(()->{getActivity().startActivity(Intent.createChooser(share,"Export PSP saves"));call.resolve();});
        });
    }
    @PluginMethod public void stop(PluginCall call) { playing=false;engine.post(()->{try{closeCore();getActivity().runOnUiThread(()->{detach();call.resolve();});}catch(Throwable error){reject(call,error);}}); }
    @Override protected void handleOnPause() { playing=false;resetInput();if(engine!=null)engine.post(()->{engine.removeCallbacks(tick);flushAudio();}); }
    @Override protected void handleOnDestroy() { playing=false;files.shutdown();if(engine!=null)engine.post(()->{closeCore();engineThread.quitSafely();}); }
}
