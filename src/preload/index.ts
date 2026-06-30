import { contextBridge, ipcRenderer } from 'electron';

// 通过 contextBridge 暴露安全的 IPC 接口给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  getDefaultUrl: () => ipcRenderer.invoke('app:get-default-url') as Promise<string>,
});
