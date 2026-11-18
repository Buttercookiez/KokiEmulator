const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const extractZip = promisify(execFile);

const extensions = ['iso', 'cso', 'chd', 'pbp', 'elf', 'prx'];
const indexName = 'psp-library.json';
const packetLimit = 2 * 1024 * 1024;
const sameFile = (first, second) => first.toLowerCase() === second.toLowerCase();

function openCore(python, host, args) {
  const child = spawn(python, ['-X', 'utf8', host, ...args], {
    cwd: path.dirname(args[0]), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  let pending;
  let buffer = Buffer.alloc(0);
  let failure;
  let diagnostics = '';
  let closing = false;
  const exited = new Promise(resolve => child.once('close', resolve));

  function fail(error) {
    failure ??= error;
    if (!pending) return;
    const request = pending;
    pending = null;
    clearTimeout(request.timer);
    request.reject(failure);
  }

  child.stderr.setEncoding('utf8').on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-2500); });
  child.once('error', fail);
  child.stdin.on('error', fail);
  child.once('close', code => {
    const message = diagnostics.trim().split('\n').at(-1) || 'PPSSPP exited (code ' + code + ').';
    fail(new Error(closing ? 'The PSP player was closed.' : message));
  });
  child.stdout.on('data', chunk => {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    if (buffer.length < 5) return;
    const size = buffer.readUInt32LE(1);
    if (size > packetLimit || buffer.length > size + 5 || !pending) {
      fail(new Error('PPSSPP sent an invalid response.'));
      child.kill();
      return;
    }
    if (buffer.length < size + 5) return;
    const request = pending;
    pending = null;
    clearTimeout(request.timer);
    const kind = buffer[0];
    const payload = buffer.subarray(5);
    buffer = Buffer.alloc(0);
    if (kind === 4) request.reject(new Error(payload.toString('utf8')));
    else if (kind !== request.kind) request.reject(new Error('Unexpected PPSSPP response.'));
    else request.resolve(payload);
  });

  function request(kind, command) {
    if (failure || closing) return Promise.reject(failure || new Error('The PSP player is closing.'));
    if (pending) return Promise.reject(new Error('The PSP player is busy.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { fail(new Error('PPSSPP stopped responding.')); child.kill(); }, 30000);
      pending = { kind, resolve, reject, timer };
      if (command) child.stdin.write(command);
    });
  }

  return {
    request,
    async close() {
      if (closing) return exited;
      closing = true;
      child.stdin.end('Q');
      const timeout = setTimeout(() => child.kill(), 4000);
      try { await exited; } finally { clearTimeout(timeout); }
    },
  };
}

