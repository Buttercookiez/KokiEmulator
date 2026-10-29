import ndsManifest from '../engines/nds-manifest.json';
export const NDS_ENGINE_ID = ndsManifest.engineId;
export const IS_NDS = import.meta.env.MODE === 'nds';
export const SYSTEM = IS_NDS ? 'NDS' : 'GBA';
export const ROM_EXTENSION = IS_NDS ? 'nds' : 'gba';
export const ROM_ACCEPT = IS_NDS ? '.nds,.srl,.zip,application/octet-stream' : '.gba,.bin,.zip';
export const ROM_PATTERN = IS_NDS ? /\.(nds|srl)$/i : /\.(gba|bin)$/i;
export const IMPORT_PATTERN = IS_NDS ? /\.(nds|srl|zip)$/i : /\.(gba|bin|zip)$/i;
export const MAX_STATE_SIZE = (IS_NDS ? 64 : 2) * 1024 * 1024;

export const NATIVE_NDS_ENGINE_ID = 'melonds-431ab4b-android-v1';
