import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildCodexArgs, buildCodexReviewArgs, parseCodexJsonl, summarizeCodexItem } from '../src/services/codex-runner.js';
import { buildCodexSpawnSpec } from '../src/services/codex-bwrap.js';

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

describe('summarizeCodexItem', () => {
  it('keeps key mcp tool call fields for logging', () => {
    expect(summarizeCodexItem({
      type: 'mcp_tool_call',
      server: 'gateway_browser',
      tool_name: 'browser_navigate',
      arguments: { url: 'https://example.com' },
    })).toEqual({
      type: 'mcp_tool_call',
      server: 'gateway_browser',
      toolName: 'browser_navigate',
      argumentsPreview: '{"url":"https://example.com"}',
    });
  });

  it('returns undefined for missing items', () => {
    expect(summarizeCodexItem(undefined)).toBeUndefined();
  });
});

describe('buildCodexArgs', () => {
  it('includes --model when model is provided', () => {
    const args = buildCodexArgs(
      { prompt: 'hello', model: 'gpt-5-codex', workdir: '/tmp/agent-a' },
      'full-auto',
    );
    expect(args).toEqual([
      '--cd',
      '/tmp/agent-a',
      'exec',
      '--json',
      '--full-auto',
      '--skip-git-repo-check',
      '--model',
      'gpt-5-codex',
      'hello',
    ]);
  });

  it('builds resume args without --model when model is empty', () => {
    const args = buildCodexArgs(
      { prompt: 'hello', threadId: 'thread_123', workdir: '/tmp/agent-a' },
      'none',
    );
    expect(args).toEqual([
      '--cd',
      '/tmp/agent-a',
      'exec',
      'resume',
      'thread_123',
      '--json',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      'hello',
    ]);
  });

  it('puts --search before exec when enabled', () => {
    const args = buildCodexArgs(
      { prompt: 'hello', model: 'gpt-5.4', search: true, workdir: '/tmp/agent-b' },
      'full-auto',
    );
    expect(args).toEqual([
      '--search',
      '--cd',
      '/tmp/agent-b',
      'exec',
      '--json',
      '--full-auto',
      '--skip-git-repo-check',
      '--model',
      'gpt-5.4',
      'hello',
    ]);
  });

  it('injects reminder MCP server config when reminder tool context is provided', () => {
    const args = buildCodexArgs(
      {
        prompt: 'remind me later',
        workdir: '/tmp/agent-d',
        reminderToolContext: {
          dbPath: '/tmp/reminders.db',
          channel: 'wecom',
          userId: 'u1',
          agentId: 'assistant',
        },
      },
      'full-auto',
    );

    expect(args).toContain('-c');
    expect(args).toContain('mcp_servers.gateway_reminder.command="node"');
    expect(args).toContain('mcp_servers.gateway_reminder.env.REMINDER_DB_PATH="/tmp/reminders.db"');
    expect(args).toContain('mcp_servers.gateway_reminder.env.REMINDER_CHANNEL="wecom"');
    expect(args).toContain('mcp_servers.gateway_reminder.env.REMINDER_USER_ID="u1"');
    expect(args).toContain('mcp_servers.gateway_reminder.env.REMINDER_AGENT_ID="assistant"');
  });

  it('injects persistent browser MCP url config under gateway_browser only', () => {
    const args = buildCodexArgs(
      {
        prompt: 'open browser',
        workdir: '/tmp/agent-e',
      },
      'full-auto',
      'http://127.0.0.1:8931/mcp',
    );

    expect(args).toContain('-c');
    expect(args).toContain('mcp_servers.gateway_browser.url="http://127.0.0.1:8931/mcp"');
  });
});

describe('buildCodexReviewArgs', () => {
  it('builds uncommitted review args', () => {
    const args = buildCodexReviewArgs(
      { mode: 'uncommitted', model: 'gpt-5.4', search: true, workdir: '/tmp/agent-b' },
      'full-auto',
    );
    expect(args).toEqual([
      '--search',
      '--cd',
      '/tmp/agent-b',
      'exec',
      'review',
      '--json',
      '--full-auto',
      '--skip-git-repo-check',
      '--uncommitted',
      '--model',
      'gpt-5.4',
    ]);
  });

  it('builds base review args with prompt', () => {
    const args = buildCodexReviewArgs(
      { mode: 'base', target: 'main', prompt: 'focus on regressions', workdir: '/tmp/agent-c' },
      'none',
    );
    expect(args).toEqual([
      '--cd',
      '/tmp/agent-c',
      'exec',
      'review',
      '--json',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '--base',
      'main',
      'focus on regressions',
    ]);
  });

  it('injects persistent browser MCP url config for review runs under gateway_browser only', () => {
    const args = buildCodexReviewArgs(
      { mode: 'uncommitted', workdir: '/tmp/agent-f' },
      'full-auto',
      'http://127.0.0.1:8931/mcp',
    );

    expect(args).toContain('-c');
    expect(args).toContain('mcp_servers.gateway_browser.url="http://127.0.0.1:8931/mcp"');
  });
});

