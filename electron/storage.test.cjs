const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createLocalStorage, relativeSegments } = require('./storage.cjs');

async function fixture(t) {
  const cache = path.resolve(__dirname, '..', '.cache');
  await fs.mkdir(cache, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cache, 'storage-test-'));
  const library = createLocalStorage(path.join(directory, 'library'));
  await library.prepare();
  t.after(async () => {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== cache || !path.basename(resolved).startsWith('storage-test-')) throw new Error('Refusing to remove an unverified test directory.');
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return { directory, library };
}

test('library rejects traversal, absolute paths, Windows aliases and alternate streams', () => {
  const invalid = ['../outside', 'games/../../outside', 'games\\..\\outside', '/outside', 'C:/outside', '//server/share', 'a//b', './index', 'games/CON.sav', 'games/nul', 'games/LPT1.bin', 'game.sav:stream', 'game.sav.', 'game.sav ', 'games/a\0b'];
  for (const relative of invalid) assert.throws(() => relativeSegments(relative), Error, relative);
  assert.deepEqual(relativeSegments("games/koki's-save.sav"), ['games', "koki's-save.sav"]);
});

test('binary files round trip and missing entries return null', async (t) => {
  const { library } = await fixture(t);
  assert.equal(await library.read('games/missing.gba'), null);
  const bytes = Uint8Array.from([0, 1, 127, 128, 255]);
  await library.write('saves/example/game.sav', bytes);
  assert.deepEqual(await library.read('saves/example/game.sav'), bytes);
  await library.remove('saves/example/game.sav');
  assert.equal(await library.read('saves/example/game.sav'), null);
  await library.remove('saves/example/game.sav');
});

test('serialized atomic writes keep the final complete value with no temporary files', async (t) => {
  const { library } = await fixture(t);
  const old = new Uint8Array(4096).fill(21);
  const next = new Uint8Array(8192).fill(42);
  const last = new Uint8Array(16384).fill(84);
  await Promise.all([library.write('states/latest.ss0', old), library.write('states/latest.ss0', next), library.write('states/latest.ss0', last)]);
  assert.deepEqual(await library.read('states/latest.ss0'), last);
  assert.deepEqual(await fs.readdir(path.join(library.directory, 'states')), ['latest.ss0']);
});

test('invalid input and directory operations do not damage existing data', async (t) => {
  const { library } = await fixture(t);
  const bytes = Uint8Array.from([1, 2, 3]);
  await library.write('game.sav', bytes);
  assert.throws(() => library.write('game.sav', [9, 9, 9]), Error);
  assert.deepEqual(await library.read('game.sav'), bytes);
  await fs.mkdir(path.join(library.directory, 'folder'));
  await assert.rejects(library.read('folder'), /regular file/);
  await assert.rejects(library.remove('folder'), /regular file/);
});

test('directory links cannot redirect reads or writes outside the library', async (t) => {
  const { directory, library } = await fixture(t);
  const outside = path.join(directory, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'protected.sav'), 'keep');
  try { await fs.symlink(outside, path.join(library.directory, 'portal'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('The host does not permit creating a test link.'); return; } throw error; }
  await assert.rejects(library.read('portal/protected.sav'), /Links/);
  await assert.rejects(library.write('portal/protected.sav', Uint8Array.from([9])), /Links/);
  await assert.rejects(library.remove('portal/protected.sav'), /Links/);
  assert.equal(await fs.readFile(path.join(outside, 'protected.sav'), 'utf8'), 'keep');
});

test('package backing paths must exactly mirror the same profile and requested library', () => {
  const { packageRoamingBackingRoot } = require('./storage.cjs');
  const root = "C:\\Users\\Example\\AppData\\Roaming\\Koki's Emulator\\library";
  const backing = "C:\\Users\\Example\\AppData\\Local\\Packages\\Example.Host_123\\LocalCache\\Roaming\\Koki's Emulator\\library";
  assert.equal(packageRoamingBackingRoot(root, backing + '\\library.json'), backing);
  assert.equal(packageRoamingBackingRoot(root, backing + '\\games', 'games'), backing);
  const invalid = [
    backing.replace('Users\\Example\\', 'Users\\Other\\') + '\\library.json',
    backing.replace("Koki's Emulator", 'Other App') + '\\library.json',
    backing.replace('\\library', '\\library-other') + '\\library.json',
    backing.replace('\\LocalCache\\', '\\LocalState\\') + '\\library.json',
    backing + '\\outside.json',
    'D:\\elsewhere\\library.json',
  ];
  for (const candidate of invalid) assert.equal(packageRoamingBackingRoot(root, candidate), null, candidate);
});

async function mergedFixture(t) {
  const { directory } = await fixture(t);
  const profile = path.join(directory, 'profile');
  const logical = path.join(profile, 'AppData', 'Roaming', "Koki's Emulator", 'library');
  const backing = path.join(profile, 'AppData', 'Local', 'Packages', 'Example.Host_123', 'LocalCache', 'Roaming', "Koki's Emulator", 'library');
  await fs.mkdir(logical, { recursive: true });
  await fs.mkdir(backing, { recursive: true });
  return { directory, logical, backing };
}

