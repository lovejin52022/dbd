import { app, BrowserWindow, ipcMain, Notification, type WebContents } from 'electron';
import { join } from 'path';
import { getDb } from './db/connection';
import { registerIpcHandlers } from './ipc/handlers';
import { AuctionScheduler } from './scheduler/auction-scheduler';
import { JdApiService } from './services/jd-api.service';

/** 多宝岛「我的页面」默认 URL */
const DEFAULT_MINE_URL =
  'https://dbd.m.jd.com/ppdbd/pages/mine/index?scene=null';

/** 多宝岛 webview 的 webContents（did-attach-webview 后赋值） */
let jdWebContents: WebContents | null = null;

/** 拍卖调度器实例（窗口创建后启动） */
let auctionScheduler: AuctionScheduler | null = null;

/** 主窗口引用，用于向渲染进程推送列表更新 */
let mainWindow: BrowserWindow | null = null;

/** 通知渲染进程刷新抢单列表 */
function notifyAuctionListUpdated(): void {
  mainWindow?.webContents.send('auction:list-updated');
}

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

  mainWindow = win;
  return win;
}

app.whenReady().then(() => {
  const db = getDb();
  const jdApi = new JdApiService(() => jdWebContents);

  createWindow();

  auctionScheduler = new AuctionScheduler(
    db,
    jdApi,
    (title, body) => {
      new Notification({ title, body }).show();
    },
    notifyAuctionListUpdated,
  );
  registerIpcHandlers({
    db,
    jdApi,
    scheduler: auctionScheduler,
    notifyListUpdated: notifyAuctionListUpdated,
  });
  auctionScheduler.start();

  // 向渲染进程提供默认多宝岛 URL
  ipcMain.handle('app:get-default-url', () => DEFAULT_MINE_URL);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