function registerPsp({ app, ipcMain, authorize, windowFor, dialog, storage, shell }) {
  const runtime = !app.isPackaged && process.env.KOKI_PSP_RUNTIME
    ? path.resolve(process.env.KOKI_PSP_RUNTIME)
    : path.join(process.resourcesPath, 'psp-runtime');
  const corePath = path.join(runtime, 'core', 'ppsspp_libretro.dll');
  const systemPath = path.join(runtime, 'system');
  const python = path.join(runtime, 'python', 'python.exe');
  const host = app.isPackaged ? path.join(process.resourcesPath, 'psp-host.py') :
    path.join(app.getAppPath(), 'native', 'psp', 'host.py');
  const importer = app.isPackaged ? path.join(process.resourcesPath, 'psp-import-zip.py') :
    path.join(app.getAppPath(), 'native', 'psp', 'import_zip.py');
  const zipImports = path.join(app.getPath('userData'), 'zip-imports');
  const saves = path.join(app.getPath('userData'), 'memory-stick');
  let player;
  let currentGame;
  const checkpoints = path.join(app.getPath('userData'), 'checkpoints');
  const screenshots = path.join(app.getPath('userData'), 'screenshots');
  let operation = Promise.resolve();

  const read = async () => {
    const bytes = await storage.read(indexName);
    return bytes ? JSON.parse(Buffer.from(bytes).toString('utf8')) : [];
  };
  const write = games => storage.write(indexName, Buffer.from(JSON.stringify(games)));
  const serialize = work => {
    const result = operation.then(work);
    operation = result.catch(() => {});
    return result;
  };
  const handle = (name, callback) => ipcMain.handle('koki:psp:' + name, (event, ...args) => {
    authorize(event);
    return callback(...args);
  });

  async function addGame(games, file, archive = undefined) {
    if (games.some(game => sameFile(game.file, file))) return;
    const info = await fs.stat(file);
    if (!info.isFile() || !info.size) return;
    const base = path.basename(file, path.extname(file));
    const folder = path.basename(path.dirname(file));
    const title = base.toLowerCase() === 'eboot' ?
      (archive && folder === 'content' ? archive.title : folder) : base;
    games.push({ id: randomUUID(), file, title, bytes: info.size, favorite: false,
      ...(archive && { archiveFolder: archive.folder, archiveKey: archive.key }) });
  }

  function archiveDirectory(folder) {
    if (!/^archive-[a-z0-9]{6}$/i.test(folder)) throw new Error('Invalid extracted ZIP directory.');
    return path.join(zipImports, folder);
  }

  function discardArchive(folder) {
    return fs.rm(archiveDirectory(folder), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }

  async function addZip(games, file, created) {
    const info = await fs.stat(file);
    const key = createHash('sha256').update(JSON.stringify([file.toLowerCase(), info.size, info.mtimeMs])).digest('hex');
    let folder = games.find(game => game.archiveKey === key)?.archiveFolder;
    if (!folder) {
      await fs.mkdir(zipImports, { recursive: true });
      const directory = await fs.mkdtemp(path.join(zipImports, 'archive-'));
      folder = path.basename(directory);
      created.push(folder);
      try {
        await extractZip(python, ['-X', 'utf8', importer, file, directory], { windowsHide: true });
      } catch (error) {
        throw new Error(error.stderr?.trim() || 'Koki could not open this ZIP.');
      }
    }
    const directory = archiveDirectory(folder);
    const content = path.join(directory, 'content');
    const members = JSON.parse(await fs.readFile(path.join(directory, 'games.json'), 'utf8'));
    const imported = [];
    for (const member of members) {
      const filePath = path.resolve(content, member);
      if (!filePath.toLowerCase().startsWith((content + path.sep).toLowerCase())) {
        throw new Error('The extracted ZIP has an invalid game path.');
      }
      await addGame(imported, filePath, { key, folder, title: path.basename(file, path.extname(file)) });
    }
    games.push(...imported.filter(entry => !games.some(game => sameFile(game.file, entry.file))));
  }

  handle('games', async () => {
    const games = await read();
    return Promise.all(games.map(async game => {
      const picture = await fs.readFile(path.join(screenshots, game.id + '.png')).catch(() => null);
      return picture ? { ...game, screenshot: 'data:image/png;base64,' + picture.toString('base64') } : game;
    }));
  });
  function checkpointPath(id) {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}(?:\.\d{13}\.[a-f0-9-]{36})?\.state$/.test(id)) {
      throw new Error('Invalid checkpoint identity.');
    }
    return path.join(checkpoints, id);
  }
  async function listCheckpoints() {
    const names = await fs.readdir(checkpoints).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const states = [];
    for (const id of names) {
      const match = /^([a-f0-9-]{36})(?:\.(\d{13})\.[a-f0-9-]{36})?\.state$/.exec(id);
      if (!match) continue;
      const stat = await fs.stat(path.join(checkpoints, id));
      states.push({ id, gameId: match[1], created: Number(match[2]) || stat.mtimeMs, bytes: stat.size });
    }
    return states.filter(state => state.id.includes('.', 37) || !states.some(other => other.gameId === state.gameId && other.id.includes('.', 37)))
      .sort((a, b) => b.created - a.created);
  }
  handle('checkpoints', () => serialize(listCheckpoints));
  handle('delete-checkpoint', id => serialize(() => fs.rm(checkpointPath(id), { force: true })));
  handle('screenshot', data => serialize(async () => {
    if (!currentGame || typeof data !== 'string' || data.length > 3 * 1024 * 1024 || !data.startsWith('data:image/png;base64,')) {
      throw new Error('Capture a screenshot from the active PSP game.');
    }
    const bytes = Buffer.from(data.slice('data:image/png;base64,'.length), 'base64');
    if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('Invalid PNG screenshot.');
    await fs.mkdir(screenshots, { recursive: true });
    const file = path.join(screenshots, currentGame + '.png');
    const temporary = file + '.tmp';
    await fs.writeFile(temporary, bytes);
    await fs.rename(temporary, file);
  }));
  handle('choose', async () => {
    const result = await dialog.showOpenDialog(windowFor(), {
      title: 'Add PSP games', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PSP games and ZIP archives', extensions: [...extensions, 'zip'] }],
    });
    if (result.canceled) return { games: await read(), errors: [] };
    return serialize(async () => {
      const games = await read();
      const errors = [];
      const created = [];
      for (const file of result.filePaths) {
        const before = created.length;
        try {
          const filePath = await fs.realpath(file);
          const extension = path.extname(filePath).slice(1).toLowerCase();
          if (extension === 'zip') await addZip(games, filePath, created);
          else if (extensions.includes(extension)) await addGame(games, filePath);
        } catch (error) {
          await Promise.allSettled(created.splice(before).map(discardArchive));
          errors.push(path.basename(file) + ' — ' + error.message);
        }
      }
      try { await write(games); }
      catch (error) {
        await Promise.allSettled(created.map(discardArchive));
        throw error;
      }
      return { games, errors };
    });
  });
  handle('favorite', id => serialize(async () => {
    const games = await read();
    const game = games.find(game => game.id === id);
    if (game) game.favorite = !game.favorite;
    await write(games);
    return games;
  }));
  handle('remove', id => serialize(async () => {
    const previous = await read();
    const removed = previous.find(game => game.id === id);
    const games = previous.filter(game => game.id !== id);
    await write(games);
    if (removed?.archiveFolder && !games.some(game => game.archiveFolder === removed.archiveFolder)) {
      await discardArchive(removed.archiveFolder);
    }
    return games;
  }));
  handle('saves', async () => {
    await fs.mkdir(saves, { recursive: true });
    const error = await shell.openPath(saves);
    if (error) throw new Error(error);
  });
  handle('start', id => serialize(async () => {
    if (player) throw new Error('Close the current PSP game first.');
    const games = await read();
    const game = games.find(item => item.id === id);
    if (!game) throw new Error('This game is missing from the library.');
    const file = await fs.stat(game.file).catch(() => null);
    if (!file?.isFile()) throw new Error('This game file has moved. Add it from its new location.');
    const ready = await Promise.all([
      fs.access(python), fs.access(corePath), fs.access(path.join(systemPath, 'PPSSPP', 'compat.ini')),
    ]).then(() => true, () => false);
    if (!ready) throw new Error('The PPSSPP runtime is missing. Rebuild the Windows preview with its PSP runtime.');
    const checkpoint = path.join(app.getPath('userData'), 'checkpoints', game.id + '.state');
    currentGame = game.id;
    player = openCore(python, host, [corePath, systemPath, saves, game.file, checkpoint]);
    try {
      const timing = await player.request(1);
      const fps = timing.readDoubleLE();
      const sampleRate = timing.readDoubleLE(8);
      if (!(fps >= 20 && fps <= 120 && sampleRate >= 8000 && sampleRate <= 96000)) {
        throw new Error('PPSSPP returned invalid playback settings.');
      }
      game.lastPlayed = Date.now();
      await write(games);
      return { fps, sampleRate };
    } catch (error) {
      await player.close();
      player = undefined;
      throw error;
    }
  }));
  handle('frame', async (buttons, x, y) => {
    if (!player) throw new Error('No PSP game is open.');
    if (![buttons, x, y].every(Number.isInteger) || buttons < 0 || buttons > 0x7fff ||
      x < -32767 || x > 32767 || y < -32767 || y > 32767) throw new Error('Invalid controller input.');
    const command = Buffer.alloc(7);
    command[0] = 70;
    command.writeUInt16LE(buttons, 1);
    command.writeInt16LE(x, 3);
    command.writeInt16LE(y, 5);
    return player.request(2, command);
  });
  handle('checkpoint', (restore, id) => serialize(async () => {
    if (!player || !currentGame) throw new Error('No PSP game is open.');
    const current = path.join(checkpoints, currentGame + '.state');
    if (restore === true) {
      const selected = id ? (await listCheckpoints()).find(state => state.id === id && state.gameId === currentGame)
        : (await listCheckpoints()).find(state => state.gameId === currentGame);
      if (!selected) throw new Error('This game has no checkpoint yet.');
      const file = checkpointPath(selected.id);
      if (file !== current) await fs.copyFile(file, current);
      await player.request(3, 'L');
    } else {
      await player.request(3, 'S');
      const file = path.join(checkpoints, currentGame + '.' + Date.now() + '.' + randomUUID() + '.state');
      await fs.copyFile(current, file);
    }
  }));
  const close = () => serialize(async () => {
    if (!player) return;
    await player.close();
    player = undefined;
    currentGame = undefined;
  });
  handle('stop', close);
  return close;
}

module.exports = { registerPsp };
