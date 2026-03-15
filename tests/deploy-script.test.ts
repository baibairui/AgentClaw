import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.resolve(import.meta.dirname, '..');

function readScript(relPath: string): string {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

describe('deploy.sh', () => {
  it('refreshes remote dependencies when lockfile changes instead of failing the deploy', () => {
    const script = readScript('deploy.sh');

    expect(script).toContain('package-lock.json changed; will refresh remote dependencies');
    expect(script).toContain('node_modules missing under');
    expect(script).toContain('needs_remote_install=1');
    expect(script).toContain('npm ci');
  });
});
