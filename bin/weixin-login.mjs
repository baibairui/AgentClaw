#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const { WeixinApi } = await import('../dist/services/weixin-api.js').catch(async () => {
  return await import('../src/services/weixin-api.ts');
});
const { createWeixinLoginSession } = await import('../dist/services/weixin-login-flow.js').catch(async () => {
  return await import('../src/services/weixin-login-flow.ts');
});

const gatewayRootDir = process.env.GATEWAY_ROOT_DIR?.trim() || process.cwd();
const dataDir = path.join(gatewayRootDir, '.data');
const sessionFile = path.join(dataDir, 'weixin-session.json');
const baseUrl = (process.env.WEIXIN_BASE_URL || 'https://ilinkai.weixin.qq.com').replace(/\/+$/, '');
const botType = process.env.WEIXIN_BOT_TYPE?.trim() || '3';
const timeoutMs = Number(process.env.WEIXIN_LOGIN_TIMEOUT_MS || 480000);
const requestTimeoutMs = Number(process.env.WEIXIN_REQUEST_TIMEOUT_MS || process.env.API_TIMEOUT_MS || 30000);

fs.mkdirSync(dataDir, { recursive: true });

const api = new WeixinApi({
  baseUrl,
  botToken: 'unused-for-login',
  timeoutMs: requestTimeoutMs,
});

try {
  let lastStatusMessage = '';
  const session = await createWeixinLoginSession({
    api,
    baseUrl,
    botType,
    timeoutMs,
    onStatus: (message) => {
      if (message.startsWith('http')) {
        console.log('Use WeChat to scan this QR code URL:');
        console.log(message);
        console.log('');
        console.log('Waiting for confirmation...');
        return;
      }
      if (message !== lastStatusMessage) {
        console.log(message);
        lastStatusMessage = message;
      }
    },
    onWarning: (message) => {
      console.error(message);
    },
  });

  fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
  console.log('\nLogin success.');
  console.log(`Session saved to ${sessionFile}`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
