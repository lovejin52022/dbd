import type { WebContents } from 'electron';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { callJdApiViaWebview } = require('../../../scripts/jd-sign');

/** 判断是否为 Webview / ParamsSign / 登录态不可用错误 */
export function isJdApiUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Webview 未就绪') ||
    msg.includes('ParamsSign 未加载') ||
    msg.includes('缺少 x-api-eid-token') ||
    msg.includes('缺少 uuid')
  );
}

/** 通过 Webview 调用京东 API */
export class JdApiService {
  constructor(private getWebContents: () => WebContents | null) {}

  async call(functionId: string, body: Record<string, unknown>): Promise<unknown> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('Webview 未就绪');
    try {
      return await callJdApiViaWebview(wc, functionId, body);
    } catch (err) {
      // 失败重试一次，仍失败则抛出
      return callJdApiViaWebview(wc, functionId, body);
    }
  }
}
