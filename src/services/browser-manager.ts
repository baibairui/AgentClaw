import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';

export interface BrowserLocatorLike {
  click(options?: Record<string, unknown>): Promise<void>;
  fill(value: string): Promise<void>;
  pressSequentially?(value: string): Promise<void>;
  selectOption?(value: string | string[]): Promise<void>;
}

export interface BrowserKeyboardLike {
  press(key: string): Promise<void>;
  type(text: string, options?: { delay?: number }): Promise<void>;
}

export interface BrowserPageLike {
  url(): string;
  title(): Promise<string>;
  goto(url: string): Promise<void>;
  close(): Promise<void>;
  bringToFront(): Promise<void>;
  locator(selector: string): BrowserLocatorLike;
  keyboard: BrowserKeyboardLike;
  waitForTimeout(ms: number): Promise<void>;
  waitForSelector(selector: string, options?: Record<string, unknown>): Promise<void>;
  waitForFunction(fn: (arg: unknown) => boolean, arg?: unknown): Promise<void>;
  evaluate<T>(fn: ((arg: unknown) => T) | (() => T), arg?: unknown): Promise<T>;
}

export interface BrowserContextLike {
  pages(): BrowserPageLike[];
  newPage(): Promise<BrowserPageLike>;
  close(): Promise<void>;
}

export type BrowserLauncher = () => Promise<BrowserContextLike>;

export interface BrowserTabSummary {
  index: number;
  url: string;
  title: string;
  current: boolean;
}

export interface BrowserSnapshotResult {
  page: string;
  snapshot: string;
}

interface BrowserManagerOptions {
  launcher?: BrowserLauncher;
  profileDir?: string;
}

const DEFAULT_REF_ATTR = 'data-gateway-ref';

export class BrowserManager {
  private readonly launcher: BrowserLauncher;
  private readonly tabs = new Map<number, BrowserPageLike>();
  private currentTabId?: number;
  private nextTabId = 0;
  private contextPromise?: Promise<BrowserContextLike>;

  constructor(options: BrowserManagerOptions = {}) {
    this.launcher = options.launcher ?? createDefaultLauncher(options.profileDir);
  }

  async ensureCurrentTab(): Promise<BrowserPageLike> {
    await this.ensureContext();
    if (this.currentTabId !== undefined) {
      const existing = this.tabs.get(this.currentTabId);
      if (existing) {
        return existing;
      }
    }
    if (this.tabs.size > 0) {
      const first = this.tabs.entries().next().value as [number, BrowserPageLike];
      this.currentTabId = first[0];
      return first[1];
    }
    return this.newTab();
  }

  async newTab(): Promise<BrowserPageLike> {
    const context = await this.ensureContext();
    const page = await context.newPage();
    return this.attachTab(page);
  }

  async navigate(url: string): Promise<BrowserPageLike> {
    const page = await this.ensureCurrentTab();
    await page.goto(url);
    return page;
  }

  async currentUrl(): Promise<string | undefined> {
    const page = await this.ensureCurrentTab();
    return page.url();
  }

  async listTabs(): Promise<BrowserTabSummary[]> {
    await this.ensureContext();
    const summaries = await Promise.all(
      [...this.tabs.entries()].map(async ([id, page]) => ({
        index: id,
        url: page.url(),
        title: await page.title(),
        current: id === this.currentTabId,
      })),
    );
    return summaries.sort((a, b) => a.index - b.index);
  }

  async selectTab(index: number): Promise<BrowserPageLike> {
    await this.ensureContext();
    const page = this.tabs.get(index);
    if (!page) {
      throw new Error(`Tab ${index} not found`);
    }
    await page.bringToFront();
    this.currentTabId = index;
    return page;
  }

  async closeCurrentTab(): Promise<void> {
    const page = await this.ensureCurrentTab();
    const closingId = this.currentTabId;
    await page.close();
    if (closingId !== undefined) {
      this.tabs.delete(closingId);
    }
    const remaining = [...this.tabs.keys()].sort((a, b) => a - b);
    this.currentTabId = remaining.at(-1);
  }

  async snapshot(): Promise<BrowserSnapshotResult> {
    const page = await this.ensureCurrentTab();
    const state = await page.evaluate((refAttr) => {
      const attr = String(refAttr);
      const elements = Array.from(document.querySelectorAll<HTMLElement>(
        'a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]',
      ));
      let index = 0;
      const lines: string[] = [];
      for (const element of elements) {
        const visible = element.getClientRects().length > 0;
        if (!visible) {
          continue;
        }
        index += 1;
        const ref = `e${index}`;
        element.setAttribute(attr, ref);
        const label = (
          element.getAttribute('aria-label')
          || element.getAttribute('placeholder')
          || element.textContent
          || element.getAttribute('value')
          || element.tagName.toLowerCase()
        ).trim();
        lines.push(`- ${element.tagName.toLowerCase()} "${label}" [ref=${ref}]`);
      }
      return {
        url: window.location.href,
        title: document.title,
        snapshot: lines.join('\n'),
      };
    }, DEFAULT_REF_ATTR);

    return {
      page: `- Page URL: ${state.url}\n- Page Title: ${state.title}`,
      snapshot: state.snapshot,
    };
  }

