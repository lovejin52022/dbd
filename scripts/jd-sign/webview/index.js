/**
 * Electron 集成辅助：读取 webview 注入脚本
 */
const fs = require('fs');
const path = require('path');

const WEBVIEW_SCRIPT_PATH = path.join(__dirname, 'fetch-current-bid-info.js');
const JD_API_CLIENT_PATH = path.join(__dirname, 'jd-api-client.js');

/** 注入脚本文本（供 executeJavaScript 使用） */
function getWebviewInjectScript() {
  return fs.readFileSync(WEBVIEW_SCRIPT_PATH, 'utf8');
}

/** 通用 JD API 客户端脚本文本 */
function getJdApiClientScript() {
  return fs.readFileSync(JD_API_CLIENT_PATH, 'utf8');
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

/**
 * 通过 Webview 调用任意京东 API
 * @param {import('electron').WebContents} webContents
 * @param {string} functionId
 * @param {Object} body
 */
async function callJdApiViaWebview(webContents, functionId, body) {
  const script = getJdApiClientScript();
  await webContents.executeJavaScript(script, true);
  return webContents.executeJavaScript(
    `(async () => window.__duobaodaoCallJdApi(${JSON.stringify(functionId)}, ${JSON.stringify(body)}))()`,
    true,
  );
}

module.exports = {
  getWebviewInjectScript,
  fetchBidInfoViaWebview,
  getJdApiClientScript,
  callJdApiViaWebview,
  WEBVIEW_SCRIPT_PATH,
};
