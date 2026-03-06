import fs from 'node:fs';
import path from 'node:path';

import { createApp } from './app.js';
import { config } from './config.js';
import { CodexRunner } from './services/codex-runner.js';
import { WeComApi } from './services/wecom-api.js';
import { WeComCrypto } from './utils/wecom-crypto.js';
import { SessionStore } from './stores/session-store.js';

const dataDir = path.resolve(process.cwd(), '.data');
fs.mkdirSync(dataDir, { recursive: true });

const sessionStore = new SessionStore(path.join(dataDir, 'sessions.json'));
const codexRunner = new CodexRunner({
  codexBin: config.codexBin,
  workdir: config.codexWorkdir,
  timeoutMs: config.commandTimeoutMs,
});
const weComApi = new WeComApi({
  corpId: config.corpId,
  secret: config.corpSecret,
  agentId: config.agentId,
});
const wecomCrypto = new WeComCrypto({
  token: config.token,
  encodingAesKey: config.encodingAesKey,
  corpId: config.corpId,
});

function clipMessage(message: string, maxLength = 1500): string {
  if (message.length <= maxLength) {
    return message;
  }
  return `${message.slice(0, maxLength)}\n...(截断)`;
}

const app = createApp({
  wecomCrypto,
  handleText: async ({ userId, content }) => {
    const prompt = content.trim();
    if (!prompt) return;

    try {
      const threadId = sessionStore.get(userId);

      const result = await codexRunner.run({
        prompt,
        threadId,
        // 每产出一条 agent_message 就实时推给用户
        onMessage: (text) => {
          weComApi.sendText(userId, clipMessage(text)).catch((err) => {
            console.error('[onMessage] 推送失败:', err);
          });
        },
      });

      sessionStore.set(userId, result.threadId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await weComApi.sendText(userId, `❌ 执行失败：${clipMessage(message, 1000)}`);
      } catch (sendErr) {
        console.error('[handleText] 推送失败通知也失败:', sendErr);
      }
    }
  },
});

app.listen(config.port, () => {
  console.log(`wecom-codex gateway listening on http://127.0.0.1:${config.port}`);
});
