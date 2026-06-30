import { useCallback, useEffect, useState } from 'react';
import type { AuctionListDbRow, DetailPanelTab } from '../electron.d.ts';
import AuctionDetailPanel from './AuctionDetailPanel';
import AuctionListRow from './AuctionListRow';

interface Props {
  selectedId: string | null;
  panelTab: DetailPanelTab;
  onSelect: (id: string) => void;
  onTabChange: (tab: DetailPanelTab) => void;
  onOpenUrl: (url: string) => void;
}

/** 中间抢购列表 + 右侧详情面板 */
export default function AuctionWorkspace({
  selectedId,
  panelTab,
  onSelect,
  onTabChange,
  onOpenUrl,
}: Props) {
  const [auctions, setAuctions] = useState<AuctionListDbRow[]>([]);
  const [schedulerPaused, setSchedulerPaused] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(() => {
    void window.electronAPI.listAuctions().then((list) => {
      setAuctions(list);
      // 选中项被删则清空
      if (selectedId && !list.some((a) => a.id === selectedId)) {
        onSelect('');
      }
    });
  }, [selectedId, onSelect]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    refresh();
    const unsubList = window.electronAPI.onListUpdated(refresh);
    const unsubPaused = window.electronAPI.onSchedulerPaused(() => setSchedulerPaused(true));
    const unsubResumed = window.electronAPI.onSchedulerResumed(() => setSchedulerPaused(false));
    return () => {
      unsubList();
      unsubPaused();
      unsubResumed();
    };
  }, [refresh]);

  const selectedItem = auctions.find((a) => a.id === selectedId) ?? null;

  const handleDelete = async (id: string) => {
    await window.electronAPI.deleteAuction(id);
    refresh();
  };

  return (
    <div className="auction-workspace">
      <aside className="auction-list-panel">
        <div className="auction-list-panel__header">
          <h2>抢单列表</h2>
          <p>
            {auctions.length} 件 ·{' '}
            {schedulerPaused ? (
              <span className="auction-sidebar__scheduler-paused">调度暂停</span>
            ) : (
              <span className="auction-sidebar__scheduler-running">调度运行中</span>
            )}
          </p>
        </div>
        {schedulerPaused && (
          <div className="auction-sidebar__alert">请登录多宝岛页面</div>
        )}
        <div className="auction-list-panel__list">
          {auctions.length === 0 ? (
            <p className="auction-sidebar__empty">详情页点击「加入抢单列表」</p>
          ) : (
            auctions.map((item) => (
              <AuctionListRow
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                nowMs={now}
                onSelect={() => onSelect(item.id)}
                onDelete={() => void handleDelete(item.id)}
              />
            ))
          )}
        </div>
      </aside>

      <AuctionDetailPanel
        item={selectedItem}
        tab={panelTab}
        onTabChange={onTabChange}
        onChanged={refresh}
        onOpenUrl={onOpenUrl}
      />
    </div>
  );
}
