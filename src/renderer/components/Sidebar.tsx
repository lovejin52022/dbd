import { useCallback, useEffect, useState } from 'react';
import type { AuctionListDbRow } from '../electron.d.ts';
import AuctionListItem from './AuctionListItem';

interface Props {
  onOpenUrl: (url: string) => void;
}

/** 抢单列表侧栏 */
export default function Sidebar({ onOpenUrl }: Props) {
  const [auctions, setAuctions] = useState<AuctionListDbRow[]>([]);

  const refresh = useCallback(() => {
    void window.electronAPI.listAuctions().then(setAuctions);
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = window.electronAPI.onListUpdated(() => refresh());
    return unsubscribe;
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
      {auctions.length === 0 && (
        <p style={{ color: '#999', fontSize: 13 }}>暂无条目，在详情页点击「加入抢单列表」</p>
      )}
      {auctions.map((item) => (
        <AuctionListItem key={item.id} item={item} onChanged={refresh} onOpenUrl={onOpenUrl} />
      ))}
    </aside>
  );
}
