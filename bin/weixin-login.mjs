#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const { WeixinApi } = await import('../dist/services/weixin-api.js').catch(async () => {
  return await import('../src/services/weixin-api.ts');
});

const gatewayRootDir = process.env.GATEWAY_ROOT_DIR?.trim() || process.cwd();
const dataDir = path.join(gatewayRootDir, '.data');
const sessionFile = path.join(dataDir, 'weixin-session.json');
const baseUrl = (process.env.WEIXIN_BASE_URL || 'https://ilinkai.weixin.qq.com').replace(/\/+$/, '');
const botType = process.env.WEIXIN_BOT_TYPE?.trim() || '3';
const timeoutMs = Number(process.env.WEIXIN_LOGIN_TIMEOUT_MS || 480000);

fs.mkdirSync(dataDir, { recursive: true });

const api = new WeixinApi({
  baseUrl,
  botToken: 'unused-for-login',
  timeoutMs: 15000,
});

const qr = await api.getBotQrCode(botType);
if (!qr?.qrcode || !qr?.qrcode_img_content) {
  console.error('failed to get qrcode');
  process.exit(1);
}

console.log('Use WeChat to scan this QR code URL:');
console.log(qr.qrcode_img_content);
console.log('');
console.log('Waiting for confirmation...');

const startedAt = Date.now();
for (;;) {
  if (Date.now() - startedAt > timeoutMs) {
    console.error('Login timed out.');
    process.exit(1);
  }
  const status = await api.getQrCodeStatus(qr.qrcode);
  if (status.status === 'wait') {
    process.stdout.write('.');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    continue;
  }
  if (status.status === 'scaned') {
    process.stdout.write('\nScanned. Confirm on your phone...\n');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    continue;
  }
  if (status.status === 'confirmed' && status.bot_token) {
    const session = {
      baseUrl: status.baseurl || baseUrl,
      botToken: status.bot_token,
      accountId: status.ilink_bot_id || '',
      userId: status.ilink_user_id || '',
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
    console.log('\nLogin success.');
    console.log(`Session saved to ${sessionFile}`);
    process.exit(0);
  }
  if (status.status === 'expired') {
    console.error('\nQR code expired.');
    process.exit(1);
  }
  console.error(`\nUnexpected login status: ${JSON.stringify(status)}`);
  process.exit(1);
}
