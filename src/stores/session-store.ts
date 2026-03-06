import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SessionStore');

export interface SessionMeta {
  name?: string;
  lastPrompt?: string;
  updatedAt: number;
}

export interface SessionListItem {
  threadId: string;
  name?: string;
  lastPrompt?: string;
  updatedAt: number;
}

export class SessionStore {
  private readonly filePath: string;
  private readonly db: DatabaseSync;
  private lastTs = 0;

  constructor(filePath: string) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    this.db = new DatabaseSync(this.filePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
    `);

    this.ensureSchema();

    const row = this.db.prepare('SELECT COUNT(*) AS count FROM user_session').get() as { count: number };
    log.info('SessionStore 已加载(SQLite)', {
      filePath: this.filePath,
      sessionCount: row.count,
    });
  }

  get(userId: string): string | undefined {
    const row = this.db
      .prepare('SELECT current_thread_id AS threadId FROM user_session WHERE user_id = ?')
      .get(userId) as { threadId?: string } | undefined;
    return row?.threadId;
  }

  set(userId: string, threadId: string, lastPrompt?: string): void {
    const now = this.nextTimestamp();
    this.withTransaction(() => {
      this.db
        .prepare(`
          INSERT INTO user_session(user_id, current_thread_id, updated_at)
          VALUES(?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            current_thread_id = excluded.current_thread_id,
            updated_at = excluded.updated_at
        `)
        .run(userId, threadId, now);

      this.db
        .prepare(`
          INSERT INTO user_history(user_id, thread_id, updated_at)
          VALUES(?, ?, ?)
          ON CONFLICT(user_id, thread_id) DO UPDATE SET
            updated_at = excluded.updated_at
        `)
        .run(userId, threadId, now);

      const normalizedPrompt = normalizePreview(lastPrompt);
      if (normalizedPrompt) {
        this.db
          .prepare(`
            INSERT INTO session_meta(thread_id, name, last_prompt, updated_at)
            VALUES(?, NULL, ?, ?)
            ON CONFLICT(thread_id) DO UPDATE SET
              last_prompt = excluded.last_prompt,
              updated_at = excluded.updated_at
          `)
          .run(threadId, normalizedPrompt, now);
      } else {
        this.db
          .prepare(`
            INSERT INTO session_meta(thread_id, name, last_prompt, updated_at)
            VALUES(?, NULL, NULL, ?)
            ON CONFLICT(thread_id) DO UPDATE SET
              updated_at = excluded.updated_at
          `)
          .run(threadId, now);
      }

      // 保留最近 20 条历史
      this.db
        .prepare(`
          DELETE FROM user_history
          WHERE user_id = ?
            AND thread_id IN (
              SELECT thread_id
              FROM user_history
              WHERE user_id = ?
              ORDER BY updated_at DESC
              LIMIT -1 OFFSET 20
            )
        `)
        .run(userId, userId);
    });
  }

  clear(userId: string): boolean {
    const result = this.db.prepare('DELETE FROM user_session WHERE user_id = ?').run(userId) as { changes?: number };
    return (result.changes ?? 0) > 0;
  }

  list(userId: string): string[] {
    const rows = this.db
      .prepare(`
        SELECT thread_id AS threadId
        FROM user_history
        WHERE user_id = ?
        ORDER BY updated_at DESC
        LIMIT 20
      `)
      .all(userId) as Array<{ threadId: string }>;
    return rows.map((row) => row.threadId);
  }

  listDetailed(userId: string): SessionListItem[] {
    const rows = this.db
      .prepare(`
        SELECT
          h.thread_id AS threadId,
          m.name AS name,
          m.last_prompt AS lastPrompt,
          COALESCE(m.updated_at, h.updated_at) AS updatedAt
        FROM user_history h
        LEFT JOIN session_meta m ON m.thread_id = h.thread_id
        WHERE h.user_id = ?
        ORDER BY h.updated_at DESC
        LIMIT 20
      `)
      .all(userId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      threadId: String(row.threadId ?? ''),
      name: typeof row.name === 'string' ? row.name : undefined,
      lastPrompt: typeof row.lastPrompt === 'string' ? row.lastPrompt : undefined,
      updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
    }));
  }

  resolveSwitchTarget(userId: string, target: string): string | undefined {
    const raw = target.trim();
    if (!raw) {
      return undefined;
    }
    if (/^\d+$/.test(raw)) {
      const index = Number(raw);
      if (index <= 0) {
        return undefined;
      }
      const list = this.list(userId);
      return list[index - 1];
    }
    return raw;
  }

  renameSession(targetThreadId: string, name: string): boolean {
    const normalized = name.trim();
    if (!normalized) {
      return false;
    }
    this.db
      .prepare(`
        INSERT INTO session_meta(thread_id, name, last_prompt, updated_at)
        VALUES(?, ?, NULL, ?)
        ON CONFLICT(thread_id) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at
      `)
      .run(targetThreadId, normalized, this.nextTimestamp());
    return true;
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_session (
        user_id TEXT PRIMARY KEY,
        current_thread_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_history (
        user_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(user_id, thread_id)
      );

      CREATE INDEX IF NOT EXISTS idx_user_history_user_updated
        ON user_history(user_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS session_meta (
        thread_id TEXT PRIMARY KEY,
        name TEXT,
        last_prompt TEXT,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  private withTransaction(fn: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private nextTimestamp(): number {
    const now = Date.now() * 1000;
    this.lastTs = Math.max(now, this.lastTs + 1);
    return this.lastTs;
  }
}

function normalizePreview(input?: string): string | undefined {
  const text = (input ?? '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return undefined;
  }
  return text.length <= 80 ? text : `${text.slice(0, 80)}...`;
}
