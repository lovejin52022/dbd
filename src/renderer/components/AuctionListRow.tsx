import type { AuctionListDbRow } from '../electron.d.ts';
import { getDisplayLifecycle, getDisplayName, LIFECYCLE_LABELS } from '../utils/auction-display';

interface Props {
  item: AuctionListDbRow;
  selected: boolean;
  nowMs: number;
  onSelect: () => void;
  onDelete: () => void;
}

/** 中间栏：精简列表行 */
export default function AuctionListRow({ item, selected, nowMs, onSelect, onDelete }: Props) {
  const lifecycle = getDisplayLifecycle(item, nowMs);
  const name = getDisplayName(item);

  return (
    <div
      className={`list-row${selected ? ' list-row--selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
    >
      <div className="list-row__main">
        <div className="list-row__title">{name}</div>
        <div className="list-row__meta">
          <span className={`list-row__badge list-row__badge--${lifecycle}`}>
            {LIFECYCLE_LABELS[lifecycle]}
          </span>
          <span className="list-row__price">
            {item.current_price != null ? `¥${item.current_price}` : '--'}
          </span>
          <span className="list-row__count">{item.bid_count ?? 0} 人</span>
        </div>
      </div>
      <button
        type="button"
        className="list-row__delete"
        title="删除"
        onClick={(e) => {
          e.stopPropagation();
          void onDelete();
        }}
      >
        ×
      </button>
    </div>
  );
}
