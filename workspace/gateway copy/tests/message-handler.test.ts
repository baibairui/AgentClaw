import { describe, expect, test } from 'vitest';

import { createMessageHandler } from '../src/services/message-handler.js';
import { PendingStore } from '../src/stores/pending-store.js';

describe('message handler', () => {
  test('creates confirm flow and executes after confirmation', async () => {
    const store = new PendingStore({ ttlMs: 60_000, randomCode: () => 'ABCD', now: () => 1_000 });
    const executions: Array<{ userId: string; prompt: string; code: string }> = [];

    const handler = createMessageHandler({
      pendingStore: store,
      onExecute: async (payload) => {
        executions.push(payload);
      },
    });

    const r1 = await handler.handleText({ userId: 'u1', content: 'codex: 帮我总结今天进展' });
    expect(r1.reply).toContain('ABCD');

    const r2 = await handler.handleText({ userId: 'u1', content: '确认 ABCD' });
    expect(r2.reply).toContain('开始执行');
    expect(executions).toHaveLength(1);
    expect(executions[0]).toEqual({ userId: 'u1', prompt: '帮我总结今天进展', code: 'ABCD' });
  });

  test('cancels command by code', async () => {
    const store = new PendingStore({ ttlMs: 60_000, randomCode: () => 'WXYZ', now: () => 1_000 });

    const handler = createMessageHandler({
      pendingStore: store,
      onExecute: async () => {
        throw new Error('should not run');
      },
    });

    await handler.handleText({ userId: 'u1', content: 'codex: hello' });
    const r = await handler.handleText({ userId: 'u1', content: '取消 WXYZ' });

    expect(r.reply).toContain('已取消');
  });
});
