import { useEffect, useState } from 'react';

export default function App() {
  const [defaultUrl, setDefaultUrl] = useState('');
  useEffect(() => {
    // 从主进程获取多宝岛默认页面 URL
    window.electronAPI.getDefaultUrl().then(setDefaultUrl);
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header>多宝岛助手</header>
      <div style={{ flex: 1, display: 'flex' }}>
        <webview src={defaultUrl} style={{ flex: 1 }} />
        <aside style={{ width: 320 }}>抢单列表</aside>
      </div>
    </div>
  );
}
