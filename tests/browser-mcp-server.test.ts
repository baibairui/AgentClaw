import { describe, expect, it, vi } from 'vitest';

import { createBrowserMcpBackend } from '../src/services/browser-mcp-server.js';

describe('createBrowserMcpBackend', () => {
  it('reuses the current tab for snapshot and navigate', async () => {
    const manager = {
      snapshot: vi.fn(async () => ({
        page: '- Page URL: about:blank',
        snapshot: '- button "Go" [ref=e1]',
      })),
      navigate: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
      type: vi.fn(async () => undefined),
      selectOption: vi.fn(async () => undefined),
      pressKey: vi.fn(async () => undefined),
      waitFor: vi.fn(async () => undefined),
      listTabs: vi.fn(async () => []),
      selectTab: vi.fn(async () => undefined),
      newTab: vi.fn(async () => undefined),
      closeCurrentTab: vi.fn(async () => undefined),
    };
    const backend = createBrowserMcpBackend(manager);

    const snapshotResult = await backend.callTool('browser_snapshot', {});
    const navigateResult = await backend.callTool('browser_navigate', { url: 'https://example.com' });

    expect(manager.snapshot).toHaveBeenCalledTimes(2);
    expect(manager.navigate).toHaveBeenCalledWith('https://example.com');
    expect(snapshotResult.content[0]?.type).toBe('text');
    expect(navigateResult.content[0]?.type).toBe('text');
  });

  it('closes only the current tab for browser_close', async () => {
    const manager = {
      snapshot: vi.fn(async () => ({ page: '', snapshot: '' })),
      navigate: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
      type: vi.fn(async () => undefined),
      selectOption: vi.fn(async () => undefined),
      pressKey: vi.fn(async () => undefined),
      waitFor: vi.fn(async () => undefined),
      listTabs: vi.fn(async () => [{ index: 0, url: 'https://example.com', title: 'Example', current: true }]),
      selectTab: vi.fn(async () => undefined),
      newTab: vi.fn(async () => undefined),
      closeCurrentTab: vi.fn(async () => undefined),
    };
    const backend = createBrowserMcpBackend(manager);

    await backend.callTool('browser_close', {});

    expect(manager.closeCurrentTab).toHaveBeenCalledTimes(1);
  });

  it('supports browser_tabs list/select/new/close actions', async () => {
    const manager = {
      snapshot: vi.fn(async () => ({ page: '', snapshot: '' })),
      navigate: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
      type: vi.fn(async () => undefined),
      selectOption: vi.fn(async () => undefined),
      pressKey: vi.fn(async () => undefined),
      waitFor: vi.fn(async () => undefined),
      listTabs: vi.fn(async () => [{ index: 0, url: 'https://example.com', title: 'Example', current: true }]),
      selectTab: vi.fn(async () => undefined),
      newTab: vi.fn(async () => undefined),
      closeCurrentTab: vi.fn(async () => undefined),
    };
    const backend = createBrowserMcpBackend(manager);

    await backend.callTool('browser_tabs', { action: 'list' });
    await backend.callTool('browser_tabs', { action: 'select', index: 0 });
    await backend.callTool('browser_tabs', { action: 'new' });
    await backend.callTool('browser_tabs', { action: 'close' });

    expect(manager.listTabs).toHaveBeenCalledTimes(4);
    expect(manager.selectTab).toHaveBeenCalledWith(0);
    expect(manager.newTab).toHaveBeenCalledTimes(1);
    expect(manager.closeCurrentTab).toHaveBeenCalledTimes(1);
  });
});
