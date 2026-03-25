import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prepareWeixinVoiceMessage } from './weixin-voice-adapter.js';
import { createLogger } from '../utils/logger.js';

type WeixinMessageItem = {
  type?: number;
  text_item?: { text?: string };
  voice_item?: { text?: string };
};

interface WeixinOutgoingMessage {
  msgType: string;
  content: Record<string, unknown> | string;
}

export type WeixinInboundMessage = {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  item_list?: WeixinMessageItem[];
  context_token?: string;
};

const DEFAULT_WEIXIN_CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';
const WEIXIN_MESSAGE_TYPE_BOT = 2;
const WEIXIN_MESSAGE_STATE_FINISH = 2;
const WEIXIN_ITEM_TYPE_TEXT = 1;
const WEIXIN_ITEM_TYPE_IMAGE = 2;
const WEIXIN_ITEM_TYPE_VOICE = 3;
const WEIXIN_ITEM_TYPE_FILE = 4;
const WEIXIN_ITEM_TYPE_VIDEO = 5;
const WEIXIN_UPLOAD_MEDIA_TYPE_IMAGE = 1;
const WEIXIN_UPLOAD_MEDIA_TYPE_VIDEO = 2;
const WEIXIN_UPLOAD_MEDIA_TYPE_FILE = 3;
const WEIXIN_UPLOAD_MEDIA_TYPE_VOICE = 4;
const log = createLogger('WeixinApi');

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function splitWeixinOutboundText(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const segments = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  return segments.length > 0 ? segments : [normalized];
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function randomWechatUin(): string {
  const uint32 = randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf-8').toString('base64');
}

function buildClientId(): string {
  return `agentclaw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function aesEcbPaddedSize(plaintextSize: number): number {
  return Math.ceil((plaintextSize + 1) / 16) * 16;
}

function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

function buildWeixinCdnUploadUrl(uploadParam: string, fileKey: string): string {
  return `${DEFAULT_WEIXIN_CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(fileKey)}`;
}

function validateLocalPath(localPath: string): string {
  const resolved = path.resolve(localPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`weixin media path not found: ${resolved}`);
  }
  return resolved;
}

function inferWeixinVoiceEncodeType(localPath: string, content: Record<string, unknown>): number {
  const explicit = typeof content.encode_type === 'number' ? content.encode_type : undefined;
  if (explicit !== undefined) {
    return explicit;
  }
  const ext = path.extname(localPath).toLowerCase();
  if (ext === '.wav' || ext === '.pcm') {
    return 1;
  }
  if (ext === '.amr') {
    return 5;
  }
  if (ext === '.silk' || ext === '.slk') {
    return 6;
  }
  if (ext === '.mp3') {
    return 7;
  }
  if (ext === '.ogg') {
    return 8;
  }
  throw new Error(`unsupported weixin voice format: ${ext || '(missing extension)'}`);
}

export class WeixinApi {
  constructor(
    private readonly input: {
      baseUrl: string;
      botToken: string;
      timeoutMs: number;
    },
  ) {}

  async getUpdates(cursor: string): Promise<{ msgs: WeixinInboundMessage[]; get_updates_buf?: string }> {
    return this.post('ilink/bot/getupdates', {
      get_updates_buf: cursor,
      base_info: {},
    });
  }

  async getBotQrCode(botType = '3'): Promise<{ qrcode: string; qrcode_img_content: string }> {
    return this.get(`ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`);
  }

  async getQrCodeStatus(qrcode: string): Promise<{
    status: 'wait' | 'scaned' | 'confirmed' | 'expired';
    bot_token?: string;
    ilink_bot_id?: string;
    ilink_user_id?: string;
    baseurl?: string;
  }> {
    return this.get(`ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, {
      'iLink-App-ClientVersion': '1',
    });
  }

  async sendText(toUserId: string, text: string, contextToken: string): Promise<void> {
    await this.post('ilink/bot/sendmessage', {
      msg: {
        from_user_id: '',
        to_user_id: toUserId,
        client_id: buildClientId(),
        message_type: WEIXIN_MESSAGE_TYPE_BOT,
        message_state: WEIXIN_MESSAGE_STATE_FINISH,
        context_token: contextToken,
        item_list: [
          {
            type: WEIXIN_ITEM_TYPE_TEXT,
            text_item: { text },
          },
        ],
      },
      base_info: {},
    });
  }

  async sendMessage(toUserId: string, message: WeixinOutgoingMessage, contextToken: string): Promise<void> {
    const msgType = message.msgType.trim().toLowerCase();
    if (!msgType) {
      throw new Error('weixin send failed: msgType is required');
    }

    if (msgType === 'text') {
      const text = typeof message.content === 'string'
        ? message.content
        : firstString((message.content as Record<string, unknown>).text, (message.content as Record<string, unknown>).content) ?? '';
      await this.sendText(toUserId, text, contextToken);
      return;
    }

    const item = await this.resolveMessageItem(msgType, message.content, toUserId);
    const payload = {
      msg: {
        from_user_id: '',
        to_user_id: toUserId,
        client_id: buildClientId(),
        message_type: WEIXIN_MESSAGE_TYPE_BOT,
        message_state: WEIXIN_MESSAGE_STATE_FINISH,
        context_token: contextToken,
        item_list: [item],
      },
      base_info: {},
    };
    log.info('sending weixin structured message', {
      toUserId,
      msgType,
      itemType: typeof item.type === 'number' ? item.type : undefined,
      hasContextToken: Boolean(contextToken),
    });
    const response = await this.post('ilink/bot/sendmessage', payload);
    log.info('weixin structured message sent', {
      toUserId,
      msgType,
      response,
    });
  }

  async post(endpoint: string, body: unknown): Promise<any> {
    const response = await fetch(new URL(endpoint, ensureTrailingSlash(this.input.baseUrl)), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        AuthorizationType: 'ilink_bot_token',
        Authorization: `Bearer ${this.input.botToken}`,
        'X-WECHAT-UIN': randomWechatUin(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.input.timeoutMs),
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`weixin api ${response.status}: ${raw}`);
    }
    return raw ? JSON.parse(raw) : {};
  }

  private async get(endpoint: string, headers: Record<string, string> = {}): Promise<any> {
    const response = await fetch(new URL(endpoint, ensureTrailingSlash(this.input.baseUrl)), {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(this.input.timeoutMs),
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`weixin api ${response.status}: ${raw}`);
    }
    return raw ? JSON.parse(raw) : {};
  }

  private async resolveMessageItem(
    msgType: string,
    content: WeixinOutgoingMessage['content'],
    toUserId: string,
  ): Promise<Record<string, unknown>> {
    if (typeof content !== 'object' || !content || Array.isArray(content)) {
      throw new Error(`weixin send failed: ${msgType} content must be an object`);
    }

    if (msgType === 'image') {
      const localPath = firstString(content.local_image_path, content.local_file_path);
      if (!localPath) {
        return { type: WEIXIN_ITEM_TYPE_IMAGE, image_item: content };
      }
      const uploaded = await this.uploadLocalMedia(localPath, WEIXIN_UPLOAD_MEDIA_TYPE_IMAGE, toUserId);
      return {
        type: WEIXIN_ITEM_TYPE_IMAGE,
        image_item: {
          media: uploaded.media,
          mid_size: uploaded.fileSizeCiphertext,
        },
      };
    }

    if (msgType === 'voice') {
      const localPath = firstString(content.local_audio_path, content.local_file_path);
      if (!localPath) {
        return { type: WEIXIN_ITEM_TYPE_VOICE, voice_item: content };
      }
      const prepared = await prepareWeixinVoiceMessage({
        localPath,
        content,
      });
      const resolvedPath = validateLocalPath(prepared.localPath);
      log.info('prepared weixin voice payload', {
        originalPath: path.resolve(localPath),
        preparedPath: resolvedPath,
        encodeType: prepared.content.encode_type,
        sampleRate: prepared.content.sample_rate,
        playtime: prepared.content.playtime ?? prepared.content.duration_ms,
      });
      const uploaded = await this.uploadLocalMedia(resolvedPath, WEIXIN_UPLOAD_MEDIA_TYPE_VOICE, toUserId);
      return {
        type: WEIXIN_ITEM_TYPE_VOICE,
        voice_item: {
          media: uploaded.media,
          encode_type: inferWeixinVoiceEncodeType(resolvedPath, prepared.content),
          bits_per_sample: typeof prepared.content.bits_per_sample === 'number' ? prepared.content.bits_per_sample : undefined,
          sample_rate: typeof prepared.content.sample_rate === 'number' ? prepared.content.sample_rate : undefined,
          playtime: typeof prepared.content.playtime === 'number'
            ? prepared.content.playtime
            : typeof prepared.content.duration_ms === 'number'
            ? prepared.content.duration_ms
            : undefined,
          text: typeof prepared.content.text === 'string' ? prepared.content.text : undefined,
        },
      };
    }

    if (msgType === 'video') {
      const localPath = firstString(content.local_media_path, content.local_file_path);
      if (!localPath) {
        return { type: WEIXIN_ITEM_TYPE_VIDEO, video_item: content };
      }
      const uploaded = await this.uploadLocalMedia(localPath, WEIXIN_UPLOAD_MEDIA_TYPE_VIDEO, toUserId);
      return {
        type: WEIXIN_ITEM_TYPE_VIDEO,
        video_item: {
          media: uploaded.media,
          video_size: uploaded.fileSizeCiphertext,
          play_length: typeof content.play_length === 'number' ? content.play_length : undefined,
        },
      };
    }

    if (msgType === 'file') {
      const localPath = firstString(content.local_file_path, content.local_media_path, content.local_audio_path);
      if (!localPath) {
        return { type: WEIXIN_ITEM_TYPE_FILE, file_item: content };
      }
      const resolvedPath = validateLocalPath(localPath);
      const uploaded = await this.uploadLocalMedia(resolvedPath, WEIXIN_UPLOAD_MEDIA_TYPE_FILE, toUserId);
      return {
        type: WEIXIN_ITEM_TYPE_FILE,
        file_item: {
          media: uploaded.media,
          file_name: path.basename(resolvedPath),
          len: String(uploaded.fileSize),
        },
      };
    }

    throw new Error(`weixin send failed: unsupported msgType ${msgType}`);
  }

  private async uploadLocalMedia(localPath: string, mediaType: number, toUserId: string): Promise<{
    media: {
      encrypt_query_param: string;
      aes_key: string;
      encrypt_type: 1;
    };
    fileSize: number;
    fileSizeCiphertext: number;
  }> {
    const resolvedPath = validateLocalPath(localPath);
    const plaintext = await fs.promises.readFile(resolvedPath);
    const fileSize = plaintext.length;
    const fileSizeCiphertext = aesEcbPaddedSize(fileSize);
    const fileKey = randomBytes(16).toString('hex');
    const aesKey = randomBytes(16);
    const uploadUrlResp = await this.post('ilink/bot/getuploadurl', {
      filekey: fileKey,
      media_type: mediaType,
      to_user_id: toUserId,
      rawsize: fileSize,
      rawfilemd5: createHash('md5').update(plaintext).digest('hex'),
      filesize: fileSizeCiphertext,
      no_need_thumb: true,
      aeskey: aesKey.toString('hex'),
      base_info: {},
    });
    log.info('weixin media upload url prepared', {
      toUserId,
      mediaType,
      localPath: resolvedPath,
      fileSize,
      fileSizeCiphertext,
      hasUploadParam: typeof uploadUrlResp.upload_param === 'string' && uploadUrlResp.upload_param.trim().length > 0,
    });
    const uploadParam = typeof uploadUrlResp.upload_param === 'string' ? uploadUrlResp.upload_param.trim() : '';
    if (!uploadParam) {
      throw new Error('weixin upload failed: missing upload_param');
    }

    const response = await fetch(buildWeixinCdnUploadUrl(uploadParam, fileKey), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(encryptAesEcb(plaintext, aesKey)),
      signal: AbortSignal.timeout(this.input.timeoutMs),
    });
    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      throw new Error(`weixin cdn upload failed: ${response.status} ${raw}`);
    }
    const downloadParam = response.headers.get('x-encrypted-param')?.trim();
    if (!downloadParam) {
      throw new Error('weixin cdn upload failed: missing x-encrypted-param');
    }
    log.info('weixin media upload finished', {
      toUserId,
      mediaType,
      localPath: resolvedPath,
      fileSize,
      hasDownloadParam: true,
    });
    return {
      media: {
        encrypt_query_param: downloadParam,
        aes_key: aesKey.toString('base64'),
        encrypt_type: 1,
      },
      fileSize,
      fileSizeCiphertext,
    };
  }
}
