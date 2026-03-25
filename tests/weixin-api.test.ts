import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/weixin-voice-adapter.js', () => ({
  prepareWeixinVoiceMessage: vi.fn(async (input: {
    localPath: string;
    content: Record<string, unknown>;
  }) => {
    if (!input.localPath.endsWith('.wav')) {
      return {
        localPath: input.localPath,
        content: input.content,
      };
    }
    return {
      localPath: input.localPath.replace(/\.wav$/i, '.silk'),
      content: {
        ...input.content,
        encode_type: 6,
        sample_rate: 24000,
        playtime: 1800,
      },
    };
  }),
}));

import { WeixinApi, splitWeixinOutboundText } from '../src/services/weixin-api.js';
import { prepareWeixinVoiceMessage } from '../src/services/weixin-voice-adapter.js';

describe('splitWeixinOutboundText', () => {
  it('keeps a single message unchanged', () => {
    expect(splitWeixinOutboundText('默认助手 ·\n开始处理。')).toEqual([
      '默认助手 ·\n开始处理。',
    ]);
  });

  it('splits multiple message blocks by blank lines', () => {
    expect(splitWeixinOutboundText('第一条消息\n继续说明\n\n第二条消息\n\n第三条消息')).toEqual([
      '第一条消息\n继续说明',
      '第二条消息',
      '第三条消息',
    ]);
  });

  it('ignores surrounding blank lines and empty blocks', () => {
    expect(splitWeixinOutboundText('\n\n第一条消息\n\n\n第二条消息\n\n')).toEqual([
      '第一条消息',
      '第二条消息',
    ]);
  });
});

describe('WeixinApi sendMessage', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uploads local voice before sending a voice message', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-upload-voice-'));
    const localAudioPath = path.join(tempDir, 'sample.mp3');
    fs.writeFileSync(localAudioPath, Buffer.from('fake-audio'));

    const seenUrls: string[] = [];
    const sendBodies: Array<Record<string, unknown>> = [];

    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      seenUrls.push(url);

      if (url.includes('/ilink/bot/getuploadurl')) {
        return new Response(JSON.stringify({
          upload_param: 'upload-token-1',
        }), { status: 200 });
      }

      if (url.includes('https://novac2c.cdn.weixin.qq.com/c2c/upload')) {
        return new Response('', {
          status: 200,
          headers: {
            'x-encrypted-param': 'download-token-1',
          },
        });
      }

      if (url.includes('/ilink/bot/sendmessage')) {
        sendBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return new Response('{}', { status: 200 });
      }

      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const api = new WeixinApi({
      baseUrl: 'https://ilinkai.weixin.qq.com',
      botToken: 'bot-token',
      timeoutMs: 2000,
    });

    await api.sendMessage('wx_u1', {
      msgType: 'voice',
      content: {
        local_audio_path: localAudioPath,
        duration_ms: 1500,
      },
    }, 'context-1');

    expect(seenUrls.some((url) => url.includes('/ilink/bot/getuploadurl'))).toBe(true);
    expect(seenUrls.some((url) => url.includes('https://novac2c.cdn.weixin.qq.com/c2c/upload'))).toBe(true);
    expect(sendBodies).toHaveLength(1);
    expect(sendBodies[0]).toMatchObject({
      msg: {
        to_user_id: 'wx_u1',
        message_type: 2,
        message_state: 2,
        context_token: 'context-1',
        item_list: [
          {
            type: 3,
            voice_item: {
              encode_type: 7,
              playtime: 1500,
              media: {
                encrypt_query_param: 'download-token-1',
                encrypt_type: 1,
              },
            },
          },
        ],
      },
    });
  });

  it('normalizes wav voice to silk metadata before sending', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-upload-voice-wav-'));
    const localAudioPath = path.join(tempDir, 'sample.wav');
    const normalizedPath = path.join(tempDir, 'sample.silk');
    fs.writeFileSync(localAudioPath, Buffer.from('fake-wav'));
    fs.writeFileSync(normalizedPath, Buffer.from('fake-silk'));

    const sendBodies: Array<Record<string, unknown>> = [];

    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/ilink/bot/getuploadurl')) {
        return new Response(JSON.stringify({
          upload_param: 'upload-token-wav',
        }), { status: 200 });
      }

      if (url.includes('https://novac2c.cdn.weixin.qq.com/c2c/upload')) {
        return new Response('', {
          status: 200,
          headers: {
            'x-encrypted-param': 'download-token-wav',
          },
        });
      }

      if (url.includes('/ilink/bot/sendmessage')) {
        sendBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return new Response('{}', { status: 200 });
      }

      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const api = new WeixinApi({
      baseUrl: 'https://ilinkai.weixin.qq.com',
      botToken: 'bot-token',
      timeoutMs: 2000,
    });

    await api.sendMessage('wx_u2', {
      msgType: 'voice',
      content: {
        local_audio_path: localAudioPath,
      },
    }, 'context-wav');

    expect(prepareWeixinVoiceMessage).toHaveBeenCalledWith({
      localPath: localAudioPath,
      content: {
        local_audio_path: localAudioPath,
      },
    });
    expect(sendBodies).toHaveLength(1);
    expect(sendBodies[0]).toMatchObject({
      msg: {
        to_user_id: 'wx_u2',
        context_token: 'context-wav',
        item_list: [
          {
            type: 3,
            voice_item: {
              encode_type: 6,
              sample_rate: 24000,
              playtime: 1800,
              media: {
                encrypt_query_param: 'download-token-wav',
                encrypt_type: 1,
              },
            },
          },
        ],
      },
    });
  });

  it('uploads local image before sending an image message', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-upload-image-'));
    const localImagePath = path.join(tempDir, 'sample.png');
    fs.writeFileSync(localImagePath, Buffer.from('fake-image'));

    const sendBodies: Array<Record<string, unknown>> = [];

    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/ilink/bot/getuploadurl')) {
        return new Response(JSON.stringify({
          upload_param: 'upload-token-2',
        }), { status: 200 });
      }

      if (url.includes('https://novac2c.cdn.weixin.qq.com/c2c/upload')) {
        return new Response('', {
          status: 200,
          headers: {
            'x-encrypted-param': 'download-token-2',
          },
        });
      }

      if (url.includes('/ilink/bot/sendmessage')) {
        sendBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return new Response('{}', { status: 200 });
      }

      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const api = new WeixinApi({
      baseUrl: 'https://ilinkai.weixin.qq.com',
      botToken: 'bot-token',
      timeoutMs: 2000,
    });

    await api.sendMessage('wx_u1', {
      msgType: 'image',
      content: {
        local_image_path: localImagePath,
      },
    }, 'context-2');

    expect(sendBodies).toHaveLength(1);
    expect(sendBodies[0]).toMatchObject({
      msg: {
        to_user_id: 'wx_u1',
        item_list: [
          {
            type: 2,
            image_item: {
              media: {
                encrypt_query_param: 'download-token-2',
                encrypt_type: 1,
              },
            },
          },
        ],
      },
    });
  });
});
