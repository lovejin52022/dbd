/** 滑动窗口样本数 */
const WINDOW = 5;

/** 忽略过高 RTT 样本（毫秒） */
const MAX_RTT_MS = 500;

/** 无 RTT 样本时的默认出价请求耗时（毫秒） */
export const DEFAULT_ESTIMATED_RTT_MS = 80;

export interface ClockSampleTiming {
  requestSentAtMs: number;
  responseReceivedAtMs: number;
}

/** 基于 API 返回的服务器时间校准本地时钟（含 RTT/2 补偿） */
export class ClockSync {
  private offsetSamples: number[] = [];
  private rttSamples: number[] = [];
  /** 单调时钟锚点：上次采样时的校准服务器时间 */
  private anchorServerMs = 0;
  /** 单调时钟锚点：上次采样时的本地 wall clock */
  private anchorWallMs = 0;
  private hasAnchor = false;

  /**
   * 记录一次 serverTime 样本。
   * 提供 timing 时用 RTT/2 补偿单向网络延迟，并在两次采样间用 wall clock 外推。
   */
  addSample(serverTimeMs: number, timing?: ClockSampleTiming): void {
    const receivedAtMs = timing?.responseReceivedAtMs ?? Date.now();
    let estimatedServerNow = serverTimeMs;

    if (timing) {
      const rtt = timing.responseReceivedAtMs - timing.requestSentAtMs;
      if (rtt >= 0 && rtt <= MAX_RTT_MS) {
        // 响应里的 serverTime 对应服务端发出时刻，到达客户端约晚 RTT/2
        estimatedServerNow = serverTimeMs + rtt / 2;
        this.recordRtt(rtt);
      }
    }

    const offset = estimatedServerNow - receivedAtMs;
    this.offsetSamples.push(offset);
    if (this.offsetSamples.length > WINDOW) this.offsetSamples.shift();

    this.anchorServerMs = estimatedServerNow;
    this.anchorWallMs = receivedAtMs;
    this.hasAnchor = true;
  }

  /** 记录 API 往返耗时（用于出价提前量补偿） */
  recordRtt(rttMs: number): void {
    if (rttMs < 0 || rttMs > MAX_RTT_MS) return;
    this.rttSamples.push(rttMs);
    if (this.rttSamples.length > WINDOW) this.rttSamples.shift();
  }

  /** 最近 N 次 RTT 的算术平均；无样本时用默认值 */
  getEstimatedRttMs(): number {
    if (this.rttSamples.length === 0) return DEFAULT_ESTIMATED_RTT_MS;
    return Math.round(this.rttSamples.reduce((a, b) => a + b, 0) / this.rttSamples.length);
  }

  /** 最近 N 次偏移的算术平均（毫秒） */
  getOffset(): number {
    if (this.offsetSamples.length === 0) return 0;
    return Math.round(this.offsetSamples.reduce((a, b) => a + b, 0) / this.offsetSamples.length);
  }

  /** 校准后的当前服务器时间（wall clock 外推，降低采样间隔内的漂移） */
  serverNow(): number {
    if (!this.hasAnchor) return Date.now();
    return Math.round(this.anchorServerMs + (Date.now() - this.anchorWallMs));
  }
}
