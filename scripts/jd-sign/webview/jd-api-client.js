/**
 * Webview 通用京东 API 客户端（ParamsSign 签名）
 *
 * 用法（Electron）：
 *   await webContents.executeJavaScript(JD_API_CLIENT_SCRIPT);
 *   await webContents.executeJavaScript(
 *     `window.__duobaodaoCallJdApi('dbd.auction.detail.v2', { auctionId: '123' })`
 *   );
 */
(function installJdApiClient(global) {
  const CONTROL_BRUSH_APP_ID = '86b9f';
  const APP_ID = 'paipai_h5';

  /** 从 cookie 读取字段 */
  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  /** 解析 uuid */
  function parseUuid() {
    const jda = getCookie('__jda');
    if (!jda) return '';
    const parts = jda.split('.');
    return parts.length > 1 ? (parts[1] || parts[2] || '') : '';
  }

  /** 解析 x-api-eid-token */
  function parseToken() {
    return getCookie('3AB9D23F7A4B3CSS') || getCookie('3AB9D23F7A4B3C9B') || '';
  }

  /** body 编码（签名与 POST 共用） */
  function encodeBody(bodyObj) {
    return encodeURIComponent(JSON.stringify(bodyObj))
      .replace(/%3A/g, ':')
      .replace(/%2C/g, ',');
  }

  /**
   * 通用京东 API 调用
   * @param {string} functionId
   * @param {Object} bodyObj
   */
  async function callJdApi(functionId, bodyObj) {
    if (!global.ParamsSign) throw new Error('ParamsSign 未加载');
    const token = parseToken();
    const uuid = parseUuid();
    if (!token) throw new Error('缺少 x-api-eid-token');
    if (!uuid) throw new Error('缺少 uuid');

    const bodyForSign = encodeBody(bodyObj);
    const t = Date.now();
    const signer = new global.ParamsSign({
      appId: CONTROL_BRUSH_APP_ID,
      debug: false,
      preRequest: false,
    });
    const signResult = await signer.sign({
      functionId,
      t: String(t),
      appid: APP_ID,
      body: bodyForSign,
    });
    const query = new URLSearchParams({
      functionId,
      t: String(t),
      appid: APP_ID,
      'x-api-eid-token': token,
      uuid,
    });
    const resp = await fetch('https://api.m.jd.com/api?' + query.toString(), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-referer-page': location.href,
        'x-rp-client': 'h5_1.0.0',
      },
      body: 'body=' + bodyForSign + '&h5st=' + encodeURIComponent(signResult.h5st),
    });
    return resp.json();
  }

  global.__duobaodaoCallJdApi = callJdApi;
})(typeof window !== 'undefined' ? window : globalThis);
