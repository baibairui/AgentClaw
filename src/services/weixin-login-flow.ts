import type { WeixinApi } from './weixin-api.js';

export type WeixinLoginSession = {
  baseUrl: string;
  botToken: string;
  accountId: string;
  userId: string;
  savedAt: string;
};

type WeixinQrStatus = Awaited<ReturnType<WeixinApi['getQrCodeStatus']>>;

export async function createWeixinLoginSession(input: {
  api: Pick<WeixinApi, 'getBotQrCode' | 'getQrCodeStatus'>;
  baseUrl: string;
  botType?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onStatus?: (message: string) => void;
  onWarning?: (message: string) => void;
}): Promise<WeixinLoginSession> {
  const timeoutMs = input.timeoutMs ?? 480000;
  const pollIntervalMs = input.pollIntervalMs ?? 1000;
  const now = input.now ?? Date.now;
  const sleep = input.sleep ?? defaultSleep;

  const qr = await input.api.getBotQrCode(input.botType ?? '3');
  if (!qr?.qrcode || !qr?.qrcode_img_content) {
    throw new Error('failed to get qrcode');
  }

  input.onStatus?.(qr.qrcode_img_content);

  const startedAt = now();
  let hasAnnouncedScan = false;
  for (;;) {
    if (now() - startedAt > timeoutMs) {
      throw new Error('Login timed out.');
    }

    let status: WeixinQrStatus;
    try {
      status = await input.api.getQrCodeStatus(qr.qrcode);
    } catch (error) {
      if (!isRetriableLoginPollError(error)) {
        throw error;
      }
      input.onWarning?.(`poll warning: ${formatErrorMessage(error)}`);
      await sleep(pollIntervalMs);
      continue;
    }

    if (status.status === 'wait') {
      await sleep(pollIntervalMs);
      continue;
    }
    if (status.status === 'scaned') {
      if (!hasAnnouncedScan) {
        input.onStatus?.('Scanned. Confirm on your phone...');
        hasAnnouncedScan = true;
      }
      await sleep(pollIntervalMs);
      continue;
    }
    if (status.status === 'confirmed' && status.bot_token) {
      return {
        baseUrl: status.baseurl || input.baseUrl,
        botToken: status.bot_token,
        accountId: status.ilink_bot_id || '',
        userId: status.ilink_user_id || '',
        savedAt: new Date(now()).toISOString(),
      };
    }
    if (status.status === 'expired') {
      throw new Error('QR code expired.');
    }
    throw new Error(`Unexpected login status: ${JSON.stringify(status)}`);
  }
}

function isRetriableLoginPollError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return true;
  }
  const message = formatErrorMessage(error);
  return /timeout/i.test(message) || /aborted/i.test(message) || /fetch failed/i.test(message);
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
