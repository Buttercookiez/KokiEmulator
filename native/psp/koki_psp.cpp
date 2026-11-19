// SPDX-License-Identifier: GPL-2.0-or-later
#include <jni.h>
#include <android/log.h>
#include <android/native_window_jni.h>
#include <EGL/egl.h>
#include <GLES3/gl3.h>
#include <dlfcn.h>
#include <zlib.h>
#include <algorithm>
#include <cstdarg>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>
#include "include/libretro.h"

namespace {
constexpr size_t maximumState = 128 * 1024 * 1024;
struct Core;
Core* active = nullptr;
std::string string(JNIEnv* env, jstring value) {
    if (!value) throw std::runtime_error("A native PSP path is missing.");
    const char* bytes = env->GetStringUTFChars(value, nullptr);
    std::string result(bytes);
    env->ReleaseStringUTFChars(value, bytes);
    return result;
}
void fail(JNIEnv* env, const std::exception& error) {
    env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), error.what());
}
void logMessage(enum retro_log_level level, const char* format, ...) {
    if (level < RETRO_LOG_WARN) return;
    va_list args;
    va_start(args, format);
    __android_log_vprint(level >= RETRO_LOG_ERROR ? ANDROID_LOG_ERROR : ANDROID_LOG_WARN, "KokiPSP", format, args);
    va_end(args);
}
struct Core {
    void* library = nullptr;
    bool initialized = false, loaded = false, shutdown = false, smoothing = true;
    EGLDisplay display = EGL_NO_DISPLAY;
    EGLContext context = EGL_NO_CONTEXT;
    EGLConfig config{};
    EGLSurface fallback = EGL_NO_SURFACE, surface = EGL_NO_SURFACE;
    ANativeWindow* window = nullptr;
    EGLint windowVisual = 0;
    GLuint framebuffer = 0, texture = 0, depth = 0;
    retro_hw_render_callback hardware{};
    retro_system_av_info av{};
    std::string system, saves;
    std::unordered_map<std::string, std::string> options;
    std::vector<int16_t> pcm;
    int buttons = 0, stickX = 0, stickY = 0;
    bool needsPresent = true;
    unsigned width = 480, height = 272;
    decltype(&retro_init) initialize = nullptr;
    decltype(&retro_deinit) deinitialize = nullptr;
    decltype(&retro_load_game) load = nullptr;
    decltype(&retro_unload_game) unload = nullptr;
    decltype(&retro_run) run = nullptr;
    decltype(&retro_get_system_av_info) getAv = nullptr;
    decltype(&retro_serialize_size) stateSize = nullptr;
    decltype(&retro_serialize) serialize = nullptr;
    decltype(&retro_unserialize) unserialize = nullptr;
    template<typename T> T symbol(const char* name) {
        void* result = dlsym(library, name);
        if (!result) throw std::runtime_error(std::string("The PPSSPP engine is missing ") + name);
        return reinterpret_cast<T>(result);
    }
    void current() {
        EGLSurface target = surface != EGL_NO_SURFACE ? surface : fallback;
        if (eglGetCurrentContext() == context && eglGetCurrentSurface(EGL_DRAW) == target) return;
        if (!eglMakeCurrent(display, target, target, context)) throw std::runtime_error("Could not activate PSP graphics.");
    }
    void graphics() {
        display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
        if (display == EGL_NO_DISPLAY || !eglInitialize(display, nullptr, nullptr)) throw std::runtime_error("OpenGL ES is unavailable.");
        const EGLint attributes[] = { EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT, EGL_SURFACE_TYPE, EGL_WINDOW_BIT | EGL_PBUFFER_BIT,
            EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8, EGL_NONE };
        EGLint count = 0;
        if (!eglChooseConfig(display, attributes, &config, 1, &count) || !count) throw std::runtime_error("PSP requires OpenGL ES 3.");
        const EGLint contextAttributes[] = { EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE };
        context = eglCreateContext(display, config, EGL_NO_CONTEXT, contextAttributes);
        const EGLint pbuffer[] = { EGL_WIDTH, 480, EGL_HEIGHT, 272, EGL_NONE };
        fallback = eglCreatePbufferSurface(display, config, pbuffer);
        if (context == EGL_NO_CONTEXT || fallback == EGL_NO_SURFACE) throw std::runtime_error("Could not create PSP graphics.");
        current();
        glGenFramebuffers(1, &framebuffer);
        glGenTextures(1, &texture);
        glBindTexture(GL_TEXTURE_2D, texture);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, 480, 272, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
        glGenRenderbuffers(1, &depth);
        glBindRenderbuffer(GL_RENDERBUFFER, depth);
        glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH24_STENCIL8, 480, 272);
        glBindFramebuffer(GL_FRAMEBUFFER, framebuffer);
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, texture, 0);
        glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT, GL_RENDERBUFFER, depth);
        if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) throw std::runtime_error("Could not create the PSP screen.");
    }
    void updateWindowBuffers() {
        if (!window) return;
        // Android can scale the native PSP buffer during composition. Keep the
        // full-size destination when the player chooses nearest-neighbor scaling.
        const int bufferWidth = smoothing ? 480 : 0;
        const int bufferHeight = smoothing ? 272 : 0;
        if (ANativeWindow_setBuffersGeometry(window, bufferWidth, bufferHeight, windowVisual) != 0)
            ANativeWindow_setBuffersGeometry(window, 0, 0, windowVisual);
        needsPresent = true;
    }
    void setSmoothing(bool enabled) {
        if (smoothing == enabled) return;
        smoothing = enabled;
        updateWindowBuffers();
    }
    void setSurface(JNIEnv* env, jobject target) {
        if (display == EGL_NO_DISPLAY) return;
        eglMakeCurrent(display, fallback, fallback, context);
        if (surface != EGL_NO_SURFACE) { eglDestroySurface(display, surface); surface = EGL_NO_SURFACE; }
        if (window) { ANativeWindow_release(window); window = nullptr; }
        if (target) {
            window = ANativeWindow_fromSurface(env, target);
            if (!window) throw std::runtime_error("The PSP display surface is unavailable.");
            eglGetConfigAttrib(display, config, EGL_NATIVE_VISUAL_ID, &windowVisual);
            updateWindowBuffers();
            surface = eglCreateWindowSurface(display, config, window, nullptr);
            if (surface == EGL_NO_SURFACE) throw std::runtime_error("Could not attach the PSP display.");
        }
        current();
        eglSwapInterval(display, 0);
        needsPresent = true;
    }
    ~Core() {
        if (context != EGL_NO_CONTEXT) {
            eglMakeCurrent(display, fallback, fallback, context);
            if (loaded && hardware.context_destroy) hardware.context_destroy();
            if (loaded && unload) unload();
            if (initialized && deinitialize) deinitialize();
            glDeleteFramebuffers(1, &framebuffer);
            glDeleteTextures(1, &texture);
            glDeleteRenderbuffers(1, &depth);
        }
        if (surface != EGL_NO_SURFACE) eglDestroySurface(display, surface);
        if (window) ANativeWindow_release(window);
        if (display != EGL_NO_DISPLAY) {
            eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
            if (fallback != EGL_NO_SURFACE) eglDestroySurface(display, fallback);
            if (context != EGL_NO_CONTEXT) eglDestroyContext(display, context);
            eglTerminate(display);
        }
        if (library) dlclose(library);
        if (active == this) active = nullptr;
    }
};
uintptr_t framebuffer() { return active ? active->framebuffer : 0; }
retro_proc_address_t procedure(const char* name) { return reinterpret_cast<retro_proc_address_t>(eglGetProcAddress(name)); }
bool environment(unsigned command, void* data) {
    if (!active) return false;
    switch (command) {
        case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: *static_cast<const char**>(data) = active->system.c_str(); return true;
        case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *static_cast<const char**>(data) = active->saves.c_str(); return true;
        case RETRO_ENVIRONMENT_GET_CAN_DUPE: *static_cast<bool*>(data) = true; return true;
        case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS: return true;
        case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *static_cast<bool*>(data) = false; return true;
        case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *static_cast<unsigned*>(data) = 1; return true;
        case RETRO_ENVIRONMENT_GET_LANGUAGE: *static_cast<unsigned*>(data) = RETRO_LANGUAGE_ENGLISH; return true;
        case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: static_cast<retro_log_callback*>(data)->log = logMessage; return true;
        case RETRO_ENVIRONMENT_GET_PREFERRED_HW_RENDER: *static_cast<unsigned*>(data) = RETRO_HW_CONTEXT_OPENGLES3; return true;
        case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: return *static_cast<unsigned*>(data) == RETRO_PIXEL_FORMAT_XRGB8888;
        case RETRO_ENVIRONMENT_SHUTDOWN: active->shutdown = true; return true;
        case RETRO_ENVIRONMENT_SET_HW_RENDER: {
            auto* request = static_cast<retro_hw_render_callback*>(data);
            if (request->context_type != RETRO_HW_CONTEXT_OPENGLES3 && request->context_type != RETRO_HW_CONTEXT_OPENGLES_VERSION && request->context_type != RETRO_HW_CONTEXT_OPENGLES2) return false;
            request->get_current_framebuffer = framebuffer;
            request->get_proc_address = procedure;
            active->hardware = *request;
            return true;
        }
        case RETRO_ENVIRONMENT_GET_VARIABLE: {
            auto* variable = static_cast<retro_variable*>(data);
            auto found = active->options.find(variable->key);
            variable->value = found == active->options.end() ? nullptr : found->second.c_str();
            return variable->value != nullptr;
        }
        case RETRO_ENVIRONMENT_SET_CORE_OPTIONS:
        case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_INTL: {
            auto* definitions = command == RETRO_ENVIRONMENT_SET_CORE_OPTIONS ?
                static_cast<retro_core_option_definition*>(data) : static_cast<retro_core_options_intl*>(data)->us;
            for (auto* entry = definitions; entry && entry->key; ++entry) {
                const char* value = entry->default_value ? entry->default_value : entry->values[0].value;
                if (value && !active->options.count(entry->key)) active->options[entry->key] = value;
            }
            return true;
        }
        case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
        case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
        case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME:
        case RETRO_ENVIRONMENT_SET_SERIALIZATION_QUIRKS: return true;
        default: return false;
    }
}
void poll() {}
int16_t input(unsigned port, unsigned device, unsigned index, unsigned id) {
    if (!active || port) return 0;
    if (device == RETRO_DEVICE_JOYPAD) return id == RETRO_DEVICE_ID_JOYPAD_MASK ? active->buttons :
        id < 16 && (active->buttons & (1 << id)) ? 1 : 0;
    if (device == RETRO_DEVICE_ANALOG && index == RETRO_DEVICE_INDEX_ANALOG_LEFT) {
        if (id == RETRO_DEVICE_ID_ANALOG_X) return active->stickX;
        if (id == RETRO_DEVICE_ID_ANALOG_Y) return active->stickY;
    }
    return 0;
}
size_t audioBatch(const int16_t* data, size_t frames) {
    if (active && data && frames <= 16384 && active->pcm.size() + frames * 2 <= 65536)
        active->pcm.insert(active->pcm.end(), data, data + frames * 2);
    return frames;
}
void audioSample(int16_t left, int16_t right) { const int16_t pair[] = { left, right }; audioBatch(pair, 1); }
void video(const void* pixels, unsigned width, unsigned height, size_t pitch) {
    if (!active || !width || !height || width > 480 || height > 272) return;
    active->width = width; active->height = height;
    if (pixels) active->needsPresent = true;
    if (pixels && pixels != RETRO_HW_FRAME_BUFFER_VALID) {
        if (pitch < width * 4) return;
        std::vector<uint8_t> rgba(width * height * 4);
        const auto* source = static_cast<const uint8_t*>(pixels);
        for (unsigned y = 0; y < height; ++y) for (unsigned x = 0; x < width; ++x) {
            const auto* pixel = source + y * pitch + x * 4;
            auto* target = rgba.data() + ((height - y - 1) * width + x) * 4;
            target[0] = pixel[2]; target[1] = pixel[1]; target[2] = pixel[0]; target[3] = 255;
        }
        glBindTexture(GL_TEXTURE_2D, active->texture);
        glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, rgba.data());
    }
}
Core& core(jlong handle) {
    if (!active || reinterpret_cast<Core*>(handle) != active) throw std::runtime_error("Open a PSP game first.");
    return *active;
}
}
extern "C" JNIEXPORT jlong JNICALL Java_com_koki_psp_NativePspPlugin_nativeCreate(JNIEnv* env, jclass, jstring libs, jstring system, jstring saves, jstring rom) {
    try {
        if (active) throw std::runtime_error("Close the current PSP game first.");
        auto instance = std::make_unique<Core>();
        active = instance.get();
        instance->system = string(env, system); instance->saves = string(env, saves);
        // The frontend clocks retro_run at the PSP refresh rate. End each run
        // at a vblank even when the game has no new picture to present.
        instance->options = { {"ppsspp_backend", "opengl"}, {"ppsspp_software_rendering", "disabled"},
            {"ppsspp_cpu_core", "JIT"}, {"ppsspp_internal_resolution", "480x272"}, {"ppsspp_cropto16x9", "disabled"},
            {"ppsspp_enable_wlan", "disabled"}, {"ppsspp_frame_duplication", "enabled"} };
        instance->library = dlopen((string(env, libs) + "/libppsspp_libretro.so").c_str(), RTLD_NOW | RTLD_LOCAL);
        if (!instance->library) throw std::runtime_error(std::string("Could not load PPSSPP: ") + dlerror());
        instance->graphics();
        instance->symbol<decltype(&retro_set_environment)>("retro_set_environment")(environment);
        instance->symbol<decltype(&retro_set_video_refresh)>("retro_set_video_refresh")(video);
        instance->symbol<decltype(&retro_set_audio_sample)>("retro_set_audio_sample")(audioSample);
        instance->symbol<decltype(&retro_set_audio_sample_batch)>("retro_set_audio_sample_batch")(audioBatch);
        instance->symbol<decltype(&retro_set_input_poll)>("retro_set_input_poll")(poll);
        instance->symbol<decltype(&retro_set_input_state)>("retro_set_input_state")(input);
        instance->initialize = instance->symbol<decltype(&retro_init)>("retro_init");
        instance->deinitialize = instance->symbol<decltype(&retro_deinit)>("retro_deinit");
        instance->load = instance->symbol<decltype(&retro_load_game)>("retro_load_game");
        instance->unload = instance->symbol<decltype(&retro_unload_game)>("retro_unload_game");
        instance->run = instance->symbol<decltype(&retro_run)>("retro_run");
        instance->getAv = instance->symbol<decltype(&retro_get_system_av_info)>("retro_get_system_av_info");
        instance->stateSize = instance->symbol<decltype(&retro_serialize_size)>("retro_serialize_size");
        instance->serialize = instance->symbol<decltype(&retro_serialize)>("retro_serialize");
        instance->unserialize = instance->symbol<decltype(&retro_unserialize)>("retro_unserialize");
        instance->initialize(); instance->initialized = true;
        const std::string file = string(env, rom);
        retro_game_info game{ file.c_str(), nullptr, 0, nullptr };
        if (!instance->load(&game)) throw std::runtime_error("PPSSPP could not open this PSP game.");
        instance->loaded = true;
        if (instance->hardware.context_reset) instance->hardware.context_reset();
        instance->getAv(&instance->av);
        return reinterpret_cast<jlong>(instance.release());
    } catch (const std::exception& error) { fail(env, error); return 0; }
}
extern "C" JNIEXPORT void JNICALL Java_com_koki_psp_NativePspPlugin_nativeDestroy(JNIEnv* env, jclass, jlong handle) {
    try { delete &core(handle); } catch (const std::exception& error) { fail(env, error); }
}
extern "C" JNIEXPORT void JNICALL Java_com_koki_psp_NativePspPlugin_nativeSurface(JNIEnv* env, jclass, jlong handle, jobject surface) {
    try { core(handle).setSurface(env, surface); } catch (const std::exception& error) { fail(env, error); }
}
extern "C" JNIEXPORT jint JNICALL Java_com_koki_psp_NativePspPlugin_nativeRate(JNIEnv* env, jclass, jlong handle) {
    try { return static_cast<jint>(core(handle).av.timing.sample_rate); } catch (const std::exception& error) { fail(env, error); return 44100; }
}
extern "C" JNIEXPORT jdouble JNICALL Java_com_koki_psp_NativePspPlugin_nativeFrame(JNIEnv* env, jclass, jlong handle, jint buttons, jint x, jint y) {
    try {
        auto& player = core(handle);
        player.current(); player.buttons = buttons; player.stickX = x; player.stickY = y; player.pcm.clear();
        glBindFramebuffer(GL_FRAMEBUFFER, player.framebuffer);
        glViewport(0, 0, 480, 272);
        player.run();
        if (player.shutdown) throw std::runtime_error("The PSP engine stopped.");
        if (player.surface != EGL_NO_SURFACE && player.needsPresent) {
            EGLint width, height;
            eglQuerySurface(player.display, player.surface, EGL_WIDTH, &width);
            eglQuerySurface(player.display, player.surface, EGL_HEIGHT, &height);
            glBindFramebuffer(GL_READ_FRAMEBUFFER, player.framebuffer);
            glBindFramebuffer(GL_DRAW_FRAMEBUFFER, 0);
            glDisable(GL_SCISSOR_TEST);
            glBlitFramebuffer(0, 0, player.width, player.height, 0, 0, width, height, GL_COLOR_BUFFER_BIT, player.smoothing ? GL_LINEAR : GL_NEAREST);
            eglSwapBuffers(player.display, player.surface);
            player.needsPresent = false;
        }
        return player.av.timing.fps > 0 ? player.av.timing.fps : 60.0;
    } catch (const std::exception& error) { fail(env, error); return 60.0; }
}
extern "C" JNIEXPORT jint JNICALL Java_com_koki_psp_NativePspPlugin_nativeAudio(JNIEnv* env, jclass, jlong handle, jshortArray target) {
    try {
        auto& player = core(handle);
        const size_t size = std::min(player.pcm.size(), static_cast<size_t>(env->GetArrayLength(target)));
        env->SetShortArrayRegion(target, 0, size, player.pcm.data());
        return static_cast<jint>(size);
    } catch (const std::exception& error) { fail(env, error); return 0; }
}
extern "C" JNIEXPORT void JNICALL Java_com_koki_psp_NativePspPlugin_nativeState(JNIEnv* env, jclass, jlong handle, jstring file, jboolean saving) {
    try {
        auto& player = core(handle); player.current();
        const std::string path = string(env, file);
        if (saving) {
            const size_t size = player.stateSize();
            if (!size || size > maximumState) throw std::runtime_error("The game is still loading. Try saving again shortly.");
            std::vector<uint8_t> bytes(size);
            if (!player.serialize(bytes.data(), size)) throw std::runtime_error("PPSSPP could not create this checkpoint.");
            gzFile archive = gzopen(path.c_str(), "wb1");
            if (!archive) throw std::runtime_error("Could not write the checkpoint.");
            const int written = gzwrite(archive, bytes.data(), static_cast<unsigned>(size));
            const int result = gzclose(archive);
            if (written != static_cast<int>(size) || result != Z_OK) throw std::runtime_error("The checkpoint could not be saved completely.");
        } else {
            gzFile archive = gzopen(path.c_str(), "rb");
            if (!archive) throw std::runtime_error("This checkpoint is missing.");
            std::vector<uint8_t> bytes;
            uint8_t chunk[65536];
            int count;
            while ((count = gzread(archive, chunk, sizeof(chunk))) > 0 && bytes.size() + count <= maximumState) bytes.insert(bytes.end(), chunk, chunk + count);
            const int result = gzclose(archive);
            if (count || result != Z_OK || bytes.empty()) throw std::runtime_error("This checkpoint is incomplete or too large.");
            if (!player.unserialize(bytes.data(), bytes.size())) throw std::runtime_error("This checkpoint is incompatible with this PSP engine.");
        }
    } catch (const std::exception& error) { fail(env, error); }
}

extern "C" JNIEXPORT void JNICALL Java_com_koki_psp_NativePspPlugin_nativeSmoothing(JNIEnv* env, jclass, jlong handle, jboolean enabled) {
    try { core(handle).setSmoothing(enabled); } catch (const std::exception& error) { fail(env, error); }
}
