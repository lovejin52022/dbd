import { contextBridge, ipcRenderer } from 'electron';

// 通过 contextBridge 暴露安全的 IPC 接口给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  getDefaultUrl: () => ipcRenderer.invoke('app:get-default-url') as Promise<string>,
  addAuction: (payload: {
    id: string;
    skuid: string | null;
    url: string;
    title: string;
  }) => ipcRenderer.invoke('auction:add', payload),
  listAuctions: () => ipcRenderer.invoke('auction:list'),
  deleteAuction: (id: string) => ipcRenderer.invoke('auction:delete', id),
  setAutoOrder: (id: string, enabled: boolean) =>
    ipcRenderer.invoke('auction:set-auto-order', id, enabled),
  updateTargetPrice: (id: string, price: number | null) =>
    ipcRenderer.invoke('auction:update-target-price', id, price),
  updateOfferAdvance: (id: string, minMs: number, maxMs: number) =>
    ipcRenderer.invoke('auction:update-offer-advance', id, minMs, maxMs),
  /** 获取商品抢购历史 */
  getAuctionHistory: (auctionId: string) =>
    ipcRenderer.invoke('auction:get-history', auctionId) as Promise<
      Array<{
        userNickname: string;
        endTime: number;
        userImage: string | null;
        offerPrice: number;
      }>
    >,
  /** 获取出价记录 */
  getBidRecords: (auctionId: string, refresh?: boolean) =>
    ipcRenderer.invoke('auction:get-bid-records', auctionId, refresh) as Promise<{
      fetchedAt: string | null;
      records: Array<{
        userNickname: string;
        offerPrice: number;
        bidTimeMs: number | null;
        userImage: string | null;
      }>;
    }>,
  /** 主进程列表更新时回调（返回取消订阅函数） */
  onListUpdated: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('auction:list-updated', listener);
    return () => ipcRenderer.removeListener('auction:list-updated', listener);
  },
  /** 调度器因 Webview / ParamsSign 不可用暂停时回调 */
  onSchedulerPaused: (callback: (payload: { reason: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { reason: string }) =>
      callback(payload);
    ipcRenderer.on('scheduler:paused', listener);
    return () => ipcRenderer.removeListener('scheduler:paused', listener);
  },
  /** 调度器恢复运行（Webview 已就绪） */
  onSchedulerResumed: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('scheduler:resumed', listener);
    return () => ipcRenderer.removeListener('scheduler:resumed', listener);
  },
  /** 清除多宝岛 webview session */
  clearSession: () => ipcRenderer.invoke('session:clear') as Promise<void>,
  /** 设置窗口置顶，返回实际状态 */
  setAlwaysOnTop: (value: boolean) =>
    ipcRenderer.invoke('window:set-always-on-top', value) as Promise<boolean>,
  /** 获取窗口是否置顶 */
  getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top') as Promise<boolean>,
  /** 切换应用壳 DevTools */
  toggleAppDevTools: () => ipcRenderer.invoke('devtools:toggle-app') as Promise<boolean>,
});
