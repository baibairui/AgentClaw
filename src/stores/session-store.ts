import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SessionStore');

interface SessionFileData {
  sessions?: Record<string, string>;
  histories?: Record<string, string[]>;
  metas?: Record<string, SessionMeta>;
}

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
  private sessions: Record<string, string>;
  private histories: Record<string, string[]>;
  private metas: Record<string, SessionMeta>;

  constructor(filePath: string) {
    this.filePath = filePath;
    const loaded = this.load();
    this.sessions = loaded.sessions;
    this.histories = loaded.histories;
    this.metas = loaded.metas;
    log.info('SessionStore 已加载', {
      filePath: this.filePath,
      sessionCount: Object.keys(this.sessions).length,
      userIds: Object.keys(this.sessions),
    });
  }

  get(userId: string): string | undefined {
    const threadId = this.sessions[userId];
    log.debug('SessionStore.get', {
      userId,
      threadId: threadId ?? '(未找到)',
    });
    return threadId;
  }

  set(userId: string, threadId: string, lastPrompt?: string): void {
    this.sessions[userId] = threadId;
    const current = this.histories[userId] ?? [];
    const withoutDup = current.filter((id) => id !== threadId);
    this.histories[userId] = [threadId, ...withoutDup].slice(0, 20);
    this.metas[threadId] = {
      ...this.metas[threadId],
      lastPrompt: normalizePreview(lastPrompt) ?? this.metas[threadId]?.lastPrompt,
      updatedAt: Date.now(),
    };
    log.debug('SessionStore.set', { userId, threadId });
    this.persist();
  }

  clear(userId: string): boolean {
    if (!(userId in this.sessions)) {
      log.debug('SessionStore.clear 未命中', { userId });
      return false;
    }
    delete this.sessions[userId];
    this.persist();
    log.info('SessionStore.clear 已清除用户会话', { userId });
    return true;
  }

  list(userId: string): string[] {
    return [...(this.histories[userId] ?? [])];
  }

  listDetailed(userId: string): SessionListItem[] {
    const list = this.list(userId);
    return list.map((threadId) => {
      const meta = this.metas[threadId];
      return {
        threadId,
        name: meta?.name,
        lastPrompt: meta?.lastPrompt,
        updatedAt: meta?.updatedAt ?? 0,
      };
    });
  }

  resolveSwitchTarget(userId: string, target: string): string | undefined {
    const raw = target.trim();
    if (!raw) {
      return undefined;
    }
    // 支持编号切换（1-based）
    if (/^\d+$/.test(raw)) {
      const index = Number(raw);
      if (index <= 0) {
        return undefined;
      }
      const list = this.list(userId);
      return list[index - 1];
    }
    // 回退：按 threadId 直接切换
    return raw;
  }

  renameSession(targetThreadId: string, name: string): boolean {
    const normalized = name.trim();
    if (!normalized) {
      return false;
    }
    this.metas[targetThreadId] = {
      ...this.metas[targetThreadId],
      name: normalized,
      updatedAt: Date.now(),
    };
    this.persist();
    return true;
  }

  private load(): { sessions: Record<string, string>; histories: Record<string, string[]>; metas: Record<string, SessionMeta> } {
    if (!fs.existsSync(this.filePath)) {
      log.debug('Session 文件不存在，返回空', { filePath: this.filePath });
      return { sessions: {}, histories: {}, metas: {} };
    }

    const content = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!content) {
      log.debug('Session 文件为空');
      return { sessions: {}, histories: {}, metas: {} };
    }

    try {
      const parsed = JSON.parse(content) as SessionFileData;
      log.debug('Session 文件加载成功', {
        sessionCount: Object.keys(parsed.sessions ?? {}).length,
      });
      const sessions = parsed.sessions ?? {};
      const histories = parsed.histories ?? {};
      const metas = parsed.metas ?? {};

      // 兼容旧数据：没有 histories 时由 current session 反推
      for (const [userId, threadId] of Object.entries(sessions)) {
        if (!histories[userId] || histories[userId].length === 0) {
          histories[userId] = [threadId];
        }
        if (!metas[threadId]) {
          metas[threadId] = { updatedAt: Date.now() };
        }
      }
      return { sessions, histories, metas };
    } catch (err) {
      log.warn('Session 文件解析失败，返回空', err);
      return { sessions: {}, histories: {}, metas: {} };
    }
  }

  private persist(): void {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });

    const body = JSON.stringify(
      { sessions: this.sessions, histories: this.histories, metas: this.metas },
      null,
      2,
    );
    const tempFilePath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempFilePath, body, 'utf8');
    fs.renameSync(tempFilePath, this.filePath);
    log.debug('Session 文件已持久化', {
      filePath: this.filePath,
      sessionCount: Object.keys(this.sessions).length,
    });
  }
}

function normalizePreview(input?: string): string | undefined {
  const text = (input ?? '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return undefined;
  }
  return text.length <= 80 ? text : `${text.slice(0, 80)}...`;
}
