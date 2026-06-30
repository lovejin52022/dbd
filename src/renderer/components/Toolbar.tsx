import { useCallback, useEffect, useState } from 'react';
import { URLS } from '../../shared/constants';

interface Props {
  /** 当前 webview URL，用于登录页检测 */
  currentUrl: string;
  /** 当前是否在商品详情页 */
  isDetailPage: boolean;
  /** 点击加入抢单列表 */
  onAddToList: () => void;
  /** 导航到我的页面 */
  onNavigateMine: () => void;
  /** 导航到首页 */
  onNavigateHome: () => void;
  /** 刷新 webview */
  onRefresh: () => void;
  /** webview 后退 */
  onGoBack: () => void;
  /** 切换网页 DevTools */
  onToggleWebviewDevTools?: () => void;
}

/** 顶部工具栏：导航、session 管理、窗口置顶、登录检测 */
export default function Toolbar({
  currentUrl,
  isDetailPage,
  onAddToList,
  onNavigateMine,
  onNavigateHome,
  onRefresh,
  onGoBack,
  onToggleWebviewDevTools,
}: Props) {
  const isDev = import.meta.env.DEV;
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const needsLogin = currentUrl.startsWith(URLS.LOGIN_PREFIX);

  // 同步窗口置顶状态
  useEffect(() => {
    void window.electronAPI.getAlwaysOnTop().then(setAlwaysOnTop);
  }, []);

  const handleClearSession = useCallback(async () => {
    if (!window.confirm('确定清除多宝岛登录 session？清除后需重新登录。')) return;
    await window.electronAPI.clearSession();
    onNavigateMine();
  }, [onNavigateMine]);

  const handleToggleAlwaysOnTop = useCallback(async () => {
    const next = !alwaysOnTop;
    const result = await window.electronAPI.setAlwaysOnTop(next);
    setAlwaysOnTop(result);
  }, [alwaysOnTop]);

  const btnStyle = {
    padding: '4px 10px',
    fontSize: 13,
    cursor: 'pointer' as const,
  };

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid #ddd',
        background: '#f5f5f5',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontWeight: 600, marginRight: 4 }}>多宝岛助手</span>

      {needsLogin && (
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            background: '#fff3cd',
            color: '#856404',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          需要登录
        </span>
      )}

      <button type="button" style={btnStyle} onClick={onNavigateMine}>
        我的页面
      </button>
      <button type="button" style={btnStyle} onClick={onNavigateHome}>
        首页
      </button>
      <button type="button" style={btnStyle} onClick={onRefresh}>
        刷新
      </button>
      <button type="button" style={btnStyle} onClick={onGoBack}>
        后退
      </button>
      <button type="button" style={btnStyle} onClick={() => void handleClearSession()}>
        清除 session
      </button>
      <button
        type="button"
        style={{
          ...btnStyle,
          background: alwaysOnTop ? '#007bff' : undefined,
          color: alwaysOnTop ? '#fff' : undefined,
        }}
        onClick={() => void handleToggleAlwaysOnTop()}
      >
        {alwaysOnTop ? '取消置顶' : '窗口置顶'}
      </button>

      <span style={{ flex: 1 }} />

      {isDev && (
        <>
          <button
            type="button"
            style={btnStyle}
            onClick={() => void window.electronAPI.toggleAppDevTools()}
          >
            应用 DevTools
          </button>
          <button type="button" style={btnStyle} onClick={onToggleWebviewDevTools}>
            网页 DevTools
          </button>
        </>
      )}

      <button type="button" disabled={!isDetailPage} onClick={onAddToList}>
        加入抢单列表
      </button>
    </header>
  );
}
