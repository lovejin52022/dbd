# 京东多宝岛出价查询（Electron Webview）

在已登录的多宝岛 Webview 内调用 `paipai.auction.current_bid_info`，复用页面自带的 `ParamsSign` 和 cookie，**只需传入 auctionIds**。

## 前置条件

1. Webview 已打开 `https://dbd.m.jd.com` 并完成登录
2. 页面已加载 `ParamsSign`（多宝岛页面会自动加载官方 SDK）

## Electron 集成

```javascript
const { fetchBidInfoViaWebview } = require('./scripts/jd-sign');

// webContents 为已登录的多宝岛 BrowserView
const result = await fetchBidInfoViaWebview(
  webContents,
  '404136328,404135828,404151331',
);
console.log(result);
```

### 主进程 IPC 示例

```javascript
const { ipcMain } = require('electron');
const { fetchBidInfoViaWebview } = require('./scripts/jd-sign');

ipcMain.handle('fetch-bid-info', async (event, auctionIds) => {
  return fetchBidInfoViaWebview(event.sender, auctionIds);
});
```

### 渲染进程调用

```javascript
const data = await window.electronAPI.invoke(
  'fetch-bid-info',
  '404136328,404135828',
);
```

## 浏览器控制台调试

1. 登录并打开 `https://dbd.m.jd.com/ppdbd/paimai`
2. 控制台粘贴 `webview/fetch-current-bid-info.js` 内容
3. 执行：

```javascript
await window.__duobaodaoFetchBidInfo('404136328,404135828');
```

## 目录结构

```text
scripts/jd-sign/
├── index.js
├── webview/
│   ├── fetch-current-bid-info.js   # 注入脚本
│   └── index.js                    # Electron 封装
└── README.md
```

## 返回数据

```json
{
  "code": 0,
  "result": {
    "code": 200,
    "message": "查询成功",
    "data": {
      "404136328": {
        "auctionId": 404136328,
        "currentPrice": 11.0,
        "num": 2,
        "currentBidder": "jd***be",
        "status": 3,
        "spectatorCount": 6
      }
    }
  }
}
```

## 说明

- cookie、token、uuid 由 Webview session 自动携带，无需手动传入
- h5st 每次由页面内 `ParamsSign.sign()` 实时生成
- auctionIds 变更后需重新调用
