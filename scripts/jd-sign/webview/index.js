/**
 * Electron 集成辅助：读取 webview 注入脚本
 */
const fs = require('fs');
const path = require('path');

const WEBVIEW_SCRIPT_PATH = path.join(__dirname, 'fetch-current-bid-info.js');

/** 注入脚本文本（供 executeJavaScript 使用） */
function getWebviewInjectScript() {
  return fs.readFileSync(WEBVIEW_SCRIPT_PATH, 'utf8');
}

/**
 * 在 BrowserView / webContents 中安装并调用
 * @param {import('electron').WebContents} webContents
 * @param {string} auctionIds
 */
async function fetchBidInfoViaWebview(webContents, auctionIds) {
  const script = getWebviewInjectScript();
  await webContents.executeJavaScript(script, true);
  const idsJson = JSON.stringify(auctionIds);
  return webContents.executeJavaScript(
    `window.__duobaodaoFetchBidInfo(${idsJson})`,
    true,
  );
}

module.exports = {
  getWebviewInjectScript,
  fetchBidInfoViaWebview,
  WEBVIEW_SCRIPT_PATH,
};
