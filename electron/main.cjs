const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;

function startServer() {
  const serverPath = path.join(__dirname, '..', 'server', 'index.cjs');
  try {
    serverProcess = fork(serverPath, [], { stdio: 'pipe' });
    serverProcess.stdout.on('data', data => console.log(`[Server] ${data}`));
    serverProcess.stderr.on('data', data => console.error(`[Server] ${data}`));
    serverProcess.on('error', err => console.error('Server error:', err));
  } catch (err) {
    console.error('Failed to start server:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1250,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    resizable: true,
    frame: false,
    backgroundColor: '#050510',
    icon: path.join(__dirname, '..', 'src', 'assets', 'logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL() && url.startsWith('http')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  ipcMain.on('win:minimize', () => mainWindow.minimize());
  ipcMain.on('win:maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('win:close', () => mainWindow.close());
  ipcMain.handle('win:is-maximized', () => mainWindow.isMaximized());
  ipcMain.on('open:external', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('win:maximized-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('win:maximized-changed', false);
  });

  const distPath = path.join(__dirname, '..', 'dist', 'index.html');
  mainWindow.loadFile(distPath).catch(err => console.error('Failed to load:', err));

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  startServer();
  setTimeout(createWindow, 2000);
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { if (serverProcess) serverProcess.kill(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });
