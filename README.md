# pi-muelsyse-cyberdeck

为 [Pi](https://pi.dev) 提供轻量的缪尔赛思马卡龙视觉主题与终端界面。

> 英文版：[README.en.md](README.en.md)。

**v1.2.0**：改进稳定性、性能与代码体积。空闲时停止重绘，保留工具和命令的原始输出，优化 Git 查询，移除固定编辑器合成器；字符雨改为手动开启，支持 256 色、`NO_COLOR` 和应用内更新日志。详见 [1.2.0 更新说明](#120)。

## 包含内容

| 组件 | 功能 |
|------|------|
| **主题** `muelsyse-macaron` | 深色马卡龙配色：缪尔赛思粉、蜜桃、花瓣、薰衣草、天空蓝、薄荷绿、珊瑚色；包含全屏滚动条与搜索颜色 |
| **页眉** | 默认彩色 ANSI 缪尔赛思图；通过 `/muelsyse-art` 选择文本或 ANSI 图片 |
| **Zentui** | 编辑器边框、Starship 风格页脚、消息与工具卡片装饰；中英文设置界面 |
| **Claude shimmer** | 马卡龙渐变工作提示，显示思考级别与 Token 用量 |
| **字符雨** | 工作期间播放浅色数字雨，**默认关闭**；使用 `/muelsyse-matrix on` 开启 |
| **遥测** | 任务结束后显示生成速率、首 Token 延迟、耗时、Token、停顿与费用速率，仅作本地统计 |
| **更新日志** | 更新后显示一次更新提示，使用 `/muelsyse-changelog` 阅读日志 |

没有运行时依赖。主要使用 Pi 扩展 API；用户消息、工具卡片和选择器通过小范围渲染补丁装饰。Open TUI 渐变适配与全屏选区优化涉及宿主组件内部接口，升级宿主后需复核。

## 界面效果（v1.2）

**页脚**

```text
◆  project  on ⎇ main [!3 ?2 ↑1]   [███░░░░░░░] 4%/128k › ↑12k ↓1.4k › Cache 70.0% › $0.06
```

> 实际终端中，`◆` 和 `⎇` 使用 Nerd Font 的系统与 Git 图标。没有 Nerd Font 时，可在设置中将图标模式切为“纯文本”，或配置 `icons.mode: "ascii"`。

- 上下文用量使用马卡龙进度条，文字为天空蓝，费用为蜜桃色。
- 分隔符、目录和系统图标使用缪尔赛思渐变。
- Token 与费用总量遵循 Pi 页脚口径，包含压缩及子代理、工具用量。
- 缓存命中率显示最近一次模型回复的 `cacheRead / (input + cacheRead + cacheWrite)`；零命中显示 `0.0%`，无数据显示 `--`。
- Git 状态默认显示文件数量；“Git 状态数量”开关可切回纯符号。
- 页脚默认静止；`/zentui pulse on` 可在模型工作时播放动画。

**工作提示**

```text
✻ Whisking...  ( HIGH · ↓ ~1.2k tokens · 00:12 )
```

- 思考级别从 MINIMAL 到 MAX，按级别配色；同一轮任务保持同一动词。
- `~` 表示实时估算；服务商返回最终 Token 数后替换估算，并累计工具调用各轮用量。
- 流式输出停顿时渐变为珊瑚色；工具执行时播放薄荷色脉冲。
- 成功结束后显示完成提示，如 `✻ Frosted for 12s`，统计整轮任务时间。
- 完成提示与遥测之间保留一行空白。遥测默认开启，可在 `/zentui` →“遥测”中逐项控制。

**历史消息**

```text
╭─ ✓ READ ─────────────────────────╮
┃  read src/app.ts                 │
┃  …Pi 的原始输出，保持不变…       │
╰──────────────────────────────────╯
```

- 工具卡片保留缪尔赛思边框与状态竖线：天空蓝表示执行中，薄荷绿表示完成，珊瑚色表示失败；正文保留 Pi 原始渲染。
- `!cmd` 输出、编辑差异和图片使用 Pi 原生显示。
- 收起的思考块显示 `✦ Thought` 标签，展开时使用 Pi 原生显示。

## 环境要求

- Pi **>= 0.87.1**；1.2.0 历史版本曾在 0.87.1 和 0.99.1 上验证。当前 Open TUI 适配使用 `pi.getCommands()` 和宿主组件接口，请使用支持这些接口的新版 Pi。
- 深色终端背景；主题不绘制背景色。
- 推荐真彩色。256 色终端使用最接近的调色板颜色；`NO_COLOR` 关闭本包的颜色效果。
- 默认图标需要 Nerd Font；纯文本模式无需此字体。

## 安装

```bash
pi install git:github.com/xMuelsysex/pi-muelsyse-cyberdeck
```

本地安装：

```bash
pi install /path/to/pi-muelsyse-cyberdeck
```

随后运行 `/settings`，将主题设为 **muelsyse-macaron**，再重启一次 Pi。Pi 0.99 默认使用 `system` 主题。

> 请使用**本包自带的 shimmer**，避免同时加载原版 `npm:pi-claude-shimmer`。

### 更新

未固定版本的 Git 安装可以执行：

```bash
pi update git:github.com/xMuelsysex/pi-muelsyse-cyberdeck
```

更新后重启 Pi。首个会话在编辑器上方显示更新内容，发送下一条消息后消失。随时可用 `/muelsyse-changelog` 在 Pi 中阅读完整日志，也可查看 [CHANGELOG.md](CHANGELOG.md)。

Pi 不会自动推送包更新。固定了标签或提交的用户需要明确选择新版本：

```bash
pi install git:github.com/xMuelsysex/pi-muelsyse-cyberdeck@v1.2.0
```

1.2.0 更新注意事项：

- 保留已有主题和 Zentui 配置。
- 移除固定编辑器合成器，自动清理旧 `fixedEditor` 配置；此前开启过该功能时会提示一次。请改用下方 Pi 全屏模式。
- 若旧版 `/zentui fixed-editor disable` 因 1.1.x 的问题关闭了主编辑器，执行一次 `/zentui editor on` 恢复。
- 字符雨默认关闭。已明确保存的开启状态仍会保留，否则使用 `/muelsyse-matrix on`。
- 页脚渐变动画需要手动开启：`/zentui pulse on`。

### 固定编辑器（Pi 全屏模式）

使用 Pi 原生全屏 TUI，可以固定编辑器并滚动历史记录：

```jsonc
// ~/.pi/agent/settings.json
{
  "tuiMode": "fullscreen"
}
```

也可使用 `pi --tui-mode fullscreen` 启动。本包的编辑器、页脚、shimmer、滚动条与搜索配色仍然生效。

## 配置

Zentui 配置位于 `~/.pi/agent/muelsyse-cyberdeck-zentui.json`，可用 `/zentui` 修改。JSON 无效时会在启动时提示，原文件保持不变。

设置默认使用简体中文。运行 **`/zentui` →“功能”→“语言 / Language”**，可在 **简体中文** 与 **English** 之间切换；立即生效并保存，重启后保留。此选项控制 Zentui 设置文案，不修改 Pi 或 Open TUI 自身的语言。

```jsonc
// ~/.pi/agent/muelsyse-cyberdeck-zentui.json（节选）
{
  "language": "zh-CN",         // zh-CN：简体中文；en：英文
  "colors": {
    "contextNormal": "syntaxFunction",
    "cost": "mdCode",
    "editorBorder": "muelsyse-macaron-gradient"
  },
  "features": {
    "messageStyle": true      // 消息和工具卡片使用缪尔赛思边框
  },
  "animations": {
    "footerPulse": false      // 模型工作时播放页脚渐变动画
  }
}
```

字符雨配置位于 `~/.pi/agent/muelsyse-cyberdeck-matrix.json`，通过 `/muelsyse-matrix` 修改。`on` 开启的是“工作时自动播放”，空闲时不常驻；`preview` 可立即预览 5 秒。

## 命令

```text
/zentui                                    设置界面（编辑器、页脚、消息、图标、配色、语言、遥测）
/zentui editor|statusline|messages|copy-friendly|pulse on|off|toggle
/zentui format "<template>"                自定义页脚模板（"" 恢复内置项布局）

/muelsyse-matrix [status]                   查看字符雨设置
/muelsyse-matrix on|off                     开启／关闭工作期间的字符雨
/muelsyse-matrix preview                    立即预览 5 秒
/muelsyse-matrix fps N | density N | height N
/muelsyse-matrix help                       查看帮助

/muelsyse-changelog [version]               可滚动更新日志（q／Esc 关闭）

/muelsyse-art [path]                        加载页眉图；省略路径时打开文件浏览器
/muelsyse-art reset                         恢复默认页眉图
```

`/muelsyse-art` 在当前项目目录打开可滚动的 TUI 文件浏览器。↑／↓ 选择，Enter 进入目录或加载文件，←／Backspace 返回上级，Esc 取消且保留当前图片。浏览器显示普通文件、目录和符号链接；请选用 UTF-8 文本或 ANSI 文件。目录读取失败时会显示错误并保留当前列表。

`/muelsyse-art <path>` 直接加载文件并替换页眉图。相对路径以当前项目目录为基准，支持绝对路径、`~/` 和带引号的含空格路径。普通 ASCII、Unicode、Braille 文本应用缪尔赛思粉至天空蓝的渐变；ANSI SGR 彩色图保留原色，`NO_COLOR` 可去除颜色。

请用空格替换制表符；光标控制序列和非文本文件会被拒绝。保留图中的空白与空行；超宽内容从右侧裁剪，完整高度保留，因此推荐紧凑图片。选择在当前 Pi 进程中有效，切换会话也保留；重启或重新加载扩展后恢复默认图。

```text
/muelsyse-art extensions/header/muelsyse-header.ansi
/muelsyse-art "./my art/portrait.ansi"
```

## 插件共存

避免与 `pi-zentui`、`pi-powerline-footer`、原版 `pi-claude-shimmer` 或本包的另一份副本叠加，它们共享页脚、工作提示和编辑器区域。

检测到 Open TUI 后，本包保留其页眉、页脚和自定义编辑器，只为装饰色应用同款渐变。缓存命中率与遥测沿用 Open TUI 原有逻辑；`/zentui` 对应设置显示“已被 /open-tui 接管”，请在 `/open-tui` 中调整。

## 更新日志

完整历史见 [CHANGELOG.md](CHANGELOG.md)，也可在 Pi 中运行 `/muelsyse-changelog`。

### 1.2.0

基于 Pi 0.99.1 的全面代码审查，改进稳定性、性能和代码体积。扩展代码从约 12,000 行缩减至约 8,700 行，空闲时不再重绘，也不再改写工具或命令输出。该版本原始兼容范围为 Pi 0.87.1 及以上，曾在 0.87.1、0.99.1 上验证。

#### 主要改进

- **空闲时停止刷新**：页脚不再每秒持续重绘 4 次，空闲输出从约 3.4 KB/s 降至 0 字节。
- **保留原始输出**：工具、`!cmd` 和思考内容按 Pi 原样显示，去除额外 ✓／×、缩进丢失、200 行截断和输出替换。
- 修复 `/zentui fixed-editor disable` 误关主编辑器并保存配置的问题。
- 修复 Anthropic 模型工作提示卡在 `↓ 1 token`，以及多步骤任务显示“0 秒完成”的问题。
- **优化 Git 查询**：避免与代理命令争用 `index.lock`，减少 Git 进程数量。
- 移除约 1,950 行固定编辑器合成器，改用 Pi 原生 `"tuiMode": "fullscreen"`。
- 字符雨需要手动开启，不再与 shimmer 冲突。
- 所有效果尊重 256 色终端和 `NO_COLOR`。
- 新增更新提示与 `/muelsyse-changelog` 日志查看器。

#### 修复：编辑器、页脚与设置（Zentui）

- `/zentui fixed-editor disable|enable|toggle` 曾误识别为主编辑器开关。现在严格解析 `/zentui <target> <on|off|toggle>`，其他输入显示用法。此前受到影响的用户可运行 `/zentui editor on`。
- 编辑器中同时出现模型名和服务商名的输入，如“compare gpt-5 with OpenAI”，曾被删去；现在只移除 Zentui 自己生成的元信息行。
- 页脚 Token 与费用统计曾漏计压缩、分支摘要、`usage` 条目和工具返回的子代理／codemode 用量；现在与 Pi 页脚一致。
- 修复 `constructor`、`__proto__` 等扩展状态键导致页脚崩溃的问题。
- Git 提交与行数、项目版本、页脚模板及图标设置现在立即生效。
- 默认刷新周期、页脚模板和图标配置统一来自同一来源。
- 损坏的配置现在提示文件名和 JSON 错误，修复前保留原文件，避免静默重置。
- 自定义模板的 `$sep` 尊重分隔符设置，不再固定显示 ` | `。
- 999,500 至 999,999 不再显示为 `1000k`，改为 `1.0M`。
- `"bold accent"` 样式正确保留主题颜色。
- 渐变不再拆散 emoji ZWJ 序列和组合字符，如带重音的目录名。
- Git 输出超过 1 MB 曾导致静默冻结；缓冲区提高到 16 MB，失败显示 `[git n/a]`。
- Git 使用 `LC_ALL=C`，避免非英文输出把普通目录误判为 Git 错误。
- 正确处理 Windows 绝对路径。
- 运行环境版本在项目目录中查询，并在版本文件变化后刷新，避免 `nvm use`、`pyenv local` 后显示过期信息。
- 为 `max` 思考级别新增 `colors.editorThinkingMax` 配色。

#### 修复：工具卡片、消息与思考

- `!cmd` 曾有约 19 行截断、底边重复标题、误改边框样式输出，以及把失败或取消显示为 `✓ COMPLETE` 的问题；现在使用 Pi 原生显示。
- 工具正文曾丢失语法和单词差异高亮，插入可复制的 ✓／×，删去缩进或末尾 `...`，限制 200 行并替换折叠内容；现在正文完整传递，外层保留缪尔赛思边框。
- 修复差异显示在行号宽度变化处丢失缩进的问题，如第 95 至 105 行。
- 工具执行状态来自真实状态，避免从文本推断。
- 修复全屏模式下点击工具卡片命中错误行的问题。
- 思考块的点击、单条展开与折叠恢复正常，不再限制为 16 行；展开使用 Pi 原生渲染，折叠显示 `✦ Thought`。
- 用户消息保留有序列表、反斜线转义和其他扩展的 Markdown 变换，只添加外层竖线。
- 修复渲染补丁卸载后残留、重新加载时叠加，以及与上游 `pi-zentui` 注册表冲突的问题。

#### 修复：工作提示（shimmer）

- Anthropic 流式阶段的早期占位用量不再被当成最终值，实时计数不再卡在 `↓ 1 token`。
- 消息中止或失败后，计数不再从数千骤降到 1。
- 完成提示统计整轮任务，不再只计最后一次模型请求。
- 完成提示使用正确通知类型，只在任务成功且 Pi 完成重试、压缩后显示；Esc 和错误不会触发。
- 同一轮任务保持同一动词，不随工具调用改变。
- 流式停顿时的珊瑚色渐变与工具调用脉冲恢复正常。
- 高亮平滑扫入，首帧思考高亮不再从随机位置开始。
- ©、®、™ 不再各算成两个 Token。
- RPC 模式不再发送含终端转义的通知，print／JSON 模式不启动动画计时器；效果只在交互 TUI 中运行。

#### 修复：字符雨、页眉与主题

- 字符雨不再监听 Pi 0.65 已移除的 `session_switch` 事件。
- 字符雨与 shimmer 不再同时操纵工作指示器，运行中关闭字符雨也不会重置 shimmer。
- 修复 `/muelsyse-matrix preview` 在关闭状态或非 TUI 中无效果，以及预览结束导致本轮字符雨停止的问题。
- 字符雨配置保存失败时保留原状态并显示错误。
- 页眉顶部空白固定为一行，不再随终端高度和纵向缩放改变。
- 主题暗色文字对比度从 3.5:1 提高到 4.7:1，满足 WCAG AA；弱边框更清晰。

#### 性能

- 空闲时停止重绘；页脚动画需手动开启，且只在模型工作时播放。
- 上下文和用量总计采用 Pi 类似的缓存方式，避免每帧遍历会话。
- 工作提示使用单个约 11 Hz 时钟，将约 40–55 次／秒的刷新降至不超过 11 次／秒。
- 每次 Git 刷新用一次 `status --porcelain=2 --branch --show-stash` 和一次 `rev-parse` 替代约 10 个进程；隐藏相关项时不运行查询。
- 运行环境和项目版本只在可见且输入变化时探测，非交互模式不执行。
- 工具卡片缓存不设大小上限，不对每行做正则处理；渐变缓存不再随动画帧反复失效。
- 时钟每分钟唤醒一次，替代每秒唤醒。

#### 安全与稳定性

- 清洗项目版本、目录、分支、标签和运行环境输出中的外部文本，防止终端转义注入，如修改剪贴板。
- Git 使用 `GIT_OPTIONAL_LOCKS=0` 和 `-c core.fsmonitor=false`；未信任项目跳过 Git、运行环境和版本探测。
- Zentui、字符雨和更新日志状态以原子方式保存；损坏配置会明确报错。
- 字符雨配置使用 Pi 的代理目录，尊重 `PI_CODING_AGENT_DIR`。
- UI 清理支持重复调用；已销毁或非 TUI 环境避免执行界面操作，TUI 运行时不使用 `console.*` 输出。

#### 行为调整

- 字符雨默认关闭，只使用 widget 展示，不再改工作提示和指示器；已保存的设置保留。
- 新增字符雨 `help`、`height N`，完善输入校验和保存失败提示。
- 页脚动画使用 `/zentui pulse on` 开启，对应 `animations.footerPulse`。
- `features.messageStyle` 独立控制消息和工具样式。旧配置保留原外观：若编辑器此前关闭，消息样式保持关闭，直到主动开启。
- 工具卡片保留主题边框和状态竖线；编辑工具、自带渲染的工具及图片使用 Pi 原生显示。
- 移除“Thought trail”树形显示，折叠思考使用 `✦ Thought` 标签。
- 页眉高度固定，仅在交互 TUI 中安装。
- 运行环境检测支持 bun、deno、node、python、go、rust、ruby、java，移除约 50 种低频环境；项目版本支持 `package.json`、`Cargo.toml`、`pyproject.toml`、`composer.json`。
- 默认后台项目刷新周期为 60 秒，且只在可见项需要时执行。
- 配色遵循 Pi 检测：真彩色使用 24 位色，256 色终端取最接近颜色，`NO_COLOR` 时停用颜色。
- 主题新增全屏滚动条与搜索匹配颜色。

#### 移除

- 移除实验性固定编辑器合成器、`fixedEditor` 配置和对应命令。该功能在 Pi 0.84+ 已停用，改用 `"tuiMode": "fullscreen"`。旧配置会自动清理，曾开启时提示一次。
- 移除 `!cmd` 重绘和工具正文改写。
- 清理双额度组件残留和未使用的代码、导出。

#### 新增

- 安装或更新后，在编辑器上方显示一次更新提示，下一条消息后隐藏。
- `/muelsyse-changelog [version]` 可在 Pi 内滚动查看日志。
- 包内附带 `CHANGELOG.md`。

#### 开发说明

- 提供 `npm test` 单元测试（100 余项）与严格类型检查。1.2.0 原版曾针对 Pi 0.99.1、0.87.1 验证；`PI_HOST_ROOT=…` 可选择宿主。
- `npm run dev:setup` 将开发工具安装到 `.dev/`，不向发布包添加依赖。
- `scripts/check.mjs` 检查清单、发布文件、peer 依赖、主题字段与更新日志，不再对源码做正则匹配。
- 发布包不包含 `scripts/`。

### 1.1.6

- 移除 Codex／Grok 订阅额度组件，包括页脚信息、API 轮询、缓存和 `/dual-usage` 命令。

### 更早版本

1.0.0 至 1.1.5 见 [CHANGELOG.md](CHANGELOG.md)。

## 开发

```bash
npm run dev:setup     # 将 Pi 和 TypeScript 安装到 .dev/，不包含在发布包中
npm run verify        # 包检查、严格类型检查和单元测试
PI_HOST_ROOT=/path/to/node_modules/@earendil-works/pi-coding-agent npm test   # 针对其他 Pi 版本测试

npm run preview           # 本项目 UI，不加载其他插件和 Skill
npm run preview:open-tui  # 本项目 UI，加上 npm 安装的 Open TUI
```

两种预览共用本机 Pi 的认证和配置目录，启用基本工具 `read`、`bash`、`edit`、`write`。预览中的设置和会话也会写入本机目录。Open TUI 的入口由根目录 `package.json` 的 `preview.extensions` 配置；其余插件和 Skill 暂停加载。

## 许可证

MIT。Claude shimmer 基于 [pi-claude-shimmer](https://github.com/ouzhenkun/pi-claude-shimmer)（MIT）修改；Zentui 基于 [pi-zentui](https://github.com/lmilojevicc/pi-zentui)（MIT，见 NOTICE）修改；遥测改编自 pi-open-tui（MIT，见 `licenses/pi-open-tui-MIT.txt`）。
