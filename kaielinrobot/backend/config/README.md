# 昵称配置文件说明

本目录包含 BanG Dream! 游戏数据的昵称映射与修正配置，用于支持模糊搜索、数据修正等功能。

## 文件说明

| 文件 | 用途 | 格式 |
|------|------|------|
| `nickname_card.xlsx` | 卡牌昵称映射 | Excel (XLSX) |
| `nickname_event.xlsx` | 活动昵称映射 | Excel (XLSX) |
| `nickname_song.xlsx` | 歌曲昵称映射 | Excel (XLSX) |
| `nickname_song_test.xlsx` | 歌曲昵称映射（测试用） | Excel (XLSX) |
| `playernumber.xlsx` | 活动参与人数数据 | Excel (XLSX) |
| `fuzzy_search_settings.json` | 模糊搜索策略与别名配置 | JSON |
| `car_keyword.json` | 卡牌关键词配置 | JSON |
| `cardsCNfix.json` | 卡牌国服数据修正（翻译、属性等） | JSON |
| `skillsCNfix.json` | 技能国服数据修正 | JSON |
| `areaItemFix.json` | 区域道具（Area Item）数据修正 | JSON |
| `eventCharacterParameterBonusFix.json` | 活动角色参数加成修正 | JSON |

---

## 昵称表格格式

以 `nickname_card.xlsx` 为例，Excel 表格结构如下：

| 列 | 说明 | 示例 |
|----|------|------|
| 角色名/卡牌名 | 游戏内的正式名称或 ID | `弦巻こころ` 或对应 `gameCharacterId` |
| 昵称 | 玩家社群中常用的称呼 | `kkr`、`扣扣肉`、`心`、`富婆心` |

> 一个角色/卡牌可以对应多行，每行一个昵称。系统在收到查询时会遍历所有昵称进行模糊匹配。

---

## 模糊搜索配置 (`fuzzy_search_settings.json`)

该文件定义了各类搜索维度的别名映射，是模糊搜索的核心配置。每个顶层键对应一个搜索维度：

| 配置键 | 搜索维度 | 说明 |
|--------|----------|------|
| `characterId` | 角色 ID → 别名列表 | 如 `"1"` → `["香澄", "kasumi", "ksm", ...]` |
| `bandId` | 乐队 ID → 别名列表 | 如 `"1"` → `["ppp", "破琵琶", "popipa", ...]` |
| `attribute` | 属性 → 别名 | 如 `"红"` → `"powerful"`，`"蓝"` → `"cool"` |
| `type` | 卡牌类型 → 别名 | 如 `"限定"` → `"limited"`，`"常驻"` → `"permanent"` |
| `rarity` | 稀有度 → 别名 | 如 `"五星"` → `"5"`，`"四星"` → `"4"` |
| `skillType` | 技能类型 → 别名 | 如 `"分卡"` → `"score"`，`"判卡"` → `"judge"` |
| `eventType` | 活动类型 → 别名 | 如 `"对邦"` → `"versus"`，`"组曲"` → `"medley"` |
| `tag` | 歌曲标签 → 别名 | 如 `"翻唱"` → `"tie_up"`，`"原创"` → `"original"` |
| `difficulty` | 难度 → 别名 | 如 `"ex"` → `"3"`，`"sp"` → `"4"` |
| `server` | 服务器 → 别名 | 如 `"国服"` → `"3"`，`"日服"` → `"0"` |
| `scoreUpMaxValue` | 技能强度 → 别名 | 如 `"150分"` → `"150"` |

### 添加角色昵称示例

在 `fuzzy_search_settings.json` 中，找到对应 `characterId` 的数组，添加新字符串：

```json
"1": [
    "戸山 香澄",
    "kasumi",
    "香澄",
    "ksm",
    "你的新昵称"
]
```

> 注意：添加时记得前一行末尾加逗号 `,`。如果不确定格式，建议用 JSON 校验工具检查后再提交 PR。

---

## PR 提交规范

欢迎提交昵称补全的 Pull Request！提交时请注意：

1. **避免重复**：提交前在 `fuzzy_search_settings.json` 中搜索确认你添加的昵称尚未收录
2. **使用广泛认同的昵称**：请提交玩家社群中广泛使用的称呼，避免过于个人化或仅在小圈子内使用的昵称
3. **保持格式一致**：JSON 文件使用 4 空格缩进，Excel 文件保持与现有数据相同的列结构
4. **一个 PR 只做一个类别**：如果同时补全卡牌、歌曲、活动昵称，请分开提交以便审核
5. **PR 标题格式**：`[Nickname] 补全 XX 类别昵称 - 简要说明`（如 `[Nickname] 补全角色昵称 - 新增 MyGO!!!!! 成员别名`）
6. **国服修正需附凭证**：如果修改 `cardsCNfix.json` 或 `skillsCNfix.json`，请在 PR 描述中附上游戏内截图作为翻译/数据修正依据

---

## 数据来源与致谢

昵称数据源自 BanG Dream! 玩家社群的长期积累与维护：

- 上游昵称项目：[tsugu-bangdream-nickname](https://github.com/Kudryavka03/tsugu-bangdream-nickname)
- 国服数据参��：Bestdori 中文 Wiki、国服游戏内文本
- 感谢所有提交 PR、分享昵称的玩家贡献者
