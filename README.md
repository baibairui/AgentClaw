# wecom-codex-gateway

企业微信（WeCom）到 Codex CLI 的轻量网关：
- 接收企业微信安全模式回调（验签 + 解密）
- 将文本消息转发给本地 `codex` CLI
- 使用企业微信 API 主动推送回复

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
cp .env.example .env
```

3. 开发启动

```bash
npm run dev
```

4. 生产构建与启动

```bash
npm run build
npm start
```

## 关键环境变量

- `WEWORK_CORP_ID` / `WEWORK_SECRET` / `WEWORK_AGENT_ID`
- `WEWORK_TOKEN` / `WEWORK_ENCODING_AES_KEY`（企业微信回调安全模式）
- `CODEX_WORKDIR`（Codex 执行目录）
- `CODEX_SANDBOX`：`full-auto`（默认）或 `none`
- `RUNNER_ENABLED`：`false` 时禁用执行，仅返回提示
- `ALLOW_FROM`：白名单，`*` 或逗号分隔用户 ID
- `DEDUP_WINDOW_SECONDS`：消息去重窗口
- `RATE_LIMIT_MAX_MESSAGES` + `RATE_LIMIT_WINDOW_SECONDS`：每用户限流
- `API_TIMEOUT_MS`：企业微信 API 请求超时

## 接口

- `GET /healthz`：健康检查
- `GET /wecom/callback`：企业微信回调地址校验
- `POST /wecom/callback`：企业微信消息回调

## 聊天内功能命令

- `/help`：查看可用命令
- `/new`：新建会话（清空当前上下文）
- `/clear`：清空当前会话（同 `/new`）
- `/session`：查看当前会话状态
- `/sessions`：查看历史会话列表（最近优先，含名称与最近问题摘要）
- `/switch <编号|threadId>`：切换会话
- `/rename <编号|threadId> <名称>`：重命名会话

推荐使用：
- 先输入 `/sessions` 查看编号
- 再输入 `/switch 2` 按编号切换

普通消息会先收到“处理中”提示，再持续收到 Codex 的流式回复。

## 测试

```bash
npm test
```

## 会话持久化

- 现在使用 SQLite 存储会话数据：`.data/sessions.db`
