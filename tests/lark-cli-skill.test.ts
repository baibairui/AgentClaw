import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { installLarkCliSkill } from '../src/services/lark-cli-skill.js';

describe('installLarkCliSkill', () => {
  it('installs the lark-cli skill and updates agent routing guidance', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lark-cli-workspace-'));
    fs.writeFileSync(path.join(workspaceDir, 'AGENTS.md'), '# Agent Rules\n', 'utf8');

    installLarkCliSkill(workspaceDir);

    const skillRoot = path.join(workspaceDir, '.codex', 'skills', 'lark-cli');
    const skillContent = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
    const agentPrompt = fs.readFileSync(path.join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
    const agentsMd = fs.readFileSync(path.join(workspaceDir, 'AGENTS.md'), 'utf8');

    expect(skillContent).toContain('npm install -g @larksuite/cli');
    expect(skillContent).toContain('npx skills add larksuite/cli -y -g');
    expect(skillContent).toContain('lark-cli docs +update');
    expect(skillContent).toContain('Do not use `feishu-canvas`');
    expect(agentPrompt).toContain('official larksuite/cli tool');
    expect(agentPrompt).toContain('Do not use feishu-canvas');
    expect(agentsMd).toContain('./.codex/skills/lark-cli/SKILL.md');
    expect(agentsMd).toContain('统一使用 `./.codex/skills/lark-cli/SKILL.md`');
    expect(agentsMd).toContain('不要继续调用仓库里的旧飞书脚本');
  });
});
