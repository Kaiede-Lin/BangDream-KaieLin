FROM mcr.microsoft.com/devcontainers/javascript-node:18-bookworm

# 安装编译 skia-canvas 需要的依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    libglib2.0-0 \
    libnss3 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json tsconfig.json ./

# 使用国内 npm 镜像
RUN npm config set registry https://registry.npmmirror.com

# 先安装所有 JS 依赖（跳过 native 编译）
RUN npm install --ignore-scripts 2>&1

# 单独编译 skia-canvas（Linux 有预编译二进制）
RUN npm rebuild skia-canvas 2>&1 || true
RUN node -e "require('skia-canvas'); console.log('skia-canvas OK')" 2>&1

# 复制源码和资源
COPY .env ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY config/ ./config/
COPY assets/ ./assets/

# 编译 TypeScript
RUN npx tsc 2>&1 && npx tsc-alias 2>&1 || true

EXPOSE 3000

ENV UV_THREADPOOL_SIZE=48
ENV LOCAL_DB=false
ENV BACKEND_PORT=3000

CMD ["node", "dist/app.js"]
