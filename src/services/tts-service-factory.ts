import { MiniMaxTtsProvider } from './minimax-tts-provider.js';
import { TtsService } from './tts-service.js';

interface TtsConfigLike {
  enabled: boolean;
  provider: string;
  baseUrl?: string;
  apiKeyEnv: string;
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
}

export function createTtsService(input: {
  tts: TtsConfigLike;
  apiTimeoutMs: number;
}): TtsService | undefined {
  if (!input.tts.enabled) {
    return undefined;
  }
  if (input.tts.provider !== 'minimax') {
    throw new Error(`unsupported tts provider: ${input.tts.provider}`);
  }
  const apiKey = process.env[input.tts.apiKeyEnv]?.trim();
  if (!apiKey) {
    throw new Error(`missing tts api key env: ${input.tts.apiKeyEnv}`);
  }
  return new TtsService(new MiniMaxTtsProvider({
    baseUrl: input.tts.baseUrl ?? 'https://api.minimax.io',
    apiKey,
    model: input.tts.model,
    voiceId: input.tts.voiceId,
    outputFormat: input.tts.outputFormat,
    audio: input.tts.audio,
    voice: input.tts.voice,
    timeoutMs: input.apiTimeoutMs,
  }));
}
