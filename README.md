# KaieLin / 沐凛

**心漾流光群机器人**

KaieLin，昵称「沐凛」，是基于 `Tsugu / BanG Dream!` 生态改造的群机器人后端与 Koishi 机器人套件。  
它主要面向 BanG Dream! 相关查询、图片生成、抽卡模拟、活动情报、群聊统计等功能，服务于心漾流光群的日常使用。

## 项目特点

- 基于 Docker 的一体化部署方案，包含 `backend`、`koishi`、`napcat` 三个服务
- 支持 BanG Dream! 相关数据查询与图像化展示
- 提供抽卡模拟、谱面查询、活动/卡池查询、cutoff 相关功能
- 支持群消息排行、快捷指令、去重等机器人侧增强能力
- 兼容 Bestdori、BandoriStation、HHWX 等数据源
- 内置 Pixiv 随机图片检索、食物/饮品随机推荐等娱乐功能

## 架构概览

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────────┐
│  QQ 客户端 │ ──→ │    NapCat    │ ──→ │    Koishi    │ ──→ │    Backend      │
│  (用户消息) │ ←── │  (QQ 协议层)  │ ←── │  (机器人框架)  │ ←── │  (HTTP API 服务) │
└──────────┘     └──────────────┘     └──────────────┘     └─────────────────┘
                       │                      │                      │
                 端口: 5600/6099         端口: 5170             端口: 3000
                 协议: OneBot WS        插件: tsugu-bot         数据源: Bestdori
                                        自定义插件 × 6          BandoriStation
                                                               HHWX
```

**数据流**: 用户在 QQ 群发送指令 → NapCat 通过 OneBot WebSocket 转发给 Koishi → Koishi 调用后端 HTTP API → 后端查询外部数据源、渲染图片 → 返回结果 → Koishi 发送回 QQ 群

**三个核心服务**:

| 服务 | 容器名 | 角色 |
|------|--------|------|
| `napcat` | `tsugu-napcat` | QQ 协议接入层，负责与 QQ 服务器通信 |
| `koishi` | `tsugu-koishi` | 机器人框架层，命令路由、插件管理、中间件 |
| `backend` | `tsugu-backend` | 核心后端服务，HTTP API、图片渲染、数据查询 |

## 功能与指令

### 卡牌查询

| 指令 | 说明 |
|------|------|
| `查卡 [角色名/卡牌ID]` | 查询指定卡牌的详细信息与图片 |
| `查卡列表 [条件]` | 按角色/属性/乐队/稀有度筛选卡牌 |
| `卡池查询 [卡池名]` | 查看当前/历史卡池详情 |

### 抽卡模拟

| 指令 | 说明 |
|------|------|
| `抽卡 [卡池名]` | 模拟抽卡，支持限定/FES/常驻等卡池 |
| `抽卡十连` | 十连抽卡模拟 |

### 歌曲与谱面

| 指令 | 说明 |
|------|------|
| `查歌 [歌曲名]` | 查询歌曲信息与各难度谱面数据 |
| `查谱面 [歌曲名] [难度]` | 查看指定难度的谱面 |
| `随机曲` | 从曲库中随机推荐一首歌曲 |

### 活动与档线

| 指令 | 说明 |
|------|------|
| `查活动 [活动名/ID]` | 查询活动详情与进度 |
| `活动预览` | 查看下期活动情报 |
| `查档线` | 各服当期活动档线一览 |
| `查档线详情 [活动ID]` | 指定活动的详细档线数据 |
| `ycx [活动ID]` | 生成活动档线预测报告 |

### 编队功能

| 指令 | 说明 |
|------|------|
| `组队 [条件]` | 自动编排最佳卡组 |
| `查编队详情` | 查看最近一次编队结果详情 |

### 群聊增强（自定义插件）

| 指令 | 说明 |
|------|------|
| `发言排行 [日期]` | 查看群内发言排行（前 20 名，含头像+柱状图） |
| `今日老婆` | 随机抽取一位 BanG Dream! 角色 |
| `吃什么` / `喝什么` | 从本地图库随机推荐食物/饮品图片 |
| `来点 [关键词]` | 从 Pixiv 检索随机图片（支持 Bang Dream 角色别名） |
| `我说 [关键词] 执行 [指令]` | 设置个人快捷指令 |
| `我说 [关键词] 回答 [文字]` | 设置个人快捷回复 |
| `问答列表` | 查看已设置的快捷指令 |
| `删除问答 [编号]` | 删除指定快捷指令 |

### 服务器支持

所有查询类指令均支持指定服务器：`日服 (jp/0)` / `国服 (cn/3)` / `台服 (tw/2)` / `国际服 (en/1)` / `韩服 (kr/4)`

---

## 目录说明

```
BangDream-KaieLin/
├── .env.example           # 环境变量模板
├── .gitignore
├── docker-compose.yml     # Docker 服务编排
├── README.md
├── DEPLOY.md              # 服务器部署与运维指南
├── TODO.md                # 功能规划清单
├── backend/               # 核心后端服务
│   ├── Dockerfile
│   ├── package.json
│   ├── src/               # TypeScript 源码
│   ├── config/            # 昵称映射与数据修正配置
│   │   └── README.md      # 配置文件说明
│   └── assets/            # 图片渲染素材（卡牌框、Rank 图标等）
├── koishi/                # Koishi 机器人配置与插件
│   ├── Dockerfile
│   ├── koishi.yml         # 机器人主配置
│   ├── food.js            # 吃什么/喝什么 插件
│   ├── pixiv.js           # Pixiv 随机图片 插件
│   ├── message-rank.js    # 发言排行 插件
│   ├── jrlp.js            # 今日老婆 插件
│   ├── custom-shortcuts.js # 个人快捷指令 插件
│   ├── dedup.js           # 消息去重 插件
│   └── patch-*.js         # 行为修正补丁
└── napcat/                # QQ 协议接入
    ├── config/            # QQ 登录配置（gitignore）
    ├── qqdata/            # 登录状态缓存（gitignore）
    └── data/              # napcat 数据
