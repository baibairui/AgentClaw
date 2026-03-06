import { describe, expect, it } from 'vitest';

import { extractReminderActionsFromAssistantText, parseReminderDelayMs } from '../src/services/reminder-action-parser.js';

describe('parseReminderDelayMs', () => {
  it('parses common duration formats', () => {
    expect(parseReminderDelayMs('30s')).toBe(30_000);
    expect(parseReminderDelayMs('5min')).toBe(5 * 60_000);
    expect(parseReminderDelayMs('2h')).toBe(2 * 60 * 60_000);
    expect(parseReminderDelayMs('1d')).toBe(24 * 60 * 60_000);
  });

  it('returns undefined for invalid input', () => {
    expect(parseReminderDelayMs('')).toBeUndefined();
    expect(parseReminderDelayMs('5 minutes later')).toBeUndefined();
    expect(parseReminderDelayMs('31d')).toBeUndefined();
  });
});

describe('extractReminderActionsFromAssistantText', () => {
  it('extracts reminder actions and strips action blocks', () => {
    const result = extractReminderActionsFromAssistantText([
      '我已经帮你设置好了。',
      '```reminder-action',
      '{"delay":"5min","message":"喝水"}',
      '```',
    ].join('\n'));

    expect(result.userText).toBe('我已经帮你设置好了。');
    expect(result.errors).toEqual([]);
    expect(result.actions).toEqual([
      {
        delayMs: 5 * 60_000,
        message: '喝水',
      },
    ]);
  });

  it('collects parse errors for invalid blocks', () => {
    const result = extractReminderActionsFromAssistantText([
      '```reminder-action',
      '{"delay":"abc","message":"test"}',
      '```',
    ].join('\n'));

    expect(result.actions).toEqual([]);
    expect(result.errors.length).toBe(1);
  });
});
