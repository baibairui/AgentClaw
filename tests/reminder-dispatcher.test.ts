import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { ReminderDispatcher } from '../src/services/reminder-dispatcher.js';
import { ReminderStore } from '../src/services/reminder-store.js';

describe('ReminderDispatcher', () => {
  it('sends due reminders and marks them as sent', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reminder-dispatcher-'));
    const store = new ReminderStore(path.join(dir, 'reminders.db'));
    const sendText = vi.fn(async () => undefined);
    const dispatcher = new ReminderDispatcher({
      store,
      sendText,
      pollIntervalMs: 1000,
    });

    const reminder = store.createReminder({
      channel: 'wecom',
      userId: 'u1',
      message: '喝水',
      dueAt: Date.now() - 1,
      sourceAgentId: 'assistant',
    });

    await dispatcher.flushDueReminders();

    expect(sendText).toHaveBeenCalledWith('wecom', 'u1', '⏰ 定时提醒：喝水');
    expect(store.listPending().some((item) => item.id === reminder.id)).toBe(false);
  });

  it('keeps reminder pending when sending fails', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reminder-dispatcher-'));
    const store = new ReminderStore(path.join(dir, 'reminders.db'));
    const sendText = vi.fn(async () => {
      throw new Error('send failed');
    });
    const dispatcher = new ReminderDispatcher({
      store,
      sendText,
      pollIntervalMs: 1000,
    });

    const reminder = store.createReminder({
      channel: 'wecom',
      userId: 'u1',
      message: '开会',
      dueAt: Date.now() - 1,
    });

    await dispatcher.flushDueReminders();

    expect(store.listPending().map((item) => item.id)).toContain(reminder.id);
  });
});
