export type ReminderChannel = 'wecom' | 'feishu';

export interface ReminderTask {
  id: string;
  channel: ReminderChannel;
  userId: string;
  message: string;
  createdAt: number;
  dueAt: number;
}

export interface ScheduleReminderInput {
  channel: ReminderChannel;
  userId: string;
  delayMs: number;
  message: string;
}

type ReminderCallback = (task: ReminderTask) => Promise<void> | void;

export class ReminderScheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private static readonly MAX_TIMEOUT_MS = 2_147_483_647;

  schedule(input: ScheduleReminderInput, onTrigger: ReminderCallback): ReminderTask {
    const now = Date.now();
    const delayMs = Math.max(0, Math.floor(input.delayMs));
    const dueAt = now + delayMs;
    const id = `${now}-${Math.random().toString(36).slice(2, 10)}`;
    const task: ReminderTask = {
      id,
      channel: input.channel,
      userId: input.userId,
      message: input.message,
      createdAt: now,
      dueAt,
    };

    const scheduleStep = (remainingMs: number): void => {
      const nextDelayMs = Math.min(remainingMs, ReminderScheduler.MAX_TIMEOUT_MS);
      const timer = setTimeout(async () => {
        if (remainingMs > ReminderScheduler.MAX_TIMEOUT_MS) {
          scheduleStep(remainingMs - ReminderScheduler.MAX_TIMEOUT_MS);
          return;
        }
        this.timers.delete(id);
        try {
          await onTrigger(task);
        } catch {
          // Swallow trigger errors to avoid unhandled rejection from timer callback.
        }
      }, nextDelayMs);
      timer.unref?.();
      this.timers.set(id, timer);
    };

    scheduleStep(delayMs);
    return task;
  }
}
