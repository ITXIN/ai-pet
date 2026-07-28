# AI Pet — Mac 桌面 AI 陪伴

面向 Mac（Apple Silicon）的常驻桌面 AI 陪伴角色：好看、好拖、好说话、指令能立刻演。默认云端大模型（**用户自带 API Key / BYOK**），Mac-only dmg 分发。

## 功能（商业 MVP）

- 透明置顶 Live2D 窗、拖拽、点击穿透、菜单栏托盘（显示/隐藏/设置/退出）
- 可选开机启动
- 文字 / 语音一轮对话（Whisper STT → LLM → TTS）+ 口型
- **用户指令预识别**：说「请跳舞 / 挥挥手」时在 LLM 返回前就开始动作
- LLM `[emotion][motion]` 标签 + 漏标签时回落意图 / Idle
- 设置：形象 / 大模型 / 语音 / 通用；首次新手引导
- 生命感：自动眨眼、视线跟随、表情参数平滑过渡（思路参考 [AIRI](https://github.com/moeru-ai/airi) 的 Live2D 控制，未引入其依赖）
- 检查更新（GitHub Releases）

## 环境要求

- macOS
- Node.js 20+
- OpenAI 兼容 API Key

## 10 分钟上手

```bash
npm install
npm run dev
```

1. 首次引导点「去填 Key」，或打开设置 → 大模型
2. 填 Base URL、API Key、Model 并保存
3. 宠物窗点「输入」，发「你好」或「请跳舞」
4. 按住角色拖动；空白处可点穿到下层 App
5. 菜单栏托盘可隐藏/显示桌宠

### 国内网络安装 Electron

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

## 打包 dmg

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run dist
```

产物：`release/AI Pet-*-arm64.dmg`（默认 `identity: null`，未签名）。首次打开若被拦截：系统设置 → 隐私与安全性 → 仍要打开。Apple 公证为可选后续流程。

## Live2D 许可（必读）

| 资源 | 说明 |
|---|---|
| `hiyori` / `mao` | Live2D **官方示例**，仅供开发演示，**不能**当商用默认形象售卖 |
| 商用角色包 | 放入 `public/models/<name>/`，写 `model.meta.json`：`"license":"commercial"`，详见 [public/models/README.md](public/models/README.md) |
| Cubism Core | `public/live2dcubismcore.min.js`，遵守 Live2D 官方许可 |

## 情绪 / 动作

回复格式：

```text
[emotion:happy][motion:Wave]你好呀！
```

- emotion: `neutral` | `happy` | `sad` | `angry` | `surprised` | `shy` | `thinking`
- motion: `Idle` | `Tap` | `Wave` | `Nod` | `Shake` | `Dance` | `Think`

用户侧意图规则见 `src/shared/intentRules.ts`（先表演再走 LLM）。

## 脚本

```bash
npm run dev         # 开发
npm run build       # 构建
npm run dist        # Mac dmg → release/
npm run test:parse  # 标签解析
npm run test:intent # 意图规则
```

## 麦克风

麦克风仅用于语音转写。打包 Info 已含用途说明；设置 → 语音中亦有提示。请在「系统设置 → 隐私与安全性 → 麦克风」允许本应用。

## 一期明确不做

Windows / 内置本地大模型 / 看屏幕 / 高精度 Viseme / 角色市场 / Mac App Store / 账号订阅墙。

## 许可

代码 MIT。Live2D Cubism Core 与示例模型遵循 Live2D 官方许可；商用角色与公证费用需产品侧自行处理。