test('merged package index selects one canonical backing root for all library operations', { skip: process.platform !== 'win32' }, async (t) => {
  const { logical, backing, directory } = await mergedFixture(t);
  const logicalIndex = path.join(logical, 'library.json'), backingIndex = path.join(backing, 'library.json');
  await fs.writeFile(logicalIndex, 'host placeholder');
  await fs.writeFile(backingIndex, 'private index');
  await fs.mkdir(path.join(backing, 'games'));
  await fs.writeFile(path.join(backing, 'games', 'example.gba'), 'rom bytes');
  const realpath = fs.realpath;
  t.mock.method(fs, 'realpath', async location => path.resolve(location).toLowerCase() === logicalIndex.toLowerCase() ? realpath(backingIndex) : realpath(location));
  const library = createLocalStorage(logical);
  assert.equal(await library.prepare(), backing);
  assert.equal(library.directory, backing);
  assert.equal(Buffer.from(await library.read('library.json')).toString(), 'private index');
  assert.equal(Buffer.from(await library.read('games/example.gba')).toString(), 'rom bytes');
  await Promise.all([library.write('states/current.ss0', Uint8Array.from([1])), library.write('states/current.ss0', Uint8Array.from([2, 3])), library.write('library.json', Uint8Array.from([7, 8]))]);
  assert.deepEqual(await fs.readFile(path.join(backing, 'states', 'current.ss0')), Buffer.from([2, 3]));
  assert.deepEqual(await fs.readFile(backingIndex), Buffer.from([7, 8]));
  assert.equal(await fs.readFile(logicalIndex, 'utf8'), 'host placeholder');
  assert.equal(await fs.stat(path.join(logical, 'states')).then(() => true, () => false), false);
  await library.remove('states/current.ss0');
  assert.equal(await library.read('states/current.ss0'), null);
  const outside = path.join(directory, 'protected'); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'keep.sav'), 'keep');
  await fs.symlink(outside, path.join(backing, 'portal'), 'junction');
  await assert.rejects(library.read('portal/keep.sav'), /Links/);
  await assert.rejects(library.write('portal/keep.sav', Uint8Array.from([9])), /Links/);
  await assert.rejects(library.remove('portal/keep.sav'), /Links/);
  assert.equal(await fs.readFile(path.join(outside, 'keep.sav'), 'utf8'), 'keep');
});

test('merged empty profile adopts its exclusive virtualized probe before caller data is written', { skip: process.platform !== 'win32' }, async (t) => {
  const { logical, backing } = await mergedFixture(t);
  const realpath = fs.realpath, open = fs.open, unlink = fs.unlink;
  const isProbe = location => path.dirname(path.resolve(location)).toLowerCase() === logical.toLowerCase() && path.basename(location).startsWith('library.json.tmp-');
  let physicalProbe;
  t.mock.method(fs, 'open', async (location, ...args) => {
    if (!isProbe(location)) return open(location, ...args);
    physicalProbe = path.join(backing, path.basename(location));
    return open(physicalProbe, ...args);
  });
  t.mock.method(fs, 'realpath', async location => isProbe(location) ? realpath(path.join(backing, path.basename(location))) : realpath(location));
  const library = createLocalStorage(logical);
  assert.equal(await library.prepare(), logical);
  await library.write('library.json', Uint8Array.from([4, 5, 6]));
  assert.equal(library.directory, backing);
  assert.deepEqual(await fs.readFile(path.join(backing, 'library.json')), Buffer.from([4, 5, 6]));
  assert.equal(await fs.stat(path.join(logical, 'library.json')).then(() => true, () => false), false);
  assert.equal(await fs.stat(physicalProbe).then(() => true, () => false), false);
  await library.write('saves/new.sav', Uint8Array.from([9]));
  assert.deepEqual(await library.read('saves/new.sav'), Uint8Array.from([9]));
  t.mock.restoreAll();
  const unrelatedRoot = path.join(path.dirname(logical), 'another-library');
  await fs.mkdir(unrelatedRoot);
  const protectedProbe = path.join(backing, 'unrecognized-probe');
  await fs.writeFile(path.join(backing, 'keep.txt'), 'keep');
  const other = createLocalStorage(unrelatedRoot);
  await other.prepare();
  const isOtherProbe = location => path.dirname(path.resolve(location)).toLowerCase() === unrelatedRoot.toLowerCase() && path.basename(location).startsWith('library.json.tmp-');
  t.mock.method(fs, 'open', async (location, ...args) => open(isOtherProbe(location) ? protectedProbe : location, ...args));
  t.mock.method(fs, 'realpath', async location => isOtherProbe(location) ? realpath(protectedProbe) : realpath(location));
  t.mock.method(fs, 'unlink', async location => unlink(isOtherProbe(location) ? protectedProbe : location));
  await assert.rejects(other.write('library.json', Uint8Array.from([99])), /outside/);
  assert.equal(await fs.stat(protectedProbe).then(() => true, () => false), false, 'Only the exclusive empty probe must be cleaned up on rejected adoption');
  assert.equal(await fs.readFile(path.join(backing, 'keep.txt'), 'utf8'), 'keep');
  t.mock.restoreAll();
  const protectedFile = path.join(backing, 'keep.txt');
  t.mock.method(fs, 'realpath', async location => isOtherProbe(location) ? realpath(protectedFile) : realpath(location));
  await assert.rejects(other.write('library.json', Uint8Array.from([88])), /outside/);
  assert.equal(await fs.readFile(protectedFile, 'utf8'), 'keep', 'A rejected realpath must never become the cleanup target');
  assert.deepEqual(await fs.readdir(unrelatedRoot), []);
});

