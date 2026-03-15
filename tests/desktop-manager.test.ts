import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createNutJsDesktopAutomationAdapter, DesktopManager } from '../src/services/desktop-manager.js';

describe('DesktopManager', () => {
  it('launches apps through open -a', async () => {
    const adapter = createAdapter();
    const commandRunner = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const manager = new DesktopManager({ adapter, commandRunner });

    await manager.launchApp('Finder');

    expect(commandRunner).toHaveBeenCalledWith('open', ['-a', 'Finder']);
  });

  it('activates apps through osascript', async () => {
    const adapter = createAdapter();
    const commandRunner = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const manager = new DesktopManager({ adapter, commandRunner });

    await manager.activateApp('Finder');

    expect(commandRunner).toHaveBeenCalledWith('osascript', ['-e', 'tell application "Finder" to activate']);
  });

  it('reads the frontmost app from osascript output', async () => {
    const adapter = createAdapter();
    const commandRunner = vi.fn(async () => ({ stdout: 'Finder\n', stderr: '' }));
    const manager = new DesktopManager({ adapter, commandRunner });

    const result = await manager.frontmostApp();

    expect(commandRunner).toHaveBeenCalledWith('osascript', ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true']);
    expect(result).toEqual({ appName: 'Finder' });
  });

  it('stores screenshots in the configured directory and returns an absolute path', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-manager-'));
    const adapter = createAdapter();
    const commandRunner = vi.fn(async (file: string, args: string[]) => {
      if (file === 'screencapture') {
        fs.writeFileSync(args[args.length - 1] as string, 'png');
      }
      return { stdout: '', stderr: '' };
    });
    const manager = new DesktopManager({
      adapter,
      commandRunner,
      screenshotDir: tempDir,
    });

    const filePath = await manager.takeScreenshot({ filename: 'desktop-step.png' });

    expect(filePath).toBe(path.join(tempDir, 'desktop-step.png'));
    expect(path.isAbsolute(filePath)).toBe(true);
    expect(commandRunner).toHaveBeenCalledWith('screencapture', [
      '-x',
      path.join(tempDir, 'desktop-step.png'),
    ]);
    expect(adapter.screenshot).not.toHaveBeenCalled();
  });

  it('falls back to the adapter screenshot when native screencapture is unavailable', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-manager-'));
    const screenshotPath = path.join(tempDir, 'desktop-step.png');
    const adapter = createAdapter();
    adapter.screenshot = vi.fn(async (filePath: string) => {
      fs.writeFileSync(filePath, 'png');
    });
    const commandRunner = vi.fn(async (file: string) => {
      if (file === 'screencapture') {
        throw new Error('Screen Recording not allowed');
      }
      return { stdout: '', stderr: '' };
    });
    const manager = new DesktopManager({
      adapter,
      commandRunner,
      screenshotDir: tempDir,
    });

    const filePath = await manager.takeScreenshot({ filename: 'desktop-step.png' });

    expect(filePath).toBe(screenshotPath);
    expect(commandRunner).toHaveBeenCalledWith('screencapture', ['-x', screenshotPath]);
    expect(adapter.screenshot).toHaveBeenCalledWith(screenshotPath);
  });

  it('rescales native screenshots to match the desktop coordinate space', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-manager-'));
    const screenshotPath = path.join(tempDir, 'desktop-step.png');
    const adapter = createAdapter();
    adapter.getScreenSize = vi.fn(async () => ({ width: 1470, height: 956 }));
    const commandRunner = vi.fn(async (file: string, args: string[]) => {
      if (file === 'screencapture') {
        fs.writeFileSync(args[args.length - 1] as string, 'png');
        return { stdout: '', stderr: '' };
      }
      if (file === 'sips' && args[0] === '-g') {
        return {
          stdout: `${screenshotPath}\n  pixelWidth: 2940\n  pixelHeight: 1912\n`,
          stderr: '',
        };
      }
      if (file === 'sips' && args[0] === '-z') {
        return { stdout: '', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
    const manager = new DesktopManager({
      adapter,
      commandRunner,
      screenshotDir: tempDir,
    });

    const filePath = await manager.takeScreenshot({ filename: 'desktop-step.png' });

    expect(filePath).toBe(screenshotPath);
    expect(commandRunner).toHaveBeenCalledWith('screencapture', ['-x', screenshotPath]);
    expect(commandRunner).toHaveBeenCalledWith('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', screenshotPath]);
    expect(commandRunner).toHaveBeenCalledWith('sips', [
      '-z',
      '956',
      '1470',
      screenshotPath,
      '--out',
      screenshotPath,
    ]);
  });

  it('includes the cursor in native screenshots when requested', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-manager-'));
    const screenshotPath = path.join(tempDir, 'desktop-step.png');
    const adapter = createAdapter();
    const commandRunner = vi.fn(async (file: string, args: string[]) => {
      if (file === 'screencapture') {
        fs.writeFileSync(args[args.length - 1] as string, 'png');
      }
      return { stdout: '', stderr: '' };
    });
    const manager = new DesktopManager({
      adapter,
      commandRunner,
      screenshotDir: tempDir,
    });

    const filePath = await manager.takeScreenshot({ filename: 'desktop-step.png', showCursor: true });

    expect(filePath).toBe(screenshotPath);
    expect(commandRunner).toHaveBeenCalledWith('screencapture', ['-C', '-x', screenshotPath]);
  });

  it('maps hotkeys, escape, and screenshots through the nut.js adapter', async () => {
    const pressKey = vi.fn(async () => undefined);
    const releaseKey = vi.fn(async () => undefined);
    const capture = vi.fn(async () => '/tmp/desktop-step.png');
    const nutJs = {
      mouse: {
        setPosition: vi.fn(async () => undefined),
        click: vi.fn(async () => undefined),
        doubleClick: vi.fn(async () => undefined),
        drag: vi.fn(async () => undefined),
      },
      keyboard: {
        type: vi.fn(async () => undefined),
        pressKey,
        releaseKey,
      },
      screen: {
        capture,
      },
      straightTo: vi.fn(async (target) => [target]),
      Point: class Point {
        constructor(public x: number, public y: number) {}
      },
      Button: {
        LEFT: 'LEFT',
        RIGHT: 'RIGHT',
      },
      FileType: {
        PNG: '.png',
      },
      Key: {
        LeftCmd: 'LeftCmd',
        LeftShift: 'LeftShift',
        Escape: 'Escape',
        Return: 'Return',
      },
    };

    const adapter = await createNutJsDesktopAutomationAdapter(nutJs as never);

    await adapter.hotkey(['Meta', 'Shift', 'Enter']);
    await adapter.pressKey('Esc');
    await adapter.screenshot('/tmp/desktop-step.png');

    expect(pressKey).toHaveBeenCalledWith('LeftCmd', 'LeftShift', 'Return');
    expect(pressKey).toHaveBeenCalledWith('Escape');
    expect(releaseKey).toHaveBeenCalledWith('LeftCmd', 'LeftShift', 'Return');
    expect(releaseKey).toHaveBeenCalledWith('Escape');
    expect(capture).toHaveBeenCalledWith('desktop-step', '.png', '/tmp');
  });
});

function createAdapter() {
  return {
    moveMouse: vi.fn(async () => undefined),
    click: vi.fn(async () => undefined),
    drag: vi.fn(async () => undefined),
    typeText: vi.fn(async () => undefined),
    pressKey: vi.fn(async () => undefined),
    hotkey: vi.fn(async () => undefined),
    screenshot: vi.fn(async () => undefined),
    getScreenSize: vi.fn(async () => undefined),
  };
}
