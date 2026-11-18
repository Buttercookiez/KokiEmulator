"""Windows PPSSPP libretro host. Binary commands and frames travel over stdio."""
import ctypes as c
import gzip
import os
from pathlib import Path
import struct
import sys

Environment = c.CFUNCTYPE(c.c_bool, c.c_uint, c.c_void_p)
Video = c.CFUNCTYPE(None, c.c_void_p, c.c_uint, c.c_uint, c.c_size_t)
Audio = c.CFUNCTYPE(None, c.c_int16, c.c_int16)
AudioBatch = c.CFUNCTYPE(c.c_size_t, c.c_void_p, c.c_size_t)
InputPoll = c.CFUNCTYPE(None)
InputState = c.CFUNCTYPE(c.c_int16, c.c_uint, c.c_uint, c.c_uint, c.c_uint)

# Environment command numbers and the frame format are from the public libretro ABI.
GET_CAN_DUPE, SHUTDOWN, GET_SYSTEM_DIRECTORY, SET_PIXEL_FORMAT = 3, 7, 9, 10
GET_VARIABLE, GET_VARIABLE_UPDATE, GET_SAVE_DIRECTORY, GET_INPUT_BITMASKS = 15, 17, 31, 51
XRGB8888, DEVICE_JOYPAD, DEVICE_ANALOG, JOYPAD_MASK = 1, 1, 5, 256
MAX_STATE_BYTES = 128 * 1024 * 1024


class GameInfo(c.Structure):
    _fields_ = [('path', c.c_char_p), ('data', c.c_void_p), ('size', c.c_size_t), ('meta', c.c_char_p)]


class Variable(c.Structure):
    _fields_ = [('key', c.c_char_p), ('value', c.c_char_p)]


class Geometry(c.Structure):
    _fields_ = [('width', c.c_uint), ('height', c.c_uint), ('max_width', c.c_uint),
                ('max_height', c.c_uint), ('aspect_ratio', c.c_float)]


class Timing(c.Structure):
    _fields_ = [('fps', c.c_double), ('sample_rate', c.c_double)]


class AvInfo(c.Structure):
    _fields_ = [('geometry', Geometry), ('timing', Timing)]


