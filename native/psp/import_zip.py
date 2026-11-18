"""Stream selected PSP game files from a ZIP into a new, private directory."""
import json
from pathlib import Path
import re
import shutil
import stat
import sys
from zipfile import BadZipFile, ZipFile

DISC_EXTENSIONS = {'.iso', '.cso', '.chd'}
HOMEBREW_EXTENSIONS = {'.pbp', '.elf', '.prx'}
INVALID = re.compile(r'[<>:"|?*\x00-\x1f]')
RESERVED = re.compile(r'^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])$', re.I)
MAX_ENTRIES = 20000


def member_path(name):
    parts = name.replace('\\', '/').removesuffix('/').split('/')
    if any(not part or part in ('.', '..') or part.endswith(('.', ' '))
           or INVALID.search(part) or RESERVED.fullmatch(part.split('.')[0].rstrip())
           for part in parts):
        raise ValueError('The ZIP contains an unsafe file path.')
    return tuple(parts)


def extract(archive_file, destination):
    with ZipFile(archive_file) as archive:
        if len(archive.infolist()) > MAX_ENTRIES:
            raise ValueError('This ZIP contains too many files. Import one PSP game at a time.')
        files = {}
        for item in archive.infolist():
            parts = member_path(item.orig_filename)
            if stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError('The ZIP contains a symbolic link.')
            if item.is_dir() or parts[0] == '__MACOSX' or parts[-1].startswith('._'):
                continue
            key = tuple(part.casefold() for part in parts)
            if key in files:
                raise ValueError('The ZIP has multiple files with the same Windows path.')
            files[key] = (parts, item)
        for key in files:
            if any(key[:count] in files for count in range(1, len(key))):
                raise ValueError('The ZIP uses a file as a folder.')

        game_keys = []
        homebrew_folders = set()
        for key, (_, item) in files.items():
            extension = Path(key[-1]).suffix
            if not item.file_size or extension not in DISC_EXTENSIONS | HOMEBREW_EXTENSIONS:
                continue
            if extension in HOMEBREW_EXTENSIONS:
                folder = key[:-1]
                eboot = files.get(folder + ('eboot.pbp',))
                if eboot and eboot[1].file_size and key[-1] != 'eboot.pbp':
                    continue
                homebrew_folders.add(folder)
            game_keys.append(key)
        if not game_keys:
            raise ValueError('No PSP game found in this ZIP. It should contain an ISO, CSO, CHD, PBP, ELF, or PRX file.')

        selected = set(game_keys)
        if homebrew_folders:
            for key in files:
                if any(key[:count] in homebrew_folders for count in range(len(key))):
                    selected.add(key)
        if any(files[key][1].flag_bits & 1 for key in selected):
            raise ValueError('This ZIP is password-protected. Extract it with its password first.')
        required = sum(files[key][1].file_size for key in selected)
        if required > shutil.disk_usage(destination).free:
            raise ValueError('There is not enough free disk space to extract this ZIP.')

        content = destination / 'content'
        for key in sorted(selected):
            parts, item = files[key]
            target = content.joinpath(*parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(item) as source, target.open('xb') as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)
        games = ['/'.join(files[key][0]) for key in game_keys]
        (destination / 'games.json').write_text(json.dumps(games), encoding='utf-8')


if __name__ == '__main__':
    try:
        extract(Path(sys.argv[1]), Path(sys.argv[2]))
    except BadZipFile:
        sys.exit('This ZIP is damaged or incomplete.')
    except (OSError, RuntimeError, ValueError, NotImplementedError) as error:
        sys.exit(str(error))
