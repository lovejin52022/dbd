import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';

/** 多宝岛「我的页面」默认 URL */
const DEFAULT_MINE_URL =
  'https://dbd.m.jd.com/ppdbd/pages/mine/index?scene=null';

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // 允许渲染进程使用 <webview> 嵌入多宝岛
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

app.whenReady().then(() => {
  createWindow();
  // 向渲染进程提供默认多宝岛 URL
  ipcMain.handle('app:get-default-url', () => DEFAULT_MINE_URL);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