describe('buildCodexSpawnSpec', () => {
  it('keeps direct codex spawn when isolation is off', () => {
    const spec = buildCodexSpawnSpec({
      codexBin: '/usr/bin/codex',
      args: ['exec', '--json', 'hello'],
      cwd: '/tmp/agent-direct',
      env: { HOME: '/root', PATH: '/usr/bin' },
      isolationMode: 'off',
      codexHomeDir: '/tmp/instance-home',
    });

    expect(spec.command).toBe('/usr/bin/codex');
    expect(spec.args).toEqual(['exec', '--json', 'hello']);
    expect(spec.cwd).toBe('/tmp/agent-direct');
    expect(spec.env.HOME).toBe('/tmp/instance-home');
    expect(spec.env.CODEX_HOME).toBe('/tmp/instance-home');
  });

  it('wraps codex in bubblewrap and rewrites --cd to /workspace', () => {
    const workspaceDir = '/tmp/agent-bwrap';
    const spec = buildCodexSpawnSpec({
      codexBin: '/usr/bin/codex',
      args: ['--cd', workspaceDir, 'exec', '--json', 'hello'],
      cwd: workspaceDir,
      env: {
        HOME: '/root',
        PATH: '/usr/bin:/bin',
        USER: 'root',
        LOGNAME: 'root',
      },
      isolationMode: 'bwrap',
      codexHomeDir: '/tmp/instance-home-bwrap',
    });

    expect(spec.command).toBe('bwrap');
    expect(spec.cwd).toBe(workspaceDir);
    expect(spec.args).toContain('/workspace');
    expect(spec.args).toContain('--bind');
    expect(spec.args).toContain('/workspace/.codex-runtime/home');
    expect(spec.env.HOME).toBe(`${workspaceDir}/.codex-runtime/home`);
    const cdIndex = spec.args.indexOf('--cd');
    expect(cdIndex).toBeGreaterThan(-1);
    expect(spec.args[cdIndex + 1]).toBe('/workspace');
  });

  it('preserves nested workdir paths inside the mounted workspace', () => {
    const workspaceDir = '/tmp/agent-bwrap-nested';
    const nestedDir = '/tmp/agent-bwrap-nested/sub/task';
    fs.mkdirSync(nestedDir, { recursive: true });

    const spec = buildCodexSpawnSpec({
      codexBin: '/usr/bin/codex',
      args: ['--cd', nestedDir, 'exec', '--json', 'hello'],
      cwd: workspaceDir,
      env: { HOME: '/root', PATH: '/usr/bin:/bin' },
      isolationMode: 'bwrap',
      codexHomeDir: '/tmp/instance-home-bwrap-nested',
    });

    const cdIndex = spec.args.indexOf('--cd');
    expect(cdIndex).toBeGreaterThan(-1);
    expect(spec.args[cdIndex + 1]).toBe('/workspace/sub/task');
  });

  it('syncs instance codex auth into workspace runtime home for bwrap runs', () => {
    const instanceHome = '/tmp/instance-home-sync';
    const workspaceDir = '/tmp/agent-bwrap-sync';
    const authFile = `${instanceHome}/auth.json`;
    const configFile = `${instanceHome}/config.toml`;
    const runtimeAuthFile = `${workspaceDir}/.codex-runtime/home/auth.json`;
    const runtimeConfigFile = `${workspaceDir}/.codex-runtime/home/config.toml`;

    fs.mkdirSync(instanceHome, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(authFile, '{"token":"abc"}');
    fs.writeFileSync(configFile, 'model = "gpt-5"');

    buildCodexSpawnSpec({
      codexBin: '/usr/bin/codex',
      args: ['exec', '--json', 'hello'],
      cwd: workspaceDir,
      env: { HOME: '/root', PATH: '/usr/bin:/bin' },
      isolationMode: 'bwrap',
      codexHomeDir: instanceHome,
    });

    expect(fs.readFileSync(runtimeAuthFile, 'utf8')).toBe('{"token":"abc"}');
    expect(fs.readFileSync(runtimeConfigFile, 'utf8')).toBe('model = "gpt-5"');
  });

  it('removes stale runtime auth files when instance codex home no longer has them', () => {
    const instanceHome = '/tmp/instance-home-prune';
    const workspaceDir = '/tmp/agent-bwrap-prune';
    const runtimeAuthFile = `${workspaceDir}/.codex-runtime/home/auth.json`;

    fs.mkdirSync(instanceHome, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(instanceHome, 'auth.json'), '{"token":"abc"}');

    buildCodexSpawnSpec({
      codexBin: '/usr/bin/codex',
      args: ['exec', '--json', 'hello'],
      cwd: workspaceDir,
      env: { HOME: '/root', PATH: '/usr/bin:/bin' },
      isolationMode: 'bwrap',
      codexHomeDir: instanceHome,
    });
    expect(fs.existsSync(runtimeAuthFile)).toBe(true);

    fs.rmSync(path.join(instanceHome, 'auth.json'), { force: true });
    buildCodexSpawnSpec({
      codexBin: '/usr/bin/codex',
      args: ['exec', '--json', 'hello'],
      cwd: workspaceDir,
      env: { HOME: '/root', PATH: '/usr/bin:/bin' },
      isolationMode: 'bwrap',
      codexHomeDir: instanceHome,
    });

    expect(fs.existsSync(runtimeAuthFile)).toBe(false);
  });
});
