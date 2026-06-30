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
