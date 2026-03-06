import { describe, expect, test } from 'vitest';

import { parseCodexJsonl } from '../src/services/codex-runner.js';

describe('parseCodexJsonl', () => {
  test('extracts thread id and final agent message', () => {
    const output = [
      '{"type":"thread.started","thread_id":"thread-123"}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"first"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"final answer"}}',
    ].join('\n');

    const parsed = parseCodexJsonl(output);

    expect(parsed.threadId).toBe('thread-123');
    expect(parsed.answer).toBe('final answer');
  });
});
