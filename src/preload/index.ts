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
  /** 主进程列表更新时回调（返回取消订阅函数） */
  onListUpdated: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('auction:list-updated', listener);
    return () => ipcRenderer.removeListener('auction:list-updated', listener);
  },
  /** 清除多宝岛 webview session */
  clearSession: () => ipcRenderer.invoke('session:clear') as Promise<void>,
  /** 设置窗口置顶，返回实际状态 */
  setAlwaysOnTop: (value: boolean) =>
    ipcRenderer.invoke('window:set-always-on-top', value) as Promise<boolean>,
  /** 获取窗口是否置顶 */
  getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top') as Promise<boolean>,
});
