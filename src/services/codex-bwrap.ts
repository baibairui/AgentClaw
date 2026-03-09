import fs from 'node:fs';
import path from 'node:path';

export type CodexWorkdirIsolationMode = 'off' | 'bwrap';

export interface CodexSpawnSpec {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

interface BuildCodexSpawnSpecInput {
  codexBin: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  isolationMode: CodexWorkdirIsolationMode;
  codexHomeDir?: string;
}

const DEFAULT_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const RUNTIME_HOME_DIR = '.codex-runtime/home';
const CODEx_SYNC_FILES = ['auth.json', 'config.toml', 'models_cache.json'] as const;

export function buildCodexSpawnSpec(input: BuildCodexSpawnSpecInput): CodexSpawnSpec {
  const hostEnv = buildHostCodexEnv(input.env, input.codexHomeDir);
  if (input.isolationMode === 'off') {
    return {
      command: input.codexBin,
      args: input.args,
      cwd: input.cwd,
      env: hostEnv,
    };
  }

  const workspaceDir = path.resolve(input.cwd);
  const runtimeHomeDir = path.join(workspaceDir, RUNTIME_HOME_DIR);
  syncCodexRuntimeHome(input.codexHomeDir, runtimeHomeDir);

  return {
    command: 'bwrap',
    args: buildBubblewrapArgs(input.codexBin, input.args, workspaceDir, runtimeHomeDir),
    cwd: workspaceDir,
    env: buildIsolatedEnv(hostEnv, runtimeHomeDir),
  };
}

function buildBubblewrapArgs(codexBin: string, args: string[], workspaceDir: string, runtimeHomeDir: string): string[] {
  const sandboxArgs = normalizeArgsForWorkspace(args, workspaceDir);
  const result = [
    '--die-with-parent',
    '--new-session',
    '--unshare-all',
    '--share-net',
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--tmpfs',
    '/tmp',
  ];

  appendIfExists(result, ['--ro-bind', '/usr', '/usr']);
  appendIfExists(result, ['--ro-bind', '/bin', '/bin']);
  appendIfExists(result, ['--ro-bind', '/lib', '/lib']);
  appendIfExists(result, ['--ro-bind', '/lib64', '/lib64']);
  appendIfExists(result, ['--ro-bind', '/etc', '/etc']);

  result.push(
    '--bind',
    workspaceDir,
    '/workspace',
    '--bind',
    runtimeHomeDir,
    '/workspace/.codex-runtime/home',
    '--chdir',
    '/workspace',
    '--setenv',
    'HOME',
    '/workspace/.codex-runtime/home',
    '--setenv',
    'CODEX_HOME',
    '/workspace/.codex-runtime/home',
    '--setenv',
    'XDG_CONFIG_HOME',
    '/workspace/.codex-runtime/home/.config',
    '--setenv',
    'XDG_CACHE_HOME',
    '/workspace/.codex-runtime/home/.cache',
    '--setenv',
    'TMPDIR',
    '/tmp',
    '--setenv',
    'PATH',
    DEFAULT_PATH,
    codexBin,
    ...sandboxArgs,
  );

  return result;
}

function buildHostCodexEnv(env: NodeJS.ProcessEnv, codexHomeDir?: string): NodeJS.ProcessEnv {
  if (!codexHomeDir) {
    return { ...env };
  }
  const resolvedHome = path.resolve(codexHomeDir);
  fs.mkdirSync(resolvedHome, { recursive: true });
  fs.mkdirSync(path.join(resolvedHome, '.config'), { recursive: true });
  fs.mkdirSync(path.join(resolvedHome, '.cache'), { recursive: true });
  return {
    ...env,
    HOME: resolvedHome,
    CODEX_HOME: resolvedHome,
    XDG_CONFIG_HOME: path.join(resolvedHome, '.config'),
    XDG_CACHE_HOME: path.join(resolvedHome, '.cache'),
  };
}

function buildIsolatedEnv(env: NodeJS.ProcessEnv, runtimeHomeDir: string): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = {
    PATH: env.PATH || DEFAULT_PATH,
    HOME: runtimeHomeDir,
    CODEX_HOME: runtimeHomeDir,
    XDG_CONFIG_HOME: path.join(runtimeHomeDir, '.config'),
    XDG_CACHE_HOME: path.join(runtimeHomeDir, '.cache'),
    TMPDIR: '/tmp',
    USER: env.USER || 'root',
    LOGNAME: env.LOGNAME || env.USER || 'root',
    LANG: env.LANG || 'C.UTF-8',
    LC_ALL: env.LC_ALL || 'C.UTF-8',
    TERM: env.TERM || 'xterm-256color',
    HTTPS_PROXY: env.HTTPS_PROXY,
    HTTP_PROXY: env.HTTP_PROXY,
    ALL_PROXY: env.ALL_PROXY,
    NO_PROXY: env.NO_PROXY,
    no_proxy: env.no_proxy,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL,
    OPENAI_ORG_ID: env.OPENAI_ORG_ID,
    OPENAI_PROJECT_ID: env.OPENAI_PROJECT_ID,
    CHATGPT_BASE_URL: env.CHATGPT_BASE_URL,
    CHATGPT_API_KEY: env.CHATGPT_API_KEY,
    CODEX_DISABLE_WRITES_OUTSIDE_CWD: 'true',
  };

  for (const [key, value] of Object.entries(nextEnv)) {
    if (value === undefined) {
      delete nextEnv[key];
    }
  }
  return nextEnv;
}

function syncCodexRuntimeHome(sourceDir: string | undefined, targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(path.join(targetDir, '.config'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, '.cache'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'tmp'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'shell_snapshots'), { recursive: true });

  if (!sourceDir) {
    return;
  }

  for (const fileName of CODEx_SYNC_FILES) {
    const sourceFile = path.join(sourceDir, fileName);
    const targetFile = path.join(targetDir, fileName);
    if (!fs.existsSync(sourceFile) || !fs.statSync(sourceFile).isFile()) {
      fs.rmSync(targetFile, { force: true });
      continue;
    }
    fs.copyFileSync(sourceFile, targetFile);
  }
}

function normalizeArgsForWorkspace(args: string[], workspaceDir: string): string[] {
  const output = [...args];
  const resolvedWorkspaceDir = path.resolve(workspaceDir);
  for (let i = 0; i < output.length - 1; i += 1) {
    if (output[i] === '--cd') {
      const requestedDir = path.resolve(output[i + 1]);
      const relativePath = path.relative(resolvedWorkspaceDir, requestedDir);
      if (relativePath === '') {
        output[i + 1] = '/workspace';
        continue;
      }
      if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
        output[i + 1] = path.posix.join('/workspace', relativePath.split(path.sep).join('/'));
      }
    }
  }
  return output;
}

function appendIfExists(target: string[], args: [string, string, string]): void {
  if (fs.existsSync(args[1])) {
    target.push(...args);
  }
}
