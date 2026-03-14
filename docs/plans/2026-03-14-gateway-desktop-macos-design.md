# Gateway Desktop macOS Design

**Date:** 2026-03-14

**Goal:** Add a macOS desktop execution capability so existing agents can operate frontmost visible applications through the gateway without introducing a second visual reasoning stack or any new user-facing runtime configuration.

## Scope

This change adds a first-pass desktop execution layer for macOS only.

In scope:

- launching and activating desktop apps on macOS
- frontmost-window mouse and keyboard actions
- screenshots as execution evidence for the existing agent vision flow
- an internal gateway-owned desktop API plus a managed skill wrapper
- runtime env injection from the gateway into the Codex child process

Out of scope:

- Windows or Linux desktop automation
- Accessibility tree or control introspection
- OCR, template matching, or model-side visual interpretation inside the executor
- arbitrary shell execution
- hidden-window or background-window automation
- new user-facing `.env` knobs for desktop API address or auth token

## Current Project Fit

The project already uses one clear capability pattern:

1. the gateway owns the real executor
2. `CodexRunner` injects runtime env into the agent process
3. the skill script calls a loopback-only internal API
4. the API returns structured text/data results

This exists today for browser automation, reminders, and Feishu operations. Desktop execution should reuse the same pattern instead of introducing a direct shell bridge or a second agent runtime.

## Decision

Add a new `gateway-desktop` capability path parallel to `gateway-browser`.

The gateway will own a `DesktopManager` and expose a loopback-only `/internal/desktop/execute` endpoint. The Codex child process will receive a runtime-only desktop API base URL plus the existing internal API token. The managed `gateway-desktop` skill will call that endpoint through a bundled script.

The agent remains responsible for perception and next-step decisions. The desktop executor only performs narrow, reversible, atomic actions and returns evidence.

## Why Not Midscene

Midscene already includes desktop and MCP flows, but its design centers around its own visual agent loop and model configuration. In this project the agent already has vision capability, so importing Midscene would add a second reasoning stack and blur execution boundaries.

The chosen design keeps the gateway as a thin executor and avoids duplicating visual interpretation logic.

## Why Not Pure nut.js

Pure `nut.js` is enough for pointer, keyboard, and screenshots, but on macOS the surrounding lifecycle actions are cleaner with native helpers:

- launch app: `open -a`
- activate app: `osascript`
- frontmost app query: `osascript` or equivalent native query

So the design uses `nut.js` for interaction primitives and small macOS-native helpers for app lifecycle/foreground tasks.

## Architecture

### 1. Desktop Manager

Create `src/services/desktop-manager.ts`.

Responsibilities:

- wrap `nut.js` mouse, keyboard, drag, and screenshot operations
- wrap macOS-native app launch and activation helpers
- provide a small typed command surface to higher layers
- store screenshots under a dedicated gateway data directory

Non-responsibilities:

- no task planning
- no perception or OCR
- no direct user messaging

### 2. Desktop Service

Create `src/services/desktop-service.ts`.

Responsibilities:

- translate `command + args` into `DesktopManager` calls
- normalize return values into `{ text, data }`
- keep command validation local and lightweight

This should mirror the role of `browser-service.ts`.

### 3. Internal API Route

Extend `createApp` in `src/app.ts` with `/internal/desktop/execute`.

Rules:

- loopback requests only
- require `x-gateway-internal-token`
- reject missing or unsupported commands with `400`
- return `{ ok, text, data }`

This should mirror the browser internal route so the desktop capability stays consistent with the existing gateway security model.

### 4. Managed Skill

Create `src/services/gateway-desktop-skill.ts`.

Responsibilities:

- install `./.codex/skills/gateway-desktop/SKILL.md`
- install `./.codex/skills/gateway-desktop/scripts/gateway-desktop.mjs`
- add or upgrade workspace `AGENTS.md` guidance so desktop tasks use the managed skill only
- sync the skill into managed global skill roots

The script contract should match the browser skill pattern:

