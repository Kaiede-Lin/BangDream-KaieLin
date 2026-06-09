# 服务器部署与热更新指南

## 环境要求

- Linux 服务器（日本）
- Docker + Docker Compose
- Git

## 首次部署

```bash
# 1. 克隆仓库
git clone https://github.com/Kaiede-Lin/BangDream-KaieLin.git
cd BangDream-KaieLin

# 2. 创建环境变量
cp .env.example .env
# 编辑 .env，填入正确的 BANDORI_STATION_TOKEN

# 3. 创建 napcat 配置目录
mkdir -p napcat/config napcat/qqdata napcat/data

# 4. 放入 napcat 配置文件
# 将你的 onebot11_3587847603.json、napcat_3587847603.json 等放入 napcat/config/

# 5. 启动全部服务
docker compose up -d --build

# 6. 扫码登录 QQ
docker compose logs -f napcat
# 看到二维码后用手机 QQ 扫描登录
```

---

## 热更新（日常更新代码）

```bash
cd /path/to/BangDream-KaieLin

# 1. 拉取最新代码
git pull

# 2. 重建并重启有变化的容器
# --build 会利用 Docker 缓存，没有变化的层会直接复用，非常快
docker compose up -d --build

# 3. 查看日志确认正常
docker compose logs --tail=30
```

> **说明**：`docker compose up -d --build` 只会重建 Dockerfile 或配置发生变化的服务。
> 数据目录（koishi/data、napcat/qqdata）通过 volume 挂载，数据不会丢失。
> napcat 容器如果没有配置变化不会重启，QQ 登录状态保持。

---

## 常见操作

### 只看某个服务日志

```bash
docker compose logs -f koishi     # Koishi 机器人
docker compose logs -f napcat     # QQ 协议端（含二维码）
docker compose logs -f backend    # 后端
```

### 单独重启某个服务

```bash
docker compose restart koishi     # 重启机器人（保持 QQ 在线）
docker compose restart backend    # 重启后端
```

> ⚠️ **不要随意重启 napcat**，否则需要重新扫码登录！

### 重新构建并启动

```bash
docker compose up -d --build      # 所有服务
docker compose up -d --build koishi  # 仅 Koishi
```

### 停止所有服务

```bash
docker compose down
```

### 查看容器状态

```bash
docker compose ps
```

---

## 目录说明（服务器上）

```
BangDream-KaieLin/
├── .env                  # 环境变量（token 等，不提交 git）
├── docker-compose.yml    # 服务编排
├── backend/              # 后端代码
├── koishi/
│   ├── Dockerfile
│   ├── koishi.yml        # 机器人配置
│   ├── *.js              # 自定义插件
│   └── data/             # 运行时数据（数据库、图片素材等）
└── napcat/
    ├── config/           # QQ 协议配置（不提交 git）
    ├── qqdata/           # QQ 登录缓存（不提交 git）
    └── data/             # napcat 数据
```

---

## 注意事项

| 项目 | 说明 |
|------|------|
| `.env` | 包含 token，已 gitignore，每台服务器需单独创建 |
| `koishi/data/koishi.db` | SQLite 数据库，已 gitignore，升级不会丢失 |
| `napcat/config/` | QQ 登录配置，已 gitignore，不要提交到 git |
| `napcat/qqdata/` | QQ 登录状态，已 gitignore，删除需要重新扫码 |
| 重启 napcat | QQ 会掉线，需要重新扫码，尽量避免 |
| 重启 koishi / backend | 安全，不影响 QQ 在线状态 |
