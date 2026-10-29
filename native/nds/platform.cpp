// SPDX-License-Identifier: GPL-3.0-or-later
#include "Platform.h"
#include <android/log.h>
#include <cstdio>
#include <cstdarg>
#include <chrono>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <dlfcn.h>
#include <unistd.h>
#include <sys/stat.h>
#include <cstring>
std::string koki_local_root;
namespace melonDS::Platform {
struct FileHandle { FILE* f; };
struct Thread { std::thread t; explicit Thread(std::function<void()> f):t(std::move(f)){} };
struct Mutex {std::mutex m;};
struct Semaphore {std::mutex m;std::condition_variable cv;int count=0;};
struct DynamicLibrary {void* h;};
void SignalStop(StopReason,void*) {}
std::string GetLocalFilePath(const std::string& f){return f.size()&&f[0]=='/'?f:koki_local_root+"/"+f;}
FileHandle* OpenFile(const std::string& path,FileMode mode){const bool w=mode&Write,r=mode&Read,p=mode&Preserve,n=mode&NoCreate,a=mode&Append;const char* flags=a?(r?"a+b":"ab"):w?(p?"r+b":r?"w+b":"wb"):"rb";FILE* f=fopen(path.c_str(),flags);if(!f&&w&&p&&!n)f=fopen(path.c_str(),r?"w+b":"wb");return f?new FileHandle{f}:nullptr;}
FileHandle* OpenLocalFile(const std::string& path,FileMode mode){return OpenFile(GetLocalFilePath(path),mode);}
bool FileExists(const std::string& p){return access(p.c_str(),F_OK)==0;}
bool LocalFileExists(const std::string& p){return FileExists(GetLocalFilePath(p));}
bool CheckFileWritable(const std::string& p){auto f=OpenFile(p,FileMode(Write|Preserve));if(!f)return false;return CloseFile(f);}
bool CheckLocalFileWritable(const std::string& p){return CheckFileWritable(GetLocalFilePath(p));}
bool CloseFile(FileHandle* f){if(!f)return false;bool ok=fclose(f->f)==0;delete f;return ok;}
bool IsEndOfFile(FileHandle* f){return feof(f->f);}
bool FileReadLine(char* s,int n,FileHandle* f){return fgets(s,n,f->f)!=nullptr;}
u64 FilePosition(FileHandle* f){return ftello(f->f);}
bool FileSeek(FileHandle* f,s64 off,FileSeekOrigin origin){return fseeko(f->f,off,origin==FileSeekOrigin::Start?SEEK_SET:origin==FileSeekOrigin::Current?SEEK_CUR:SEEK_END)==0;}
void FileRewind(FileHandle* f){rewind(f->f);}
u64 FileRead(void* p,u64 s,u64 n,FileHandle* f){return fread(p,s,n,f->f);}
bool FileFlush(FileHandle* f){return fflush(f->f)==0;}
u64 FileWrite(const void* p,u64 s,u64 n,FileHandle* f){return fwrite(p,s,n,f->f);}
u64 FileWriteFormatted(FileHandle* f,const char* fmt,...){va_list a;va_start(a,fmt);int n=vfprintf(f->f,fmt,a);va_end(a);return n<0?0:n;}
u64 FileLength(FileHandle* f){auto off=ftello(f->f);fseeko(f->f,0,SEEK_END);auto size=ftello(f->f);fseeko(f->f,off,SEEK_SET);return size<0?0:size;}
void Log(LogLevel l,const char* fmt,...){if(l<Warn)return;va_list a;va_start(a,fmt);__android_log_vprint(l==Error?ANDROID_LOG_ERROR:ANDROID_LOG_WARN,"KokiNds",fmt,a);va_end(a);}
Thread* Thread_Create(std::function<void()> f){return new Thread(std::move(f));}
void Thread_Wait(Thread* t){if(t&&t->t.joinable())t->t.join();}
void Thread_Free(Thread* t){Thread_Wait(t);delete t;}
Semaphore* Semaphore_Create(){return new Semaphore;}
void Semaphore_Free(Semaphore* s){delete s;}
void Semaphore_Reset(Semaphore* s){std::lock_guard<std::mutex> l(s->m);s->count=0;}
void Semaphore_Wait(Semaphore* s){std::unique_lock<std::mutex> l(s->m);s->cv.wait(l,[s]{return s->count>0;});--s->count;}
bool Semaphore_TryWait(Semaphore* s,int timeout){std::unique_lock<std::mutex> l(s->m);if(!s->cv.wait_for(l,std::chrono::milliseconds(timeout),[s]{return s->count>0;}))return false;--s->count;return true;}
void Semaphore_Post(Semaphore* s,int n){{std::lock_guard<std::mutex> l(s->m);s->count+=n;}s->cv.notify_all();}
Mutex* Mutex_Create(){return new Mutex;}
void Mutex_Free(Mutex* m){delete m;}
void Mutex_Lock(Mutex* m){m->m.lock();}
void Mutex_Unlock(Mutex* m){m->m.unlock();}
bool Mutex_TryLock(Mutex* m){return m->m.try_lock();}
void Sleep(u64 us){std::this_thread::sleep_for(std::chrono::microseconds(us));}
u64 GetUSCount(){return std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();}
u64 GetMSCount(){return GetUSCount()/1000;}
void WriteNDSSave(const u8*,u32,u32,u32,void*){}
void WriteGBASave(const u8*,u32,u32,u32,void*){}
void WriteFirmware(const Firmware&,u32,u32,void*){}
void WriteDateTime(int,int,int,int,int,int,void*){}
void MP_Begin(void*){} void MP_End(void*){}
int MP_SendPacket(u8*,int,u64,void*){return 0;} int MP_RecvPacket(u8*,u64*,void*){return 0;}
int MP_SendCmd(u8*,int,u64,void*){return 0;} int MP_SendReply(u8*,int,u64,u16,void*){return 0;} int MP_SendAck(u8*,int,u64,void*){return 0;}
int MP_RecvHostPacket(u8*,u64*,void*){return 0;} u16 MP_RecvReplies(u8*,u64,u16,void*){return 0;}
int Net_SendPacket(u8*,int,void*){return 0;} int Net_RecvPacket(u8*,void*){return 0;}
void Camera_Start(int,void*){} void Camera_Stop(int,void*){} void Camera_CaptureFrame(int,u32* f,int w,int h,bool,void*){memset(f,0,w*h*4);}
void Mic_Start(void*){} void Mic_Stop(void*){} int Mic_ReadInput(s16* data,int n,void*){memset(data,0,n*2);return n;}
AACDecoder* AAC_Init(){return nullptr;} void AAC_DeInit(AACDecoder*){} bool AAC_Configure(AACDecoder*,int,int){return false;} bool AAC_DecodeFrame(AACDecoder*,const void*,int,void*,int){return false;}
bool Addon_KeyDown(KeyType,void*){return false;} void Addon_RumbleStart(u32,void*){} void Addon_RumbleStop(void*){} float Addon_MotionQuery(MotionQueryType,void*){return 0;}
DynamicLibrary* DynamicLibrary_Load(const char* p){void* h=dlopen(p,RTLD_NOW|RTLD_LOCAL);return h?new DynamicLibrary{h}:nullptr;}
void DynamicLibrary_Unload(DynamicLibrary* p){if(p){dlclose(p->h);delete p;}}
void* DynamicLibrary_LoadFunction(DynamicLibrary* p,const char* f){return p?dlsym(p->h,f):nullptr;}
}
