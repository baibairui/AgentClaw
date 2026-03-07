---
name: reminder-tool
description: Use when a user asks to be reminded later, at a time, after a delay, or on a schedule in the current chat. Calls the create_reminder MCP tool to create a durable reminder task instead of emitting reminder-action text blocks or asking the user to run /remind.
---

# Reminder Tool

When the user asks for a reminder, call the `create_reminder` tool.

Use this workflow:
1. Extract the delay and reminder message.
2. If the delay is ambiguous, ask a follow-up question before calling the tool.
3. Call `create_reminder` with either `delay` or `delayMs`, plus `message`.
4. Tell the user the reminder has been created. Do not emit raw tool payloads or fenced action blocks.

Rules:
- Prefer `delay` for simple durations such as `5min`, `2h`, `1d`.
- Keep `message` short, concrete, and action-oriented.
- Never ask the user to type `/remind`.
- Never output ```reminder-action blocks.

Examples:
- User: `20分钟后提醒我开会`
  Call: `create_reminder(delay="20min", message="开会")`
- User: `明天提醒我交周报`
  If the exact trigger time is unclear, ask for a concrete time first.
