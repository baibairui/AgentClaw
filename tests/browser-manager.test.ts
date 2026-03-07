import { describe, expect, it } from 'vitest';

import { BrowserManager, type BrowserContextLike, type BrowserLauncher, type BrowserPageLike } from '../src/services/browser-manager.js';

class FakeLocator {
  async click(): Promise<void> {}
  async fill(): Promise<void> {}
  async pressSequentially(): Promise<void> {}
  async selectOption(): Promise<void> {}
}

class FakeKeyboard {
  async press(): Promise<void> {}
  async type(): Promise<void> {}
}

class FakePage implements BrowserPageLike {
  public currentUrl = 'about:blank';
  public readonly keyboard = new FakeKeyboard();
  public waitedMs?: number;

  constructor(url = 'about:blank') {
    this.currentUrl = url;
  }

  url(): string {
    return this.currentUrl;
  }

  async title(): Promise<string> {
    return this.currentUrl;
  }

  async goto(url: string): Promise<void> {
    this.currentUrl = url;
  }

  async close(): Promise<void> {}

  async bringToFront(): Promise<void> {}

  locator(): FakeLocator {
    return new FakeLocator();
  }

  async waitForTimeout(ms: number): Promise<void> {
    this.waitedMs = ms;
  }

  async waitForSelector(): Promise<void> {}

  async waitForFunction(): Promise<void> {}

  async evaluate<T>(fn: ((arg: unknown) => T) | (() => T), arg?: unknown): Promise<T> {
    void fn;
    return {
      url: this.currentUrl,
      title: this.currentUrl,
      snapshot: '',
    } as T;
  }
}

class FakeContext implements BrowserContextLike {
  constructor(private readonly currentPages: FakePage[] = []) {}

  pages(): BrowserPageLike[] {
    return this.currentPages;
  }

  async newPage(): Promise<BrowserPageLike> {
    const page = new FakePage();
    this.currentPages.push(page);
    return page;
  }

  async close(): Promise<void> {}
}

describe('BrowserManager', () => {
  it('lazily starts browser context on first tab request', async () => {
    let launches = 0;
    const launcher: BrowserLauncher = async () => {
      launches++;
      return new FakeContext();
    };
    const manager = new BrowserManager({ launcher });

    expect(launches).toBe(0);
    await manager.ensureCurrentTab();
    expect(launches).toBe(1);
  });

  it('preserves current tab URL across multiple operations', async () => {
    const manager = new BrowserManager({
      launcher: async () => new FakeContext(),
    });

    await manager.navigate('https://example.com/a');
    expect(await manager.currentUrl()).toBe('https://example.com/a');

    await manager.snapshot();
    expect(await manager.currentUrl()).toBe('https://example.com/a');
  });

  it('switches to another existing tab when closing the current tab', async () => {
    const existingPages = [
      new FakePage('https://example.com/1'),
      new FakePage('https://example.com/2'),
    ];
    const manager = new BrowserManager({
      launcher: async () => new FakeContext(existingPages),
    });

    const tabs = await manager.listTabs();
    await manager.selectTab(tabs[1]!.index);
    expect(await manager.currentUrl()).toBe('https://example.com/2');

    await manager.closeCurrentTab();
    expect(await manager.currentUrl()).toBe('https://example.com/1');
  });

  it('treats large browser_wait_for time values as milliseconds', async () => {
    const page = new FakePage('https://example.com');
    const manager = new BrowserManager({
      launcher: async () => new FakeContext([page]),
    });

    await manager.waitFor({ time: 1500 });

    expect(page.waitedMs).toBe(1500);
  });
});
