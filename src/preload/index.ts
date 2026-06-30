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
});
