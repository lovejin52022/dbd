/** 调度阶段中文（侧栏展示） */
export const SCHEDULER_PHASE_LABELS: Record<string, string> = {
  idle: '等待调度',
  slow_poll: '慢轮询(60s)',
  fast_poll: '快轮询(≤10s)',
  firing: '正在出价',
  done: '调度结束',
};

/** 结合生命周期生成调度状态文案 */
export function describeSchedulerStatus(
  lifecycle: string,
  phase: string,
  dataIncomplete: number,
): string {
  if (dataIncomplete) return '数据不完整，未调度';
  if (lifecycle === 'expired') return '已过期，调度停止';
  if (lifecycle === 'not_started' && phase === 'idle') return '等待开始时间';
  return SCHEDULER_PHASE_LABELS[phase] ?? phase;
}
