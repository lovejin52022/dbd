export type LifecycleStatus = 'not_started' | 'in_progress' | 'expired';
export type SchedulerPhase = 'idle' | 'slow_poll' | 'fast_poll' | 'firing' | 'done';
export type OrderResult = 'pending' | 'success' | 'failed' | 'skipped';

export interface AuctionListRow {
  id: string;
  skuid: string | null;
  title: string;
  url: string;
  addedAt: string;
  updatedAt: string;
  note: string | null;
  targetPrice: number | null;
  autoOrderEnabled: number;
  lifecycleStatus: LifecycleStatus;
  auctionStartTime: number | null;
  auctionEndTime: number | null;
  address: string | null;
  currentPrice: number | null;
  bidCount: number | null;
  auctionStatus: number | null;
  serverTimeOffset: number;
  orderResult: OrderResult;
  orderError: string | null;
  lastPolledAt: string | null;
  schedulerPhase: SchedulerPhase;
  dataIncomplete: number;
}
