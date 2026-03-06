import { describe, expect, test } from 'vitest';

import { PendingStore } from '../src/stores/pending-store.js';

describe('PendingStore', () => {
  test('creates and confirms pending request for same user', () => {
    const store = new PendingStore({ ttlMs: 60_000, randomCode: () => 'ABCD', now: () => 1_000 });

    const created = store.create('u1', 'hello world');
    expect(created.code).toBe('ABCD');

    const confirmed = store.confirm('u1', 'ABCD');
    expect(confirmed.ok).toBe(true);
    expect(confirmed.item?.prompt).toBe('hello world');
    expect(confirmed.item?.status).toBe('executing');
  });

  test('rejects confirm from another user', () => {
    const store = new PendingStore({ ttlMs: 60_000, randomCode: () => 'EFGH', now: () => 1_000 });
    store.create('u1', 'hello');

    const confirmed = store.confirm('u2', 'EFGH');
    expect(confirmed.ok).toBe(false);
    expect(confirmed.reason).toBe('forbidden');
  });

  test('expires request when ttl is reached', () => {
    let now = 1_000;
    const store = new PendingStore({ ttlMs: 500, randomCode: () => 'IJKL', now: () => now });

    store.create('u1', 'hello');
    now = 2_000;

    const confirmed = store.confirm('u1', 'IJKL');
    expect(confirmed.ok).toBe(false);
    expect(confirmed.reason).toBe('expired');
  });
});
