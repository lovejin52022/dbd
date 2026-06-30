import { app, BrowserWindow, ipcMain, type WebContents } from 'electron';
import { join } from 'path';
import { URLS } from '../shared/constants';
import { getDb } from './db/connection';
import { registerIpcHandlers } from './ipc/handlers';
import { showNotification } from './notify';
import { AuctionScheduler } from './scheduler/auction-scheduler';
import { JdApiService } from './services/jd-api.service';

/** 多宝岛 webview 的 webContents（did-attach-webview 后赋值） */
let jdWebContents: WebContents | null = null;

/** 拍卖调度器实例（Webview 挂载后启动） */
let auctionScheduler: AuctionScheduler | null = null;
let schedulerStarted = false;

/** Webview 就绪后启动调度器（避免 jdWebContents 为空导致整表暂停） */
function startSchedulerIfReady(): void {
  if (schedulerStarted || !auctionScheduler || !jdWebContents) return;
  schedulerStarted = true;
  auctionScheduler.start();
}

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
    // 不自动打开 DevTools，避免终端刷屏：
    // language-mismatch / Autofill.enable 等为 Chromium DevTools 内部噪音
    // 需要调试时用工具栏「应用 DevTools」手动打开
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // 保存 webview webContents，供 JdApiService 调用 ParamsSign
  win.webContents.on('did-attach-webview', (_event, webContents) => {
    jdWebContents = webContents;
    if (!auctionScheduler) return;
    if (auctionScheduler.isPaused()) {
      auctionScheduler.resume();
      schedulerStarted = true;
      mainWindow?.webContents.send('scheduler:resumed');
    } else {
      startSchedulerIfReady();
    }
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
    showNotification,
    notifyAuctionListUpdated,
    (reason) => {
      mainWindow?.webContents.send('scheduler:paused', { reason });
    },
  );
  registerIpcHandlers({
    db,
    jdApi,
    scheduler: auctionScheduler,
    notifyListUpdated: notifyAuctionListUpdated,
  });
  // 调度器在 did-attach-webview 后启动；若 webview 已存在则立即启动
  startSchedulerIfReady();

  // 向渲染进程提供默认多宝岛 URL
  ipcMain.handle('app:get-default-url', () => URLS.MINE);

  // 清除多宝岛 webview session（cookie / 本地存储）
  ipcMain.handle('session:clear', async () => {
    const wc = jdWebContents;
    if (!wc) return;
    const ses = wc.session;
    await ses.clearStorageData();
    await ses.clearCache();
  });

  // 窗口置顶切换
  ipcMain.handle('window:set-always-on-top', (event, value: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.setAlwaysOnTop(value);
    return win?.isAlwaysOnTop() ?? false;
  });

  ipcMain.handle('window:get-always-on-top', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isAlwaysOnTop() ?? false;
  });

  // 切换应用壳 DevTools（开发调试用）
  ipcMain.handle('devtools:toggle-app', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    win.webContents.toggleDevTools();
    return win.webContents.isDevToolsOpened();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
