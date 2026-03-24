#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { buildStartupFailureHints } from './lib/install-hints.mjs';

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const cwd = process.cwd();
const forceXvfb = process.env.GATEWAY_FORCE_XVFB === 'true';

function runConfigCheck() {
  return new Promise((resolve) => {
    const check = spawn('node', ['./bin/config-check.mjs'], {
      cwd,
      stdio: 'inherit',
    });
    check.on('exit', (code) => {
      resolve(code === 0);
    });
  });
}

function resolveGatewayRootDir() {
  const raw = process.env.GATEWAY_ROOT_DIR?.trim();
  if (!raw) {
    return cwd;
  }
  return path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
}

function resolveWeixinSessionPath() {
  return path.join(resolveGatewayRootDir(), '.data', 'weixin-session.json');
}

function shouldRequireWeixinLogin() {
  if (process.env.WEIXIN_ENABLED !== 'true') {
    return false;
  }
  if (process.env.WEIXIN_BOT_TOKEN?.trim()) {
    return false;
  }
  return !fs.existsSync(resolveWeixinSessionPath());
}

async function promptWeixinLogin() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('已启用微信渠道，但尚未登录微信。请先执行：npm run weixin:login');
    return false;
  }

  console.log('');
  console.log('检测到已启用微信渠道，但当前还没有微信登录会话。');
  console.log(`会话文件预期位置：${resolveWeixinSessionPath()}`);
  console.log('需要先扫码登录微信，才能启动个人微信渠道。');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await rl.question('现在执行微信扫码登录吗？[Y/n] ');
  rl.close();

  if (answer.trim().toLowerCase() === 'n') {
    console.error('已取消启动。你可以稍后手动执行：npm run weixin:login');
    return false;
  }

  const ok = await new Promise((resolve) => {
    const child = spawn('npm', ['run', 'weixin:login'], {
      cwd,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      resolve(code === 0);
    });
  });

  if (!ok) {
    console.error('微信登录未完成，启动已中止。');
    return false;
  }

  return true;
}

function hasDisplayServer() {
  return Boolean(process.env.DISPLAY && process.env.DISPLAY.trim());
}

function findCommand(command) {
  const pathEnv = process.env.PATH ?? '';
  const pathEntries = pathEnv.split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, command);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveCommand(command, args) {
  if (!forceXvfb && hasDisplayServer()) {
    return { command, args };
  }

  const xvfbRun = findCommand('xvfb-run');
  if (!xvfbRun) {
    console.error(
      '当前未检测到可用的 DISPLAY，且系统中未安装 xvfb-run。请安装 xvfb，或在有图形界面的会话中启动。',
    );
    process.exit(1);
  }

  return {
    command: xvfbRun,
    args: ['-a', '--server-args=-screen 0 1440x900x24', command, ...args],
  };
}

function runCommand(command, args) {
  const resolved = resolveCommand(command, args);
  const child = spawn(resolved.command, resolved.args, {
    cwd,
    stdio: 'inherit',
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

const ok = await runConfigCheck();
if (!ok) {
  console.error('');
  for (const line of buildStartupFailureHints(process.env)) {
    console.error(line);
  }
  process.exit(1);
}

if (shouldRequireWeixinLogin()) {
  const loginReady = await promptWeixinLogin();
  if (!loginReady) {
    process.exit(1);
  }
}

if (mode === 'start') {
  const distServer = path.join(cwd, 'dist', 'server.js');
  if (!fs.existsSync(distServer)) {
    console.error('未找到 dist/server.js，请先执行 npm run build。');
    process.exit(1);
  }
  runCommand('node', ['./dist/server.js']);
} else {
  runCommand('tsx', ['watch', 'src/server.ts']);
}
