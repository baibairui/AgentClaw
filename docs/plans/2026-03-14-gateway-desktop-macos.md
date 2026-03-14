# Gateway Desktop macOS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a macOS-only desktop execution path so existing agents can operate frontmost visible applications through a managed `gateway-desktop` skill without any new user-facing runtime configuration.

**Architecture:** Reuse the existing browser capability pattern. Add a gateway-owned desktop manager plus service, expose a loopback-only internal execute route, inject desktop runtime env into the Codex child process, and install a managed `gateway-desktop` skill that calls the internal API one atomic action at a time. Keep perception in the agent and keep the executor limited to app launch/activation, mouse, keyboard, and screenshots.

**Tech Stack:** Node.js, TypeScript, Express, Vitest, managed skills, macOS native helpers (`open`, `osascript`), a `nut.js` adapter behind a narrow interface.

---

### Task 1: Add failing tests for the desktop service contract

**Files:**
- Create: `tests/desktop-service.test.ts`
- Create: `src/services/desktop-service.ts`

**Step 1: Write the failing test**

Add tests that expect:

- `launch-app` delegates `appName`
- pointer and keyboard commands return normalized `{ text, data }`
- `screenshot` returns an absolute path in `text` and `data.path`
- unsupported commands throw a clear error

Use the existing `tests/browser-service.test.ts` style as the template.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/desktop-service.test.ts`
Expected: FAIL because `src/services/desktop-service.ts` does not exist yet.

**Step 3: Write minimal implementation**

Create `src/services/desktop-service.ts` with:

```ts
export function createDesktopAutomationBackend(manager: DesktopCapableManager) {
  return {
    async execute(command: string, args: Record<string, unknown>) {
      switch (command) {
        case 'launch-app':
          await manager.launchApp(String(args.appName ?? ''));
          return { text: `launched app: ${String(args.appName ?? '')}` };
        default:
          throw new Error(`Unsupported desktop command: ${command}`);
      }
    },
  };
}
```

Expand only as much as the tests require.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/desktop-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/desktop-service.test.ts src/services/desktop-service.ts
git commit -m "test: add desktop service contract"
```

### Task 2: Add the desktop manager boundary for macOS app and input actions

**Files:**
- Create: `src/services/desktop-manager.ts`
- Create: `tests/desktop-manager.test.ts`

**Step 1: Write the failing test**

Add tests for:

- `launchApp` builds the expected macOS helper invocation
- `activateApp` builds the expected `osascript` activation call
- `frontmostApp` returns parsed helper output
- `takeScreenshot` writes to the configured screenshot directory and returns an absolute path

Mock child-process and the `nut.js` adapter boundary. Do not hit the real desktop.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/desktop-manager.test.ts`
Expected: FAIL because the manager file does not exist yet.

**Step 3: Write minimal implementation**

Create a manager with a narrow adapter shape:

```ts
interface DesktopAutomationAdapter {
  moveMouse(x: number, y: number): Promise<void>;
  click(button: 'left' | 'right', double: boolean): Promise<void>;
  drag(from: Point, to: Point): Promise<void>;
  typeText(text: string): Promise<void>;
  pressKey(key: string): Promise<void>;
  hotkey(keys: string[]): Promise<void>;
  screenshot(filePath: string): Promise<void>;
}
```

Keep all concrete `nut.js` imports inside the adapter creation path so package/license selection stays isolated.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/desktop-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/desktop-manager.ts tests/desktop-manager.test.ts
git commit -m "feat: add macos desktop manager boundary"
```

### Task 3: Add the managed `gateway-desktop` skill and generated script

**Files:**
- Create: `src/services/gateway-desktop-skill.ts`
- Create: `tests/gateway-desktop-skill.test.ts`
- Modify: `src/services/agent-workspace-manager.ts`

**Step 1: Write the failing test**

Add tests that expect:

- workspace-local skill installation creates `SKILL.md` and `scripts/gateway-desktop.mjs`
- generated skill text mentions atomic actions, screenshot evidence, and frontmost-app-only rules
- existing `AGENTS.md` desktop guidance upgrades to the managed skill workflow
- managed global skill sync installs the new skill root

Use `tests/gateway-browser-skill.test.ts` as the template.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/gateway-desktop-skill.test.ts`
Expected: FAIL because the skill installer does not exist yet.

**Step 3: Write minimal implementation**

Implement:

- `installGatewayDesktopSkill(workspaceDir)`
- `syncManagedGlobalDesktopSkills(...)` or extend the existing managed skill sync entrypoint
- generated `gateway-desktop.mjs` that reads:

```js
const apiBaseUrl = requireEnv('GATEWAY_DESKTOP_API_BASE');
const internalToken = requireEnv('GATEWAY_INTERNAL_API_TOKEN');
```

Use the browser skill file structure and argument parser style as the template.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/gateway-desktop-skill.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/gateway-desktop-skill.ts tests/gateway-desktop-skill.test.ts src/services/agent-workspace-manager.ts
git commit -m "feat: add gateway desktop skill scaffold"
```

### Task 4: Wire the internal desktop execute route into the app

**Files:**
- Modify: `src/app.ts`
- Modify: `src/server.ts`
- Modify: `tests/app.test.ts`

**Step 1: Write the failing test**

Add app tests for:

- `/internal/desktop/execute` rejects missing/invalid token
- `/internal/desktop/execute` rejects non-loopback requests in the same way as the browser route
- `/internal/desktop/execute` forwards `command` and `args` to the desktop backend
- missing command returns `400`

