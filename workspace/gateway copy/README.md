# WeCom Codex Gateway (Local PoC)

最小目标：通过企业微信消息触发本机 `codex`，并保留同一用户的会话上下文。

## 功能

- 企业微信回调入口：`/wecom/callback`
- 指令格式：`codex: 你的问题`
- 强制二次确认：`确认 <code>` / `取消 <code>`
- 会话延续：`企业微信用户ID -> codex thread_id` 持久化到 `.data/sessions.json`

## 前置条件

- Node.js 22+
- 已安装并可直接运行 `codex` CLI（`codex --help` 可用）
- 企业微信自建应用（可接收消息）
- `cloudflared`（用于本地回调公网暴露）

## 启动

1. 安装依赖

```bash
cd gateway
npm install
```

2. 配置环境变量

```bash
cp .env.example .env
```

填写：

- `WEWORK_CORP_ID`
- `WEWORK_SECRET`
- `WEWORK_AGENT_ID`
- `CODEX_WORKDIR`（建议为你想让 Codex 操作的工作目录绝对路径）

3. 启动服务

```bash
npm run dev
```

4. 暴露本地地址

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

拿到公网地址，例如：`https://xxxx.trycloudflare.com`

5. 配置企业微信回调

- 回调 URL：`https://xxxx.trycloudflare.com/wecom/callback`
- 建议先使用明文模式做本地联调（当前 PoC 未做加解密回调）

## 使用方式

在企业微信里给应用发消息：

```text
codex: 帮我总结当前目录代码结构
```

收到确认码后：

```text
确认 ABCD
```

取消：

```text
取消 ABCD
```

## 上下文说明

- 首次执行会创建新的 Codex 线程并记录 `thread_id`
- 后续同一用户会使用 `codex exec resume <thread_id>` 续聊
- 因此不会“每次都丢上下文”
- 但模型上下文窗口有限，超长历史会被压缩

## 本地 PoC 限制

- 当前未实现企业微信加密回调验签/解密（仅最小明文联调）
- 仅支持文本消息
- 未实现消息幂等去重（生产建议补上 `MsgId` 去重）
