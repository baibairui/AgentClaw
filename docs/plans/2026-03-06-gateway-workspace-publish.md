# Gateway Workspace Publish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a server-side publish script that promotes `/opt/gateway/workspace/wecom-codex-gateway` into the live `/opt/gateway` service safely.

**Architecture:** Keep Codex edits isolated in the workspace, then publish by running a shell script on the server. The script will back up the live directory, sync source files while preserving live runtime state (`.env`, `.data`, `workspace`), run install/test/build, restart PM2, and verify health before reporting success.

**Tech Stack:** Bash, rsync, tar, Node.js, npm, Vitest, PM2

---

### Task 1: Add Regression Test For Publish Contract

**Files:**
- Create: `gateway/tests/publish-workspace-script.test.ts`
- Create: `gateway/bin/publish-workspace.sh`

**Step 1: Write the failing test**

Create a Vitest integration test that:
- creates temp `source`, `target`, and `backups` directories
- writes stub `npm`, `pm2`, and `curl` executables into a temp `bin` directory
- runs `bash bin/publish-workspace.sh` with environment overrides for source/target/backup paths
- expects:
  - source files copied into target
  - target `.env`, `.data`, and `workspace` preserved
  - removed live files deleted
  - backup archive created
  - `npm ci`, `npm test`, `npm run build`, `pm2 restart ... --update-env`, and health check invoked

**Step 2: Run test to verify it fails**

Run: `cd gateway && npm test -- publish-workspace-script`
Expected: FAIL because the script does not exist yet.

**Step 3: Write minimal implementation**

Create `bin/publish-workspace.sh` with:
- strict shell mode
- overridable env vars for directories, PM2 app name, and health URL
- backup + rsync sync + npm/test/build + pm2 restart + curl health check

**Step 4: Run test to verify it passes**

Run: `cd gateway && npm test -- publish-workspace-script`
Expected: PASS

### Task 2: Wire It Into Operator Workflow

**Files:**
- Modify: `gateway/package.json`
- Modify: `gateway/README.md`

**Step 1: Write the failing test**

Reuse the script integration test as the regression test for operator workflow; it should continue passing after wiring.

**Step 2: Run focused tests**

Run: `cd gateway && npm test -- publish-workspace-script`
Expected: PASS

**Step 3: Write minimal implementation**

Add an npm script for server use and document:
- where the script lives
- which source and target directories it uses
- the exact publish command to run on the server

**Step 4: Run full verification**

Run:
- `cd gateway && npm test`
- `cd gateway && npm run build`

Expected: PASS
