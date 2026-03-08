# Gateway Browser Only Design

## Goal

强制所有 agent 只使用 gateway 内置浏览器能力，彻底切断外部 browser MCP URL 覆盖入口，避免运行结果受用户本机 Codex 配置或额外 MCP 配置影响。

## Scope

- 保留现有 `gateway_browser` MCP server 名称与工具集合。
- 保留本地内置 browser MCP 的懒启动与共享 profile 行为。
- 移除 `BROWSER_MCP_URL` 作为运行时输入的主链路能力。
- 文档明确说明：浏览器能力只能来自 gateway 内置实现。

## Recommended Approach

采用“删除覆盖入口、保留内置实现”的最小改动方案：

1. 配置层不再暴露 `browserMcpUrl`。
2. 服务启动时，`resolveBrowserMcpRuntime` 永远只基于 `enabled` 和 `port` 生成本地 runtime。
3. `CodexRunner` 继续接收最终生效的本地 URL，但这个 URL 只允许来自 gateway 自己启动出来的 browser MCP server。
4. 测试与 README 同步更新为“只允许 gateway 内置浏览器”。

## Why This Approach

- 改动面小，不需要重写 `CodexRunner` 或 browser MCP server。
- 保持 `gateway_browser` 注入方式不变，agent 行为和现有 prompt 约束无需迁移。
- 从配置源头切掉外部覆盖，比在 prompt 或运行时做“尽量优先内置”更可靠。

## Non-Goals

- 不新增新的浏览器工具。
- 不调整 browser manager 生命周期。
- 不兼容外部 browser MCP 作为开发模式；这次改动的目标就是彻底禁用该能力。
