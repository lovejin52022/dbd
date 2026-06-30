import { app, BrowserWindow, ipcMain, type WebContents } from 'electron';
import { join } from 'path';
import { getDb } from './db/connection';
import { registerIpcHandlers } from './ipc/handlers';
import { JdApiService } from './services/jd-api.service';

/** 多宝岛「我的页面」默认 URL */
const DEFAULT_MINE_URL =
  'https://dbd.m.jd.com/ppdbd/pages/mine/index?scene=null';

/** 多宝岛 webview 的 webContents（did-attach-webview 后赋值） */
let jdWebContents: WebContents | null = null;

/** 供 Task 8 调度器使用的共享依赖 */
export function getAppServices() {
  return {
    db: getDb(),
    jdApi: new JdApiService(() => jdWebContents),
  };
}

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

  // 保存 webview webContents，供 JdApiService 调用 ParamsSign
  win.webContents.on('did-attach-webview', (_event, webContents) => {
    jdWebContents = webContents;
  });

  return win;
}

app.whenReady().then(() => {
  const db = getDb();
  const jdApi = new JdApiService(() => jdWebContents);

  createWindow();
  registerIpcHandlers({ db, jdApi });

  // 向渲染进程提供默认多宝岛 URL
  ipcMain.handle('app:get-default-url', () => DEFAULT_MINE_URL);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
