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

function pickApiMessage(
  root: Record<string, unknown>,
  result?: Record<string, unknown>,
): string {
  const msg = root.message ?? root.msg ?? result?.message ?? result?.msg ?? root.echo;
  return msg != null ? String(msg) : '未知错误';
}

/** 解析 offerPrice 响应：成功时 result.code=200、message=出价成功 */
export function parseOfferPriceResponse(json: unknown): {
  success: boolean;
  message: string;
} {
  const root = json as Record<string, unknown>;
  const result = root.result as Record<string, unknown> | undefined;
  const message = pickApiMessage(root, result);

  const rootOk = root.code === 0 || root.code === '0';
  const innerCode = result?.code ?? root.code;
  const innerOk = innerCode === 200 || innerCode === '200';

  // 典型成功：{"code":0,"result":{"code":200,"message":"出价成功","data":null}}
  const success = rootOk && innerOk;
  return {
    success,
    message: message || (success ? '出价成功' : '出价失败'),
  };
}
