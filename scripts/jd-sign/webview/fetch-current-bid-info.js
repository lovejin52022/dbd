/**
 * Webview 注入脚本：在已登录的多宝岛页面内调用 current_bid_info
 *
 * 用法（Electron）：
 *   await webContents.executeJavaScript(FETCH_CURRENT_BID_INFO_SCRIPT);
 *   await webContents.executeJavaScript(
 *     `window.__duobaodaoFetchBidInfo('404136328,404135828')`
 *   );
 */
(function installDuobaodaoBidFetcher(global) {
  const CONTROL_BRUSH_APP_ID = '86b9f';
  const APP_ID = 'paipai_h5';
  const FUNCTION_ID = 'paipai.auction.current_bid_info';

  /** 从 cookie 读取字段 */
  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  /** 解析 uuid / token */
  function parseUuid() {
    const jda = getCookie('__jda');
    if (!jda) return '';
    const parts = jda.split('.');
    return parts.length > 1 ? (parts[1] || parts[2] || '') : '';
  }

  function parseToken() {
    return getCookie('3AB9D23F7A4B3CSS') || getCookie('3AB9D23F7A4B3C9B') || '';
  }

  /** body 编码 */
  function encodeBody(bodyObj) {
    return encodeURIComponent(JSON.stringify(bodyObj))
      .replace(/%3A/g, ':')
      .replace(/%2C/g, ',');
  }

  /**
   * 查询当前出价（依赖页面已加载 ParamsSign）
   * @param {string} auctionIds 逗号分隔
   * @param {Object} [options]
   * @param {number} [options.sourceTag=2]
   */
  async function fetchCurrentBidInfo(auctionIds, options) {
    const sourceTag = (options && options.sourceTag) || 2;
    if (!auctionIds) throw new Error('auctionIds 不能为空');
    if (!global.ParamsSign) throw new Error('ParamsSign 未加载，请确认在多宝岛页面内执行');

    const token = parseToken();
    const uuid = parseUuid();
    if (!token) throw new Error('cookie 中缺少 x-api-eid-token');
    if (!uuid) throw new Error('cookie 中缺少 uuid（__jda）');

    const bodyForSign = encodeBody({
      auctionId: auctionIds,
      mpSource: 1,
      sourceTag,
    });

    const t = Date.now();
    const signer = new global.ParamsSign({
      appId: CONTROL_BRUSH_APP_ID,
      debug: false,
      preRequest: false,
    });

    const signResult = await signer.sign({
      functionId: FUNCTION_ID,
      t: String(t),
      appid: APP_ID,
      body: bodyForSign,
    });

    const h5stForPost = encodeURIComponent(signResult.h5st);
    const query = new URLSearchParams({
      functionId: FUNCTION_ID,
      t: String(t),
      appid: APP_ID,
      'x-api-eid-token': token,
      uuid,
    });

    const url = 'https://api.m.jd.com/api?' + query.toString();
    const resp = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-referer-page': location.href,
        'x-rp-client': 'h5_1.0.0',
      },
      body: 'body=' + bodyForSign + '&h5st=' + h5stForPost,
    });

    return resp.json();
  }

  global.__duobaodaoFetchBidInfo = fetchCurrentBidInfo;
})(typeof window !== 'undefined' ? window : globalThis);
