const MAX_REMINDER_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

export interface ReminderAction {
  delayMs: number;
  message: string;
}

export interface ReminderActionParseResult {
  userText: string;
  actions: ReminderAction[];
  errors: string[];
}

interface ReminderActionPayload {
  delay?: unknown;
  delayMs?: unknown;
  message?: unknown;
}

const REMINDER_BLOCK_RE = /```reminder-action\s*([\s\S]*?)```/gi;

export function parseReminderDelayMs(input: string): number | undefined {
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
  const secondsUnits = ['秒', '秒钟', 's', 'sec', 'secs', 'second', 'seconds'];
  const minutesUnits = ['分', '分钟', 'm', 'min', 'mins', 'minute', 'minutes'];
  const hoursUnits = ['时', '小时', 'h', 'hr', 'hrs', 'hour', 'hours'];
  const daysUnits = ['天', 'd', 'day', 'days'];

  let delayMs = 0;
  if (secondsUnits.includes(unit)) {
    delayMs = amount * 1000;
  } else if (minutesUnits.includes(unit)) {
    delayMs = amount * 60 * 1000;
  } else if (hoursUnits.includes(unit)) {
    delayMs = amount * 60 * 60 * 1000;
  } else if (daysUnits.includes(unit)) {
    delayMs = amount * 24 * 60 * 60 * 1000;
  } else {
    return undefined;
  }
  if (delayMs > MAX_REMINDER_DELAY_MS) {
    return undefined;
  }
  return delayMs;
}

export function extractReminderActionsFromAssistantText(text: string): ReminderActionParseResult {
  const actions: ReminderAction[] = [];
  const errors: string[] = [];
  let userText = text;
  let matched = false;
  REMINDER_BLOCK_RE.lastIndex = 0;
  for (const match of text.matchAll(REMINDER_BLOCK_RE)) {
    matched = true;
    const jsonText = (match[1] ?? '').trim();
    if (!jsonText) {
      errors.push('提醒动作块为空');
      continue;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(jsonText);
    } catch {
      errors.push('提醒动作 JSON 解析失败');
      continue;
    }

    const payloadList = Array.isArray(payload)
      ? payload
      : [payload];

    for (const item of payloadList) {
      const parsed = parseReminderActionPayload(item as ReminderActionPayload);
      if ('error' in parsed) {
        errors.push(parsed.error);
      } else {
        actions.push(parsed.action);
      }
    }
  }

  if (matched) {
    userText = text.replace(REMINDER_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  return {
    userText,
    actions,
    errors,
  };
}

function parseReminderActionPayload(payload: ReminderActionPayload): { action: ReminderAction } | { error: string } {
  const message = String(payload.message ?? '').trim();
  if (!message) {
    return { error: '提醒动作缺少 message' };
  }

  if (typeof payload.delayMs === 'number' && Number.isFinite(payload.delayMs)) {
    const rounded = Math.floor(payload.delayMs);
    if (rounded <= 0 || rounded > MAX_REMINDER_DELAY_MS) {
      return { error: '提醒动作 delayMs 超出范围' };
    }
    return {
      action: {
        delayMs: rounded,
        message,
      },
    };
  }

  if (typeof payload.delay === 'string') {
    const delayMs = parseReminderDelayMs(payload.delay);
    if (!delayMs) {
      return { error: '提醒动作 delay 格式无效' };
    }
    return {
      action: {
        delayMs,
        message,
      },
    };
  }

  return { error: '提醒动作缺少 delay 或 delayMs' };
}
