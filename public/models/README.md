# Live2D 模型说明（示例 / 商用）

本目录下每个子文件夹为一套 Cubism 4 模型（需含 `*.model3.json`）。

## 许可与驱动配置：`model.meta.json`

每个模型目录可放置 `model.meta.json`：

```json
{
  "displayName": "MyCharacter",
  "license": "commercial",
  "notes": "正版授权或自研可商用角色",
  "emotionMap": {
    "neutral": "exp_01",
    "happy": "exp_02",
    "sad": "exp_03",
    "angry": "exp_04",
    "surprised": "exp_05",
    "shy": "exp_06",
    "thinking": "exp_07"
  },
  "talkMotionGroup": "Idle",
  "idleMotionGroup": "Idle"
}
```

| 字段 | 含义 |
|---|---|
| `license` | `sample` / `commercial` / `custom` |
| `emotionMap` | 语义情绪 → 表情名或 Expressions 下标（对齐 Open-LLM-VTuber） |
| `talkMotionGroup` | TTS 说话时循环的动作组；无独立 Talk 时用 `Idle` |
| `idleMotionGroup` | 待机动作组 |

说话时：系统会循环 `talkMotionGroup`（候选还含 `Talk`/`Speak`），同时 Analyser 驱动口型；结束后回 Idle。

| `license` | 含义 |
|---|---|
| `sample` | Live2D 官方示例等，**不可**作为商用默认形象对外售卖 |
| `commercial` | 已获商用授权 / 自研可商用包 |
| （导入本地） | 设置里导入的目录标记为 `custom` |

## 内置

| 目录 | 许可 | 说明 |
|---|---|---|
| `hiyori/` | sample | 开发样例；无 `.exp3`，表情用参数预设；说话用 Idle 晃动 |
| `mao/` | sample | 多表情 `exp_*` + Idle/TapBody；`emotionMap` 已配置 |

以下划线开头的目录（如 `_commercial_template`）会被扫描跳过。

## 接入可商用角色包

1. 将整套模型复制到 `public/models/<你的角色名>/`
2. 写入 `model.meta.json`，`"license": "commercial"`，并配置 `emotionMap` / `talkMotionGroup`
3. 建议动作组包含：`Idle`（多段）、可选独立 `Talk`、交互 `TapBody` / `Wave` / `Dance`；表情用 `.exp3`
4. 开发：`npm run dev` → 设置 → 形象中选择；或「导入本地 / 商用模型目录」
5. 打包：`extraResources` 会把 `public/models` 打进 dmg

**一期交付要求**：至少能加载 1 套含多 Idle + 交互动作 + 若干表情的包；默认仍可用示例开发，对外发布须换成可商用包。
