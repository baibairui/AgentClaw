#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const cliFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(cliFile), '..');

process.chdir(projectRoot);

const args = process.argv.slice(2);
const command = args[0] ?? 'help';

function run(bin, binArgs) {
  const child = spawn(bin, binArgs, {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

function printHelp() {
  console.log(`
codexclaw <command>

Commands:
  up            启动（开发模式，启动前自动配置检查）
  dev           同 up
  start         生产启动（启动前自动配置检查）
  setup         逐行交互配置向导（写入 .env）
  check         仅执行配置检查
  build         执行构建
  test          执行测试
  help          查看帮助
`.trim());
}

switch (command) {
  case 'up':
  case 'dev':
    run('node', ['./bin/start-gateway.mjs', 'dev']);
    break;
  case 'start':
    run('node', ['./bin/start-gateway.mjs', 'start']);
    break;
  case 'setup':
    run('node', ['./bin/setup-wizard.mjs']);
    break;
  case 'check':
    run('node', ['./bin/config-check.mjs']);
    break;
  case 'build':
    run('npm', ['run', 'build']);
    break;
  case 'test':
    run('npm', ['run', 'test']);
    break;
  case 'help':
  default:
    printHelp();
    process.exit(command === 'help' ? 0 : 1);
}
