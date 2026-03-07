#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const MAX_REMINDER_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

const dbPath = requireEnv('REMINDER_DB_PATH');
const channel = requireChannel(process.env.REMINDER_CHANNEL);
const userId = requireEnv('REMINDER_USER_ID');
const sourceAgentId = process.env.REMINDER_AGENT_ID?.trim() || null;

const db = openDb(dbPath);
ensureSchema(db);

const server = new McpServer({
  name: 'gateway-reminder',
  version: '1.0.0',
});

server.registerTool(
  'create_reminder',
  {
    description: 'Create a durable reminder for the current chat user.',
    inputSchema: {
      delay: z.string().optional(),
      delayMs: z.number().int().positive().max(MAX_REMINDER_DELAY_MS).optional(),
      message: z.string().trim().min(1).max(200),
    },
  },
  async ({ delay, delayMs, message }) => {
    const resolvedDelayMs = resolveDelayMs({ delay, delayMs });
    if (resolvedDelayMs === undefined) {
      return {
        content: [{ type: 'text', text: 'Reminder creation failed: provide a valid delay or delayMs.' }],
        isError: true,
      };
    }

    const now = Date.now();
    const dueAt = now + resolvedDelayMs;
    const id = randomUUID();
    db.prepare(`
      INSERT INTO reminder_task(id, channel, user_id, message, created_at, due_at, status, sent_at, source_agent_id)
      VALUES(?, ?, ?, ?, ?, ?, 'pending', NULL, ?)
    `).run(id, channel, userId, message.trim(), now, dueAt, sourceAgentId);

    return {
      content: [{
        type: 'text',
        text: `Reminder created for ${formatDelay(resolvedDelayMs)} from now. It will be delivered in this chat.`,
      }],
      structuredContent: {
        reminderId: id,
        dueAt,
        delayMs: resolvedDelayMs,
        message: message.trim(),
      },
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing required env: ${name}`);
  }
  return value;
}

function requireChannel(value) {
  if (value === 'wecom' || value === 'feishu') {
    return value;
  }
  throw new Error('invalid REMINDER_CHANNEL');
}

function openDb(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return new DatabaseSync(filePath);
}

function ensureSchema(database) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS reminder_task (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      due_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      sent_at INTEGER,
      source_agent_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reminder_task_status_due_at
      ON reminder_task(status, due_at);
  `);
}

function resolveDelayMs(input) {
  if (typeof input.delayMs === 'number' && Number.isFinite(input.delayMs)) {
    const rounded = Math.floor(input.delayMs);
    if (rounded > 0 && rounded <= MAX_REMINDER_DELAY_MS) {
      return rounded;
    }
    return undefined;
  }
  if (typeof input.delay === 'string') {
    return parseReminderDelayMs(input.delay);
  }
  return undefined;
}

function parseReminderDelayMs(input) {
  const value = input.trim().toLowerCase();
  const match = value.match(/^(\d+)(秒钟?|秒|s|sec|secs|second|seconds|分钟?|分|m|min|mins|minute|minutes|小时?|时|h|hr|hrs|hour|hours|天|d|day|days)$/i);
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }
  const unit = (match[2] ?? '').toLowerCase();
  if (['秒', '秒钟', 's', 'sec', 'secs', 'second', 'seconds'].includes(unit)) {
    return amount * 1000;
  }
  if (['分', '分钟', 'm', 'min', 'mins', 'minute', 'minutes'].includes(unit)) {
    return amount * 60 * 1000;
  }
  if (['时', '小时', 'h', 'hr', 'hrs', 'hour', 'hours'].includes(unit)) {
    return amount * 60 * 60 * 1000;
  }
  if (['天', 'd', 'day', 'days'].includes(unit)) {
    return amount * 24 * 60 * 60 * 1000;
  }
  return undefined;
}

function formatDelay(delayMs) {
  const totalMinutes = Math.floor(delayMs / 60_000);
  if (totalMinutes < 1) {
    return `${Math.floor(delayMs / 1000)} seconds`;
  }
  if (totalMinutes < 60) {
    return `${totalMinutes} minutes`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    return `${totalHours} hours`;
  }
  return `${Math.floor(totalHours / 24)} days`;
}
