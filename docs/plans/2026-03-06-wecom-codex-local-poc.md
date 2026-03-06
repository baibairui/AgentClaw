# WeCom Codex Local PoC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local Node.js gateway so Enterprise WeChat users can invoke Codex with per-user session continuity and mandatory confirmation before execution.

**Architecture:** A single Express app receives WeCom callbacks, manages pending confirmations and per-user Codex thread IDs, and uses Codex CLI + WeCom send-message API for execution and async result push. Session state is persisted in JSON files under `.data/`.

**Tech Stack:** Node.js 22, TypeScript, Express, Vitest, xml2js

---

### Task 1: Project Skeleton

**Files:**
- Create: `gateway/package.json`
- Create: `gateway/tsconfig.json`
- Create: `gateway/vitest.config.ts`
- Create: `gateway/.env.example`
- Create: `gateway/src/server.ts`

**Step 1: Write failing test**
Create tests that import `src/stores/pending-store.ts` and `src/stores/session-store.ts` and assert expected behavior.

**Step 2: Run test to verify it fails**
Run: `cd gateway && npm test`
Expected: FAIL due to missing modules.

**Step 3: Write minimal implementation**
Create missing modules and minimal app wiring.

**Step 4: Run tests to verify pass**
Run: `cd gateway && npm test`
Expected: PASS for store tests.

**Step 5: Commit**
`git add gateway docs/plans/2026-03-06-wecom-codex-local-poc.md && git commit -m "feat: add local wecom-codex poc gateway"`

### Task 2: Callback Handling + Confirmation Flow

**Files:**
- Create: `gateway/src/app.ts`
- Create: `gateway/src/routes/wecom-callback.ts`
- Create: `gateway/src/services/message-handler.ts`
- Create: `gateway/src/utils/wecom-xml.ts`
- Test: `gateway/tests/message-handler.test.ts`

**Step 1: Write failing test**
Test three flows: `codex:...` creates pending code, `确认 CODE` transitions to executing, `取消 CODE` cancels.

**Step 2: Run test to verify it fails**
Run: `cd gateway && npm test -- message-handler`
Expected: FAIL until service exists.

**Step 3: Write minimal implementation**
Implement parser/handler to return reply text and schedule background execute callback.

**Step 4: Run test to verify it passes**
Run: `cd gateway && npm test -- message-handler`
Expected: PASS.

**Step 5: Commit**
`git add gateway/src gateway/tests && git commit -m "feat: add wecom callback confirmation flow"`

### Task 3: Codex + WeCom Integration

**Files:**
- Create: `gateway/src/services/codex-runner.ts`
- Create: `gateway/src/services/wecom-api.ts`
- Modify: `gateway/src/services/message-handler.ts`
- Test: `gateway/tests/codex-runner.test.ts`

**Step 1: Write failing test**
Test JSONL parsing for `thread.started` and final `agent_message` extraction.

**Step 2: Run test to verify it fails**
Run: `cd gateway && npm test -- codex-runner`
Expected: FAIL.

**Step 3: Write minimal implementation**
Execute `codex exec`/`codex exec resume` with `--json`, parse output, persist `user -> thread_id`, and push result via WeCom API.

**Step 4: Run full tests**
Run: `cd gateway && npm test`
Expected: PASS.

**Step 5: Commit**
`git add gateway && git commit -m "feat: integrate codex runner and wecom outbound messaging"`
