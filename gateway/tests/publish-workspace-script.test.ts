import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function writeExecutable(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}

describe('publish-workspace.sh', () => {
  it('publishes workspace into live gateway while preserving runtime state', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-workspace-'));
    const sourceDir = path.join(tempRoot, 'source');
    const targetDir = path.join(tempRoot, 'live');
    const backupDir = path.join(tempRoot, 'backups');
    const fakeBinDir = path.join(tempRoot, 'bin');
    const commandLog = path.join(tempRoot, 'commands.log');

    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });
    fs.mkdirSync(fakeBinDir, { recursive: true });

    fs.mkdirSync(path.join(sourceDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'package.json'), '{"name":"workspace-gateway"}\n');
    fs.writeFileSync(path.join(sourceDir, 'package-lock.json'), '{"lockfileVersion":3}\n');
    fs.writeFileSync(path.join(sourceDir, 'README.md'), 'new readme\n');
    fs.writeFileSync(path.join(sourceDir, 'bin', 'publish-workspace.sh'), '#!/usr/bin/env bash\n');
    fs.writeFileSync(path.join(sourceDir, 'src', 'server.ts'), 'export const live = true;\n');

    fs.mkdirSync(path.join(targetDir, '.data'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'workspace'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, '.env'), 'SECRET=keep-me\n');
    fs.writeFileSync(path.join(targetDir, '.data', 'sessions.db'), 'db');
    fs.writeFileSync(path.join(targetDir, 'workspace', 'keep.txt'), 'workspace');
    fs.writeFileSync(path.join(targetDir, 'obsolete.txt'), 'remove me');

    const logCommand = `printf '%s|%s\\n' \"$PWD\" \"$*\" >> \"${commandLog}\"`;
    writeExecutable(
      path.join(fakeBinDir, 'npm'),
      `#!/usr/bin/env bash
set -euo pipefail
${logCommand}
exit 0
`,
    );
    writeExecutable(
      path.join(fakeBinDir, 'pm2'),
      `#!/usr/bin/env bash
set -euo pipefail
${logCommand}
exit 0
`,
    );
    writeExecutable(
      path.join(fakeBinDir, 'curl'),
      `#!/usr/bin/env bash
set -euo pipefail
${logCommand}
printf '{"ok":true}'
`,
    );

    const scriptPath = path.resolve(process.cwd(), 'bin', 'publish-workspace.sh');

    execFileSync('bash', [scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
        SOURCE_DIR: sourceDir,
        TARGET_DIR: targetDir,
        BACKUP_DIR: backupDir,
        PM2_APP_NAME: 'wecom-codex',
        HEALTHCHECK_URL: 'http://127.0.0.1:3000/healthz',
      },
      stdio: 'pipe',
    });

    expect(fs.readFileSync(path.join(targetDir, '.env'), 'utf8')).toContain('SECRET=keep-me');
    expect(fs.readFileSync(path.join(targetDir, '.data', 'sessions.db'), 'utf8')).toBe('db');
    expect(fs.readFileSync(path.join(targetDir, 'workspace', 'keep.txt'), 'utf8')).toBe('workspace');
    expect(fs.readFileSync(path.join(targetDir, 'README.md'), 'utf8')).toBe('new readme\n');
    expect(fs.readFileSync(path.join(targetDir, 'package-lock.json'), 'utf8')).toContain('"lockfileVersion":3');
    expect(fs.readFileSync(path.join(targetDir, 'bin', 'publish-workspace.sh'), 'utf8')).toContain('#!/usr/bin/env bash');
    expect(fs.readFileSync(path.join(targetDir, 'src', 'server.ts'), 'utf8')).toContain('live = true');
    expect(fs.existsSync(path.join(targetDir, 'obsolete.txt'))).toBe(false);

    const backups = fs.readdirSync(backupDir).filter((name) => name.endsWith('.tgz'));
    expect(backups.length).toBe(1);

    const commands = fs.readFileSync(commandLog, 'utf8');
    expect(commands).toContain(`${targetDir}|ci`);
    expect(commands).toContain(`${targetDir}|test`);
    expect(commands).toContain(`${targetDir}|run build`);
    expect(commands).toContain(`${targetDir}|restart wecom-codex --update-env`);
    expect(commands).toContain(`${targetDir}|-fsS http://127.0.0.1:3000/healthz`);
  });

  it('fails before syncing when required source files are missing', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-workspace-missing-'));
    const sourceDir = path.join(tempRoot, 'source');
    const targetDir = path.join(tempRoot, 'live');
    const backupDir = path.join(tempRoot, 'backups');

    fs.mkdirSync(path.join(sourceDir, 'src'), { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });

    fs.writeFileSync(path.join(sourceDir, 'package.json'), '{"name":"workspace-gateway"}\n');
    fs.writeFileSync(path.join(targetDir, 'sentinel.txt'), 'keep me\n');

    const scriptPath = path.resolve(process.cwd(), 'bin', 'publish-workspace.sh');

    expect(() => {
      execFileSync('bash', [scriptPath], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          SOURCE_DIR: sourceDir,
          TARGET_DIR: targetDir,
          BACKUP_DIR: backupDir,
        },
        stdio: 'pipe',
      });
    }).toThrowError(/missing required source file/);

    expect(fs.readFileSync(path.join(targetDir, 'sentinel.txt'), 'utf8')).toBe('keep me\n');
    expect(fs.readdirSync(backupDir)).toHaveLength(0);
  });
});
