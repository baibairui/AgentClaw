import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { installReminderToolSkill } from '../src/services/reminder-tool-skill.js';

let DatabaseSync: typeof import('node:sqlite').DatabaseSync | undefined;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = undefined;
}

const describeIfSqlite = DatabaseSync ? describe : describe.skip;

describeIfSqlite('reminder-tool skill', () => {
  it('creates weixin reminder tasks through the generated cli', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reminder-tool-skill-'));
    const dbPath = path.join(workspaceDir, 'data', 'reminders.db');
    installReminderToolSkill(workspaceDir);

    const scriptPath = path.join(
      workspaceDir,
      '.codex',
      'skills',
      'reminder-tool',
      'scripts',
      'reminder-cli.mjs',
    );

    const stdout = execFileSync(
      'node',
      [scriptPath, 'create', '--delay', '5min', '--message', '微信提醒测试'],
      {
        cwd: workspaceDir,
        env: {
          ...process.env,
          GATEWAY_REMINDER_DB_PATH: dbPath,
          GATEWAY_REMINDER_CHANNEL: 'weixin',
          GATEWAY_REMINDER_USER_ID: 'wx_user_1',
          GATEWAY_REMINDER_AGENT_ID: 'assistant',
        },
        encoding: 'utf8',
      },
    );

    const result = JSON.parse(stdout) as { ok: boolean; message: string };
    expect(result.ok).toBe(true);
    expect(result.message).toBe('微信提醒测试');

    const db = new DatabaseSync!(dbPath);
    const row = db.prepare(
      'SELECT channel, user_id AS userId, message, source_agent_id AS sourceAgentId FROM reminder_task LIMIT 1',
    ).get() as { channel: string; userId: string; message: string; sourceAgentId: string };

    expect(row).toEqual({
      channel: 'weixin',
      userId: 'wx_user_1',
      message: '微信提醒测试',
      sourceAgentId: 'assistant',
    });
  });
});
