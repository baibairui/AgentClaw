import fs from 'node:fs';
import path from 'node:path';

import { createApp } from './app.js';
import { config } from './config.js';
import { CodexRunner } from './services/codex-runner.js';
import { WeComApi } from './services/wecom-api.js';
import { WeComCrypto } from './utils/wecom-crypto.js';
import { SessionStore } from './stores/session-store.js';
import { MessageDedupStore } from './stores/message-dedup-store.js';
import { RateLimitStore } from './stores/rate-limit-store.js';
import { createLogger } from './utils/logger.js';
import { handleUserCommand, maskThreadId } from './features/user-command.js';

const log = createLogger('Server');

log.info('服务启动初始化...', {
  port: config.port,
  codexBin: config.codexBin,
  codexWorkdir: config.codexWorkdir,
  commandTimeoutMs: config.commandTimeoutMs,
  runnerEnabled: config.runnerEnabled,
  allowFrom: config.allowFrom,
  dedupWindowSeconds: config.dedupWindowSeconds,
  rateLimitMaxMessages: config.rateLimitMaxMessages,
  rateLimitWindowSeconds: config.rateLimitWindowSeconds,
  apiTimeoutMs: config.apiTimeoutMs,
});

const dataDir = path.resolve(process.cwd(), '.data');
fs.mkdirSync(dataDir, { recursive: true });
log.debug('数据目录已就绪', { dataDir });

const sessionStore = new SessionStore(path.join(dataDir, 'sessions.json'));
log.debug('SessionStore 已初始化');
const dedupStore = new MessageDedupStore(config.dedupWindowSeconds);
log.debug('MessageDedupStore 已初始化', { dedupWindowSeconds: config.dedupWindowSeconds });
const rateLimitStore = new RateLimitStore(config.rateLimitMaxMessages, config.rateLimitWindowSeconds);
log.debug('RateLimitStore 已初始化', {
  maxMessages: config.rateLimitMaxMessages,
  windowSeconds: config.rateLimitWindowSeconds,
});

const codexRunner = new CodexRunner({
  codexBin: config.codexBin,
  workdir: config.codexWorkdir,
  timeoutMs: config.commandTimeoutMs,
  sandbox: config.codexSandbox,
});
log.debug('CodexRunner 已初始化');

const weComApi = new WeComApi({
  corpId: config.corpId,
  secret: config.corpSecret,
  agentId: config.agentId,
  timeoutMs: config.apiTimeoutMs,
});
log.debug('WeComApi 已初始化');

const wecomCrypto = new WeComCrypto({
  token: config.token,
  encodingAesKey: config.encodingAesKey,
  corpId: config.corpId,
});
log.debug('WeComCrypto 已初始化');

function clipMessage(message: string, maxLength = 1500): string {
  if (message.length <= maxLength) {
    return message;
  }
  return `${message.slice(0, maxLength)}\n...(截断)`;
}

const userTaskQueue = new Map<string, Promise<void>>();

function runInUserQueue(userId: string, task: () => Promise<void>): Promise<void> {
  const previous = userTaskQueue.get(userId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      if (userTaskQueue.get(userId) === next) {
        userTaskQueue.delete(userId);
      }
    });

  userTaskQueue.set(userId, next);
  return next;
}

const app = createApp({
  wecomCrypto,
  allowFrom: config.allowFrom,
  isDuplicateMessage: (msgId) => dedupStore.isDuplicate(msgId),
  handleText: async ({ userId, content }) => {
    await runInUserQueue(userId, async () => {
      const prompt = content.trim();
      if (!prompt) {
        log.debug('handleText 收到空 prompt，跳过', { userId });
        return;
      }

      log.info(`
════════════════════════════════════════════════════════════
📩 用户消息  [${userId}]
────────────────────────────────────────────────────────────
${clipMessage(prompt, 500)}
════════════════════════════════════════════════════════════`);

      const existingThreadId = sessionStore.get(userId);
      const commandResult = handleUserCommand(prompt, existingThreadId, sessionStore.listDetailed(userId));
      if (commandResult.handled) {
        if (commandResult.clearSession) {
          sessionStore.clear(userId);
        }
        if (commandResult.renameTarget && commandResult.renameName) {
          const resolved = sessionStore.resolveSwitchTarget(userId, commandResult.renameTarget);
          if (!resolved) {
            await weComApi.sendText(userId, '❌ 未找到目标会话，请先发送 /sessions 查看编号。');
            return;
          }
          sessionStore.renameSession(resolved, commandResult.renameName);
          await weComApi.sendText(userId, `✅ 已重命名会话：${commandResult.renameName}`);
          return;
        }
        if (commandResult.switchTarget) {
          const resolved = sessionStore.resolveSwitchTarget(userId, commandResult.switchTarget);
          if (!resolved) {
            await weComApi.sendText(userId, '❌ 未找到目标会话，请先发送 /sessions 查看编号。');
            return;
          }
          sessionStore.set(userId, resolved);
          await weComApi.sendText(userId, `✅ 已切换到会话：${maskThreadId(resolved)}`);
          return;
        }
        if (commandResult.message) {
          await weComApi.sendText(userId, commandResult.message);
        }
        return;
      }

      if (!rateLimitStore.allow(userId)) {
        log.warn('handleText 命中限流，拒绝执行', { userId });
        await weComApi.sendText(userId, '⏳ 请求过于频繁，请稍后再试。');
        return;
      }

      if (!config.runnerEnabled) {
        log.warn('handleText runnerEnabled=false，拒绝执行', { userId });
        await weComApi.sendText(userId, '⚠️ 当前服务已禁用命令执行，请联系管理员。');
        return;
      }

      try {
        const threadId = sessionStore.get(userId);
        log.debug('handleText 查询 session', {
          userId,
          existingThreadId: threadId ?? '(无，新会话)',
        });

        await weComApi.sendText(userId, '⏳ 已收到，正在处理，请稍候...');

        const startTime = Date.now();
        const result = await codexRunner.run({
          prompt,
          threadId,
          // 每产出一条 agent_message 就实时推给用户
          onMessage: (text) => {
            log.info(`
════════════════════════════════════════════════════════════
🤖 Codex 回复  [${userId}]
────────────────────────────────────────────────────────────
${clipMessage(text, 500)}
════════════════════════════════════════════════════════════`);
            weComApi.sendText(userId, text).catch((err) => {
              log.error('handleText onMessage 推送失败', err);
            });
          },
        });
        const elapsed = Date.now() - startTime;

        log.info('<<< handleText Codex 执行完成', {
          userId,
          threadId: result.threadId,
          elapsedMs: elapsed,
          rawOutputLength: result.rawOutput.length,
        });

        sessionStore.set(userId, result.threadId, prompt);
        log.debug('handleText session 已更新', {
          userId,
          threadId: result.threadId,
        });
      } catch (error) {
        log.error('handleText 执行失败', {
          userId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        const message = error instanceof Error ? error.message : String(error);
        try {
          await weComApi.sendText(userId, `❌ 执行失败：${clipMessage(message, 1000)}`);
          log.debug('handleText 已推送失败通知给用户', { userId });
        } catch (sendErr) {
          log.error('handleText 推送失败通知也失败', sendErr);
        }
      }
    });
  },
});

app.listen(config.port, () => {
  log.info(`✅ wecom-codex gateway 已启动，监听 http://127.0.0.1:${config.port}`);
});
