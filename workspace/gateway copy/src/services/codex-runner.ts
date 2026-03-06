import { spawn } from 'node:child_process';

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
}

const DEFAULT_TIMEOUT_MS = 180_000;

export function parseCodexJsonl(raw: string): ParsedCodexOutput {
  let threadId: string | undefined;
  let answer = '';

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
        threadId = event.thread_id;
      }

      if (event.type === 'item.completed') {
        const item = event.item as Record<string, unknown> | undefined;
        if (item?.type === 'agent_message' && typeof item.text === 'string') {
          answer = item.text;
        }
      }
    } catch {
      continue;
    }
  }

  return {
    threadId,
    answer: answer || '（Codex 未返回可解析内容）',
  };
}

export class CodexRunner {
  private readonly codexBin: string;
  private readonly workdir: string;
  private readonly timeoutMs: number;

  constructor(options: CodexRunnerOptions = {}) {
    this.codexBin = options.codexBin ?? 'codex';
    this.workdir = options.workdir ?? process.cwd();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  run(input: CodexRunInput): Promise<CodexRunResult> {
    const args = input.threadId
      ? ['exec', 'resume', input.threadId, '--json', '--full-auto', '--skip-git-repo-check', input.prompt]
      : ['exec', '--json', '--full-auto', '--skip-git-repo-check', input.prompt];

    return new Promise<CodexRunResult>((resolve, reject) => {
      const child = spawn(this.codexBin, args, {
        cwd: this.workdir,
        env: process.env,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      // 用于处理跨 chunk 的不完整行
      let lineBuf = '';

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill('SIGKILL');
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
          try {
            const event = JSON.parse(line) as Record<string, unknown>;
            // 发现 threadId
            if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
              // threadId 会在 close 时从 stdout 再解析
            }
            // 实时推送每条 agent_message
            if (event.type === 'item.completed') {
              const item = event.item as Record<string, unknown> | undefined;
              if (item?.type === 'agent_message' && typeof item.text === 'string' && input.onMessage) {
                input.onMessage(item.text);
              }
            }
          } catch {
            // 非 JSON 行，忽略
          }
        }
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);

        if (code !== 0) {
          reject(new Error(`codex exited with code ${code}: ${stderr || stdout}`));
          return;
        }

        const parsed = parseCodexJsonl(stdout);
        const threadId = parsed.threadId ?? input.threadId;
        if (!threadId) {
          reject(new Error('thread id not found in codex output'));
          return;
        }

        resolve({
          threadId,
          rawOutput: stdout,
        });
      });
    });
  }
}
