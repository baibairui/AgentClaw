# Feishu Card-Only Outbound Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure every user-visible Feishu agent reply is sent as a schema 2.0 interactive card, including plain text, structured markdown/post payloads, and streaming snapshots.

**Architecture:** Enforce the “card-only” invariant in `src/services/feishu-api.ts`, keep existing specialized Feishu cards intact, stop structured markdown from normalizing to `post`, and add a concrete Feishu streaming sender that emits a new card per snapshot. Keep WeCom behavior unchanged.

**Tech Stack:** Node.js, TypeScript, Vitest, existing gateway Feishu API wrapper, chat handler, and server wiring.

---

### Task 1: Add failing tests for card-only Feishu text normalization

**Files:**
- Modify: `tests/feishu-api.test.ts`
- Modify: `tests/feishu-outgoing.test.ts`
- Test: `tests/feishu-api.test.ts`
- Test: `tests/feishu-outgoing.test.ts`

**Step 1: Write the failing test**

Add coverage for:

- `feishuApi.sendText()` sending generic text as `interactive`
- long generic Feishu text splitting into multiple `interactive` sends instead of `post`
- `normalizeFeishuStructuredMessage('markdown', ...)` no longer returning `post`

**Step 2: Run test to verify it fails**

Run: `npm test -- --dir tests tests/feishu-api.test.ts tests/feishu-outgoing.test.ts`
Expected: FAIL because generic Feishu text and structured markdown still normalize to `post`.

**Step 3: Write minimal implementation**

Change only the outbound normalization code needed for these assertions.

**Step 4: Run test to verify it passes**

Run: `npm test -- --dir tests tests/feishu-api.test.ts tests/feishu-outgoing.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/feishu-api.test.ts tests/feishu-outgoing.test.ts src/services/feishu-api.ts src/utils/feishu-outgoing.ts
git commit -m "fix: send feishu text replies as cards"
```

### Task 2: Convert structured Feishu post payloads into safe interactive cards

**Files:**
- Modify: `src/services/feishu-api.ts`
- Modify: `src/utils/feishu-outgoing.ts`
- Modify: `tests/feishu-api.test.ts`
- Modify: `tests/feishu-outgoing.test.ts`

**Step 1: Write the failing test**

Add one focused regression proving a structured Feishu `post` payload is accepted by the gateway but reaches the transport layer as `interactive`, with flattened markdown-safe content.

**Step 2: Run test to verify it fails**

Run: `npm test -- --dir tests tests/feishu-api.test.ts tests/feishu-outgoing.test.ts`
Expected: FAIL because post payloads still pass through as `post`.

**Step 3: Write minimal implementation**

Add helpers to:

- extract text-like content from supported `post` nodes
- wrap the flattened content in a schema 2.0 interactive card
- reuse the same generic card builder for `text`, `markdown`, and flattened `post`

Do not try to emulate every rich `post` node type.

**Step 4: Run test to verify it passes**

Run: `npm test -- --dir tests tests/feishu-api.test.ts tests/feishu-outgoing.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/feishu-api.ts src/utils/feishu-outgoing.ts tests/feishu-api.test.ts tests/feishu-outgoing.test.ts
git commit -m "fix: normalize feishu post replies into cards"
```

### Task 3: Wire real Feishu streaming card sends and cover no-duplicate final flush

**Files:**
- Modify: `src/server.ts`
- Modify: `src/services/chat-handler.ts`
- Modify: `tests/chat-handler.test.ts`
- Test: `tests/chat-handler.test.ts`

**Step 1: Write the failing test**

Add coverage for:

- Feishu streaming path invoking a dedicated `sendStreamingText`
- each flushed snapshot sending a new card
- final flush skipping a duplicate send when the last snapshot already contains the final text

**Step 2: Run test to verify it fails**

Run: `npm test -- --dir tests tests/chat-handler.test.ts`
Expected: FAIL because `createChatHandler` is not currently wired with a concrete Feishu streaming sender and the final flush behavior is not deduplicated.

**Step 3: Write minimal implementation**

Implement:

- a concrete `sendStreamingText` function in `src/server.ts`
- Feishu-only routing that sends the snapshot through the same interactive-card transport path
- a small dedup guard in `src/services/chat-handler.ts` so the final send happens only when new content was added

Keep WeCom and non-streaming behavior unchanged.

**Step 4: Run test to verify it passes**

Run: `npm test -- --dir tests tests/chat-handler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server.ts src/services/chat-handler.ts tests/chat-handler.test.ts
git commit -m "feat: stream feishu agent replies as cards"
```

### Task 4: Tighten outbound Feishu guidance and run focused regression checks

**Files:**
- Modify: `src/services/chat-handler.ts`
- Modify: `tests/chat-handler.test.ts`
- Verify only: `tests/feishu-command-cards.test.ts`
- Verify only: `tests/startup-help.test.ts`

**Step 1: Write the failing test**

Add or update one assertion proving the Feishu outbound protocol guidance no longer recommends `post` as the preferred format for multi-section replies.

**Step 2: Run test to verify it fails**

Run: `npm test -- --dir tests tests/chat-handler.test.ts`
Expected: FAIL because the current prompt still recommends `post` in several Feishu guidance lines.

**Step 3: Write minimal implementation**

Update the Feishu outbound protocol prompt so it matches the card-only transport invariant without changing unrelated channel guidance.

**Step 4: Run test to verify it passes**

Run: `npm test -- --dir tests tests/chat-handler.test.ts tests/feishu-command-cards.test.ts tests/startup-help.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/chat-handler.ts tests/chat-handler.test.ts docs/plans/2026-03-14-feishu-card-only-design.md docs/plans/2026-03-14-feishu-card-only.md
git commit -m "docs: capture feishu card-only outbound plan"
```

### Task 5: Run the full focused Feishu regression bundle

**Files:**
- Verify only: `tests/feishu-api.test.ts`
- Verify only: `tests/feishu-outgoing.test.ts`
- Verify only: `tests/chat-handler.test.ts`
- Verify only: `tests/feishu-command-cards.test.ts`
- Verify only: `tests/startup-help.test.ts`
- Verify only: `tests/app.test.ts`

**Step 1: Run focused tests**

Run: `npm test -- --dir tests tests/feishu-api.test.ts tests/feishu-outgoing.test.ts tests/chat-handler.test.ts tests/feishu-command-cards.test.ts tests/startup-help.test.ts tests/app.test.ts`
Expected: PASS

**Step 2: Review outbound behavior**

Confirm:

- no user-visible Feishu agent reply path intentionally emits `post`
- existing explicit interactive cards still render as cards
- streaming snapshots create multiple cards and the final flush is not duplicated

**Step 3: Commit**

```bash
git add docs/plans/2026-03-14-feishu-card-only-design.md docs/plans/2026-03-14-feishu-card-only.md
git commit -m "docs: record feishu card-only implementation plan"
```