Follow the existing browser internal route style.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/app.test.ts`
Expected: FAIL because no desktop route is registered.

**Step 3: Write minimal implementation**

Add a new optional `desktopAutomation` dependency to `createApp`, then register:

```ts
app.post('/internal/desktop/execute', async (req, res) => {
  // token + loopback validation
  // command extraction
  // backend execute(command, args)
});
```

In `src/server.ts`, instantiate `DesktopManager`, wrap it with `createDesktopAutomationBackend`, and pass it into `createApp`.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/app.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app.ts src/server.ts tests/app.test.ts
git commit -m "feat: expose internal desktop execute route"
```

### Task 5: Inject desktop runtime env into Codex child processes

**Files:**
- Modify: `src/services/codex-runner.ts`
- Modify: `tests/codex-runner.test.ts`
- Modify: `src/services/codex-bwrap.ts` if gateway env passthrough needs an allowlist update

**Step 1: Write the failing test**

Extend runner tests to expect:

- `buildCodexChildEnv` sets `GATEWAY_DESKTOP_API_BASE`
- isolated runs preserve `GATEWAY_DESKTOP_API_BASE` alongside `GATEWAY_INTERNAL_API_TOKEN`

Mirror the current browser env tests.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/codex-runner.test.ts`
Expected: FAIL because desktop env vars are not injected yet.

**Step 3: Write minimal implementation**

Add a desktop runtime config and env injection:

```ts
if (input.desktopAutomation?.apiBaseUrl) {
  env.GATEWAY_DESKTOP_API_BASE = input.desktopAutomation.apiBaseUrl;
}
```

Keep the token internal and runtime-only. Do not add config parsing for it.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/codex-runner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/codex-runner.ts src/services/codex-bwrap.ts tests/codex-runner.test.ts
git commit -m "feat: inject desktop runtime env"
```

### Task 6: Install desktop guidance into workspace bootstrap and managed skill sync

**Files:**
- Modify: `src/services/agent-workspace-manager.ts`
- Modify: `src/services/skill-registry.ts` only if managed skill root helpers must be shared cleanly
- Modify: `tests/agent-workspace-manager.test.ts`

**Step 1: Write the failing test**

Extend workspace-manager tests to expect:

- default workspace contains `gateway-desktop` skill files
- `TOOLS.md` mentions desktop tasks and frontmost visible app limits
- any desktop guidance in `AGENTS.md` points to `./.codex/skills/gateway-desktop/SKILL.md`

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/agent-workspace-manager.test.ts`
Expected: FAIL because the workspace scaffold does not install or mention the desktop skill.

**Step 3: Write minimal implementation**

Install the skill during workspace creation and add one narrow tools rule:

```md
- 桌面任务：只用 `gateway-desktop` skill，自带脚本执行真实桌面动作。
```

Also mention the frontmost-visible-app limitation.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/agent-workspace-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/agent-workspace-manager.ts tests/agent-workspace-manager.test.ts
git commit -m "feat: add desktop skill workspace bootstrap"
```

### Task 7: Add the dependency and document macOS setup

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

**Step 1: Write the failing test**

No new automated test is required here. Instead, define the exact README additions before editing:

- macOS only
- Accessibility permission required
- Screen Recording permission required
- no new user-facing gateway env vars

**Step 2: Install the chosen desktop adapter dependency**

Run one of these, depending on the licensing decision made at implementation kickoff:

- licensed/prebuilt path: `npm install <chosen-nutjs-package>`
- source-build path: `npm install <chosen-source-build-compatible-package>`

Expected: lockfile updates and package metadata changes only.

**Step 3: Write minimal documentation**

Add one short README subsection under the skills/browser capability area describing:

- what the desktop executor can do
- the macOS-only limitation
- required OS permissions

**Step 4: Run focused safety checks**

Run: `npm test -- tests/config.test.ts tests/gateway-desktop-skill.test.ts tests/desktop-service.test.ts tests/desktop-manager.test.ts tests/app.test.ts tests/codex-runner.test.ts tests/agent-workspace-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json package-lock.json README.md tests/gateway-desktop-skill.test.ts tests/desktop-service.test.ts tests/desktop-manager.test.ts tests/app.test.ts tests/codex-runner.test.ts tests/agent-workspace-manager.test.ts src/services/desktop-service.ts src/services/desktop-manager.ts src/services/gateway-desktop-skill.ts src/app.ts src/server.ts src/services/codex-runner.ts src/services/codex-bwrap.ts src/services/agent-workspace-manager.ts
git commit -m "feat: add macos desktop execution skill"
```

### Task 8: Final verification and plan artifact commit

**Files:**
- Verify only: `docs/plans/2026-03-14-gateway-desktop-macos-design.md`
- Verify only: `docs/plans/2026-03-14-gateway-desktop-macos.md`

**Step 1: Run the focused suite again**

Run: `npm test -- tests/gateway-desktop-skill.test.ts tests/desktop-service.test.ts tests/desktop-manager.test.ts tests/app.test.ts tests/codex-runner.test.ts tests/agent-workspace-manager.test.ts`
Expected: PASS

**Step 2: Perform a manual macOS smoke check**

Run the gateway locally, then verify:

- `launch-app` can activate Finder
- `hotkey` can trigger a harmless system shortcut in the frontmost app
- `screenshot` returns an absolute file path
- macOS blocks the feature until Accessibility and Screen Recording are granted

**Step 3: Review for scope control**

Confirm:

- no new user-facing desktop env vars were added
- no shell execution command was introduced
- the feature stays macOS-only and frontmost-visible-app-only

**Step 4: Commit docs if needed**

```bash
git add docs/plans/2026-03-14-gateway-desktop-macos-design.md docs/plans/2026-03-14-gateway-desktop-macos.md
git commit -m "docs: capture gateway desktop macos plan"
```
