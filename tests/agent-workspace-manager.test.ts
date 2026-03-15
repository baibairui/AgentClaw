import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { AgentWorkspaceManager } from '../src/services/agent-workspace-manager.js';

describe('AgentWorkspaceManager', () => {
  it('creates scaffold for the built-in default workspace inside the agents directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-default-'));
    const manager = new AgentWorkspaceManager(dir);

    const result = manager.ensureDefaultWorkspace('wecom:u1');

    expect(result.agentId).toBe('default');
    expect(result.workspaceDir).toContain(path.join('users'));
    expect(result.workspaceDir).toContain(path.join('agents', 'default'));
    expect(fs.existsSync(path.join(result.workspaceDir, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, 'SOUL.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, 'memory', 'daily'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, '.codex', 'workspace.json'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, '.codex', 'skills', 'gateway-browser', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, '.codex', 'skills', 'gateway-desktop', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, '.codex', 'skills', 'reminder-tool', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, 'agent.md'))).toBe(false);
    expect(fs.existsSync(path.join(result.workspaceDir, 'TOOLS.md'))).toBe(false);
    expect(fs.existsSync(path.join(result.workspaceDir, 'browser-playbook.md'))).toBe(false);
    expect(fs.existsSync(path.join(result.workspaceDir, 'feishu-ops-playbook.md'))).toBe(false);
  });

  it('creates a minimal workspace scaffold plus runtime and user identity files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-'));
    const manager = new AgentWorkspaceManager(dir);

    const result = manager.createWorkspace({
      userId: 'wecom:u1',
      agentName: 'Frontend Pair',
      existingAgentIds: [],
    });

    const userDir = findOnlyUserDir(dir);
    const agentsMd = fs.readFileSync(path.join(result.workspaceDir, 'AGENTS.md'), 'utf8');
    const soul = fs.readFileSync(path.join(result.workspaceDir, 'SOUL.md'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(result.workspaceDir, '.codex', 'workspace.json'), 'utf8')) as Record<string, unknown>;

    expect(result.agentId).toBe('frontend-pair');
    expect(result.workspaceDir).toBe(path.join(userDir, 'agents', 'frontend-pair'));
    expect(fs.existsSync(path.join(dir, 'runtime', 'shared-context.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'runtime', 'house-rules.md'))).toBe(true);
    expect(fs.existsSync(path.join(userDir, 'user.md'))).toBe(true);
    expect(fs.existsSync(path.join(userDir, 'agents'))).toBe(true);
    expect(fs.existsSync(path.join(userDir, 'internal'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, 'memory', 'daily'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, '.codex', 'skills', 'feishu-official-ops', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, '.codex', 'skills', 'social-intel', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, 'agent.md'))).toBe(false);
    expect(fs.existsSync(path.join(result.workspaceDir, 'TOOLS.md'))).toBe(false);
    expect(fs.existsSync(path.join(result.workspaceDir, 'browser-playbook.md'))).toBe(false);
    expect(fs.existsSync(path.join(result.workspaceDir, 'feishu-ops-playbook.md'))).toBe(false);
    expect(fs.existsSync(path.join(result.workspaceDir, 'memory', 'identity.md'))).toBe(false);
    expect(fs.existsSync(path.join(result.workspaceDir, 'memory', 'profile.md'))).toBe(false);
    expect(agentsMd).toContain('./SOUL.md');
    expect(agentsMd).toContain('../../user.md');
    expect(agentsMd).toContain('../../../runtime/house-rules.md');
    expect(agentsMd).toContain('./.codex/skills/gateway-browser/SKILL.md');
    expect(agentsMd).toContain('./.codex/skills/feishu-official-ops/SKILL.md');
    expect(agentsMd).not.toContain('browser-playbook');
    expect(agentsMd).not.toContain('feishu-ops-playbook');
    expect(soul).toContain('- Agent name: Frontend Pair');
    expect(soul).toContain('- Agent ID: frontend-pair');
    expect(soul).toContain('- Role: Frontend Pair');
    expect(manifest.agentId).toBe('frontend-pair');
    expect(manifest.template).toBe('default');
  });

  it('creates hidden system memory steward workspace under the internal directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-'));
    const manager = new AgentWorkspaceManager(dir);

    const result = manager.ensureSystemMemoryStewardWorkspace('wecom:u1');

    const agentsMd = fs.readFileSync(path.join(result.workspaceDir, 'AGENTS.md'), 'utf8');
    const soul = fs.readFileSync(path.join(result.workspaceDir, 'SOUL.md'), 'utf8');

    expect(result.workspaceDir).toContain(path.join('internal', 'memory-steward'));
    expect(fs.existsSync(path.join(result.workspaceDir, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, '.codex', 'workspace.json'))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, 'agent.md'))).toBe(false);
    expect(fs.existsSync(path.join(result.workspaceDir, 'TOOLS.md'))).toBe(false);
    expect(agentsMd).toContain('Memory Steward');
    expect(agentsMd).toContain('../../user.md');
    expect(soul).toContain('- Role: System Memory Steward');
  });

  it('creates minimal onboarding scaffolds without legacy checklist files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-'));
    const manager = new AgentWorkspaceManager(dir);

    const memoryOnboarding = manager.createWorkspace({
      userId: 'wecom:u1',
      agentName: '记忆初始化引导',
      existingAgentIds: [],
      template: 'memory-onboarding',
    });
    const skillOnboarding = manager.createWorkspace({
      userId: 'wecom:u1',
      agentName: '技能扩展助手',
      existingAgentIds: [memoryOnboarding.agentId],
      template: 'skill-onboarding',
    });

    const memorySoul = fs.readFileSync(path.join(memoryOnboarding.workspaceDir, 'SOUL.md'), 'utf8');
    const skillSoul = fs.readFileSync(path.join(skillOnboarding.workspaceDir, 'SOUL.md'), 'utf8');

    expect(memoryOnboarding.agentId).toBe('memory-onboarding');
    expect(skillOnboarding.agentId).toBe('skill-onboarding');
    expect(memorySoul).toContain('记忆初始化引导');
    expect(skillSoul).toContain('技能扩展助手');
    expect(fs.existsSync(path.join(memoryOnboarding.workspaceDir, 'memory-init-checklist.md'))).toBe(false);
    expect(fs.existsSync(path.join(skillOnboarding.workspaceDir, 'skill-install-checklist.md'))).toBe(false);
  });

  it('detects whether the user identity has meaningful content', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-'));
    const manager = new AgentWorkspaceManager(dir);
    const userId = 'wecom:u1';

    manager.createWorkspace({
      userId,
      agentName: '个人助理',
      existingAgentIds: [],
    });
    expect(manager.isSharedMemoryEmpty(userId)).toBe(true);

    const userDir = findOnlyUserDir(dir);
    fs.appendFileSync(path.join(userDir, 'user.md'), '- Preferred name: Alice\n', 'utf8');

    expect(manager.isSharedMemoryEmpty(userId)).toBe(false);
  });

  it('detects whether a workspace soul is initialized', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-'));
    const manager = new AgentWorkspaceManager(dir);
    const userId = 'wecom:u1';

    const workspace = manager.createWorkspace({
      userId,
      agentName: 'first-agent',
      existingAgentIds: [],
    });
    expect(manager.isWorkspaceIdentityEmpty(workspace.workspaceDir)).toBe(true);

    fs.writeFileSync(path.join(workspace.workspaceDir, 'SOUL.md'), [
      '# SOUL',
      '',
      '- Agent name: first-agent',
      '- Agent ID: first-agent',
      '- Role: first-agent',
      '- Mission: 负责需求澄清与实现',
      '- Working style: 直接、基于事实',
      '- Decision principles:',
      '  - 遵守事实',
      '- Boundaries:',
      '  - 不做半途兼容方案',
      '- Success criteria: 可验证、可回归、可上线',
      '',
    ].join('\n'), 'utf8');

    expect(manager.isWorkspaceIdentityEmpty(workspace.workspaceDir)).toBe(false);
  });
});

function findOnlyUserDir(rootDir: string): string {
  const usersDir = path.join(rootDir, 'users');
  const userDirs = fs.readdirSync(usersDir);
  expect(userDirs).toHaveLength(1);
  return path.join(usersDir, userDirs[0]!);
}