test('package backing selection rejects linked candidate directories and unrelated redirects', { skip: process.platform !== 'win32' }, async (t) => {
  const { directory, logical, backing } = await mergedFixture(t);
  const logicalIndex = path.join(logical, 'library.json');
  await fs.writeFile(logicalIndex, 'host index');
  const protectedRoot = path.join(directory, 'protected'); await fs.mkdir(protectedRoot); await fs.writeFile(path.join(protectedRoot, 'library.json'), 'protected');
  await fs.rmdir(backing);
  await fs.symlink(protectedRoot, backing, 'junction');
  const realpath = fs.realpath;
  t.mock.method(fs, 'realpath', async location => path.resolve(location).toLowerCase() === logicalIndex.toLowerCase() ? path.join(backing, 'library.json') : realpath(location));
  const library = createLocalStorage(logical);
  await assert.rejects(library.prepare(), /Links/);
  assert.equal(await fs.readFile(path.join(protectedRoot, 'library.json'), 'utf8'), 'protected');
  t.mock.restoreAll();
  t.mock.method(fs, 'realpath', async location => path.resolve(location).toLowerCase() === logicalIndex.toLowerCase() ? path.join(protectedRoot, 'library.json') : realpath(location));
  await assert.rejects(createLocalStorage(logical).read('library.json'), /outside/);
});


test('concurrent merged-profile first writes settle on the canonical backing root', { skip: process.platform !== 'win32' }, async (t) => {
  const { logical, backing } = await mergedFixture(t);
  const logicalGames = path.join(logical, 'games'), backingGames = path.join(backing, 'games');
  const mkdir = fs.mkdir, lstat = fs.lstat, realpath = fs.realpath, open = fs.open;
  const isVirtualGames = location => path.resolve(location).toLowerCase() === logicalGames.toLowerCase();
  t.mock.method(fs, 'mkdir', async (location, ...args) => mkdir(isVirtualGames(location) ? backingGames : location, ...args));
  t.mock.method(fs, 'lstat', async location => lstat(isVirtualGames(location) ? backingGames : location));
  t.mock.method(fs, 'realpath', async location => realpath(isVirtualGames(location) ? backingGames : location));
  let opened, release;
  const firstOpened = new Promise(resolve => { opened = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let held = false;
  t.mock.method(fs, 'open', async (location, ...args) => {
    const handle = await open(location, ...args);
    if (!held && path.dirname(location).toLowerCase() === logical.toLowerCase() && path.basename(location).startsWith('library.json.tmp-')) { held = true; opened(); await gate; }
    return handle;
  });
  const library = createLocalStorage(logical);
  assert.equal(await library.prepare(), logical);
  const indexWrite = library.write('library.json', Uint8Array.from([4, 5, 6]));
  await firstOpened;
  await library.write('games/first.gba', Uint8Array.from([1, 2, 3]));
  release();
  await indexWrite;
  assert.equal(library.directory, backing);
  assert.deepEqual(await fs.readFile(path.join(backingGames, 'first.gba')), Buffer.from([1, 2, 3]));
  assert.deepEqual(await fs.readFile(path.join(backing, 'library.json')), Buffer.from([4, 5, 6]));
  assert.deepEqual(await fs.readdir(logical), []);
});

test('a canonical Host index prevents later package-root adoption and split metadata', { skip: process.platform !== 'win32' }, async (t) => {
  const { logical, backing } = await mergedFixture(t);
  const hostIndex = path.join(logical, 'library.json');
  await fs.writeFile(hostIndex, 'authoritative host index');
  await fs.mkdir(path.join(logical, 'games')); await fs.mkdir(path.join(backing, 'games'));
  const realpath = fs.realpath;
  t.mock.method(fs, 'realpath', async location => path.resolve(location).toLowerCase() === path.join(logical, 'games').toLowerCase() ? realpath(path.join(backing, 'games')) : realpath(location));
  const library = createLocalStorage(logical);
  assert.equal(await library.prepare(), logical);
  await assert.rejects(library.write('games/new.gba', Uint8Array.from([9])), /split across/);
  assert.equal(library.directory, logical);
  assert.equal(await fs.readFile(hostIndex, 'utf8'), 'authoritative host index');
  assert.deepEqual(await fs.readdir(path.join(backing, 'games')), []);
  assert.equal(await fs.stat(path.join(backing, 'library.json')).then(() => true, () => false), false);
});
