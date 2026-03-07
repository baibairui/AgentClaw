#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const cwd = process.cwd();

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

function runCommand(command, args) {
  const child = spawn(command, args, {
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
  console.error('\n请先补齐 .env 中缺失项，再重新执行启动命令。');
  process.exit(1);
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
