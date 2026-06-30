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
  /** 更新自动出价提前量（距结束 ms） */
  updateOfferAdvance: (id: string, minMs: number, maxMs: number) => Promise<AuctionListDbRow>;
  /** 获取抢购历史记录 */
  getAuctionHistory: (auctionId: string) => Promise<AuctionHistoryItem[]>;
  /** 获取出价记录 */
  getBidRecords: (
    auctionId: string,
    refresh?: boolean,
  ) => Promise<{ fetchedAt: string | null; records: BidRecordItem[] }>;
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
  /** 切换应用壳 DevTools */
  toggleAppDevTools: () => Promise<boolean>;
}

/** 详情快照摘要（侧栏展示） */
export interface AuctionDetailDisplay {
  productName: string;
  imageUrl: string | null;
  startTime: number | null;
  actualEndTime: number | null;
  startPrice: number | null;
  qualityDesc: string | null;
}

/** saleInfo 快照摘要（侧栏展示） */
export interface AuctionSaleDisplay {
  freightArea: string | null;
  freightAreaText: string | null;
  stockCheckArea: string | null;
  hasAuctionStock: boolean | null;
}

/** 抢购历史单条 */
export interface AuctionHistoryItem {
  userNickname: string;
  endTime: number;
  userImage: string | null;
  offerPrice: number;
}

/** 出价记录单条 */
export interface BidRecordItem {
  userNickname: string;
  offerPrice: number;
  bidTimeMs: number | null;
  userImage: string | null;
}

/** 右侧面板 Tab */
export type DetailPanelTab = 'detail' | 'history' | 'bids';

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
  used_no: string | null;
  current_bidder: string | null;
  /** 结束前出价提前量（毫秒） */
  offer_advance_min_ms: number;
  offer_advance_max_ms: number;
  /** 最新 detail.v2 快照解析结果 */
  detail_display: AuctionDetailDisplay | null;
  /** 最新 saleInfo 快照解析结果 */
  sale_display: AuctionSaleDisplay | null;
  /** 慢轮询拉取出价记录的次数统计 */
  poll_summary: {
    bidRecordsCount: number;
    lastBidRecordsAt: string | null;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
