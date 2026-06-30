import { useEffect, useState } from 'react';
import type { AuctionListDbRow } from '../electron.d.ts';

/** 生命周期中文标签 */
const LIFECYCLE_LABELS: Record<string, string> = {
  not_started: '未开始',
  in_progress: '抢购中',
  expired: '已过期',
};

/** 格式化倒计时（距开始时间） */
function formatCountdown(startMs: number | null, nowMs: number, status: string): string {
  if (status === 'expired') return '已结束';
  if (startMs == null) return '--';
  const diff = startMs - nowMs;
  if (diff <= 0) return status === 'in_progress' ? '已开始' : '00:00:00';
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

interface Props {
  item: AuctionListDbRow;
  onChanged: () => void;
  onOpenUrl: (url: string) => void;
}

/** 单条抢单列表项 */
export default function AuctionListItem({ item, onChanged, onOpenUrl }: Props) {
  const [now, setNow] = useState(Date.now());
  const [targetPrice, setTargetPrice] = useState(
    item.target_price != null ? String(item.target_price) : '',
  );

  // 每秒刷新倒计时
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setTargetPrice(item.target_price != null ? String(item.target_price) : '');
  }, [item.target_price]);

  const isInProgress = item.lifecycle_status === 'in_progress';

  const handleDelete = async () => {
    await window.electronAPI.deleteAuction(item.id);
    onChanged();
  };

  const handleAutoOrder = async (enabled: boolean) => {
    await window.electronAPI.setAutoOrder(item.id, enabled);
    onChanged();
  };

  const handleTargetPriceBlur = async () => {
    const trimmed = targetPrice.trim();
    const price = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && Number.isNaN(price)) return;
    await window.electronAPI.updateTargetPrice(item.id, price);
    onChanged();
  };

  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: 6,
        padding: 10,
        marginBottom: 8,
        background: '#fafafa',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{item.title}</div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '1px 6px',
            borderRadius: 4,
            background: isInProgress ? '#fff3e0' : '#eee',
            marginRight: 6,
          }}
        >
          {LIFECYCLE_LABELS[item.lifecycle_status] ?? item.lifecycle_status}
        </span>
        现价: {item.current_price ?? '--'} | 出价: {item.bid_count ?? 0}
      </div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        倒计时: {formatCountdown(item.auction_start_time, now, item.lifecycle_status)}
      </div>

      {isInProgress && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={item.auto_order_enabled === 1}
            onChange={(e) => void handleAutoOrder(e.target.checked)}
          />
          自动出价
        </label>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12 }}>
        <span>期望价:</span>
        <input
          type="number"
          value={targetPrice}
          onChange={(e) => setTargetPrice(e.target.value)}
          onBlur={() => void handleTargetPriceBlur()}
          placeholder="元"
          style={{ width: 72, padding: '2px 4px' }}
          disabled={!isInProgress}
        />
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => void handleDelete()} style={{ fontSize: 12 }}>
          删除
        </button>
        <button type="button" onClick={() => onOpenUrl(item.url)} style={{ fontSize: 12 }}>
          打开
        </button>
      </div>
    </div>
  );
}
