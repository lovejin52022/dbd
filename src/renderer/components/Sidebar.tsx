import { useCallback, useEffect, useState } from 'react';
import type { AuctionListDbRow } from '../electron.d.ts';
import AuctionListItem from './AuctionListItem';

interface Props {
  onOpenUrl: (url: string) => void;
}

/** 抢单列表侧栏 */
export default function Sidebar({ onOpenUrl }: Props) {
  const [auctions, setAuctions] = useState<AuctionListDbRow[]>([]);
  const [schedulerPaused, setSchedulerPaused] = useState(false);

  const refresh = useCallback(() => {
    void window.electronAPI.listAuctions().then(setAuctions);
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribeList = window.electronAPI.onListUpdated(() => refresh());
    const unsubscribePaused = window.electronAPI.onSchedulerPaused(() => {
      setSchedulerPaused(true);
    });
    const unsubscribeResumed = window.electronAPI.onSchedulerResumed(() => {
      setSchedulerPaused(false);
    });
    return () => {
      unsubscribeList();
      unsubscribePaused();
      unsubscribeResumed();
    };
  }, [refresh]);

  return (
    <aside
      style={{
        width: 320,
        borderLeft: '1px solid #ddd',
        padding: 12,
        overflowY: 'auto',
        background: '#fff',
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>抢单列表</h2>
      {schedulerPaused && (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 10px',
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: 4,
            fontSize: 13,
            color: '#856404',
          }}
        >
          请打开多宝岛页面并完成登录
        </div>
      )}
      {auctions.length === 0 && (
        <p style={{ color: '#999', fontSize: 13 }}>暂无条目，在详情页点击「加入抢单列表」</p>
      )}
      {auctions.map((item) => (
        <AuctionListItem key={item.id} item={item} onChanged={refresh} onOpenUrl={onOpenUrl} />
      ))}
    </aside>
  );
}