```

---

## 快速开始

### 前置要求

- **Docker** 20.10+ 与 **Docker Compose** v2
- **Git**
- 一个可正常登录的 **QQ 账号**（用于机器人）

### 1. 克隆仓库

```bash
git clone https://github.com/Kaiede-Lin/BangDream-KaieLin.git
cd BangDream-KaieLin
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Bandori Station API Token（必填）
# 获取方式：加入 BandoriStation 官方群获取
BANDORI_STATION_TOKEN=你的_token

# 数据提交来源标识（选填，默认"沐凛"）
BANDORI_STATION_SOURCE=沐凛

# NapCat 快速登录 QQ 号（选填，取消注释后填写）
# NAPCAT_QUICK_ACCOUNT=3587847603
```

### 3. 准备 NapCat 配置

```bash
mkdir -p napcat/config napcat/qqdata napcat/data
```

将你的 NapCat 配置文件放入 `napcat/config/`：

- `onebot11_<QQ号>.json` — OneBot 协议配置
- `napcat_<QQ号>.json` — NapCat 主配置

> 配置文件可从 [NapCat 官方文档](https://napcat.napneko.com/) 获取模板。

### 4. 启动服务

```bash
docker compose up -d --build
```

首次构建需要几分钟（安装依赖 + 编译 TypeScript + 编译 skia-canvas）。

### 5. 扫码登录

```bash
docker compose logs -f napcat
```

看到二维码后，使用机器人 QQ 号的手机 QQ 扫描登录。登录成功后 `Ctrl+C` 退出日志。

### 6. 验证部署

```bash
# 确认三个容器都在运行
docker compose ps

# 在 QQ 群中发送任意指令（如"查歌 壱雫空"）测试
```

---

## 环境变量参考

### Backend 服务

| 变量 | 用途 | 默认值 | 必填 |
|------|------|--------|:--:|
| `BANDORI_STATION_TOKEN` | BandoriStation API 访问令牌 | - | ✅ |
| `BANDORI_STATION_SOURCE` | 数据提交时的来源标识名 | `沐凛` | ❌ |
| `LOCAL_DB` | 是否启用本地用户数据库 | `false` | ❌ |
| `BACKEND_PORT` | 后端 HTTP 监听端口 | `3000` | ❌ |
| `USE_BANDORISTATION` | 是否启用 BandoriStation 数据提交 | `true` | ❌ |
| `TZ` | 时区设置 | `Asia/Shanghai` | ❌ |
| `UV_THREADPOOL_SIZE` | libuv 线程池大小（影响图片渲染并发） | `48` | ❌ |

### NapCat 服务

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `NAPCAT_QUICK_ACCOUNT` | 快速登录的 QQ 号 | - |
| `TZ` | 时区设置 | `Asia/Shanghai` |

---

## 后续更新

```bash
git pull
docker compose up -d --build
```

> Docker 会利用构建缓存，没有变化的层直接复用，通常只需几十秒即可完成热更新。
>
> 如果 `git pull` 时遇到本地有修改导致的冲突：
> ```bash
> git stash && git pull && git stash pop
> ```
>
> 详细运维指南请参阅 [DEPLOY.md](./DEPLOY.md)。

---

## 开发指南

### 本地开发环境搭建

**后端开发**：

```bash
cd backend
npm install --ignore-scripts
npm rebuild skia-canvas

