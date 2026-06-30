/** preload 暴露给渲染进程的 API 类型 */
export interface ElectronAPI {
  getDefaultUrl: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
