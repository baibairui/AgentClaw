import { afterEach, describe, expect, it, vi } from 'vitest';

import { MiniMaxTtsProvider } from '../src/services/minimax-tts-provider.js';

describe('MiniMaxTtsProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('posts the configured HTTP TTS request and decodes hex audio', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.minimax.io/v1/t2a_v2');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'speech-2.8-hd',
        text: '你好，世界',
        stream: false,
        output_format: 'hex',
        voice_setting: {
          voice_id: 'voice_123',
          speed: 1,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
      });
      return new Response(JSON.stringify({
        data: {
          audio: '68656c6c6f',
          status: 2,
        },
        extra_info: {
          audio_format: 'mp3',
          audio_length: 1200,
        },
        base_resp: {
          status_code: 0,
          status_msg: 'success',
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MiniMaxTtsProvider({
      baseUrl: 'https://api.minimax.io',
      apiKey: 'secret',
      model: 'speech-2.8-hd',
      voiceId: 'voice_123',
      outputFormat: 'mp3',
      audio: {
        sampleRate: 32000,
        bitrate: 128000,
        channel: 1,
      },
      voice: {
        speed: 1,
        vol: 1,
        pitch: 0,
      },
      timeoutMs: 5000,
    });

    const result = await provider.synthesize({ text: '你好，世界' });

    expect(result).toEqual({
      audio: Buffer.from('hello'),
      format: 'mp3',
      durationMs: 1200,
    });
  });

  it('throws when upstream returns an error response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      base_resp: {
        status_code: 1004,
        status_msg: 'bad request',
      },
    }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })));

    const provider = new MiniMaxTtsProvider({
      baseUrl: 'https://api.minimax.io',
      apiKey: 'secret',
      model: 'speech-2.8-hd',
      voiceId: 'voice_123',
      outputFormat: 'mp3',
      audio: {
        sampleRate: 32000,
        bitrate: 128000,
        channel: 1,
      },
      voice: {
        speed: 1,
        vol: 1,
        pitch: 0,
      },
      timeoutMs: 5000,
    });

    await expect(provider.synthesize({ text: '你好，世界' })).rejects.toThrow(/speech tts failed: 400 1004/i);
  });
});
