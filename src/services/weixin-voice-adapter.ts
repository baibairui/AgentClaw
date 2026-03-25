import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../utils/logger.js';

interface PrepareWeixinVoiceMessageInput {
  localPath: string;
  content: Record<string, unknown>;
}

interface PrepareWeixinVoiceMessageResult {
  localPath: string;
  content: Record<string, unknown>;
}

const WEIXIN_SILK_SAMPLE_RATE = 24_000;
const log = createLogger('WeixinVoiceAdapter');

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

export async function prepareWeixinVoiceMessage(
  input: PrepareWeixinVoiceMessageInput,
): Promise<PrepareWeixinVoiceMessageResult> {
  const resolvedPath = path.resolve(input.localPath);
  const ext = path.extname(resolvedPath).toLowerCase();

  if (ext === '.silk' || ext === '.slk') {
    return {
      localPath: resolvedPath,
      content: {
        ...input.content,
        encode_type: 6,
        sample_rate: firstNumber(input.content.sample_rate) ?? WEIXIN_SILK_SAMPLE_RATE,
      },
    };
  }

  if (ext !== '.wav') {
    return {
      localPath: resolvedPath,
      content: input.content,
    };
  }

  const [{ encode }, source] = await Promise.all([
    import('silk-wasm'),
    fs.promises.readFile(resolvedPath),
  ]);
  const encoded = await encode(source, WEIXIN_SILK_SAMPLE_RATE);
  const targetPath = resolvedPath.replace(/\.wav$/i, '.silk');
  await fs.promises.writeFile(targetPath, Buffer.from(encoded.data));
  log.info('converted wav to silk for weixin', {
    sourcePath: resolvedPath,
    targetPath,
    durationMs: encoded.duration,
    sampleRate: WEIXIN_SILK_SAMPLE_RATE,
  });

  return {
    localPath: targetPath,
    content: {
      ...input.content,
      encode_type: 6,
      sample_rate: WEIXIN_SILK_SAMPLE_RATE,
      playtime: firstNumber(
        input.content.playtime,
        input.content.duration_ms,
      ) ?? encoded.duration,
    },
  };
}
