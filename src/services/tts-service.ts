import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { TTSProvider } from './tts-provider.js';

export class TtsService {
  constructor(private readonly provider: TTSProvider) {}

  async synthesize(input: {
    text: string;
    workspaceDir: string;
  }): Promise<{
    filePath: string;
    mimeType: string;
    format: 'mp3' | 'wav' | 'flac';
  }> {
    const result = await this.provider.synthesize({ text: input.text });
    const dir = path.join(input.workspaceDir, '.gateway', 'tts');
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${Date.now()}-${randomUUID()}.${result.format}`);
    await fs.promises.writeFile(filePath, result.audio);
    return {
      filePath,
      mimeType: result.format === 'mp3' ? 'audio/mpeg' : result.format === 'wav' ? 'audio/wav' : 'audio/flac',
      format: result.format,
    };
  }
}