- read `GATEWAY_DESKTOP_API_BASE`
- read `GATEWAY_INTERNAL_API_TOKEN`
- `POST /execute` with `{ command, args }`
- print the JSON result

### 5. Runner Env Injection

Extend `CodexRunner` child env building to inject:

- `GATEWAY_DESKTOP_API_BASE`
- `GATEWAY_INTERNAL_API_TOKEN`

These are runtime-only values created by the gateway and passed into the child process automatically. They are not user configuration fields.

### 6. Workspace Bootstrap

Update `AgentWorkspaceManager` tool guidance to add:

- desktop tasks must use `gateway-desktop`
- the executor only operates frontmost visible apps
- after critical actions the agent should capture a screenshot as evidence

## Command Protocol

First version command set:

- `launch-app`
  - args: `{ "appName": "Finder" }`
- `activate-app`
  - args: `{ "appName": "Finder" }`
- `frontmost-app`
  - args: `{}`
- `move-mouse`
  - args: `{ "x": 640, "y": 420 }`
- `click`
  - args: `{ "x": 640, "y": 420, "button": "left", "double": false }`
- `drag`
  - args: `{ "from": { "x": 300, "y": 400 }, "to": { "x": 900, "y": 400 } }`
- `type-text`
  - args: `{ "text": "hello world" }`
- `press-key`
  - args: `{ "key": "Enter" }`
- `hotkey`
  - args: `{ "keys": ["Meta", "Shift", "4"] }`
- `screenshot`
  - args: `{ "filename": "desktop-step-01.png" }`

Return shape:

```json
{
  "ok": true,
  "text": "frontmost app: Finder",
  "data": {
    "frontmostApp": "Finder",
    "path": "/abs/path/to/desktop-step-01.png"
  }
}
```

Notes:

- `screenshot` returns a local absolute path so the existing gateway media path handling can forward or analyze it without inventing a new protocol
- `move-mouse` is included for debugging and high-precision recovery, but normal skill guidance should prefer `click`, `drag`, and screenshots for evidence

## Safety Boundaries

Hard constraints for v1:

- only operate the frontmost visible application
- no hidden background automation
- no arbitrary shell commands
- no file reads or writes outside screenshot output
- no Accessibility tree inspection
- after two consecutive failed actions, stop and report current evidence
- before irreversible actions such as send, delete, confirm, submit, or payment, capture a screenshot and request confirmation if the user did not already state intent explicitly

## macOS Runtime Requirements

This feature depends on macOS permissions that cannot be hidden by gateway configuration:

- Accessibility
- Screen Recording

The actual host application running the gateway must hold those permissions, for example Terminal, iTerm, Warp, or VS Code's integrated terminal.

No new desktop env vars should be exposed to end users. The only user-visible setup is granting the required macOS permissions when prompted.

## Dependency Strategy

One practical uncertainty remains: the concrete `nut.js` package/install path depends on whether the project uses the licensed prebuilt distribution or a source-build-compatible path.

To avoid coupling the architecture to that decision, `DesktopManager` should expose a narrow adapter boundary:

- gateway code depends on the adapter interface
- only the adapter module depends on the chosen `nut.js` package/import

That keeps the rest of the implementation stable regardless of the final licensing decision.

## Testing

Add focused automated coverage for:

1. desktop command translation in `desktop-service`
2. skill installation and generated script content in `gateway-desktop-skill`
3. runtime env injection in `codex-runner`
4. internal route auth and execution behavior in `app`
5. workspace bootstrap text and skill installation in `agent-workspace-manager`

Avoid real desktop automation in unit tests. Mock the manager boundary and native helper calls.

## Rollout

Implement behind the existing gateway capability pattern without a feature flag.

Rollout order:

1. add service and skill tests
2. add the desktop service/skill/runtime plumbing
3. add workspace bootstrap text
4. document macOS permission requirements in README after the executor works

The first release should be explicitly described as:

- macOS only
- frontmost visible app only
- screenshot-driven evidence loop
