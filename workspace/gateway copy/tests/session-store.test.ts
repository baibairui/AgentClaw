import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { SessionStore } from '../src/stores/session-store.js';

describe('SessionStore', () => {
  test('persists and reloads user thread mapping', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-store-'));
    const filePath = path.join(tempDir, 'sessions.json');

    const store = new SessionStore(filePath);
    store.set('u1', 'thread-1');

    const reloaded = new SessionStore(filePath);
    expect(reloaded.get('u1')).toBe('thread-1');
  });
});
