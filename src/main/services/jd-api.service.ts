import type { WebContents } from 'electron';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { callJdApiViaWebview } = require('../../../scripts/jd-sign');

/** 通过 Webview 调用京东 API */
export class JdApiService {
  constructor(private getWebContents: () => WebContents | null) {}

  async call(functionId: string, body: Record<string, unknown>): Promise<unknown> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('Webview 未就绪');
    return callJdApiViaWebview(wc, functionId, body);
  }
}
