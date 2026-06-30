import { useCallback, useEffect, useRef, useState } from 'react';
import { URLS } from '../shared/constants';
import AuctionWorkspace from './components/AuctionWorkspace';
import Toolbar from './components/Toolbar';
import type { DetailPanelTab } from './electron.d.ts';
import './styles/app.css';

/** 轻量判断是否在 detail-v2 详情页 */
function isDetailPageUrl(url: string): boolean {
  return url.includes('detail-v2/index') && url.includes('id=');
}

/** 从详情页 URL 解析拍卖 id 与 skuid */
function parseDetailUrl(url: string): { id: string; skuid: string | null; url: string } | null {
  if (!isDetailPageUrl(url)) return null;
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get('id')?.trim();
    if (!id) return null;
    const skuid = parsed.searchParams.get('skuid')?.trim() || null;
    return { id, skuid, url };
  } catch {
    return null;
  }
}

export default function App() {
  const [defaultUrl, setDefaultUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<DetailPanelTab>('detail');
  const webviewRef = useRef<Electron.WebviewTag | null>(null);

  useEffect(() => {
    void window.electronAPI.getDefaultUrl().then(setDefaultUrl);
  }, []);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !defaultUrl) return;

    const syncUrl = () => setCurrentUrl(webview.getURL());
    const onDomReady = () => syncUrl();

    webview.addEventListener('did-navigate', syncUrl);
    webview.addEventListener('did-navigate-in-page', syncUrl);
    webview.addEventListener('dom-ready', onDomReady);

    return () => {
      webview.removeEventListener('did-navigate', syncUrl);
      webview.removeEventListener('did-navigate-in-page', syncUrl);
      webview.removeEventListener('dom-ready', onDomReady);
    };
  }, [defaultUrl]);

  const handleOpenUrl = useCallback((url: string) => {
    const webview = webviewRef.current;
    if (webview) webview.src = url;
  }, []);

  const handleNavigateMine = useCallback(() => {
    handleOpenUrl(URLS.MINE);
  }, [handleOpenUrl]);

  const handleNavigateHome = useCallback(() => {
    handleOpenUrl(URLS.HOME);
  }, [handleOpenUrl]);

  const handleRefresh = useCallback(() => {
    webviewRef.current?.reload();
  }, []);

  const handleGoBack = useCallback(() => {
    const webview = webviewRef.current;
    if (webview?.canGoBack()) webview.goBack();
  }, []);

  const handleToggleWebviewDevTools = useCallback(() => {
    webviewRef.current?.openDevTools();
  }, []);

  const handleAddToList = useCallback(async () => {
    const webview = webviewRef.current;
    const info = parseDetailUrl(currentUrl);
    if (!webview || !info) return;

    const title = webview.getTitle() || info.id;
    try {
      const row = await window.electronAPI.addAuction({
        id: info.id,
        skuid: info.skuid,
        url: info.url,
        title,
      });
      if (row) {
        setSelectedId(row.id);
        setPanelTab('detail');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`加入抢单列表失败：${msg}`);
    }
  }, [currentUrl]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id || null);
    setPanelTab('detail');
  }, []);

  return (
    <div className="app-shell">
      <Toolbar
        currentUrl={currentUrl}
        isDetailPage={isDetailPageUrl(currentUrl)}
        onAddToList={() => void handleAddToList()}
        onNavigateMine={handleNavigateMine}
        onNavigateHome={handleNavigateHome}
        onRefresh={handleRefresh}
        onGoBack={handleGoBack}
        onToggleWebviewDevTools={handleToggleWebviewDevTools}
      />
      <div className="app-body">
        {defaultUrl && (
          <div className="webview-panel">
            <webview ref={webviewRef} src={defaultUrl} className="webview-panel__view" />
          </div>
        )}
        <AuctionWorkspace
          selectedId={selectedId}
          panelTab={panelTab}
          onSelect={handleSelect}
          onTabChange={setPanelTab}
          onOpenUrl={handleOpenUrl}
        />
      </div>
    </div>
  );
}
