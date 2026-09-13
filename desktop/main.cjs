/* oxlint-disable typescript/no-require-imports -- Explicit CommonJS files for the Electron main process/build configuration. */
const {
  app,
  BrowserWindow,
  dialog,
  Menu,
  protocol,
  screen,
  session,
  ipcMain,
  clipboard,
} = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const {
  GAME_URL,
  isGameURL,
  isGameOrigin,
  verifyRenderer,
  rendererResponse,
} = require('./security.cjs');

// Stable across architectures, portable/installed packages, and application versions.
app.setName('FRIENDSLOP');
app.setPath('userData', path.join(app.getPath('appData'), 'WellcumBack'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'wellcum', privileges: { standard: true, secure: true } },
]);

let mainWindow = null;
let gameSession;
let network;
let closing = false;

function fatal(error) {
  dialog.showErrorBox(
    'Не удалось открыть игру',
    String(error instanceof Error ? error.message : error),
  );
  app.quit();
}

async function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const window = new BrowserWindow({
    title: 'FRIENDSLOP',
    width: Math.min(1440, width),
    height: Math.min(900, height),
    minWidth: Math.min(720, width),
    minHeight: Math.min(480, height),
    backgroundColor: '#13161d',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      session: gameSession,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  mainWindow = window;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview', (event) =>
    event.preventDefault(),
  );
  window.webContents.on('will-frame-navigate', (details) => {
    if (!details.isMainFrame || !isGameURL(details.url))
      details.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
    void network?.stop();
  });
  window.webContents.on('render-process-gone', () => {
    void network?.stop();
  });
  await window.loadURL(GAME_URL);
}

async function start() {
  const { createDesktopNetwork, parseInvitation } = require('./network.cjs');
  network = createDesktopNetwork({
    schema: await readFile(path.join(__dirname, 'rooms.sql'), 'utf8'),
    binary: path.join(
      app.isPackaged ? process.resourcesPath : __dirname,
      'tunnel',
      process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared',
    ),
    tempRoot: app.getPath('temp'),
  });
  const trustedSender = (event) => {
    if (
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== event.sender.mainFrame ||
      !isGameURL(event.senderFrame.url)
    )
      throw new Error('Untrusted game frame.');
  };
  for (const method of ['host', 'stop', 'status', 'request', 'disconnect']) {
    ipcMain.handle(`wellcum:network:${method}`, (event, ...args) => {
      trustedSender(event);
      if (args.length > 2 || JSON.stringify(args).length > 270 * 1024)
        throw new Error('Invalid network request.');
      return network[method](...args);
    });
  }
  ipcMain.handle('wellcum:network:copy', async (event, text) => {
    trustedSender(event);
    if (typeof text !== 'string') throw new Error('Invalid invitation.');
    parseInvitation(text);
    await clipboard.writeText(text);
  });
  const rendererPath = path.join(__dirname, 'renderer');
  const [html, manifestJSON] = await Promise.all([
    readFile(path.join(rendererPath, 'index.html'), 'utf8'),
    readFile(path.join(rendererPath, 'build.json'), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestJSON);
  verifyRenderer(html, manifest, app.getVersion());
  gameSession = session.fromPartition('persist:wellcum-game-v1');
  gameSession.protocol.handle('wellcum', (request) =>
    rendererResponse(request, html, manifest.csp),
  );
  const trustedContents = (contents) =>
    Boolean(
      contents &&
      !contents.isDestroyed() &&
      contents === mainWindow?.webContents &&
      isGameURL(contents.getURL()),
    );
  gameSession.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      callback(
        permission === 'fullscreen' &&
          trustedContents(contents) &&
          details.isMainFrame &&
          isGameURL(details.requestingUrl),
      );
    },
  );
  gameSession.setPermissionCheckHandler(
    (contents, permission, origin) =>
      permission === 'fullscreen' &&
      trustedContents(contents) &&
      isGameOrigin(origin),
  );
  gameSession.on('will-download', (event) => event.preventDefault());
  gameSession.webRequest.onBeforeRequest(
    {
      urls: [
        'http://*/*',
        'https://*/*',
        'ws://*/*',
        'wss://*/*',
        'file://*/*',
      ],
    },
    (_details, callback) => callback({ cancel: true }),
  );
  // Game F / the visible fullscreen button owns fullscreen state. No global key grabs.
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([
          { role: 'appMenu' },
          { role: 'editMenu' },
          { label: 'Окно', submenu: [{ role: 'minimize' }, { role: 'close' }] },
        ])
      : null,
  );
  await createWindow();
  app.on('activate', () => {
    if (!mainWindow) void createWindow().catch(fatal);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.show();
    mainWindow?.focus();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('before-quit', (event) => {
    if (!network || closing) return;
    event.preventDefault();
    closing = true;
    void network.stop().finally(() => app.quit());
  });
  void app.whenReady().then(start).catch(fatal);
}
