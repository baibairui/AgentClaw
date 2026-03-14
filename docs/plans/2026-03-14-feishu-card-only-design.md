# Feishu Card-Only Outbound Design

**Date:** 2026-03-14

**Goal:** Make all user-visible Feishu agent replies render as schema 2.0 interactive cards, eliminating the current fallback to `post` while preserving existing command/login cards and allowing streaming replies to emit multiple cards.

## Scope

This change covers Feishu outbound reply behavior for agent-visible messages.

In scope:

- plain `sendText()` replies that currently fall back to `post`
- structured Feishu `text` / `markdown` / `post` payloads that come from gateway code, skills, or model output
- Feishu streaming snapshots produced during normal chat execution
- test coverage proving Feishu no longer sends `post` for these user-visible agent flows

Out of scope:

- changing WeCom outbound behavior
- rewriting binary/media message handling
- changing existing explicit Feishu card actions beyond keeping them schema-2.0-compatible

## Current Context

Recent relevant changes in this area:

- `6359229 fix: normalize feishu interactive cards`
- `a4419f2 feat: wire speech service into server`

The current implementation still mixes multiple outbound shapes:

- `src/services/feishu-api.ts` converts only some prefixed text replies into `interactive`, then falls back to chunked `post`
- `src/utils/feishu-outgoing.ts` rewrites structured `markdown` into `post`
- `src/server.ts` does not provide a concrete Feishu `sendStreamingText` implementation, so streaming snapshots do not have a dedicated card-only path

That means the gateway can still violate the desired invariant even after the recent schema-2.0 cleanup for `action` and `note`.

## Decision

Adopt a mixed strategy with transport-layer enforcement and small business-layer adjustments.

Transport-layer enforcement is the key invariant:

- every visible Feishu text-like outbound message must end up as `interactive`
- existing `interactive` cards remain first-class and are only normalized for schema 2.0 compatibility

Business-layer changes stay minimal:

- keep existing specialized command/login cards
- add a real Feishu streaming sender so streaming snapshots intentionally produce new cards instead of relying on generic `sendText()`
- tighten the outbound protocol guidance so future agent/skill output does not keep asking for `post`

This avoids a broad rewrite of all call sites while still making “no post for Feishu agent replies” a hard gateway rule.

## Architecture

### 1. Feishu transport normalization

`src/services/feishu-api.ts` becomes the single enforcement point for card-only Feishu text-like output.

Rules:

- `interactive`: preserve as `interactive`, then normalize unsupported legacy tags like `action` and `note`
- `text`: convert to a generic schema 2.0 card with a markdown body
- `markdown`: convert to the same generic card shape
- `post`: flatten supported post content into markdown, then wrap it in the same generic card shape

The API layer also owns message splitting. Instead of splitting long text into multiple `post` messages, it should split the rendered markdown body into multiple interactive cards and add a compact segment indicator when needed.

### 2. Structured message normalization

`src/utils/feishu-outgoing.ts` should stop translating structured `markdown` into `post`.

Instead:

- either preserve `markdown` and let `feishu-api.ts` convert it into cards
- or normalize `markdown` directly into `interactive`

The same policy applies to structured `post`: keep it routable, but ensure it reaches Feishu only as an interactive card. This keeps model-generated structured output compatible without requiring every agent or skill to be updated in lockstep.

### 3. Streaming behavior

User-approved behavior is “option 2”: every Feishu streaming snapshot becomes a new card.

Implementation requirements:

- add a concrete `sendStreamingText` implementation from `src/server.ts` into `createChatHandler`
- for Feishu, each throttled snapshot sends a new interactive card
- do not call `updateMessage()` for streaming snapshots
- when the final accumulated text matches the last flushed snapshot, skip the duplicate final send

This is intentionally noisier than single-card updates, but it matches the explicit requirement to preserve the visible progression.

### 4. Specialized cards remain specialized

Existing command, login, and operational cards in `src/services/feishu-command-cards.ts` should remain intact.

They already provide richer layouts than a generic fallback card. The transport layer should not downgrade them; it only needs to normalize schema-2.0-incompatible tags before send.

## Data Flow

### Plain text path

1. business code calls `sendText(channel, userId, content)`
2. Feishu path reaches `feishuApi.sendText(...)`
3. `sendText()` always converts visible text content into one or more `interactive` cards
4. no `post` create/reply request is sent to Feishu

### Structured outbound path

1. business code or agent returns a gateway structured message
2. `src/server.ts` parses it and normalizes Feishu reply options
3. structured `text` / `markdown` / `post` content is routed into the interactive-card normalization path
4. structured `interactive` content remains interactive and is schema-normalized before send

### Streaming path

1. `chat-handler` accumulates `streamedText`
2. on each throttle window, Feishu sends the latest snapshot as a new interactive card
3. the final flush sends one last card only if it adds content beyond the last snapshot

## Card Rendering Rules

Generic fallback cards should stay simple and stable:

- schema `2.0`
- optional lightweight header title
- body rendered with supported `markdown`
- no `note`
- no `action`
- no reliance on legacy containers rejected by current Feishu validation

For content extracted from `post`, flatten only the supported text-like parts into markdown:

- `text` nodes become plain text
- `md` nodes stay markdown
- unsupported rich nodes should be omitted or replaced with a short placeholder instead of trying to emulate every `post` feature

The goal is safe degradation, not perfect `post` feature parity.

## Error Handling

The invariant is “interactive or fail”, not “interactive unless post is easier”.

Therefore:

- remove any Feishu fallback that intentionally reverts text-like content to `post`
- keep existing retry behavior for transient send failures
- if a card send still fails, fallback warning messages should themselves go through the same card-only path

This keeps operational behavior consistent even during partial failures.

## Testing

Update or add tests for:

1. `sendText()` with generic text now sends `interactive`, never `post`
2. structured Feishu `markdown` no longer normalizes to `post`
3. structured Feishu `post` is converted into an interactive card-safe representation
4. long Feishu text splits into multiple interactive cards instead of multiple posts
5. Feishu streaming sends multiple cards and avoids a duplicate final card when no new content was added
6. existing command cards still remain `interactive`

Primary files:

- `tests/feishu-api.test.ts`
- `tests/feishu-outgoing.test.ts`
- `tests/chat-handler.test.ts`

## Risks And Tradeoffs

The main tradeoff is volume: streaming with one new card per snapshot will generate more Feishu messages than update-in-place.

That is acceptable because:

- it is the explicitly approved product behavior
- it avoids hidden mutable state for users who want to see progression

Another tradeoff is `post` degradation. Some rich `post` layouts may lose fidelity when flattened into markdown, but this is preferable to continuing to emit a message type the user no longer wants for agent replies.

## Rollout

Implement test-first.

Start with outbound normalization tests, then the API-layer conversion, then wire streaming send support, then tighten prompt guidance and run focused Feishu regressions.
