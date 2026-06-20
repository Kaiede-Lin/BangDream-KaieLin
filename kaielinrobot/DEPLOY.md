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

### 拉取冲突处理

如果本地有未提交的修改导致 `git pull` 冲突：

```bash
git stash && git pull && git stash pop
```

> `git stash pop` 后如有冲突需手动解决。建议本地修改及时提交或备份。

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

> ⚠️ `docker compose down -v` 会**删除 backend_cache 数据卷**，一般不需要加 `-v`。

### 查看容器状态

```bash
docker compose ps
```

---

## 故障排查

### NapCat 无法登录 / 扫码后掉线

**症状**：日志中出现"扫码登录失败"、"登录态失效"，或二维码刷新后仍然无法登录

**解决**：
1. 检查 `napcat/qqdata/` 目录权限（容器内应可读写）
2. 尝试删除 `napcat/qqdata/` 目录后重新扫码
3. 确认 QQ 号未被风控（先在手机 QQ 上正常使用该账号一段时间）
4. 检查 `napcat/config/` 中的 JSON 配置文件格式是否正确

### 后端启动失败

**症状**：`tsugu-backend` 容器反复重启，或 `docker compose ps` 显示 `Restarting`

**解决**：
1. 查看详细错误日志：`docker compose logs backend --tail=50`
2. 常见原因：
   - skia-canvas 编译失败（Docker 构建阶段）→ 确认 Dockerfile 中 `npm rebuild skia-canvas` 已执行
   - 宿主机内存不足 → skia-canvas 渲染需要至少 512MB 空闲内存
   - TypeScript 编译错误 → 检查源码是否完整
3. 确认 `.env` 文件存在且 `BANDORI_STATION_TOKEN` 已填写

### 图片生成失败 / 显示异常

**症状**：返回的图片是灰色方块、报错信息，或图片内容错乱

**解决**：
1. 确认 `backend/assets/` 目录完整（Fonts、Card、Rank 等子目录的素材文件均在）
2. 检查宿主机内存使用情况：`free -h`
3. 查看后端日志定位具体错误：`docker compose logs -f backend | grep -i error`

### Koishi 无法连接后端

**症状**：发送指令后长时间无响应，Koishi 日志显示连接超时或 `ECONNREFUSED`

**解决**：
1. 确认 backend 容器正常运行：`docker compose ps backend`
2. 确认 `koishi.yml` 中 `backendUrl` 为 `http://backend:3000`（使用 Docker 内部网络）
3. 在 koishi 容器内测试连通性：
   ```bash
   docker exec tsugu-koishi wget -qO- http://backend:3000/
   ```

### 宿主机重启后服务自启

确认 Docker daemon 已设置开机自启：

```bash
systemctl enable docker
```

确认 `docker-compose.yml` 中各服务配置了 `restart: unless-stopped`（项目默认已配置）。

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

## 备份与恢复

### 需要备份的数据

| 路径 | 内容 | 重要性 |
|------|------|:--:|
| `.env` | 环境变量与 API Token | 🔴 高 |
| `napcat/config/*.json` | QQ 登录配置 | 🔴 高 |
| `napcat/qqdata/` | QQ 登录状态缓存（丢失需重新扫码） | 🔴 高 |
| `backend/config/` | 昵称配置与数据修正 | 🟡 中 |
| `koishi/data/koishi.db` | 群发言统计、用户数据 | 🟡 中 |
| `koishi/data/food-libs/` | 食物/饮品图库 | 🟡 中 |
| `koishi/data/jrlp-cache/` | 今日老婆缓存 | 🟢 低 |

### 备份命令

```bash
cd /path/to/BangDream-KaieLin

tar czf kaielin-backup-$(date +%Y%m%d).tar.gz \
  .env \
  koishi/data/ \
  napcat/config/ \
  napcat/qqdata/ \
  backend/config/
```

### 恢复命令

```bash
cd /path/to/BangDream-KaieLin
tar xzf kaielin-backup-YYYYMMDD.tar.gz -C .
docker compose up -d --build
```

### 自动化备份（crontab）

```bash
# 每天凌晨 3 点自动备份
0 3 * * * cd /path/to/BangDream-KaieLin && \
  tar czf backups/kaielin-$(date +\%Y\%m\%d).tar.gz .env koishi/data/ napcat/config/ napcat/qqdata/ backend/config/
```

> 建议保留最近 7 天的备份，定期清理旧文件：
> ```bash
> find backups/ -name "kaielin-*.tar.gz" -mtime +7 -delete
> ```

---

## 使用 Nginx 反向代理（可选）

虽然本项目不对外提供 Web 服务，但如果需要从外网访问 Koishi 控制台（端口 5170）：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5170;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 重要提示

| 项目 | 说明 |
|------|------|
| `.env` | 包含 token，已 gitignore，每台服务器需单独创建 |
| `koishi/data/koishi.db` | SQLite 数据库，已 gitignore，升级不会丢失 |
| `napcat/config/` | QQ 登录配置，已 gitignore，不要提交到 git |
| `napcat/qqdata/` | QQ 登录状态，已 gitignore，删除需要重新扫码 |
| 重启 napcat | QQ 会掉线，需要重新扫码，尽量避免 |
| 重启 koishi / backend | 安全，不影响 QQ 在线状态 |
| Docker 镜像源 | 国内服务器可配置 Docker 镜像加速器加速拉取 |
