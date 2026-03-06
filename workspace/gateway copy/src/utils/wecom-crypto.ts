/**
 * 企业微信安全模式：消息签名验证 + AES-256-CBC 加解密
 *
 * 参考文档：https://developer.work.weixin.qq.com/document/path/90968
 */
import crypto from 'node:crypto';

export interface WeComCryptoOptions {
    token: string;
    encodingAesKey: string;
    corpId: string;
}

export class WeComCrypto {
    private readonly token: string;
    private readonly corpId: string;
    private readonly aesKey: Buffer;
    private readonly iv: Buffer;

    constructor(options: WeComCryptoOptions) {
        this.token = options.token;
        this.corpId = options.corpId;

        // EncodingAESKey 是 Base64 编码的 AES Key，长度 43，末尾补 '=' 后 base64 decode 得到 32 字节
        this.aesKey = Buffer.from(options.encodingAesKey + '=', 'base64');
        if (this.aesKey.length !== 32) {
            throw new Error(`invalid EncodingAESKey: decoded length is ${this.aesKey.length}, expected 32`);
        }
        // IV 取 AES Key 前 16 字节
        this.iv = this.aesKey.subarray(0, 16);
    }

    /**
     * 验证签名
     */
    verifySignature(signature: string, timestamp: string, nonce: string, encrypt: string): boolean {
        const computed = this.computeSignature(timestamp, nonce, encrypt);
        return crypto.timingSafeEqual(Buffer.from(computed, 'utf8'), Buffer.from(signature, 'utf8'));
    }

    /**
     * 计算签名：sha1(sort([token, timestamp, nonce, encrypt]))
     */
    private computeSignature(timestamp: string, nonce: string, encrypt: string): string {
        const items = [this.token, timestamp, nonce, encrypt].sort();
        return crypto.createHash('sha1').update(items.join('')).digest('hex');
    }

    /**
     * 解密消息
     * 返回解密后的明文 XML
     */
    decrypt(encrypt: string): string {
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.aesKey, this.iv);
        decipher.setAutoPadding(false);

        const deciphered = Buffer.concat([
            decipher.update(encrypt, 'base64'),
            decipher.final(),
        ]);

        // PKCS#7 去除填充
        const padLen = deciphered[deciphered.length - 1];
        const unpadded = deciphered.subarray(0, deciphered.length - padLen);

        // 格式：random(16) + msgLen(4, big-endian) + msg + receiveid
        const msgLen = unpadded.readUInt32BE(16);
        const msg = unpadded.subarray(20, 20 + msgLen).toString('utf8');
        const receiveid = unpadded.subarray(20 + msgLen).toString('utf8');

        if (receiveid !== this.corpId) {
            throw new Error(`receiveid mismatch: expected ${this.corpId}, got ${receiveid}`);
        }

        return msg;
    }

    /**
     * 加密消息（用于加密回复——备用）
     */
    encrypt(plaintext: string): string {
        const random = crypto.randomBytes(16);
        const msgBuf = Buffer.from(plaintext, 'utf8');
        const msgLenBuf = Buffer.alloc(4);
        msgLenBuf.writeUInt32BE(msgBuf.length, 0);
        const corpIdBuf = Buffer.from(this.corpId, 'utf8');

        const rawBuf = Buffer.concat([random, msgLenBuf, msgBuf, corpIdBuf]);

        // PKCS#7 填充到 32 字节的倍数
        const blockSize = 32;
        const padLen = blockSize - (rawBuf.length % blockSize);
        const padBuf = Buffer.alloc(padLen, padLen);
        const padded = Buffer.concat([rawBuf, padBuf]);

        const cipher = crypto.createCipheriv('aes-256-cbc', this.aesKey, this.iv);
        cipher.setAutoPadding(false);
        const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
        return encrypted.toString('base64');
    }

    /**
     * 生成加密后的回复 XML（备用）
     */
    buildEncryptedReplyXml(replyMsg: string, timestamp: string, nonce: string): string {
        const encryptedMsg = this.encrypt(replyMsg);
        const signature = this.computeSignature(timestamp, nonce, encryptedMsg);

        return [
            '<xml>',
            `<Encrypt><![CDATA[${encryptedMsg}]]></Encrypt>`,
            `<MsgSignature><![CDATA[${signature}]]></MsgSignature>`,
            `<TimeStamp>${timestamp}</TimeStamp>`,
            `<Nonce><![CDATA[${nonce}]]></Nonce>`,
            '</xml>',
        ].join('\n');
    }
}
