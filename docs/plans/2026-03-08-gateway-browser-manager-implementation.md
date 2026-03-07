# Gateway Browser Manager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current Playwright MCP session-based browser path with a gateway-owned browser manager that preserves the visible browser page across Codex runs.

**Architecture:** Add an in-process `BrowserManager` that owns the browser, context, tabs, and current page state. Expose browser tools from a gateway-owned MCP server and update `CodexRunner` to connect to that local server instead of the current `@playwright/mcp` runtime.

**Tech Stack:** TypeScript, Playwright, Node.js, Vitest, local MCP server integration

---

### Task 1: Add browser manager state tests

**Files:**
- Create: `tests/browser-manager.test.ts`
- Create: `src/services/browser-manager.ts`

**Step 1: Write the failing test**

Cover:
- lazy browser startup
- creating the first tab on demand
- keeping `currentTabId` after navigation
- switching to the remaining tab after current tab close
- preserving the current page URL between operations

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/browser-manager.test.ts`
Expected: FAIL because `src/services/browser-manager.ts` does not exist.

**Step 3: Write minimal implementation**

Implement:
- browser/context lazy initialization
- tab registry
- current tab selection and close behavior
- simple helpers for snapshot/navigate/current page access

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/browser-manager.test.ts`
Expected: PASS

### Task 2: Add gateway-owned browser MCP server

**Files:**
- Create: `src/services/browser-mcp-server.ts`
- Create: `tests/browser-mcp-server.test.ts`

**Step 1: Write the failing test**

Cover:
- `browser_snapshot` creates a tab only when no current tab exists
- `browser_navigate` reuses the current tab instead of implicitly creating a fresh blank page every run
- `browser_close` closes only the current tab, not the whole browser
- `browser_tabs` lists and selects gateway-owned tabs

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/browser-mcp-server.test.ts`
Expected: FAIL because the browser MCP server does not exist yet.

**Step 3: Write minimal implementation**

Implement the first compatible tool set:
- `browser_snapshot`
- `browser_navigate`
- `browser_click`
- `browser_type`
- `browser_press_key`
- `browser_wait_for`
- `browser_tabs`
- `browser_close`

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/browser-mcp-server.test.ts`
Expected: PASS

### Task 3: Rewire server startup and runner integration

**Files:**
- Modify: `src/server.ts`
- Modify: `src/services/codex-runner.ts`
- Modify: `src/config.ts`
- Modify: `tests/codex-runner.test.ts`

**Step 1: Write the failing test**

Update runner expectations so browser MCP config points at the gateway-owned server name/url instead of the current Playwright MCP runtime.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/codex-runner.test.ts`
Expected: FAIL because the runner still injects the old browser server wiring.

**Step 3: Write minimal implementation**

Update:
- gateway startup to initialize `BrowserManager`
- local MCP startup to expose the new browser MCP server
- runner config injection to point at the new server
- old Playwright-specific browser startup path to stop being the main path

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/codex-runner.test.ts`
Expected: PASS

### Task 4: Remove deprecated browser pathways

**Files:**
- Modify: `src/services/chat-handler.ts`
- Modify: `src/features/user-command.ts`
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `tests/chat-handler.test.ts`
- Modify: `tests/user-command.test.ts`

**Step 1: Write the failing test**

Update tests to remove `/open` behavior and any dependency on the old browser opener / external Playwright MCP lifecycle.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/chat-handler.test.ts tests/user-command.test.ts`
Expected: FAIL because `/open` and old browser assumptions still exist.

**Step 3: Write minimal implementation**

Remove:
- `/open` command support
- `BrowserOpener` wiring
- outdated docs/config mentions

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/chat-handler.test.ts tests/user-command.test.ts`
Expected: PASS

### Task 5: Verify end-to-end targeted coverage

**Files:**
- Verify only

**Step 1: Run targeted tests**

Run: `npm test -- tests/browser-manager.test.ts tests/browser-mcp-server.test.ts tests/codex-runner.test.ts tests/chat-handler.test.ts tests/user-command.test.ts`
Expected: PASS

**Step 2: Run build**

Run: `npm run build`
Expected: PASS
