# Gateway Browser Manager Design

**Date:** 2026-03-08

**Goal**

用 gateway 自己持有的浏览器状态替换当前基于 `@playwright/mcp` HTTP session 的浏览器链路，确保用户桌面上的浏览器页面可以跨多轮 Codex run 持续存在，不再回到 `about:blank` 或被隐式丢失。

**Problem**

当前实现把浏览器能力交给常驻 `@playwright/mcp`，Codex 每轮通过 MCP URL 接入。虽然 `shared-browser-context` 能让同一 MCP 进程复用 profile，但每次新的 Codex run 仍然表现为新的工具会话。实际观测表明：

- 新一轮工具调用开始时，当前页会退回空白页。
- 日志中没有显式 `browser_close`，但上一轮页面状态在下一轮不可见。
- 这说明“页面生命周期”没有真正掌握在 gateway 手里，而是被底层工具会话隐式决定。

因此，继续修补当前 `@playwright/mcp` URL 注入模式无法满足“单用户桌面部署下浏览器页面跨消息保活”的产品目标。

**Chosen Approach**

- 在 gateway 进程内引入单例 `BrowserManager`。
- `BrowserManager` 自己持有：
  - 一个 `Browser`
  - 一个持久化 `BrowserContext`
  - 一个 tab registry
  - 一个 current tab 指针
- gateway 自己暴露一个本地 browser MCP server，Codex 只连接这个 server。
- 移除现有 `@playwright/mcp` 常驻服务主链路。
- 移除 `/open` 兜底能力，统一通过 gateway-owned browser tools 工作。

**Why This Approach**

- 页面生命周期掌握在 gateway 进程，而不是临时工具 session。
- 单用户桌面部署场景下，单例 browser/context 模型足够简单，复杂度最低。
- 可以复用现有 Codex MCP 接入方式，只替换 browser server 实现，不需要 agent 学习全新交互模型。
- 后续如果需要扩展更多工具，只是在 gateway 侧继续补能力，不再受 `@playwright/mcp` 会话语义限制。

**Non-Goals**

- 不做多用户浏览器隔离。
- 不做复杂权限模型或浏览器租户调度。
- 不追求完全覆盖 `@playwright/mcp` 的所有工具。
- 不保留 `/open` 或旧的 Playwright MCP 双轨方案。

**Runtime Model**

- Browser lazily starts on first browser tool call.
- Browser is headed and visible on the user desktop.
- A single persistent context is reused across all Codex runs.
- Existing tabs remain in memory until explicitly closed or gateway exits.
- `browser_snapshot` uses the current tab if one exists; otherwise it creates one.

**Tool Compatibility**

第一阶段兼容以下工具名，减少 agent 行为变化：

- `browser_snapshot`
- `browser_navigate`
- `browser_click`
- `browser_type`
- `browser_press_key`
- `browser_wait_for`
- `browser_tabs`
- `browser_close`

输出格式尽量保持与当前 browser MCP 接近，至少保留：

- `page`
- `snapshot`
- 必要的 `code`

**Data Model**

`BrowserManager` 维护以下状态：

- `browser?: Browser`
- `context?: BrowserContext`
- `tabs: Map<number, Page>`
- `currentTabId?: number`
- `nextTabId: number`

约束：

- tab id 在 gateway 生命周期内单调递增
- 关闭当前 tab 时，current tab 自动切到最近仍存在的 tab
- 最后一个 tab 关闭后，不自动销毁 browser/context；下一次工具调用可再创建新 tab

**Integration Changes**

- `src/server.ts`
  - 初始化 `BrowserManager`
  - 启动 gateway-owned browser MCP server
  - 不再启动 `@playwright/mcp`
- `src/services/codex-runner.ts`
  - 改为注入 gateway-owned browser MCP URL
  - 删除对旧 Playwright MCP 语义的假设
- `src/services/playwright-mcp-server.ts`
  - 删除或退役
- `src/services/browser-manager.ts`
  - 新增浏览器生命周期与 tab 状态管理
- `src/services/browser-mcp-server.ts`
  - 新增 browser MCP tools 实现
- `src/services/chat-handler.ts`
  - 移除 `/open` 路径
- `src/config.ts`
  - 删除旧的 `BROWSER_OPEN_*` 相关配置

**Verification**

- 单元测试覆盖 `BrowserManager`：
  - 首次调用时懒启动
  - 新建/切换/关闭 tab
  - current tab 跨多次调用保持
- MCP server 单测覆盖工具行为：
  - snapshot/navigate 使用已有 current tab
  - close 不会销毁整个 browser
- Runner 单测覆盖：
  - 注入新的 browser MCP URL
  - 不再依赖旧 `gateway_playwright`

**Risks**

- 自己维护 browser tools 会带来一定实现成本，尤其是 snapshot 输出兼容。
- 如果最初工具面做得太小，某些复杂任务可能临时回退到不可用。
- 单例 browser/context 模型在未来多用户场景下需要重构，但当前部署形态可接受。
