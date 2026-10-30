// SPDX-License-Identifier: GPL-3.0-or-later
#include <jni.h>
#include <android/native_window_jni.h>
#include <android/log.h>
#include <zlib.h>
#include <fstream>
#include <vector>
#include <deque>
#include <array>
#include <memory>
#include <string>
#include <cstring>
#include <stdexcept>
#include <algorithm>
#include "NDS.h"
#include "Args.h"
#include "GPU3D_Soft.h"
extern std::string koki_local_root;
using namespace melonDS;
namespace {
struct Session {
 std::unique_ptr<NDS> nds;
 ANativeWindow* window=nullptr;
 std::array<u8,32> hash{};
 int layout=0;bool swapped=false;int surfaceWidth=0,surfaceHeight=0;
 int rewind=0;unsigned frame=0;
 std::deque<std::vector<u8>> history;size_t historyBytes=0;
 ~Session(){if(window)ANativeWindow_release(window);}
};
std::string str(JNIEnv* e,jstring s){if(!s)return {};const char* p=e->GetStringUTFChars(s,nullptr);std::string out(p);e->ReleaseStringUTFChars(s,p);return out;}
void error(JNIEnv* e,const std::exception& x){e->ThrowNew(e->FindClass("java/lang/IllegalStateException"),x.what());}
Session& get(jlong p){if(!p)throw std::runtime_error("The native player is closed.");return *reinterpret_cast<Session*>(p);}
std::vector<u8> read(const std::string& path,size_t limit){std::ifstream f(path,std::ios::binary|std::ios::ate);if(!f)throw std::runtime_error("Could not open the local game data.");auto n=f.tellg();if(n<0||uint64_t(n)>limit)throw std::runtime_error("The local game data is too large.");std::vector<u8>b(static_cast<size_t>(n));f.seekg(0);if(n&&!f.read(reinterpret_cast<char*>(b.data()),n))throw std::runtime_error("The local game data is incomplete.");return b;}
void write(const std::string& path,const u8* p,size_t n){std::string pending=path+".pending";{std::ofstream f(pending,std::ios::binary|std::ios::trunc);if(!f||!f.write(reinterpret_cast<const char*>(p),n)||!f.flush())throw std::runtime_error("Could not save native game data.");}if(rename(pending.c_str(),path.c_str()))throw std::runtime_error("Could not finish saving native game data.");}
void put32(std::vector<u8>& b,size_t pos,u32 v){for(int i=0;i<4;i++)b[pos+i]=(v>>(i*8))&255;}
u32 read32(const std::vector<u8>& b,size_t pos){return b[pos]|u32(b[pos+1])<<8|u32(b[pos+2])<<16|u32(b[pos+3])<<24;}
void present(Session& s){if(!s.window)return;const int w=s.layout==1?512:256,h=s.layout==0?384:192;if(s.surfaceWidth!=w||s.surfaceHeight!=h){if(ANativeWindow_setBuffersGeometry(s.window,w,h,WINDOW_FORMAT_RGBA_8888)!=0)return;s.surfaceWidth=w;s.surfaceHeight=h;}ANativeWindow_Buffer b{};if(ANativeWindow_lock(s.window,&b,nullptr)!=0)return;auto* pixels=static_cast<u32*>(b.bits);auto& gpu=s.nds->GPU;for(int y=0;y<h;y++){for(int x=0;x<w;x++){int screen=s.layout==0?y/192:s.layout==1?x/256:1;int sx=x%256,sy=y%192;if(s.layout!=2&&s.swapped)screen=1-screen;const auto* source=gpu.Framebuffer[gpu.FrontBuffer][screen].get();u32 c=source?source[sy*256+sx]:0;pixels[y*b.stride+x]=(c&0xff00ff00)|((c&255)<<16)|((c>>16)&255)|0xff000000;}}ANativeWindow_unlockAndPost(s.window);}
std::vector<u8> state(Session& s){Savestate data; if(!s.nds->DoSavestate(&data)||data.Error)throw std::runtime_error("Could not create native checkpoint.");data.Finish();const auto n=data.Length();if(n<16||n>64*1024*1024)throw std::runtime_error("Invalid native checkpoint size.");uLongf capacity=compressBound(n);std::vector<u8> result(52+capacity);memcpy(result.data(),"KOKIMLN1",8);put32(result,8,0x431ab4bd);memcpy(result.data()+12,s.hash.data(),32);put32(result,44,n);put32(result,48,crc32(0,static_cast<const Bytef*>(data.Buffer()),n));if(compress2(result.data()+52,&capacity,static_cast<const Bytef*>(data.Buffer()),n,1)!=Z_OK)throw std::runtime_error("Could not compress native checkpoint.");result.resize(52+capacity);return result;}
void restore(Session& s,const std::vector<u8>& bytes){if(bytes.size()<53||memcmp(bytes.data(),"KOKIMLN1",8)||read32(bytes,8)!=0x431ab4bd||memcmp(bytes.data()+12,s.hash.data(),32))throw std::runtime_error("This checkpoint belongs to another game or engine.");uLongf n=read32(bytes,44);if(n<16||n>64*1024*1024)throw std::runtime_error("Invalid native checkpoint size.");std::vector<u8> raw(n);if(uncompress(raw.data(),&n,bytes.data()+52,bytes.size()-52)!=Z_OK||n!=raw.size()||crc32(0,raw.data(),n)!=read32(bytes,48))throw std::runtime_error("The native checkpoint is damaged.");Savestate data(raw.data(),n,false);if(data.Error||!s.nds->DoSavestate(&data)||data.Error)throw std::runtime_error("The native checkpoint could not be restored.");s.nds->SPU.SetDegrade10Bit(false);s.nds->SPU.SetInterpolation(AudioInterpolation::Cubic);s.nds->SPU.DrainOutput();present(s);}
}
#define JNI(name) extern "C" JNIEXPORT
JNI(create) jlong JNICALL Java_com_koki_nds_NativeNdsPlugin_nativeCreate(JNIEnv* e,jclass,jstring romPath,jstring savePath,jstring gameHash,jstring localRoot){try{auto s=std::make_unique<Session>();const auto hash=str(e,gameHash);if(hash.size()!=64)throw std::runtime_error("Invalid game identity.");for(int i=0;i<32;i++)s->hash[i]=std::stoul(hash.substr(i*2,2),nullptr,16);koki_local_root=str(e,localRoot);const auto path=str(e,romPath);std::ifstream f(path,std::ios::binary|std::ios::ate);if(!f)throw std::runtime_error("The game file is missing.");auto size=f.tellg();if(size<1024||size>512*1024*1024)throw std::runtime_error("Invalid DS game size.");auto rom=std::make_unique<u8[]>(size_t(size));f.seekg(0);if(!f.read(reinterpret_cast<char*>(rom.get()),size))throw std::runtime_error("Could not read the DS game.");NDSArgs args;args.JIT->FastMemory=false;args.OutputSampleRate=48000;args.BitDepth=AudioBitDepth::_16Bit;args.Interpolation=AudioInterpolation::Cubic;s->nds=std::make_unique<NDS>(std::move(args),s.get());auto cart=NDSCart::ParseROM(std::move(rom),size_t(size),s.get());if(!cart)throw std::runtime_error("This game header is not supported.");s->nds->SetNDSCart(std::move(cart));s->nds->Reset();auto save=str(e,savePath);if(!save.empty()){auto bytes=read(save,8*1024*1024);if(bytes.size()!=s->nds->GetNDSSaveLength())throw std::runtime_error("The in-game save size does not match this native engine. Your original save is preserved.");s->nds->SetNDSSave(bytes.data(),bytes.size());}auto& renderer=static_cast<SoftRenderer&>(s->nds->GetRenderer3D());renderer.SetThreaded(true,s->nds->GPU);s->nds->SetupDirectBoot("game.nds");s->nds->Start();return reinterpret_cast<jlong>(s.release());}catch(const std::exception& x){error(e,x);return 0;}}
JNI(destroy) void JNICALL Java_com_koki_nds_NativeNdsPlugin_nativeDestroy(JNIEnv*,jclass,jlong p){delete reinterpret_cast<Session*>(p);}
JNI(surface) void JNICALL Java_com_koki_nds_NativeNdsPlugin_nativeSurface(JNIEnv* e,jclass,jlong p,jobject surface){try{auto& s=get(p);if(s.window)ANativeWindow_release(s.window);s.window=surface?ANativeWindow_fromSurface(e,surface):nullptr;s.surfaceWidth=s.surfaceHeight=0;present(s);}catch(const std::exception& x){error(e,x);}}
JNI(layout) void JNICALL Java_com_koki_nds_NativeNdsPlugin_nativeLayout(JNIEnv* e,jclass,jlong p,jint layout,jboolean swap){try{auto& s=get(p);s.layout=std::clamp(int(layout),0,2);s.swapped=swap;present(s);}catch(const std::exception& x){error(e,x);}}
JNI(frame) jint JNICALL Java_com_koki_nds_NativeNdsPlugin_nativeFrame(JNIEnv* e,jclass,jlong p,jint keys,jint x,jint y,jboolean down,jboolean rewinding){try{auto& s=get(p);if(rewinding){if(!s.history.empty()){auto data=std::move(s.history.back());s.history.pop_back();s.historyBytes-=data.size();restore(s,data);}return 0;}s.nds->SetKeyMask((~keys)&4095);if(down)s.nds->TouchScreen(std::clamp(int(x),0,255),std::clamp(int(y),0,191));else s.nds->ReleaseScreen();s.nds->RunFrame();present(s);if(s.rewind&&++s.frame%60==0){auto data=state(s);s.historyBytes+=data.size();s.history.push_back(std::move(data));while(!s.history.empty()&&(s.history.size()>size_t(s.rewind)||s.historyBytes>32*1024*1024)){s.historyBytes-=s.history.front().size();s.history.pop_front();}}return s.nds->SPU.GetOutputSize();}catch(const std::exception& x){error(e,x);return -1;}}
JNI(audio) jint JNICALL Java_com_koki_nds_NativeNdsPlugin_nativeAudio(JNIEnv* e,jclass,jlong p,jshortArray target){try{auto& s=get(p);std::array<s16,8192> buffer{};int n=s.nds->SPU.ReadOutput(buffer.data(),4096);if(n>0)e->SetShortArrayRegion(target,0,n*2,reinterpret_cast<const jshort*>(buffer.data()));return n*2;}catch(const std::exception& x){error(e,x);return 0;}}
JNI(save) jint JNICALL Java_com_koki_nds_NativeNdsPlugin_nativeSave(JNIEnv* e,jclass,jlong p,jstring path){try{auto& s=get(p);auto n=s.nds->GetNDSSaveLength();if(n)write(str(e,path),s.nds->GetNDSSave(),n);return n;}catch(const std::exception& x){error(e,x);return 0;}}
JNI(state) void JNICALL Java_com_koki_nds_NativeNdsPlugin_nativeState(JNIEnv* e,jclass,jlong p,jstring path,jboolean saving){try{auto& s=get(p);if(saving){auto data=state(s);write(str(e,path),data.data(),data.size());}else{restore(s,read(str(e,path),64*1024*1024));s.history.clear();s.historyBytes=0;}}catch(const std::exception& x){error(e,x);}}
JNI(rewind) void JNICALL Java_com_koki_nds_NativeNdsPlugin_nativeRewind(JNIEnv* e,jclass,jlong p,jint seconds){try{auto& s=get(p);s.rewind=std::clamp(int(seconds),0,20);if(!s.rewind){s.history.clear();s.historyBytes=0;}}catch(const std::exception& x){error(e,x);}}
JNI(history) jint JNICALL Java_com_koki_nds_NativeNdsPlugin_nativeHistory(JNIEnv* e,jclass,jlong p){try{return get(p).history.size();}catch(const std::exception& x){error(e,x);return 0;}}
JNI(reset) void JNICALL Java_com_koki_nds_NativeNdsPlugin_nativeReset(JNIEnv* e,jclass,jlong p){try{auto& s=get(p);s.nds->Reset();s.nds->SetupDirectBoot("game.nds");s.nds->Start();s.nds->SPU.SetDegrade10Bit(false);s.nds->SPU.SetInterpolation(AudioInterpolation::Cubic);s.history.clear();s.historyBytes=0;}catch(const std::exception& x){error(e,x);}}
