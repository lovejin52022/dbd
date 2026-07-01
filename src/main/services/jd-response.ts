/** 加入列表等业务错误 */
export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestError';
  }
}

/** 校验京东 API 响应是否成功（兼容 code 在根节点或 result 内） */
export function assertJdApiOk(json: unknown, apiName: string): void {
  const root = json as Record<string, unknown>;
  const result = root.result as Record<string, unknown> | undefined;
  const code = root.code ?? result?.code ?? root.errCode ?? result?.errCode;
  const success = root.success ?? result?.success;

  if (success === false) {
    const msg = pickApiMessage(root, result);
    throw new IngestError(`${apiName} 失败: ${msg}`);
  }

  if (code == null) return;

  const codeStr = String(code);
  if (codeStr !== '0' && code !== 0 && codeStr !== '200') {
    const msg = pickApiMessage(root, result);
    throw new IngestError(`${apiName} 失败: ${msg} (code=${codeStr})`);
  }
}

const API_MESSAGE_KEYS = [
  'message',
  'msg',
  'errMsg',
  'errorMsg',
  'errorMessage',
  'desc',
  'reason',
  'error',
  'echo',
] as const;

/** 从 API 响应对象中提取首条非空文案 */
function pickFirstApiMessage(
  ...objects: (Record<string, unknown> | undefined)[]
): string {
  for (const obj of objects) {
    if (!obj) continue;
    for (const key of API_MESSAGE_KEYS) {
      const val = obj[key];
      if (val != null && String(val).trim()) return String(val).trim();
    }
  }
  return '';
}

function pickApiMessage(
  root: Record<string, unknown>,
  result?: Record<string, unknown>,
): string {
  return pickFirstApiMessage(root, result) || '未知错误';
}

/** 业务失败时补全 code，避免只显示「出价失败」 */
function formatOfferFailureMessage(message: string, code: unknown): string {
  const codeStr = code != null ? String(code) : '';
  const isSuccessCode =
    codeStr === '0' || codeStr === '200' || code === 0 || code === 200;
  if (!message || message === '出价失败' || message === '未知错误') {
    return codeStr && !isSuccessCode ? `出价失败 (code=${codeStr})` : message || '出价失败';
  }
  if (codeStr && !isSuccessCode && !message.includes('code=')) {
    return `${message} (code=${codeStr})`;
  }
  return message;
}

/** 解析 offerPrice 响应：成功时 result.code=200、message=出价成功 */
export function parseOfferPriceResponse(json: unknown): {
  success: boolean;
  message: string;
} {
  const root = json as Record<string, unknown>;
  const result = root.result as Record<string, unknown> | undefined;
  const data =
    result?.data && typeof result.data === 'object'
      ? (result.data as Record<string, unknown>)
      : undefined;

  const rootOk = root.code === 0 || root.code === '0';
  const innerCode = result?.code ?? root.code ?? root.errCode ?? result?.errCode;
  const innerOk = innerCode === 200 || innerCode === '200';
  const explicitFail = root.success === false || result?.success === false;

  // 典型成功：{"code":0,"result":{"code":200,"message":"出价成功","data":null}}
  const success = !explicitFail && rootOk && innerOk;
  const rawMessage = pickFirstApiMessage(root, result, data);

  if (success) {
    return { success: true, message: rawMessage || '出价成功' };
  }

  return {
    success: false,
    message: formatOfferFailureMessage(rawMessage, innerCode ?? root.code ?? root.errCode),
  };
}
