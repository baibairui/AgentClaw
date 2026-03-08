# Gateway Browser Only Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce gateway-owned browser automation as the only browser path and remove external browser MCP URL overrides.

**Architecture:** Keep the existing `gateway_browser` MCP injection path, but remove all config/runtime branches that accept an external browser MCP URL. The server will always compute a local runtime and inject only the gateway-managed URL into Codex runs.

**Tech Stack:** TypeScript, Node.js, Vitest

---

### Task 1: Lock config semantics to gateway-owned browser only

**Files:**
- Modify: `tests/config.test.ts`
- Modify: `src/config.ts`

**Step 1: Write the failing test**

Add a config test that sets `BROWSER_MCP_URL` but expects no exported `browserMcpUrl` value.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL because config still exports `browserMcpUrl`.

**Step 3: Write minimal implementation**

Remove `browserMcpUrl` from `src/config.ts`.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/config.test.ts`
Expected: PASS.

### Task 2: Remove external URL branch from server startup

**Files:**
- Modify: `src/server.ts`

**Step 1: Write the failing test**

Covered by existing and updated integration expectations once runtime wiring stops referencing config URL.

**Step 2: Run targeted tests to verify failure**

Run: `npm test -- tests/config.test.ts tests/codex-runner.test.ts`
Expected: FAIL until server/config wiring is consistent.

**Step 3: Write minimal implementation**

Update `src/server.ts` logging and `resolveBrowserMcpRuntime` call to stop reading `config.browserMcpUrl`.

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/config.test.ts tests/codex-runner.test.ts`
Expected: PASS.

### Task 3: Update documentation to remove external-browser guidance

**Files:**
- Modify: `README.md`

**Step 1: Write the failing test**

No automated doc test.

**Step 2: Write minimal implementation**

Remove `BROWSER_MCP_URL` documentation and state that browser automation is always gateway-owned.

**Step 3: Verify**

Read the updated section and confirm there is no remaining external browser MCP guidance.

### Task 4: Full verification

**Files:**
- Test: `tests/config.test.ts`
- Test: `tests/codex-runner.test.ts`

**Step 1: Run verification**

Run: `npm test -- tests/config.test.ts tests/codex-runner.test.ts`
Expected: PASS.

**Step 2: Optional broader regression check**

Run: `npm test -- tests/browser-mcp-server.test.ts tests/browser-manager.test.ts`
Expected: PASS.
