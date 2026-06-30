import type { WebContents } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';

/** 解析 jd-sign 路径：打包后在 out/main，源码在 src/main/services */
function resolveJdSignPath(): string {
  const candidates = [
    join(__dirname, '../../scripts/jd-sign'),
    join(__dirname, '../../../scripts/jd-sign'),
    join(process.cwd(), 'scripts/jd-sign'),
  ];
  for (const p of candidates) {
    if (existsSync(join(p, 'index.js'))) return p;
  }
  throw new Error('找不到 scripts/jd-sign 模块');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { callJdApiViaWebview } = require(resolveJdSignPath());

/** 判断是否为 Webview / ParamsSign / 登录态不可用错误 */
export function isJdApiUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('ParamsSign 未加载') ||
    msg.includes('缺少 x-api-eid-token') ||
    msg.includes('缺少 uuid')
  );
}

/** Webview 尚未挂载，可稍后重试，不应暂停调度器 */
export function isWebviewNotReadyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('Webview 未就绪');
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