  async click(ref: string): Promise<void> {
    const page = await this.ensureCurrentTab();
    await page.locator(selectorForRef(ref)).click();
  }

  async type(ref: string, text: string, options: { slowly?: boolean; submit?: boolean } = {}): Promise<void> {
    const page = await this.ensureCurrentTab();
    const locator = page.locator(selectorForRef(ref));
    await locator.click();
    if (options.slowly && locator.pressSequentially) {
      await locator.pressSequentially(text);
    } else {
      await locator.fill(text);
    }
    if (options.submit) {
      await page.keyboard.press('Enter');
    }
  }

  async selectOption(ref: string, values: string[]): Promise<void> {
    const page = await this.ensureCurrentTab();
    const locator = page.locator(selectorForRef(ref));
    if (!locator.selectOption) {
      throw new Error('selectOption is not supported for this locator');
    }
    await locator.selectOption(values);
  }

  async pressKey(key: string): Promise<void> {
    const page = await this.ensureCurrentTab();
    await page.keyboard.press(key);
  }

  async waitFor(input: { time?: number; text?: string; textGone?: string }): Promise<void> {
    const page = await this.ensureCurrentTab();
    if (typeof input.time === 'number') {
      const waitMs = input.time >= 100 ? input.time : input.time * 1000;
      await page.waitForTimeout(waitMs);
      return;
    }
    if (input.text) {
      await page.waitForSelector(`text=${input.text}`);
      return;
    }
    if (input.textGone) {
      await page.waitForFunction((text) => !document.body.innerText.includes(String(text)), input.textGone);
    }
  }

  async dispose(): Promise<void> {
    if (!this.contextPromise) {
      return;
    }
    const context = await this.contextPromise;
    await context.close();
    this.contextPromise = undefined;
    this.tabs.clear();
    this.currentTabId = undefined;
  }

  private async ensureContext(): Promise<BrowserContextLike> {
    if (!this.contextPromise) {
      this.contextPromise = this.launcher();
      const context = await this.contextPromise;
      for (const page of context.pages()) {
        this.attachTab(page);
      }
      return context;
    }
    return this.contextPromise;
  }

  private attachTab(page: BrowserPageLike): BrowserPageLike {
    const existing = [...this.tabs.entries()].find(([, value]) => value === page);
    if (existing) {
      this.currentTabId = existing[0];
      return existing[1];
    }
    const id = this.nextTabId++;
    this.tabs.set(id, page);
    this.currentTabId = id;
    return page;
  }
}

function selectorForRef(ref: string): string {
  return `[${DEFAULT_REF_ATTR}="${ref}"]`;
}

function createDefaultLauncher(profileDir = '.data/browser/profile'): BrowserLauncher {
  return async () => {
    const context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless: false,
      viewport: null,
    });
    return adaptContext(context);
  };
}

function adaptContext(context: BrowserContext): BrowserContextLike {
  return {
    pages: () => context.pages().map(adaptPage),
    newPage: async () => adaptPage(await context.newPage()),
    close: async () => {
      await context.close();
    },
  };
}

function adaptPage(page: Page): BrowserPageLike {
  return {
    url: () => page.url(),
    title: async () => page.title(),
    goto: async (url) => {
      await page.goto(url);
    },
    close: async () => {
      await page.close();
    },
    bringToFront: async () => {
      await page.bringToFront();
    },
    locator: (selector: string): BrowserLocatorLike => adaptLocator(page.locator(selector)),
    keyboard: page.keyboard,
    waitForTimeout: async (ms) => {
      await page.waitForTimeout(ms);
    },
    waitForSelector: async (selector, options) => {
      await page.waitForSelector(selector, options);
    },
    waitForFunction: async (fn, arg) => {
      await page.waitForFunction(fn, arg);
    },
    evaluate: async (fn, arg) => page.evaluate(fn as never, arg),
  };
}

function adaptLocator(locator: Locator): BrowserLocatorLike {
  return {
    click: async (options) => {
      await locator.click(options);
    },
    fill: async (value) => {
      await locator.fill(value);
    },
    pressSequentially: async (value) => {
      await locator.pressSequentially(value);
    },
    selectOption: async (value) => {
      await locator.selectOption(value);
    },
  };
}
