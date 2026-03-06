import express from 'express';

import { WeComCrypto } from './utils/wecom-crypto.js';
import { parseWeComXml } from './utils/wecom-xml.js';

interface AppDeps {
  wecomCrypto: WeComCrypto;
  /**
   * 处理文本消息，业务回复统一走主动发消息 API，无需返回值。
   * 该函数被 fire-and-forget 调用，不阻塞回调响应。
   */
  handleText: (input: { userId: string; content: string }) => Promise<void>;
}

/**
 * 从 query 中安全提取 string 类型参数
 */
function qs(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

export function createApp(deps: AppDeps) {
  const app = express();

  // 接收原始 body（XML 密文）
  app.use(express.text({ type: '*/*' }));

  // ========================= 健康检查 =========================
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  // ===================== GET 验证 URL =====================
  // 企业微信在配置回调 URL 时发 GET 请求验证：
  //   ?msg_signature=xxx&timestamp=xxx&nonce=xxx&echostr=xxx
  // 验签 + 解密 echostr，返回明文
  app.get('/wecom/callback', (req, res) => {
    const msgSignature = qs(req.query.msg_signature);
    const timestamp = qs(req.query.timestamp);
    const nonce = qs(req.query.nonce);
    const echostr = qs(req.query.echostr);

    if (!msgSignature || !timestamp || !nonce || !echostr) {
      console.warn('[GET /wecom/callback] missing query params');
      res.status(400).type('text/plain').send('missing params');
      return;
    }

    // 验签
    if (!deps.wecomCrypto.verifySignature(msgSignature, timestamp, nonce, echostr)) {
      console.warn('[GET /wecom/callback] signature mismatch');
      res.status(403).type('text/plain').send('signature mismatch');
      return;
    }

    // 解密 echostr
    try {
      const plainEchostr = deps.wecomCrypto.decrypt(echostr);
      res.type('text/plain').send(plainEchostr);
    } catch (err) {
      console.error('[GET /wecom/callback] decrypt echostr failed:', err);
      res.status(500).type('text/plain').send('decrypt error');
    }
  });

  // ==================== POST 接收消息 ====================
  // 安全模式：验签 + 解密 → 解析明文 XML → 立即返回 "success"
  // 业务回复统一走主动发消息 API (fire-and-forget)
  app.post('/wecom/callback', async (req, res) => {
    const msgSignature = qs(req.query.msg_signature);
    const timestamp = qs(req.query.timestamp);
    const nonce = qs(req.query.nonce);

    try {
      const rawBody = typeof req.body === 'string' ? req.body : '';
      if (!rawBody.trim()) {
        res.status(400).type('text/plain').send('empty body');
        return;
      }

      // 1. 从外层 XML 中提取 <Encrypt> 字段
      const outerParsed = await parseWeComXml(rawBody);
      const encrypt = outerParsed.encrypt ?? '';
      if (!encrypt) {
        console.warn('[POST /wecom/callback] missing <Encrypt> in body');
        res.status(400).type('text/plain').send('missing Encrypt');
        return;
      }

      // 2. 验签
      if (!deps.wecomCrypto.verifySignature(msgSignature, timestamp, nonce, encrypt)) {
        console.warn('[POST /wecom/callback] signature mismatch');
        res.status(403).type('text/plain').send('signature mismatch');
        return;
      }

      // 3. 解密
      const plainXml = deps.wecomCrypto.decrypt(encrypt);

      // 4. 解析明文 XML
      const msg = await parseWeComXml(plainXml);

      // 5. 立即返回 success，不阻塞
      res.type('text/plain').send('success');

      // 6. 异步处理业务（fire-and-forget）
      if (msg.msgType === 'text' && msg.content.trim()) {
        deps.handleText({ userId: msg.fromUserName, content: msg.content }).catch((err) => {
          console.error('[POST /wecom/callback] handleText error:', err);
        });
      }
    } catch (error) {
      console.error('[POST /wecom/callback] callback error:', error);
      // 即使出错也返回 success，避免企业微信重试
      res.type('text/plain').send('success');
    }
  });

  return app;
}
