FROM docker.m.daocloud.io/library/node:18-slim

# 安装 canvas / skia-canvas 运行所需的系统依赖
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi8 \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 使用国内 npm 镜像
RUN npm config set registry https://registry.npmmirror.com

# 创建 package.json
RUN echo '{"name":"tsugu-bot","version":"1.0.0","private":true}' > package.json

# 安装依赖
RUN npm install koishi@4 \
    koishi-plugin-adapter-onebot \
    @koishijs/plugin-database-sqlite \
    @koishijs/plugin-help \
    koishi-plugin-tsugu-bangdream-bot \
    canvas axios 2>&1

# 创建 data 目录
RUN mkdir -p /app/data

# 复制修补脚本
COPY patch-middleware.js ./
COPY patch-submit.js ./

# 替换 Tsugu 插件中硬编码的 source 为可配置的环境变量
RUN sed -i \
  -e 's/`\${BandoriStationurl}index.php`/BandoriStationurl/g' \
  -e 's/source: "Tsugu"/source: process.env.BANDORI_STATION_SOURCE || "Tsugu"/g' \
  -e 's/bandoriStationToken = "ZtV4EX2K9Onb"/bandoriStationToken = process.env.BANDORI_STATION_TOKEN || "ZtV4EX2K9Onb"/g' \
  -e 's/await axios3.default.post(url, data);/const res = await axios3.default.post(url, data); try { console.log("station", JSON.stringify({submitted: data, status: res.status, response: typeof res.data === "string" ? res.data : res.status})); } catch(e) { console.log("station", "submit success, data omitted"); }/g' \
  -e 's/console\.log("station", `error: \${e}`);/try { console.log("station", JSON.stringify({error: e.message, submitted: data})); } catch(e2) { console.log("station", `error: \${e}`); }/g' \
  /app/node_modules/koishi-plugin-tsugu-bangdream-bot/lib/index.js

# 给 submitRoomNumber 的 data 字段加 String() 保护，防止循环引用
RUN node patch-submit.js

# 给房间号自动检测中间件添加 try-catch（数据库不可用时不会报错）
RUN node patch-middleware.js

# 复制配置、自定义插件
COPY koishi.yml ./
COPY custom-shortcuts.js ./
COPY message-rank.js ./
COPY dedup.js ./

# 复制中文字体（用于发言排行图片生成）
COPY fonts/ /app/fonts/

EXPOSE 5170

CMD ["npx", "koishi", "start"]
