const { app, BrowserWindow, dialog, ipcMain, protocol, session, shell, nativeTheme } = require('electron');
const fs = require('node:fs/promises');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createLocalStorage, validBytes } = require('./storage.cjs');

const isNds = process.env.KOKI_SYSTEM === 'nds' || require('../package.json').kokiSystem === 'nds';
app.setName(isNds ? 'Koki NDS' : "Koki's Emulator");
if (isNds) app.setPath('userData', path.join(app.getPath('appData'), 'Koki NDS'));
const testMode = !app.isPackaged && process.env.KOKI_TEST_MODE === '1';
if (testMode && process.env.KOKI_TEST_DATA_DIR) {
  if (!path.isAbsolute(process.env.KOKI_TEST_DATA_DIR)) throw new Error('The test data directory must be absolute.');
  mkdirSync(process.env.KOKI_TEST_DATA_DIR, { recursive: true });
  app.setPath('userData', path.resolve(process.env.KOKI_TEST_DATA_DIR));
}
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const developmentUrl = !app.isPackaged ? process.env.KOKI_DEV_URL : null;
if (developmentUrl) {
  const address = new URL(developmentUrl);
  if (address.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(address.hostname)) throw new Error('Development URL must use the local loopback interface.');
}

let window;
let library;
let pendingCloseToken;
let allowClose = false;
let startupBackground = nativeTheme.shouldUseDarkColors ? '#0e0e0e' : '#f7f7f7';
const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self' blob: data:; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'";

function isAppUrl(value) {
  try {
    const address = new URL(value);
    return address.protocol === 'app:' && address.hostname === 'bundle' || Boolean(developmentUrl && address.origin === new URL(developmentUrl).origin);
  } catch { return false; }
}

function authorize(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame || !isAppUrl(event.senderFrame.url)) {
    throw new Error('This window is not allowed to access the library.');
  }
}

function registerIpc() {
  ipcMain.on('koki:close-ready', (event, result) => {
    try { authorize(event); } catch { return; }
    if (!result || result.token !== pendingCloseToken || !pendingCloseToken) return;
    pendingCloseToken = null;
    if (typeof result.error === 'string') {
      dialog.showMessageBox(window, { type: 'error', title: 'Koki is still open', message: 'Your progress could not be saved.', detail: result.error.slice(0, 2048), buttons: ['Keep Koki open'], defaultId: 0 });
      return;
    }
    allowClose = true;
    window.close();
  });
  ipcMain.handle('koki:read', (event, relative) => { authorize(event); return library.read(relative); });
  ipcMain.handle('koki:write', (event, relative, bytes) => { authorize(event); return library.write(relative, bytes); });
  ipcMain.handle('koki:remove', (event, relative) => { authorize(event); return library.remove(relative); });
  ipcMain.handle('koki:reveal-library', async (event) => {
    authorize(event);
    const error = await shell.openPath(await library.prepare());
    if (error) throw new Error(error);
  });
  ipcMain.handle('koki:export', async (event, name, bytes) => {
    authorize(event);
    validBytes(bytes, isNds ? 512 * 1024 * 1024 : undefined);
    if (typeof name !== 'string' || !name || name.length > 160 || name !== path.basename(name) || /[\\/\x00-\x1f<>:"|?*]/.test(name) || /[. ]$/.test(name)) throw new Error('Invalid export filename.');
    const result = await dialog.showSaveDialog(window, { defaultPath: path.join(app.getPath('downloads'), name), title: 'Export from Koki', buttonLabel: 'Export', properties: ['showOverwriteConfirmation', 'createDirectory'] });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, bytes);
    return true;
  });
}

function registerBundleProtocol() {
  const bundle = path.join(app.getAppPath(), isNds ? 'dist-nds' : 'dist');
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
  protocol.handle('app', async (request) => {
    try {
      const address = new URL(request.url);
      if (address.hostname !== 'bundle' || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
      const decoded = decodeURIComponent(address.pathname);
      if (decoded.includes('\\') || decoded.includes('\0')) return new Response('Invalid path', { status: 400 });
      const parts = decoded.split('/').filter(Boolean);
      if (parts.some((part) => part === '..' || part === '.' || part.includes(':'))) return new Response('Invalid path', { status: 400 });
      const target = path.resolve(bundle, ...(parts.length ? parts : ['index.html']));
      if (!target.toLowerCase().startsWith((bundle + path.sep).toLowerCase())) return new Response('Not found', { status: 404 });
      const content = await fs.readFile(target);
      const headers = new Headers({ 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
      headers.set('Content-Security-Policy', csp);
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(request.method === 'HEAD' ? null : content, { status: 200, headers });
    } catch { return new Response('Not found', { status: 404 }); }
  });
}

function createWindow() {
  allowClose = false;
  pendingCloseToken = null;
  window = new BrowserWindow({
    width: 1340, height: 900, minWidth: 720, minHeight: 560,
    title: isNds ? "Koki NDS" : "Koki's Emulator", backgroundColor: startupBackground,
    icon: app.isPackaged ? path.join(process.resourcesPath, isNds ? 'koki-nds.png' : 'koki-gba.png') : path.join(app.getAppPath(), 'assets', 'app-icons', isNds ? 'koki-nds.png' : 'koki-gba.png'),
    autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false, backgroundThrottling: !testMode },
  });
  window.once('ready-to-show', () => { if (!testMode) window?.show(); });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!isAppUrl(url)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (pendingCloseToken) return;
    pendingCloseToken = randomUUID();
    window.webContents.send('koki:before-close', pendingCloseToken);
  });
  window.on('closed', () => { window = null; });
  window.loadURL(developmentUrl || 'app://bundle/index.html');
}

app.whenReady().then(async () => {
  if (!ownsInstance) return;
  library = createLocalStorage(path.join(app.getPath('userData'), 'library'), isNds ? 512 * 1024 * 1024 : undefined);
  await library.prepare();
  try {
    const saved = await library.read(isNds ? 'nds/library.json' : 'library.json');
    const theme = saved ? JSON.parse(Buffer.from(saved).toString('utf8'))?.settings?.theme : 'system';
    const dark = theme === 'dark' || theme !== 'light' && nativeTheme.shouldUseDarkColors;
    startupBackground = dark ? '#0e0e0e' : '#f7f7f7';
  } catch { /* The renderer reports library errors and offers recovery. */ }
  registerBundleProtocol();
  registerIpc();
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'fullscreen'));
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isAppUrl(details.url) || details.url.startsWith('blob:') || details.url.startsWith('data:') || Boolean(developmentUrl && details.url.startsWith(developmentUrl.replace(/^http:/, 'ws:')));
    callback({ cancel: !allowed });
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch((error) => { dialog.showErrorBox('Koki could not start', error.message); app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('second-instance', () => {
  if (!window || testMode) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
});
