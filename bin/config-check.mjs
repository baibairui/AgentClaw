#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

function asBool(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true';
}

function missingIfEmpty(name) {
  const value = process.env[name];
  return value === undefined || String(value).trim() === '';
}

function commandExists(command) {
  const result = spawnSync('bash', ['-lc', `command -v ${command}`], {
    stdio: 'pipe',
  });
  return result.status === 0;
}

const issues = [];
const warnings = [];
const missingKeys = [];

const wecomEnabled = asBool(process.env.WECOM_ENABLED, true);
const feishuEnabled = asBool(process.env.FEISHU_ENABLED, false);
const feishuLongConnection = asBool(process.env.FEISHU_LONG_CONNECTION, false);
const runnerEnabled = asBool(process.env.RUNNER_ENABLED, true);

if (missingIfEmpty('PORT')) {
  warnings.push('PORT 未配置，将使用默认值 3000。');
}

if (runnerEnabled && missingIfEmpty('CODEX_WORKDIR')) {
  warnings.push('CODEX_WORKDIR 未配置，将使用当前目录。建议配置为你的项目绝对路径。');
}

if (!missingIfEmpty('BROWSER_MCP_URL')) {
  warnings.push('BROWSER_MCP_URL 已废弃且会被忽略；gateway 现在只允许使用内置浏览器 MCP。');
}

if (!commandExists(process.env.CODEX_BIN || 'codex')) {
  issues.push(`未找到 Codex 可执行文件：${process.env.CODEX_BIN || 'codex'}。`);
}

if (wecomEnabled) {
  const required = [
    'WEWORK_CORP_ID',
    'WEWORK_SECRET',
    'WEWORK_AGENT_ID',
    'WEWORK_TOKEN',
    'WEWORK_ENCODING_AES_KEY',
  ];
  for (const key of required) {
    if (missingIfEmpty(key)) {
      issues.push(`WECOM_ENABLED=true 时缺少 ${key}。`);
      missingKeys.push(key);
    }
  }
}

if (feishuEnabled) {
  const required = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET'];
  for (const key of required) {
    if (missingIfEmpty(key)) {
      issues.push(`FEISHU_ENABLED=true 时缺少 ${key}。`);
      missingKeys.push(key);
    }
  }
  if (!feishuLongConnection && missingIfEmpty('FEISHU_VERIFICATION_TOKEN')) {
    warnings.push('当前是飞书 webhook 模式，建议配置 FEISHU_VERIFICATION_TOKEN。');
  }
}

if (feishuLongConnection && !feishuEnabled) {
  warnings.push('FEISHU_LONG_CONNECTION=true 但 FEISHU_ENABLED=false，长连接不会启动。');
}

if (issues.length === 0) {
  console.log('✅ 启动配置检查通过。');
} else {
  console.log('❌ 启动配置检查失败：');
  for (const issue of issues) {
    console.log(`- ${issue}`);
  }
  const uniqueMissingKeys = [...new Set(missingKeys)];
  if (uniqueMissingKeys.length > 0) {
    console.log('\n建议补充到 .env：');
    for (const key of uniqueMissingKeys) {
      console.log(`${key}=<please_set>`);
    }
  }
}

if (warnings.length > 0) {
  console.log('\n⚠️ 建议项：');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

console.log('\n当前模式：');
console.log(`- WECOM_ENABLED=${wecomEnabled}`);
console.log(`- FEISHU_ENABLED=${feishuEnabled}`);
console.log(`- FEISHU_LONG_CONNECTION=${feishuLongConnection}`);
console.log(`- RUNNER_ENABLED=${runnerEnabled}`);

if (issues.length > 0) {
  process.exit(1);
}