# 启动开发服务器
npm start
```

> 本地开发需要 Node 18+，以及 skia-canvas 的编译依赖（详见 backend/Dockerfile 中的 apt 依赖列表）。

**Koishi 插件开发**：

1. 在 `koishi/` 目录下创建新的 `.js` 插件文件
2. 使用 `module.exports = { name: '...', apply(ctx) { ... } }` 格式导出
3. 在 `koishi/koishi.yml` 中注册插件路径
4. 通过 Docker volume 挂载或本地 Koishi 测试

### 添加自定义命令

**后端新增 API**（需要数据查询/图片渲染）：

1. 在 `backend/src/routers/` 创建路由模块
2. 在 `backend/src/view/` 创建视图渲染逻辑
3. 使用 Express Router 注册路由
4. 在 Koishi 中通过 HTTP 调用后端 API

**Koishi 新增指令**（纯文本/简单逻辑）：

1. 在 `koishi/` 目录创建插件文件（参考 `food.js` 或 `pixiv.js` 的结构）
2. 使用 `ctx.command()` 定义指令
3. 在 `koishi.yml` 的 `plugins` 下注册 `./your-plugin: {}`
4. 重新构建并启动：`docker compose up -d --build`

### 添加角色昵称

1. 编辑 `backend/config/fuzzy_search_settings.json`
2. 在对应 `characterId` 或 `bandId` 的数组中添加新别名
3. 也可通过 Excel 文件 (`nickname_*.xlsx`) 添加
4. 提交 PR 时遵循 `backend/config/README.md` 中的提交规范

---

## 常见问题

**Q: NapCat 扫码后一直显示"登录中"？**

A: 检查 `napcat/config/` 下的配置文件是否正确，特别是 JSON 中的 QQ 号是否匹配。确认 QQ 号未被风控（尝试在手机 QQ 上正常使用该账号）。

**Q: 重启 napcat 后需要重新扫码？**

A: 确保 `napcat/qqdata/` 目录已正确挂载为 Docker volume（见 `docker-compose.yml`）。该目录保存了 QQ 登录状态，丢失后需要重新扫码。`napcat/config/` 中的配置也需要保留。

**Q: 如何添加新的食物/饮品图片？**

A: 将图片放入 `koishi/data/food-libs/eat/`（吃的）或 `koishi/data/food-libs/drink/`（喝的）目录。支持按子文件夹分类管理，重启 koishi 后自动生效（有 30 秒缓存）。

**Q: 后端返回"服务器未启用数据库"错误？**

A: 在 `.env` 中将 `LOCAL_DB` 设为 `true` 以启用本地数据库，支持用户绑定和 Station 提交功能。

**Q: 图片生成失败或显示异常？**

A: 确认 `backend/assets/` 目录完整；检查 Docker 宿主机内存（skia-canvas 渲染需要至少 512MB 空闲内存）；查看后端容器日志 `docker compose logs backend --tail=50`。

---

## 基础框架与借用来源

本项目是在原始 `tsugu-bangdream-bot` 基础上进行的二次开发与定制，保留并感谢以下来源与参考：

- 原始项目：`tsugu-bangdream-bot`
  - GitHub: <https://github.com/Yamamoto-2/tsugu-bangdream-bot>
- 配置相关内容曾独立拆分并持续同步，感谢相关维护思路与资料整理
  - GitHub: <https://github.com/Kudryavka03/tsugu-bangdream-nickname>
- 部分优化与功能参考自：
  - <https://github.com/yyf-0404/tsugu-bangdream-bot>
  - <https://github.com/StarFreedomX/tsugu-bangdream-bot/tree/starfx-main>
- 预测线相关实现参考自：
  - <https://github.com/byydzh/MYCX_1000>

同时感谢 Bestdori、BandoriStation、HHWX 等数据源，以及所有为 BanG Dream! 相关工具生态做出贡献的开发者与维护者。

## 说明

- 本项目名称为 **KaieLin**，也叫 **沐凛**
- 这是 **心漾流光群机器人**，如果你需要借用请联系管理员沐枫 **QQ1146598834**
- 如果你对本项目满意，欢迎保留相关来源说明与致谢信息

## 许可证

如无额外说明，本项目遵循原仓库的许可证与引用规范。
