import { describe, expect, it, vi } from 'vitest';

import { createWeixinLoginSession } from '../src/services/weixin-login-flow.js';

describe('createWeixinLoginSession', () => {
  it('keeps waiting when a poll request times out and eventually returns the confirmed session', async () => {
    const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const sleep = vi.fn(async () => undefined);
    const onWarning = vi.fn();
    const onStatus = vi.fn();
    const getQrCodeStatus = vi
      .fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce({ status: 'wait' })
      .mockResolvedValueOnce({
        status: 'confirmed',
        bot_token: 'bot-token',
        ilink_bot_id: 'bot-id',
        ilink_user_id: 'user-id',
        baseurl: 'https://wx.example.com',
      });

    const session = await createWeixinLoginSession({
      api: {
        getBotQrCode: vi.fn(async () => ({
          qrcode: 'qr-code',
          qrcode_img_content: 'https://liteapp.weixin.qq.com/q/example',
        })),
        getQrCodeStatus,
      },
      baseUrl: 'https://ilinkai.weixin.qq.com',
      sleep,
      onWarning,
      onStatus,
      now: () => new Date('2026-03-22T09:26:03.331Z').getTime(),
    });

    expect(session).toEqual({
      baseUrl: 'https://wx.example.com',
      botToken: 'bot-token',
      accountId: 'bot-id',
      userId: 'user-id',
      savedAt: '2026-03-22T09:26:03.331Z',
    });
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith('https://liteapp.weixin.qq.com/q/example');
    expect(getQrCodeStatus).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalled();
  });
});
