import { spawn } from 'node:child_process';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CodexRunner');

export interface CodexRunInput {
  prompt: string;
  threadId?: string;
  /** 每产出一条 agent_message 就回调一次 */
  onMessage?: (text: string) => void;
}

export interface CodexRunResult {
  threadId: string;
  rawOutput: string;
}

export interface ParsedCodexOutput {
  threadId?: string;
  answer: string;
}

interface CodexRunnerOptions {
  codexBin?: string;
  workdir?: string;
  timeoutMs?: number;
  /** 'full-auto' (沙箱) 或 'none' (无沙箱) */
  sandbox?: 'full-auto' | 'none';
}

const DEFAULT_TIMEOUT_MS = 180_000;

export function parseCodexJsonl(raw: string): ParsedCodexOutput {
  let threadId: string | undefined;
  let answer = '';

  for (const event of iterateCodexEvents(raw)) {
    if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
      threadId = event.thread_id;
    }

    if (event.type === 'item.completed') {
      const item = event.item as Record<string, unknown> | undefined;
      if (item?.type === 'agent_message' && typeof item.text === 'string') {
        answer = item.text;
      }
    }
  }

  return {
    threadId,
    answer: answer || '（Codex 未返回可解析内容）',
  };
}

function *iterateCodexEvents(raw: string): Generator<Record<string, unknown>> {
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    try {
      yield JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
  }
}

export class CodexRunner {
  private readonly codexBin: string;
  private readonly workdir: string;
  private readonly timeoutMs: number;
  private readonly sandbox: 'full-auto' | 'none';

  constructor(options: CodexRunnerOptions = {}) {
    this.codexBin = options.codexBin ?? 'codex';
    this.workdir = options.workdir ?? process.cwd();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sandbox = options.sandbox ?? 'full-auto';
    log.debug('CodexRunner 构造完成', {
      codexBin: this.codexBin,
      workdir: this.workdir,
      timeoutMs: this.timeoutMs,
      sandbox: this.sandbox,
    });
  }

  run(input: CodexRunInput): Promise<CodexRunResult> {
    const sandboxFlag = this.sandbox === 'none'
      ? '--dangerously-bypass-approvals-and-sandbox'
      : '--full-auto';

    const args = input.threadId
      ? ['exec', 'resume', input.threadId, '--json', sandboxFlag, '--skip-git-repo-check', input.prompt]
      : ['exec', '--json', sandboxFlag, '--skip-git-repo-check', input.prompt];

    log.info('Codex 子进程启动', {
      bin: this.codexBin,
      args: redactArgsForLog(args),
      cwd: this.workdir,
      isResume: !!input.threadId,
      threadId: maskThreadId(input.threadId),
    });

    return new Promise<CodexRunResult>((resolve, reject) => {
      const child = spawn(this.codexBin, args, {
        cwd: this.workdir,
        env: process.env,
      });

      log.debug('Codex 子进程已 spawn', { pid: child.pid });

      let stdout = '';
      let stderr = '';
      let settled = false;
      // 用于处理跨 chunk 的不完整行
      let lineBuf = '';
      let eventCount = 0;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill('SIGKILL');
        log.error('Codex 子进程超时，已 SIGKILL', {
          pid: child.pid,
          timeoutMs: this.timeoutMs,
          stdoutLength: stdout.length,
          stderrLength: stderr.length,
          eventCount,
        });
        reject(new Error(`codex timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        stdout += text;

        // 逐行解析，实时回调 agent_message
        lineBuf += text;
        const lines = lineBuf.split('\n');
        // 最后一个元素可能是不完整行，留到下次
        lineBuf = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          handleCodexLine(line, input.onMessage, () => {
            eventCount++;
          });
        }
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        stderr += text;
        log.warn('Codex stderr 输出', { text: text.substring(0, 500) });
      });

      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        log.error('Codex 子进程 error 事件', error);
        reject(error);
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);

        log.info('Codex 子进程退出', {
          pid: child.pid,
          exitCode: code,
          stdoutLength: stdout.length,
          stderrLength: stderr.length,
          eventCount,
        });

        if (code !== 0) {
          log.error('Codex 子进程异常退出', {
            exitCode: code,
            stderr: stderr.substring(0, 500),
            stdout: stdout.substring(0, 200),
          });
          reject(new Error(`codex exited with code ${code}: ${stderr || stdout}`));
          return;
        }

        // flush 最后一行（可能没有以换行结束）
        const tail = lineBuf.trim();
        if (tail) {
          handleCodexLine(tail, input.onMessage, () => {
            eventCount++;
          });
        }

        const parsed = parseCodexJsonl(stdout);
        const threadId = parsed.threadId ?? input.threadId;
        if (!threadId) {
          log.error('Codex 输出中未找到 threadId', {
            stdoutPreview: stdout.substring(0, 500),
          });
          reject(new Error('thread id not found in codex output'));
          return;
        }

        log.info('Codex 执行成功', {
          threadId,
          answerLength: parsed.answer.length,
          answerPreview: parsed.answer.substring(0, 200),
        });

        resolve({
          threadId,
          rawOutput: stdout,
        });
      });
    });
  }
}

function redactArgsForLog(args: string[]): string[] {
  if (args.length === 0) {
    return [];
  }
  const output = [...args];
  output[output.length - 1] = '<prompt omitted>';
  for (let i = 0; i < output.length; i++) {
    if (output[i] === 'resume' && i + 1 < output.length) {
      output[i + 1] = maskThreadId(output[i + 1]);
    }
  }
  return output;
}

function maskThreadId(threadId?: string): string {
  if (!threadId) {
    return '(新)';
  }
  if (threadId.length <= 8) {
    return '****';
  }
  return `${threadId.slice(0, 4)}...${threadId.slice(-4)}`;
}

function handleCodexLine(
  line: string,
  onMessage: CodexRunInput['onMessage'],
  onEvent: () => void,
): void {
  try {
    const event = JSON.parse(line) as Record<string, unknown>;
    onEvent();
    log.debug('Codex 事件', {
      type: event.type,
      itemType: (event.item as Record<string, unknown> | undefined)?.type,
    });

    if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
      log.info('Codex thread.started', { threadId: event.thread_id });
    }

    if (event.type === 'item.completed') {
      const item = event.item as Record<string, unknown> | undefined;
      if (item?.type === 'agent_message' && typeof item.text === 'string' && onMessage) {
        log.info('Codex item.completed agent_message', {
          textLength: item.text.length,
          textPreview: item.text.substring(0, 200),
        });
        onMessage(item.text);
      }
    }
  } catch {
    log.debug('Codex stdout 非 JSON 行', { line: line.substring(0, 100) });
  }
}
