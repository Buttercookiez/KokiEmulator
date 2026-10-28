const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_FILE_BYTES = 128 * 1024 * 1024;
const invalidSegment = /[\x00-\x1f<>:"|?*]/;
const reservedSegment = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function relativeSegments(relative) {
  if (typeof relative !== 'string' || !relative || relative.length > 1024 || relative.includes('\\') || path.isAbsolute(relative)) {
    throw new Error('A relative library path is required.');
  }
  const segments = relative.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || invalidSegment.test(segment) || reservedSegment.test(segment) || /[. ]$/.test(segment))) {
    throw new Error('Invalid library path.');
  }
  return segments;
}

function validBytes(value) {
  if (!(value instanceof Uint8Array) || value.byteLength > MAX_FILE_BYTES) {
    throw new Error('Expected a byte array no larger than 128 MB.');
  }
  return value;
}

function comparable(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
function samePath(first, second) { return comparable(first) === comparable(second); }
function inside(directory, entry) {
  const prefix = comparable(directory).replace(/[\\/]$/, '') + path.sep;
  return comparable(entry).startsWith(prefix);
}

/**
 * Recognize only the Windows package private-Roaming mirror of this exact library.
 * Other profiles, package locations, relative suffixes, or arbitrary redirects do not match.
 */
function packageRoamingBackingRoot(directory, realEntry, relative = 'library.json') {
  const win = path.win32;
  if (!win.isAbsolute(directory) || !win.isAbsolute(realEntry)) return null;
  const requested = win.normalize(directory);
  const match = /^(.*)\\AppData\\Roaming\\(.+)$/i.exec(requested);
  if (!match) return null;
  let segments;
  try { segments = relativeSegments(relative); } catch { return null; }
  const packages = win.join(match[1], 'AppData', 'Local', 'Packages');
  const physical = win.normalize(realEntry);
  const parts = win.relative(packages, physical).split('\\');
  const family = parts[0];
  if (!family || !/^(?!\.{1,2}$)[a-z0-9._-]+$/i.test(family)) return null;
  if (parts[1]?.toLowerCase() !== 'localcache' || parts[2]?.toLowerCase() !== 'roaming') return null;
  const candidate = win.join(packages, family, 'LocalCache', 'Roaming', match[2]);
  return win.join(candidate, ...segments).toLowerCase() === physical.toLowerCase() ? candidate : null;
}

function createLocalStorage(directory) {
  const requestedRoot = path.resolve(directory);
  const pending = new Map();
  let root = requestedRoot;
  let initialRoot;
  let canonicalHostIndex = false;
  let ready;

  async function validateBackingRoot(candidate) {
    // The candidate is a physical path, so each ancestor must stay canonical and non-linked.
    const parsed = path.parse(candidate);
    let current = parsed.root;
    for (const segment of candidate.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      const info = await fs.lstat(current);
      if (info.isSymbolicLink()) throw new Error('Links are not allowed in the library backing path.');
      if (!info.isDirectory()) throw new Error('The library backing path is not a directory.');
      if (!samePath(await fs.realpath(current), current)) throw new Error('The library backing path is not canonical.');
    }
    return fs.realpath(candidate);
  }

  async function adoptBackingRoot(segments, realEntry) {
    if (process.platform !== 'win32') return false;
    const candidate = packageRoamingBackingRoot(initialRoot, realEntry, segments.join('/'));
    if (!candidate) return false;
    if (canonicalHostIndex) throw new Error('The library is split across Windows storage locations.');
    if (!samePath(root, initialRoot)) return samePath(root, candidate);
    const canonical = await validateBackingRoot(candidate);
    const physicalEntry = path.join(canonical, ...segments);
    const info = await fs.lstat(physicalEntry);
    if (info.isSymbolicLink()) throw new Error('Links are not allowed inside the library.');
    if (!info.isDirectory() && !info.isFile()) throw new Error('The library backing entry is not regular.');
    if (!samePath(await fs.realpath(physicalEntry), realEntry)) throw new Error('The library backing entry does not match.');
    // A concurrent observation may select this same root, but never a second package.
    if (!samePath(root, initialRoot) && !samePath(root, canonical)) throw new Error('Conflicting library backing paths.');
    root = canonical;
    return true;
  }

  async function initialize() {
    ready ??= (async () => {
      await fs.mkdir(requestedRoot, { recursive: true });
      const info = await fs.lstat(requestedRoot);
      if (info.isSymbolicLink()) throw new Error('The library root cannot be a link.');
      if (!info.isDirectory()) throw new Error('The library root is not a directory.');
      initialRoot = root = await fs.realpath(requestedRoot);
      const index = path.join(requestedRoot, 'library.json');
      let indexInfo;
      try { indexInfo = await fs.lstat(index); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (indexInfo) {
        if (indexInfo.isSymbolicLink()) throw new Error('Links are not allowed inside the library.');
        if (!indexInfo.isFile()) throw new Error('The library index is not a regular file.');
        const realIndex = await fs.realpath(index);
        if (!inside(root, realIndex) && !await adoptBackingRoot(['library.json'], realIndex)) {
          throw new Error('Library entry resolves outside its folder.');
        }
        if (samePath(root, initialRoot)) canonicalHostIndex = true;
      }
    })();
    await ready;
    return root;
  }

  function resolve(relative) {
    const segments = relativeSegments(relative);
    // A stable relative key keeps operations serialized even if Windows reveals its backing root.
    const key = process.platform === 'win32' ? segments.join('/').toLowerCase() : segments.join('/');
    return { segments, key };
  }

  async function inspect(segments, createParents = false) {
    const realRoot = await initialize();
    let current = realRoot;
    for (let index = 0; index < segments.length; index += 1) {
      current = path.join(current, segments[index]);
      const parent = index < segments.length - 1;
      let info;
      try {
        info = await fs.lstat(current);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (!parent || !createParents) {
          if (!samePath(root, realRoot)) return inspect(segments, createParents);
          return { exists: false, target: path.join(realRoot, ...segments) };
        }
        try { await fs.mkdir(current); } catch (mkdirError) { if (mkdirError.code !== 'EEXIST') throw mkdirError; }
        info = await fs.lstat(current);
      }
      if (info.isSymbolicLink()) throw new Error('Links are not allowed inside the library.');
      if (parent && !info.isDirectory()) throw new Error('A library folder is not a directory.');
      if (!parent && !info.isFile()) throw new Error('The library entry is not a regular file.');
      const real = await fs.realpath(current);
      if (!inside(realRoot, real)) {
        if (await adoptBackingRoot(segments.slice(0, index + 1), real)) return inspect(segments, createParents);
        throw new Error('Library entry resolves outside its folder.');
      }
    }
    if (!samePath(root, realRoot)) return inspect(segments, createParents);
    return { exists: true, target: path.join(realRoot, ...segments) };
  }

  function serialize(key, operation) {
    const previous = pending.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    pending.set(key, next);
    return next.finally(() => { if (pending.get(key) === next) pending.delete(key); });
  }

  return {
    get directory() { return root; },
    async read(relative) {
      const { segments, key } = resolve(relative);
      await pending.get(key)?.catch(() => {});
      const entry = await inspect(segments);
      if (!entry.exists) return null;
      const info = await fs.stat(entry.target);
      if (info.size > MAX_FILE_BYTES) throw new Error('Library file exceeds the supported size.');
      return new Uint8Array(await fs.readFile(entry.target));
    },
    write(relative, input) {
      const { segments, key } = resolve(relative);
      const bytes = Buffer.from(validBytes(input));
      return serialize(key, async () => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const { target } = await inspect(segments, true);
          if (!inside(root, target) && !samePath(root, initialRoot) && inside(initialRoot, target)) continue;
          const temporary = target + '.tmp-' + randomUUID();
          let handle;
          let retry = false;
          try {
            handle = await fs.open(temporary, 'wx', 0o600);
            const realTemporary = await fs.realpath(temporary);
            if (!inside(root, realTemporary)) {
              if (attempt === 0 && !samePath(root, initialRoot) && inside(initialRoot, realTemporary)) retry = true;
              else {
                const temporarySegments = [...segments.slice(0, -1), path.basename(temporary)];
                if (!await adoptBackingRoot(temporarySegments, realTemporary)) throw new Error('Library entry resolves outside its folder.');
              }
            }
            if (!retry) {
              const info = await fs.lstat(realTemporary);
              if (info.isSymbolicLink() || !info.isFile()) throw new Error('The library temporary entry is not a regular file.');
              const [owned, physical] = await Promise.all([handle.stat({ bigint: true }), fs.stat(realTemporary, { bigint: true })]);
              if (owned.dev !== physical.dev || owned.ino !== physical.ino) throw new Error('The library temporary entry changed.');
              if (!inside(root, realTemporary)) {
                if (attempt === 0 && !samePath(root, initialRoot) && inside(initialRoot, realTemporary)) retry = true;
                else throw new Error('Library entry resolves outside its folder.');
              }
              if (!retry) {
                await handle.writeFile(bytes);
                await handle.sync();
                await handle.close();
                handle = null;
                const destination = await inspect(segments, true);
                await fs.rename(realTemporary, destination.target);
                if (segments.length === 1 && segments[0].toLowerCase() === 'library.json' && samePath(root, initialRoot)) canonicalHostIndex = true;
                return;
              }
            }
          } finally {
            await handle?.close().catch(() => {});
            // Never unlink an untrusted realpath result: only our original exclusive probe name.
            await fs.unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
          }
          if (!retry) throw new Error('Library write could not select a stable storage location.');
        }
        throw new Error('Library write could not select a stable storage location.');
      });
    },
    remove(relative) {
      const { segments, key } = resolve(relative);
      return serialize(key, async () => {
        const entry = await inspect(segments);
        if (entry.exists) await fs.unlink(entry.target);
      });
    },
    async prepare() { return initialize(); },
  };
}

module.exports = { createLocalStorage, MAX_FILE_BYTES, relativeSegments, validBytes, packageRoamingBackingRoot };

