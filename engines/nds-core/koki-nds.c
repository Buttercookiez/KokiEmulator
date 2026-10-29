/* SPDX-License-Identifier: MIT
 * Koki DS WebAssembly bridge. Copyright (c) 2026 Koki contributors.
 * Upstream core and BIOS replacement notices are bundled separately.
 */
#include <emscripten/emscripten.h>
#include <math.h>
#include <time.h>
#include <limits.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "shared.h"
#include "sb_types.h"
#include "arm7.h"
#include "nds.h"
#define API EMSCRIPTEN_KEEPALIVE
#define CORE_ID 0xf4d3238bu
#define PIXELS (256 * 384 * 4)
typedef struct { sb_emu_state_t emu; nds_t ds; nds_scratch_t scratch; uint8_t rgba[PIXELS]; uint8_t *state; uint32_t state_length,rom_hash; bool loaded; char error[160]; } Koki;
typedef struct { char magic[8]; uint32_t core,rom,ds_size,scratch_size,checksum,total; } StateHeader;
bool se_load_bios_file(const char* name,const char* path,const char* file,uint8_t* data,size_t size){return false;}
static uint32_t hash_bytes(const uint8_t* p,size_t n){uint32_t h=2166136261u;for(size_t i=0;i<n;i++)h=(h^p[i])*16777619u;return h;}
static int fail(Koki* k,const char* text){if(k)snprintf(k->error,sizeof(k->error),"%s",text);return 0;}
static void clear_logs(nds_scratch_t* s){s->gx_log=s->io9_log=s->io7_log=s->gc_log=s->dma_log=s->vert_log=s->arm9_log=s->arm7_log=NULL;}
static void picture(Koki* k){for(size_t i=0;i<PIXELS;i+=4){memcpy(k->rgba+i,k->scratch.framebuffer_full+i,3);k->rgba[i+3]=255;}}
API Koki* koki_create(int rate){return rate==48000?calloc(1,sizeof(Koki)):NULL;}
API void koki_destroy(Koki* k){if(!k)return;free(k->emu.rom_data);free(k->state);free(k);}
API const char* koki_last_error(Koki* k){return k?k->error:"Could not allocate DS engine";}
API int koki_load_rom(Koki* k,const uint8_t* rom,uint32_t length,const uint8_t* save,uint32_t save_length,const char* name){
 if(!k||!rom||length<1024||length>512u*1024*1024)return fail(k,"Invalid DS ROM size");
 uint8_t* copy=malloc(length);if(!copy)return fail(k,"Not enough memory for this DS game");memcpy(copy,rom,length);
 uint8_t* save_copy=NULL;if(save&&save_length){if(save_length>sizeof(k->scratch.save_data)){free(copy);return fail(k,"Unsupported DS save size");}save_copy=malloc(save_length);if(!save_copy){free(copy);return fail(k,"Not enough memory for the game save");}memcpy(save_copy,save,save_length);}
 free(k->emu.rom_data);memset(&k->emu,0,sizeof(k->emu));memset(&k->scratch,0,sizeof(k->scratch));k->loaded=false;k->emu.rom_data=copy;k->emu.rom_size=length;k->emu.system=SYSTEM_NDS;k->emu.rom_loaded=true;k->emu.render_frame=true;k->emu.run_mode=SB_MODE_RUN;k->emu.master_volume=1;strcpy(k->emu.rom_path,"game.nds");
 memset(k->scratch.save_data,255,sizeof(k->scratch.save_data));nds_ptrs_init(&k->ds,&k->scratch,copy,length);
 if(!nds_load_rom(&k->emu,&k->ds,&k->scratch)){free(save_copy);return fail(k,"The DS core could not start this game");}
 if(nds_get_save_size(&k->ds)>sizeof(k->scratch.save_data)){free(save_copy);return fail(k,"This preview does not support DS saves larger than 8 MB");}
 uint32_t expected_save=nds_get_save_size(&k->ds);
 if(save_copy&&save_length!=expected_save){free(save_copy);return fail(k,"The existing save size does not match this game in the replacement engine. Your original save is preserved.");}
 memset(k->scratch.save_data,255,sizeof(k->scratch.save_data));
 if(save_copy){memcpy(k->scratch.save_data,save_copy,save_length);free(save_copy);}
 clear_logs(&k->scratch);nds_ptrs_init(&k->ds,&k->scratch,copy,length);k->rom_hash=hash_bytes(copy,length);k->loaded=true;k->error[0]=0;picture(k);return 1;
}
API int koki_run_frame(Koki* k){if(!k||!k->loaded)return 0;nds_tick(&k->emu,&k->ds,&k->scratch);k->emu.prev_frame_joy=k->emu.joy;picture(k);return 1;}
API uint8_t* koki_get_framebuffer_ptr(Koki* k){return k?k->rgba:NULL;}
API void koki_set_key_mask(Koki* k,unsigned mask){if(!k)return;const int keys[12]={SE_KEY_A,SE_KEY_B,SE_KEY_SELECT,SE_KEY_START,SE_KEY_RIGHT,SE_KEY_LEFT,SE_KEY_UP,SE_KEY_DOWN,SE_KEY_R,SE_KEY_L,SE_KEY_X,SE_KEY_Y};for(int i=0;i<12;i++)k->emu.joy.inputs[keys[i]]=(mask&(1u<<i))?0:1;}
API void koki_set_touch(Koki* k,int x,int y,int down){if(!k)return;k->emu.joy.inputs[SE_KEY_PEN_DOWN]=!!down;k->emu.joy.touch_pos[0]=fminf(255,fmaxf(0,x))/256.0f;k->emu.joy.touch_pos[1]=fminf(191,fmaxf(0,y))/192.0f;}
API int koki_pull_audio(Koki* k,int16_t* output,uint32_t max_frames){if(!k||!k->loaded||!output)return 0;sb_ring_buffer_t* b=&k->emu.audio_ring_buff;uint32_t n=sb_ring_buffer_size(b)/2;if(n>max_frames)n=max_frames;for(uint32_t i=0;i<n*2;i++)output[i]=b->data[(b->read_ptr+i)%SB_AUDIO_RING_BUFFER_SIZE];b->read_ptr+=n*2;return n;}
API uint8_t* koki_get_nds_save_ptr(Koki* k){return k&&k->loaded?k->scratch.save_data:NULL;}
API uint32_t koki_get_nds_save_length(Koki* k){return k&&k->loaded?nds_get_save_size(&k->ds):0;}
API int koki_reset(Koki* k){if(!k||!k->loaded)return 0;return koki_load_rom(k,k->emu.rom_data,k->emu.rom_size,k->scratch.save_data,nds_get_save_size(&k->ds),"game.nds");}
API int koki_save_state(Koki* k){
 if(!k||!k->loaded)return 0;uint32_t n=sizeof(StateHeader)+sizeof(nds_t)+sizeof(nds_scratch_t);if(!k->state){k->state=malloc(n);if(!k->state)return fail(k,"Not enough memory for a checkpoint");}k->state_length=n;
 StateHeader h={{'K','O','K','I','N','D','S','1'},CORE_ID,k->rom_hash,sizeof(nds_t),sizeof(nds_scratch_t),0,n};uint8_t* p=k->state+sizeof(h);memcpy(p,&k->ds,sizeof(nds_t));memcpy(p+sizeof(nds_t),&k->scratch,sizeof(nds_scratch_t));h.checksum=hash_bytes(p,n-sizeof(h));memcpy(k->state,&h,sizeof(h));return 1;
}
API uint8_t* koki_get_state_ptr(Koki* k){return k?k->state:NULL;}
API uint32_t koki_get_state_length(Koki* k){return k?k->state_length:0;}
API int koki_load_state(Koki* k,const uint8_t* data,uint32_t n){
 if(!k||!k->loaded||!data||n<sizeof(StateHeader))return fail(k,"Invalid DS checkpoint");StateHeader h;memcpy(&h,data,sizeof(h));
 if(memcmp(h.magic,"KOKINDS1",8)||h.core!=CORE_ID)return fail(k,"This checkpoint belongs to a different DS engine; use an in-game save instead");
 if(h.rom!=k->rom_hash||h.ds_size!=sizeof(nds_t)||h.scratch_size!=sizeof(nds_scratch_t)||h.total!=n||n!=sizeof(h)+sizeof(nds_t)+sizeof(nds_scratch_t))return fail(k,"This checkpoint is not compatible with this game and engine");
 const uint8_t* p=data+sizeof(h);if(hash_bytes(p,n-sizeof(h))!=h.checksum)return fail(k,"The DS checkpoint is damaged");
 memcpy(&k->ds,p,sizeof(nds_t));memcpy(&k->scratch,p+sizeof(nds_t),sizeof(nds_scratch_t));clear_logs(&k->scratch);nds_ptrs_init(&k->ds,&k->scratch,k->emu.rom_data,k->emu.rom_size);k->ds.arm7.print_instructions=k->ds.arm9.print_instructions=false;k->emu.audio_ring_buff.read_ptr=k->emu.audio_ring_buff.write_ptr=0;picture(k);return 1;
}
