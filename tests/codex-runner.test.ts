import { describe, expect, it } from 'vitest';

import { parseCodexJsonl } from '../src/services/codex-runner.js';

describe('parseCodexJsonl', () => {
  it('parses thread id and latest agent message', () => {
    const raw = [
      JSON.stringify({ type: 'thread.started', thread_id: 't_123' }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'first' } }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'second' } }),
    ].join('\n');

    const result = parseCodexJsonl(raw);
    expect(result.threadId).toBe('t_123');
    expect(result.answer).toBe('second');
  });

  it('ignores invalid lines and falls back when no answer', () => {
    const raw = '{not-json}\n' + JSON.stringify({ type: 'thread.started', thread_id: 't_456' });
    const result = parseCodexJsonl(raw);

    expect(result.threadId).toBe('t_456');
    expect(result.answer).toContain('未返回可解析内容');
  });
});
