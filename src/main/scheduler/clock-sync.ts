/** 滑动窗口样本数 */
const WINDOW = 5;

/** 基于 API 返回的服务器时间校准本地时钟 */
export class ClockSync {
  private samples: number[] = [];

  /** 记录一次 serverTime 与本地时间的偏移样本 */
  addSample(serverTimeMs: number): void {
    const offset = serverTimeMs - Date.now();
    this.samples.push(offset);
    if (this.samples.length > WINDOW) this.samples.shift();
  }

  /** 最近 N 次偏移的算术平均（毫秒） */
  getOffset(): number {
    if (this.samples.length === 0) return 0;
    return Math.round(this.samples.reduce((a, b) => a + b, 0) / this.samples.length);
  }

  /** 校准后的当前服务器时间 */
  serverNow(): number {
    return Date.now() + this.getOffset();
  }
}
