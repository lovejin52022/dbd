interface Props {
  /** 当前是否在商品详情页 */
  isDetailPage: boolean;
  /** 点击加入抢单列表 */
  onAddToList: () => void;
}

/** 顶部工具栏（Task 9 占位：加入列表按钮） */
export default function Toolbar({ isDetailPage, onAddToList }: Props) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderBottom: '1px solid #ddd',
        background: '#f5f5f5',
      }}
    >
      <span style={{ fontWeight: 600 }}>多宝岛助手</span>
      <button type="button" disabled={!isDetailPage} onClick={onAddToList}>
        加入抢单列表
      </button>
    </header>
  );
}
