# KaieLin / 沐凛

**心漾流光群机器人**

KaieLin，昵称「沐凛」，是基于 `Tsugu / BanG Dream!` 生态改造的群机器人后端与 Koishi 机器人套件。  
它主要面向 BanG Dream! 相关查询、图片生成、抽卡模拟、活动情报、群聊统计等功能，服务于心漾流光群的日常使用。

## 项目特点

- 基于 Docker 的一体化部署方案，包含 `backend`、`koishi`、`napcat`
- 支持 BanG Dream! 相关数据查询与图像化展示
- 提供抽卡模拟、谱面查询、活动/卡池查询、cutoff 相关功能
- 支持群消息排行、快捷指令、去重等机器人侧增强能力
- 兼容 Bestdori、BandoriStation、HHWX 等数据源

## 目录说明

- `backend/`：核心后端服务，提供 HTTP API、图片渲染、数据查询、缓存处理
- `koishi/`：Koishi 机器人配置、插件和中间件
- `napcat/`：QQ 协议接入相关配置
- `docker-compose.yml`：整套服务编排

## 使用方式

本项目推荐通过 Docker Compose 启动。

```bash
docker compose up -d --build
```

如果你需要单独调整后端或 Koishi 的配置，可分别查看：

- [backend/package.json](backend/package.json)
- [backend/Dockerfile](backend/Dockerfile)
- [koishi/koishi.yml](koishi/koishi.yml)
- [docker-compose.yml](docker-compose.yml)

## 基础框架与借用来源

本项目是在原始 `tsugu-bangdream-bot` 基础上进行的二次开发与定制，保留并感谢以下来源与参考：

- 原始项目：`tsugu-bangdream-bot`
  - GitHub: https://github.com/Yamamoto-2/tsugu-bangdream-bot
- 配置相关内容曾独立拆分并持续同步，感谢相关维护思路与资料整理
  - GitHub: https://github.com/Kudryavka03/tsugu-bangdream-nickname
- 部分优化与功能参考自：
  - https://github.com/yyf-0404/tsugu-bangdream-bot
  - https://github.com/StarFreedomX/tsugu-bangdream-bot/tree/starfx-main
- 预测线相关实现参考自：
  - https://github.com/byydzh/MYCX_1000

同时感谢 Bestdori、BandoriStation、HHWX 等数据源，以及所有为 BanG Dream! 相关工具生态做出贡献的开发者与维护者。

## 说明

- 本项目名称为 **KaieLin**，也叫 **沐凛**
- 这是 **心漾流光群机器人**，如果你需要借用请联系管理员沐枫**QQ1146598834**
- 如果你对本项目满意，欢迎保留相关来源说明与致谢信息

## 许可证

如无额外说明，本项目遵循原仓库的许可证与引用规范。
