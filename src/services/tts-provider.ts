export interface TTSProvider {
  synthesize(input: { text: string }): Promise<{
    audio: Buffer;
    format: 'mp3' | 'wav' | 'flac';
    durationMs?: number;
  }>;
}
