# ---- build ----
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:22-slim
WORKDIR /app

# 安装 codex CLI
RUN npm install -g @openai/codex

# 只复制生产依赖
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 复制编译产物
COPY --from=builder /app/dist ./dist

# 创建 workspace、data、codex 配置目录
RUN mkdir -p /app/workspace /app/.data /root/.codex

# 挂载点：运行时需要将 codex 认证凭据挂载到 /root/.codex
VOLUME ["/root/.codex"]

EXPOSE 3000

CMD ["node", "dist/server.js"]
