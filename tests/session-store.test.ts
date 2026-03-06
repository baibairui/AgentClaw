import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SessionStore } from '../src/stores/session-store.js';

function makeStore(): SessionStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-store-'));
  return new SessionStore(path.join(dir, 'sessions.json'));
}

describe('SessionStore', () => {
  it('keeps session history and resolves numeric switch target', () => {
    const store = makeStore();
    store.set('u1', 'thread_1', 'first prompt');
    store.set('u1', 'thread_2', 'second prompt');
    store.set('u1', 'thread_3', 'third prompt');

    expect(store.list('u1')).toEqual(['thread_3', 'thread_2', 'thread_1']);
    expect(store.resolveSwitchTarget('u1', '2')).toBe('thread_2');
    expect(store.resolveSwitchTarget('u1', '999')).toBeUndefined();

    store.renameSession('thread_2', '发布修复');
    const list = store.listDetailed('u1');
    expect(list[1]?.name).toBe('发布修复');
    expect(list[0]?.lastPrompt).toContain('third prompt');
  });
});