def main():
    core_path, system_path, save_path, game_path, checkpoint_path = map(Path, sys.argv[1:])
    # Keep core logging off the framed protocol stream.
    output = os.fdopen(os.dup(sys.stdout.fileno()), 'wb')
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    source = sys.stdin.buffer
    save_path.mkdir(parents=True, exist_ok=True)
    directories = {GET_SYSTEM_DIRECTORY: str(system_path).encode(), GET_SAVE_DIRECTORY: str(save_path).encode()}
    variables = {
        b'ppsspp_rendering_mode': b'none',
        b'ppsspp_software_rendering': b'enabled',
        b'ppsspp_cpu_core': b'JIT',
        b'ppsspp_internal_resolution': b'480x272',
        b'ppsspp_cropto16x9': b'disabled',
    }
    frame = None
    audio = bytearray()
    buttons = stick_x = stick_y = 0
    stopped = False

    @Environment
    def environment(command, pointer):
        nonlocal stopped
        command &= 0xffff
        if command == SHUTDOWN:
            stopped = True
            return True
        if command in directories:
            c.cast(pointer, c.POINTER(c.c_char_p))[0] = directories[command]
            return True
        if command == GET_VARIABLE:
            variable = Variable.from_address(pointer)
            variable.value = variables.get(variable.key)
            return variable.value is not None
        if command == SET_PIXEL_FORMAT:
            return c.cast(pointer, c.POINTER(c.c_uint))[0] == XRGB8888
        if command in (GET_CAN_DUPE, GET_VARIABLE_UPDATE, GET_INPUT_BITMASKS):
            if pointer:
                c.cast(pointer, c.POINTER(c.c_bool))[0] = command != GET_VARIABLE_UPDATE
            return True
        return False

    @Video
    def video(pointer, width, height, pitch):
        nonlocal frame
        if pointer and pointer != c.c_void_p(-1).value and 0 < width <= 480 and 0 < height <= 272:
            if width * 4 <= pitch <= 4096:
                frame = (width, height, pitch, c.string_at(pointer, pitch * height))

    @Audio
    def audio_sample(left, right):
        audio.extend(struct.pack('<hh', left, right))

    @AudioBatch
    def audio_batch(pointer, count):
        if pointer and count <= 8192:
            audio.extend(c.string_at(pointer, count * 4))
        return count

    @InputPoll
    def poll():
        pass

    @InputState
    def input_state(port, device, index, control):
        if port != 0:
            return 0
        if device == DEVICE_JOYPAD:
            return buttons if control == JOYPAD_MASK else int(control < 16 and bool(buttons & (1 << control)))
        if device == DEVICE_ANALOG and index == 0:
            return stick_x if control == 0 else stick_y
        return 0

    core = c.CDLL(str(core_path))
    for name, callback in [('environment', environment), ('video_refresh', video),
                           ('audio_sample', audio_sample), ('audio_sample_batch', audio_batch),
                           ('input_poll', poll), ('input_state', input_state)]:
        setter = getattr(core, 'retro_set_' + name)
        setter.argtypes = [type(callback)]
        setter.restype = None
        setter(callback)
    core.retro_api_version.restype = c.c_uint
    if core.retro_api_version() != 1:
        raise RuntimeError('Unsupported libretro API version')
    core.retro_load_game.argtypes = [c.POINTER(GameInfo)]
    core.retro_load_game.restype = c.c_bool
    core.retro_get_system_av_info.argtypes = [c.POINTER(AvInfo)]
    core.retro_serialize_size.restype = c.c_size_t
    for name in ('retro_serialize', 'retro_unserialize'):
        function = getattr(core, name)
        function.argtypes = [c.c_void_p, c.c_size_t]
        function.restype = c.c_bool

    def reply(kind, body=b''):
        output.write(struct.pack('<BI', kind, len(body)))
        output.write(body)
        output.flush()

    def checkpoint(command):
        if command == b'S':
            size = core.retro_serialize_size()
            if not 0 < size <= MAX_STATE_BYTES:
                raise ValueError('This game is still loading or does not support checkpoints.')
            state = c.create_string_buffer(size)
            if not core.retro_serialize(state, size):
                raise ValueError('PPSSPP could not create a checkpoint.')
            checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
            temporary = checkpoint_path.with_suffix('.tmp')
            try:
                with gzip.open(temporary, 'wb', compresslevel=1) as archive:
                    archive.write(memoryview(state))
                os.replace(temporary, checkpoint_path)
            finally:
                temporary.unlink(missing_ok=True)
        else:
            if not checkpoint_path.is_file():
                raise ValueError('This game has no checkpoint yet.')
            if not 0 < checkpoint_path.stat().st_size <= MAX_STATE_BYTES:
                raise ValueError('The checkpoint has an invalid size.')
            with gzip.open(checkpoint_path, 'rb') as archive:
                state = archive.read(MAX_STATE_BYTES + 1)
            if not 0 < len(state) <= MAX_STATE_BYTES:
                raise ValueError('The checkpoint has an invalid size.')
            if not core.retro_unserialize(state, len(state)):
                raise ValueError('PPSSPP could not restore this checkpoint.')

    core.retro_init()
    loaded = False
    game = GameInfo(str(game_path).encode())
    try:
        loaded = core.retro_load_game(c.byref(game))
        if not loaded:
            raise RuntimeError('PPSSPP could not open this PSP file.')
        av = AvInfo()
        core.retro_get_system_av_info(c.byref(av))
        reply(1, struct.pack('<dd', av.timing.fps, av.timing.sample_rate))
        while command := source.read(1):
            if command == b'Q':
                break
            if command == b'F':
                controls = source.read(6)
                if len(controls) != 6:
                    break
                buttons, stick_x, stick_y = struct.unpack('<Hhh', controls)
                frame = None
                audio.clear()
                core.retro_run()
                if stopped:
                    raise RuntimeError('PPSSPP stopped while opening this PSP file.')
                width, height, pitch, pixels = frame or (0, 0, 0, b'')
                reply(2, struct.pack('<4I', width, height, pitch, len(pixels)) + pixels + audio)
            elif command in (b'S', b'L'):
                try:
                    checkpoint(command)
                    reply(3)
                except (ValueError, OSError) as error:
                    reply(4, str(error).encode())
            else:
                raise RuntimeError('Unknown player command.')
    finally:
        if loaded:
            core.retro_unload_game()
        core.retro_deinit()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
