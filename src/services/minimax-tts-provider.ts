import type { TTSProvider } from './tts-provider.js';

interface MiniMaxTtsProviderInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  voiceId: string;
  outputFormat: 'mp3' | 'wav' | 'flac';
  audio: {
    sampleRate: number;
    bitrate: number;
    channel: number;
  };
  voice: {
    speed: number;
    vol: number;
    pitch: number;
  };
  timeoutMs: number;
}

export class MiniMaxTtsProvider implements TTSProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly voiceId: string;
  private readonly outputFormat: 'mp3' | 'wav' | 'flac';
  private readonly audio: MiniMaxTtsProviderInput['audio'];
  private readonly voice: MiniMaxTtsProviderInput['voice'];
  private readonly timeoutMs: number;

  constructor(input: MiniMaxTtsProviderInput) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, '');
    this.apiKey = input.apiKey;
    this.model = input.model;
    this.voiceId = input.voiceId;
    this.outputFormat = input.outputFormat;
    this.audio = input.audio;
    this.voice = input.voice;
    this.timeoutMs = input.timeoutMs;
  }

  async synthesize(input: { text: string }): Promise<{
    audio: Buffer;
    format: 'mp3' | 'wav' | 'flac';
    durationMs?: number;
  }> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/v1/t2a_v2`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        text: input.text,
        stream: false,
        output_format: 'hex',
        voice_setting: {
          voice_id: this.voiceId,
          speed: this.voice.speed,
          vol: this.voice.vol,
          pitch: this.voice.pitch,
        },
        audio_setting: {
          sample_rate: this.audio.sampleRate,
          bitrate: this.audio.bitrate,
          format: this.outputFormat,
          channel: this.audio.channel,
        },
      }),
    });
    const body = await response.json() as {
      data?: {
        audio?: string;
      };
      extra_info?: {
        audio_length?: number;
      };
      base_resp?: {
        status_code?: number;
        status_msg?: string;
      };
    };
    const statusCode = body.base_resp?.status_code ?? (response.ok ? 0 : response.status);
    if (!response.ok || statusCode !== 0 || !body.data?.audio) {
      throw new Error(`speech tts failed: ${response.status} ${statusCode} ${body.base_resp?.status_msg ?? 'unknown'}`);
    }
    return {
      audio: Buffer.from(body.data.audio, 'hex'),
      format: this.outputFormat,
      durationMs: body.extra_info?.audio_length,
    };
  }

  private async fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
