/** preload 暴露给渲染进程的 API 类型 */
export interface ElectronAPI {
  getDefaultUrl: () => Promise<string>;
  addAuction: (payload: {
    id: string;
    skuid: string | null;
    url: string;
    title: string;
  }) => Promise<AuctionListDbRow>;
  listAuctions: () => Promise<AuctionListDbRow[]>;
  deleteAuction: (id: string) => Promise<void>;
  setAutoOrder: (id: string, enabled: boolean) => Promise<AuctionListDbRow>;
  updateTargetPrice: (id: string, price: number | null) => Promise<AuctionListDbRow>;
  /** 订阅列表更新事件，返回取消订阅函数 */
  onListUpdated: (callback: () => void) => () => void;
  /** 调度器暂停事件（Webview / 登录不可用） */
  onSchedulerPaused: (callback: (payload: { reason: string }) => void) => () => void;
  /** 调度器恢复事件 */
  onSchedulerResumed: (callback: () => void) => () => void;
  /** 清除多宝岛 webview session */
  clearSession: () => Promise<void>;
  /** 设置窗口置顶，返回实际状态 */
  setAlwaysOnTop: (value: boolean) => Promise<boolean>;
  /** 获取窗口是否置顶 */
  getAlwaysOnTop: () => Promise<boolean>;
}

/** IPC 返回的数据库行（SQLite snake_case） */
export interface AuctionListDbRow {
  id: string;
  skuid: string | null;
  title: string;
  url: string;
  added_at: string;
  updated_at: string;
  note: string | null;
  target_price: number | null;
  auto_order_enabled: number;
  lifecycle_status: string;
  auction_start_time: number | null;
  auction_end_time: number | null;
  address: string | null;
  current_price: number | null;
  bid_count: number | null;
  auction_status: number | null;
  server_time_offset: number;
  order_result: string;
  order_error: string | null;
  last_polled_at: string | null;
  scheduler_phase: string;
  data_incomplete: number;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
