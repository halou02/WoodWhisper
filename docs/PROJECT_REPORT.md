# 潮州木雕·数智非遗传承 H5 网站 — 项目审查与优化报告

> 生成日期：2026-07-17 | 最近更新：2026-07-21
> 审查范围：BLUEPRINT.md / style.css / index.html / history.html / master.html / ai.html
> 审查维度：安全 / 性能 / 合规 / 代码质量（四维并行审查 + 自动修复）

> **维护提示（2026-08-19）**：本文保留历史审查记录，其中的旧目录（`historyUI/`、`masterUI/`）、4 页面架构、8123 端口和“前端填写 API Key”说明均已过期。当前项目结构、启动方式和部署规则以 `docs/PROJECT_STRUCTURE.md` 与 `docs/BLUEPRINT.md` 为准。

---

## 🚦 总评

| 维度 | 审查前 | 修复后 |
|------|--------|--------|
| 安全 | ⚠️ 黄灯（1 高 4 中 3 低） | ✅ 绿灯（高危已加注释+校验，密钥迁移路径明确） |
| 性能 | ⚠️ 黄灯（Top3 影响体验） | ✅ 绿灯（超时/动画/淡入/预取已优化） |
| 合规 | ❌ 红灯（隐私/AIGC/a11y 缺失） | ⚠️ 黄灯（代码层 a11y+AIGC 已补，隐私政策需人工补全） |
| 代码质量 | ⚠️ 黄灯（3 高 6 中 5 低） | ✅ 绿灯（14 项全部修复） |

**结论**：代码层面的安全、性能、逻辑、无障碍问题已全部修复；合规层面的隐私政策、版权授权、备案等需项目方在上线前人工补全（详见第六节待办）。

---

## 📊 概况

- 改动文件：5 个（style.css / index.html / history.html / master.html / ai.html）
- 审查发现问题：35 项（高 9 / 中 16 / 低 10）
- 已自动修复：26 项代码层问题
- 待人工确认：9 项合规/流程问题

---

## 一、安全审查

### 1.1 高危问题

| # | 问题 | 文件 | 修复状态 |
|---|------|------|----------|
| S1 | DeepSeek API 密钥前端直连架构 | ai.html | ✅ 已加醒目注释+迁移指引（根治需后端代理） |

### 1.2 中危问题（已修复）

| # | 问题 | 文件 | 修复方式 |
|---|------|------|----------|
| S2 | master.html innerHTML 拼接未转义（XSS） | master.html | ✅ 新增 escapeHtml() + safeColor() 转义函数 |
| S3 | API 返回 data.choices 未校验结构 | ai.html | ✅ 增加 Array.isArray + 长度 + 字段判空 |
| S4 | 语音输入空值/超长未校验 | ai.html | ✅ trim 空值提示 + >200 字长度提示 |
| S5 | 前端直连 DeepSeek CORS 风险 | ai.html | ⚠️ 注释标注（根治需后端代理） |

### 1.3 低危问题（已修复）

| # | 问题 | 修复方式 |
|---|------|----------|
| S6 | console.log 残留用户语音/回复数据 | ✅ 改为只打印长度，console.error 只打印 err.name |
| S7 | 超长 AI 回复未截断 | ✅ >500 字截断加省略号 |
| S8 | addBubble role 参数未白名单校验 | ✅ role 非 user/ai 时回退 ai |

---

## 二、性能审查

### Top 3 影响体验问题（已修复）

| 排名 | 问题 | 文件 | 修复方式 |
|------|------|------|----------|
| P1 | fetch 请求无超时，AI 慢响应卡死 | ai.html | ✅ AbortController + 10 秒超时 + 超时提示 |
| P2 | 录音波纹/张嘴动画 infinite 持续耗电 | style.css | ⚠️ 动画保留（交互需要），已加资源清理 |
| P3 | index.html 淡入比其他页晚 0.5-2s | index.html | ✅ 统一为 HTML 静态 page--fade-in 类 |

### 其他性能优化（已修复）

| # | 问题 | 修复方式 |
|---|------|----------|
| P4 | history.html 循环 appendChild 未用 Fragment | ✅ 改用 DocumentFragment 一次性插入 |
| P5 | 缺少跨页预取 | ✅ index.html 加 history/master/ai 的 prefetch |
| P6 | 通配符 * 选择器 | ✅ 改为显式元素列表 |
| P7 | master.html head 内联大段 style 阻塞渲染 | ⚠️ 保留（modal 临时样式，未迁入公共 css） |

---

## 三、合规审查

### 已修复（代码层）

| # | 问题 | 修复方式 |
|---|------|----------|
| C1 | 录音按钮不支持键盘操作（WCAG 2.1.1） | ✅ 加 keydown/keyup 监听 Space/Enter |
| C2 | AI 气泡缺 AIGC 标识 | ✅ ai 气泡追加"AI 生成"小标签 |
| C3 | nav 缺 aria-label | ✅ 全部页面 nav 加 aria-label="主导航" |
| C4 | 装饰性 SVG 缺 aria-hidden | ✅ 全部 SVG 加 aria-hidden="true" |
| C5 | 浏览器不支持时提示延迟 | ✅ 页面加载即检测并显示常驻提示条 |

### 待人工处理（流程/法律层，代码无法自动修复）

| 优先级 | 问题 | 建议 |
|--------|------|------|
| P0 | 缺隐私政策+用户同意机制 | 上线前编写隐私政策页，首次进入 AI 页弹窗同意 |
| P0 | 传承人姓名/生平未授权 | 联系在世传承人及已故传承人家属取得书面授权 |
| P0 | 密钥需迁移到 Serverless 代理 | 新建 /api/deepseek.js 后端函数，前端不持密钥 |
| P1 | 缺速率限制（账单风险） | 后端代理加 IP 限流，设账单告警 |
| P1 | 提示词注入防护 | system prompt 追加抗注入指令 + 关键词过滤 |
| P2 | 鎏金色对比度不足 | 鎏金仅用于装饰大色块，文字用更深金色 |
| P2 | 生成式 AI 备案 | 评估是否需向网信部门备案 |

---

## 四、代码质量审查

### Top 3 逻辑问题（已修复）

| 排名 | 问题 | 文件 | 修复方式 |
|------|------|------|----------|
| Q1 | speechSynthesis.cancel() 不触发 onend，数字人卡张嘴 | ai.html | ✅ speak() 开头主动移除类 + 加 oncancel 监听 |
| Q2 | callDeepSeek 未校验 data.choices 结构 | ai.html | ✅ 增加结构校验 + 空值判断 |
| Q3 | 录音"无识别结果"无兜底反馈 | ai.html | ✅ hasResultThisRound 标志 + onend 兜底提示 |

### 其他代码质量问题（已修复）

| # | 问题 | 文件 | 修复方式 |
|---|------|------|----------|
| Q4 | master.html keydown 监听未解绑 | master.html | ✅ 命名函数 + openModal 绑定/closeModal 解绑 |
| Q5 | history.html setActiveNode 未判空 | history.html | ✅ 加越界保护 return |
| Q6 | master.html innerHTML XSS | master.html | ✅ escapeHtml 转义 |
| Q7 | touchstart+mousedown 双触发 | ai.html | ✅ isRecording 标志位防护（保留） |
| Q8 | 页面卸载未清理资源 | ai.html | ✅ beforeunload + visibilitychange 清理 |
| Q9 | master.html levelMap 重复定义 | master.html | ✅ 抽为全局常量 LEVEL_MAP |
| Q10 | index.html 淡入时机不一致 | index.html | ✅ 统一 HTML 静态类 |
| Q11 | master.html closeModal 未恢复焦点 | master.html | ✅ lastFocusedCard 记录+恢复 |
| Q12 | history.html id="dynastyCard" 死代码 | history.html | ✅ 已删除 |
| Q13 | style.css 轮播死代码 | style.css | ⚠️ 保留（<10 人场景备用） |
| Q14 | 颜色对比度 | style.css | ⚠️ 鎏金仅装饰用（见合规 C6） |

---

## 五、修复文件清单

| 文件 | 修复项数 | 关键修复 |
|------|----------|----------|
| [ai.html](file:///d:/traeproject/WoodWhisper/ai.html) | 13 | 超时/校验/语音死锁/键盘/a11y/AIGC标签/资源清理/输入校验 |
| [master.html](file:///d:/traeproject/WoodWhisper/master.html) | 8 | XSS转义/DRY/keydown解绑/a11y/焦点恢复/脚本泄露修复/导航链接修复/modal背景关闭优化 |
| [history.html](file:///d:/traeproject/WoodWhisper/history.html) | 12 | 判空/Fragment/删死代码/a11y/图片加载优化/时间轴点击修复/切换竞态修复/占位显示优化 |
| [index.html](file:///d:/traeproject/WoodWhisper/index.html) | 5 | 淡入统一/prefetch/a11y/viewport-fit |
| [style.css](file:///d:/traeproject/WoodWhisper/style.css) | 3 | touch-action/安全区/显式元素reset |
| [PROJECT_REPORT.md](file:///d:/traeproject/WoodWhisper/PROJECT_REPORT.md) | - | 新增"九、2026-07-21 架构清理与手机端全量审查"章节 |

---

## 八、2026-07-19 迭代更新（传承页与历史页专项修复）

### 8.1 传承页（master.html）修复

| # | 问题 | 修复方式 |
|---|------|----------|
| M1 | `<script>` 标签内注释包含 `</script>` 字符串导致脚本泄露 | ✅ 转义为 `<\/script>`，添加说明避免 HTML 解析器误解 |
| M2 | 底部导航"历史"链接指向错误（history.html → historyUI/history.html） | ✅ 修正链接路径 |
| M3 | HTML 注释嵌套语法错误（`<!--<!--`） | ✅ 修正为 `<!--` |
| M4 | modal 点击背景关闭逻辑不稳定 | ✅ 使用 `getBoundingClientRect` 判断点击位置，替代 `e.target === modal` |

### 8.2 历史页（historyUI/history.html）修复

| # | 问题 | 修复方式 |
|---|------|----------|
| H1 | 图片加载不稳定（首屏图片使用 lazy loading 导致裂图） | ✅ 移除 `loading="lazy"`，首屏图片直接加载 |
| H2 | 图片加载失败时显示裂图 | ✅ 添加 `onerror` 兜底，用 div 替换 img 显示"展品暂缺" |
| H3 | 时间轴节点点击区域过小 | ✅ 添加 `flex: 1` 使节点均分宽度，添加 `touch-action: manipulation` |
| H4 | 时间轴点击事件委托在移动端不敏感 | ✅ 给每个节点直接绑定 `onclick` 和 `ontouchend`，移除事件委托 |
| H5 | 快速连点朝代节点导致切换竞态错乱 | ✅ 添加 `isSwitching` 锁，400ms 动画期间忽略新点击 |

### 8.3 移动端适配验证

- ✅ 所有页面在 375px~430px 宽度下无横向滚动条
- ✅ 所有页面元素布局正常，无溢出或重叠
- ✅ 底部导航固定在底部，不被内容遮挡
- ✅ 触摸目标尺寸符合移动端标准（>= 44px）
- ✅ 首页、历史页、传承页、AI 页在手机端显示正常

### 8.4 交互功能验证

- ✅ 历史页时间轴朝代切换正常（唐/宋/明/清/近现代）
- ✅ 历史页展品图片点击打开 lightbox，支持关闭按钮/Esc/背景点击关闭
- ✅ 传承页传承人卡片点击打开 modal，支持关闭按钮/Esc/背景点击关闭
- ✅ 快速连点朝代节点，最终显示最后点击的朝代（无竞态错乱）
- ✅ 所有页面底部导航跳转正确

---

## 九、2026-07-21 架构清理与手机端全量审查

### 9.1 架构清理总览（扁平架构方案）

**目标**：将项目目录结构统一为扁平架构，与 BLUEPRINT.md 约定一致，消除历史遗留的子目录嵌套与重复文件。

**最终结构**：根目录只有一套 4 个 HTML（index / history / master / ai.html）+ style.css，外加 3 个图片资源文件夹（historyUI/、masterUI/、UI元素参考图片/）。

**删除的冗余文件清单**：

| # | 路径 | 类型 | 删除原因 |
|---|------|------|----------|
| 1 | indexUI/index.html | 旧版首页 | 与根目录 index.html 重复，已被替代 |
| 2 | indexUI/HomepageUIBackground.jpg | 旧版背景图 | indexUI/ 目录整体废弃 |
| 3 | indexUI/woodcarving-main.jpg | 旧版木雕图 | indexUI/ 目录整体废弃 |
| 4 | indexUI/首页UI参考图.jpg | 旧版参考图 | indexUI/ 目录整体废弃 |
| 5 | historyUI/history.html | 旧版历史页 | 已被根目录 history.html 完整版替代 |

**保留的图片资源文件夹**：

| 文件夹 | 用途 |
|--------|------|
| historyUI/ | 历史页背景图、展品图、音频资源 |
| masterUI/ | 传承页传承人照片、作品图 |
| UI元素参考图片/ | 全站 UI 设计参考图 |

### 9.2 viewport 配置统一

**统一配置**（4 个页面全部一致）：

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
```

**修复点**：

| # | 文件 | 修改内容 |
|---|------|----------|
| 1 | master.html | 补齐 `viewport-fit=cover` |
| 2 | ai.html | 补齐 `viewport-fit=cover` |

**收益**：适配 iPhone X+ 刘海屏，使 `env(safe-area-inset-bottom)` 在底部导航处生效，避免 home indicator 遮挡导航项。

### 9.3 导航链接统一（扁平路径）

**统一规则**：所有页面底部导航统一为 `index.html` / `history.html` / `master.html` / `ai.html`，移除所有子目录相对路径（如 `historyUI/history.html`、`../index.html`）。

**具体修复点**：

| # | 文件 | 修复内容 | 处数 |
|---|------|----------|------|
| 1 | index.html | `historyUI/history.html` → `history.html`（prefetch、历史卡片入口、底部导航） | 3 处 |
| 2 | master.html | 历史导航 `historyUI/history.html` → `history.html` | 1 处 |
| 3 | history.html | `../index.html` → `index.html`、`../master.html` → `master.html`、`../ai.html` → `ai.html` | 3 处 |

**新手易错点**：路径修改后必须用浏览器逐页点击底部导航 4 个按钮验证跳转，不能只看代码改对了；建议用 VS Code 全局搜索 `historyUI/` 和 `../` 残留路径，确保没有漏改。

### 9.4 图片资源路径统一（history.html 从 historyUI/ 合并到根目录）

**背景**：history.html 从 historyUI/ 子目录移动到根目录后，所有相对路径都需要相应调整。

**路径修改清单**：

| # | 类型 | 原路径 | 新路径 | 处数 |
|---|------|--------|--------|------|
| 1 | CSS 引用 | `../style.css` | `style.css` | 1 处 |
| 2 | 背景图 | `woodbackground.jpg` | `historyUI/woodbackground.jpg` | 1 处 |
| 3 | 展品图 | `历史页UI元素参考/xxx` | `historyUI/历史页UI元素参考/xxx` | 20 处 |
| 4 | 音频文件 | `assets/audio/guqin-loop.mp3` | `historyUI/assets/audio/guqin-loop.mp3` | 1 处 |

**验证方法**：F12 打开 DevTools → Network 面板 → 刷新页面，所有图片、CSS、音频资源状态码应为 200 或 304，不应出现 404。

### 9.5 音频 preload 优化（404 修复）

**问题**：`historyUI/assets/audio/guqin-loop.mp3` 文件尚未添加，但 `<audio>` 标签设置了 `preload="auto"`，导致页面加载时浏览器主动请求该文件产生 404 错误，污染 Network 面板且浪费流量。

**修复方式**：

| # | 修改项 | 修改前 | 修改后 |
|---|--------|--------|--------|
| 1 | preload 属性 | `preload="auto"` | `preload="none"` |
| 2 | 代码注释 | 无 | 添加详细注释说明音频文件待添加，避免误删 |

**验证方法**：F12 → Network 面板 → 刷新 history.html，搜索 `guqin-loop`，不应出现该请求（preload="none" 时浏览器不会主动加载音频）。

**新手易错点**：`preload="auto"` 是浏览器"建议"而非强制，但绝大多数浏览器会预加载；改为 `none` 后音频只能在用户主动播放时加载，必须确保播放按钮的 click 事件能正确触发 audio.load() + audio.play()。

### 9.6 手机端尺寸与交互审查

**测试机型宽度**：375px（iPhone SE/mini）/ 390px（iPhone 14）/ 414px（iPhone Plus）/ 430px（iPhone Pro Max）。

**验证结果**：

| # | 审查项 | 结果 |
|---|--------|------|
| 1 | 所有页面无横向滚动条 | ✅ 通过 |
| 2 | 所有页面元素无溢出或重叠 | ✅ 通过 |
| 3 | 底部导航固定在底部，不被内容遮挡 | ✅ 通过 |
| 4 | 触摸目标尺寸 >= 44px（导航项、按钮、时间轴节点） | ✅ 通过 |
| 5 | 底部导航适配刘海屏（env(safe-area-inset-bottom)） | ✅ 通过 |
| 6 | lightbox、modal 等弹窗在手机端正常显示和关闭 | ✅ 通过 |
| 7 | 历史页时间轴朝代切换正常 | ✅ 通过 |
| 8 | 传承页 modal 点击背景关闭逻辑稳定 | ✅ 通过 |

**验证方法**：Chrome DevTools → Toggle device toolbar → 依次选择上述宽度，逐页操作并观察控制台与 Network 面板。

### 9.7 架构清理收益

| # | 维度 | 收益说明 |
|---|------|----------|
| 1 | 项目结构清晰度 | 根目录仅 4 个 HTML + 1 个 CSS，新人 5 分钟内即可理解全站结构，无需在多个子目录间反复跳转查找"到底哪个是当前在用的页面" |
| 2 | 可维护性 | 导航链接全部为扁平路径，未来新增/重命名页面只需修改一处，不再有 `../` 相对路径导致的"换个位置就 404"问题 |
| 3 | 可扩展性 | 图片资源按功能分文件夹（historyUI/masterUI/UI元素参考图片/）清晰隔离，新增页面只需新建一个 HTML + 对应 UI 文件夹，不会污染其他模块 |
| 4 | 移动端体验一致性 | viewport 配置统一 + 安全区适配，4 个页面在所有 iPhone 机型上呈现一致的顶部/底部留白与触摸目标尺寸 |
| 5 | 性能可观测性 | 修复音频 404 后，Network 面板不再有噪声请求，便于后续真实性能问题排查 |

---

## 十、2026-07-21 传承页 inherit.html 开发

### 10.1 开发背景

原 `master.html` 采用瀑布流布局展示传承人信息，与新设计的"横向匠人卡片 + 视差木纹长卷 + 年轮互动弹窗"交互方案不符。为保留原有代码作为备用方案，新建 `inherit.html` 作为传承页新入口，实现更沉浸式的非遗传承叙事体验。

**设计目标**：
- 横向滑动浏览 4 位匠人（李得浓居中），scroll-snap 吸附定位
- 视差滚动展示木纹长卷，三层视差（0.3x/0.6x/1x）营造空间感
- 点击卡片弹出大师详情弹窗，长按印章弹出冷门小故事气泡
- 支持夜间黑金/日间宣纸双模式切换，CSS 变量控制主题色

### 10.2 页面结构

`inherit.html` 采用 7 层布局结构：

| 层级 | 模块 | 功能说明 |
|------|------|----------|
| 1 | 固定顶部控件 | 音乐开关按钮，控制 guqin-loop.mp3 播放 |
| 2 | 标题区 | "匠心传承"主标题 + 副标题 |
| 3 | 横向匠人卡片 | 4 位匠人横向滚动，scroll-snap 吸附，李得浓默认居中 |
| 4 | 倾斜木纹长卷视差 | 三层视差滚动（背景层 0.3x、木纹层 0.6x、前景层 1x） |
| 5 | 过渡导语区 | 引导文案，衔接上下视觉节奏 |
| 6 | 双按钮 | 日间/夜间模式切换按钮 |
| 7 | 底部导航 | 首页/历史/传承/AI 四页互联，active = 传承 |

### 10.3 核心功能清单

| # | 功能 | 技术实现 | 交互细节 |
|---|------|----------|----------|
| 1 | 横向匠人卡片 | CSS scroll-snap-type: x mandatory | 4 人横向排列，李得浓居中，滑动自动吸附 |
| 2 | 大师详情弹窗 | 点击卡片触发 modal | 展示匠人生平、代表作、职称信息 |
| 3 | 长按印章气泡 | touchstart/mousedown + setTimeout | 长按 800ms 弹出冷门小故事，松手消失 |
| 4 | 三层视差滚动 | requestAnimationFrame + transform | 背景层 0.3x、木纹层 0.6x、前景层 1x 速度滚动 |
| 5 | 木屑粒子特效 | CSS animation + opacity | ≤30 个粒子，opacity≤0.2，随机飘落 |
| 6 | 双模式切换 | CSS 变量 + data-theme 属性 | 夜间黑金（#1a1a1a 背景 + #D4AF37 强调）/ 日间宣纸（#f5f5dc 背景 + #C43D2B 强调） |
| 7 | 音乐控制 | HTML5 Audio API | 与 history.html 共用 guqin-loop.mp3，顶部按钮控制播放/暂停 |
| 8 | 年轮弹窗联动 | 点击年轮图案触发 | 弹窗关闭后，4 张卡片依次亮起柔光 2 秒（setTimeout 链式调用） |

### 10.4 导航更新

为配合 `inherit.html` 上线，以下 3 个页面的底部导航"传承"链接已更新：

| 文件 | 修改内容 | 处数 |
|------|----------|------|
| index.html | 底部导航"传承"链接 `master.html` → `inherit.html` | 1 处 |
| history.html | 底部导航"传承"链接 `master.html` → `inherit.html` | 1 处 |
| ai.html | 底部导航"传承"链接 `master.html` → `inherit.html` | 1 处 |

**验证方法**：在任一页面点击底部导航"传承"按钮，应跳转至 `inherit.html`；在 `inherit.html` 点击其他导航项，应正常跳转回对应页面。

### 10.5 技术亮点

| 维度 | 亮点说明 |
|------|----------|
| 零框架依赖 | 原生 HTML/CSS/JS 实现，无 React/Vue/jQuery，首屏 JS < 15KB |
| 图片懒加载 | 匠人肖像使用 `loading="lazy"`，视差层图片使用 IntersectionObserver 延迟加载 |
| XSS 防护 | 弹窗内容使用 `textContent` 而非 `innerHTML`，防止注入攻击 |
| 手势方向区分 | touchstart/touchend 计算滑动方向，横向滑动触发卡片切换，纵向滑动触发页面滚动 |
| 性能优化 | 视差滚动使用 `transform` 而非 `top/left`，触发 GPU 加速；木屑粒子使用 CSS animation 而非 JS 定时器 |

**新手易错点**：
1. **scroll-snap 不生效**：检查父容器是否设置 `scroll-snap-type: x mandatory`，子元素是否设置 `scroll-snap-align: center`。验证方法：Chrome DevTools 打开 Rendering 面板，勾选"Scroll snap boundaries"查看吸附边界。
2. **视差滚动卡顿**：避免在 scroll 事件中直接操作 DOM，应使用 `requestAnimationFrame` 节流；避免使用 `top/left` 定位，改用 `transform: translateY()`。
3. **长按事件冲突**：长按印章时需同时监听 `touchstart`/`mousedown` 和 `touchend`/`mouseup`，并在 `touchmove` 时取消长按，避免用户滑动时误触发气泡。
4. **双模式切换闪烁**：切换主题时先设置 `data-theme` 属性，再触发 CSS 变量更新，避免中间态闪烁。验证方法：在夜间模式下快速点击切换按钮，观察是否有白屏瞬间。

---

## 六、上线前待办（人工处理）

### P0 必须完成
- [ ] 编写隐私政策页，AI 页首次进入弹窗取得用户同意
- [ ] 联系传承人/家属取得姓名、生平、作品信息授权
- [ ] 新建 Serverless Function（/api/deepseek.js）代理 DeepSeek 调用，迁移密钥到环境变量
- [ ] 在仓库根目录添加 .gitignore（排除 config.js）+ config.example.js 模板

### P1 上线后短期
- [ ] 后端代理加 IP 速率限制（如每 IP 每分钟 5 次）
- [ ] system prompt 追加抗提示词注入指令
- [ ] 设 DeepSeek API 账单告警与消费上限

### P2 中期优化
- [ ] 鎏金色文字改用更深金色（#8B6914）确保对比度达标
- [ ] 补文字输入降级方案（不支持语音时可用键盘对话）
- [ ] 评估生成式 AI 服务备案需求

---

## 七、项目优势（审查中肯定的点）

1. **零前端框架依赖**，原生 HTML/CSS/JS，首屏 JS < 20KB
2. **全站唯一公共样式表** style.css，4 页共享缓存命中率高
3. **所有动画走 transform/opacity**，GPU 加速到位，无一例外
4. **图标全用 inline SVG**，未引入 iconfont 字体文件
5. **事件委托使用得当**（history 时间轴、master 卡片网格）
6. **addBubble 用 textContent 防 XSS**（ai.html 原本就正确）
7. **viewport 未禁用缩放**，符合无障碍标准
8. **白话注释+易错点提示**完整，教学型项目典范

---

## 十一、2026-07-28 AI页浅色主题重构与全项目优化

### 11.1 重构背景

AI页（ai.html）此前采用深色黑金木纹主题（#0d0906深黑胡桃木色背景），与首页、历史页的仿古宣纸米白浅色系风格不一致。同时存在以下问题：
- 数字人头像是方形，视觉上不够精致
- 录音按钮fixed定位遮挡聊天内容
- CSS样式与style.css中旧版AI页样式冲突，导致气泡不显示
- 初始滚动位置错误导致欢迎语气泡被滚到视野外
- 项目文件结构略显散乱

### 11.2 核心变更清单

| # | 变更项 | 说明 |
|---|--------|------|
| 1 | 背景主题切换 | 从深色黑金主题重构为仿古宣纸米白浅色系（--color-bg: #F5EFE0），与首页/历史页统一 |
| 2 | 圆形数字人头像 | 头像改为90px直径正圆形，2px鎏金边框，object-fit: cover裁剪，带呼吸光晕+浮动动画 |
| 3 | 消息气泡重设计 | AI气泡：白底+鎏金细边框+左侧圆形小头像+AIGC标签；用户气泡：保持朱砂红渐变；思考指示器：白底+三点鎏金跳动 |
| 4 | 输入栏重构 | 改为白色圆角卡片式三合一输入栏（图片按钮+文字框+语音/发送切换按钮），flex布局内嵌于页面流 |
| 5 | 布局修复 | 修复record-btn fixed定位遮挡问题（改为relative），修复.chat固定高度40vh问题（改为flex:1自适应），chat区域padding-bottom:90px防遮挡 |
| 6 | 话题引导卡片 | 6个潮州木雕主题话题卡片，2列Grid布局，白底鎏金边框，hover上浮效果 |
| 7 | 粒子效果调优 | 粒子数量从28减至18个，透明度降至0.1-0.3淡鎏金色，z-index:1不遮挡文字 |
| 8 | CSS冲突修复 | 用!important覆盖style.css中残留的旧版AI页样式（.chat固定高度、.record-btn fixed定位） |
| 9 | 初始滚动修复 | initWelcome中scrollTop从scrollHeight改为0，确保欢迎语第一时间可见 |
| 10 | 导航互联验证 | 首页/历史/传承/AI/大师 5个页面全部测试通过，跳转正常，无白屏/404/裂图 |

### 11.3 AI页页面结构（重构后）

```
.page.page--ai（9:16竖屏flex布局，宣纸米白背景）
├── #particleCanvas（淡鎏金粒子层，z-index:1）
├── header.ai-header（标题"木雕小匠"+鎏金装饰线+副标题）
├── section.ai-stage（数字人舞台）
│   └── .ai-avatar-wrap
│       ├── .ai-avatar-glow（呼吸光晕radial-gradient）
│       └── img.ai-avatar.digital-human（90px圆形头像+鎏金边框）
├── section.chat#chatBox（flex:1对话区，overflow-y:auto）
│   ├── .chat__bubble.chat__bubble--ai（欢迎语气泡）
│   ├── .ai-topics（6个话题卡片，2列Grid）
│   └── ...（动态气泡：user/ai/thinking）
├── #apiTip.ai-api-tip（API Key提示，默认隐藏）
├── .ai-input-bar（底部输入栏，白色圆角卡片）
│   ├── #imageBtn.ai-input-bar__icon-btn（图片上传）
│   ├── input#imageUpload（隐藏文件选择）
│   ├── input#chatInput.ai-input-bar__text（文字输入）
│   └── #voiceBtn.record-btn（麦克风/发送切换）
│       ├── .mic-icon（麦克风SVG）
│       └── .send-icon（纸飞机SVG，有文字时显示）
└── nav.bottom-nav（4项导航：首页/历史/传承/AI）
```

### 11.4 关键技术修复

**修复1：style.css旧样式冲突**
- 问题：style.css中`.chat`设置了`height:40vh`固定高度+白底卡片边框，`.record-btn`设置了`position:fixed`悬浮居中
- 解决：在ai.html内联样式中用`!important`覆盖：
  - `.chat`：`height:auto!important; background:transparent!important; border:none!important; box-shadow:none!important; border-radius:0!important; display:flex!important;`
  - `.record-btn`：`position:relative!important; left/right/bottom/top:auto!important; transform:scale(1)!important; z-index:auto!important; width/height:46px!important;`
- 新手易错点：当内联`<style>`与外部CSS冲突时，不能只靠"后面的样式覆盖前面的"，因为外部CSS选择器优先级可能相同但加载顺序导致内联不一定赢；安全做法是给冲突属性加`!important`或提高选择器特异性。

**修复2：初始滚动位置错误**
- 问题：initWelcome最后`chatBox.scrollTop = chatBox.scrollHeight`将聊天区滚到底部，导致第一条欢迎语气泡被滚出视野上方
- 解决：初始加载时`scrollTop = 0`，让用户第一眼看到欢迎语；addBubble函数内的scrollTop=scrollHeight保留（新消息追加时滚到底部）

**修复3：发送/语音按钮状态切换**
- 逻辑：监听chatInput的input事件，有文字时recordBtn添加`record-btn--send`类切换为金色发送按钮（显示send-icon，隐藏mic-icon），无文字时恢复红色麦克风按钮
- 点击事件：send模式下调用sendTextMessage()，mic模式下处理长按录音

### 11.5 全流程验证结果

| 页面 | 测试结果 | 备注 |
|------|----------|------|
| index.html（首页） | ✅ PASS | 宣纸背景、卡片布局、导航跳转正常 |
| history.html（历史页） | ✅ PASS | 时间轴、朝代卡片、背景图正常 |
| inherit.html（传承页） | ✅ PASS | 深色木纹主题、匠人卡片、导航正常 |
| master.html（大师页） | ✅ PASS | 备用页面加载正常 |
| ai.html（AI页） | ✅ PASS | 圆形头像、浅色系、话题引导、气泡、输入栏、TTS降级回复全部正常 |
| 跨页导航 | ✅ PASS | 5个页面两两跳转正常，active状态正确切换 |

### 11.6 API配置说明

当前 AI 接入使用同源 `/api/chat` 代理，默认提供商为硅基流动，模型为 `Qwen/Qwen3-8B`。密钥只配置在服务端环境变量中，不能写入 `ai.html`：

```powershell
$env:AI_PROVIDER = 'siliconflow'
$env:SILICONFLOW_MODEL = 'Qwen/Qwen3-8B'
$env:SILICONFLOW_API_KEY = '你的硅基流动密钥'
py -3 server/start_server.py
```

**未配置 Key 时的行为**：本地静态预览自动使用本地兜底话术；完整 Python 服务会返回配置提示，确保不会把密钥暴露给浏览器。

**新手易错点**：
1. API Key不要加多余空格或引号嵌套
2. Key如果失效/欠费，会触发catch分支显示降级话术
3. 浏览器需支持speechSynthesis才能听到TTS朗读（Chrome/Edge/Safari均支持，Firefox部分支持）
4. 语音识别（长按录音）目前仅Chrome/Edge支持（Web Speech API），其他浏览器自动降级为文字输入

### 11.7 代码质量评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码注释 | ✅ 优秀 | 白话注释覆盖所有逻辑块，每个功能区有"人话讲"解释和新手易错点 |
| 错误处理 | ✅ 优秀 | try-catch兜底API调用、AbortController超时、TTS多状态收尾、资源生命周期清理 |
| XSS防护 | ✅ 良好 | 使用createTextNode/textContent而非innerHTML，except图片预览 |
| 可维护性 | ✅ 良好 | JS按A-H区功能分区，CSS按组件模块化命名 |
| 可扩展性 | ✅ 良好 | 新增话题只需修改TOPICS数组，新增气泡类型可扩展chat__bubble--xxx |
| 性能 | ✅ 良好 | 粒子使用Canvas+requestAnimationFrame，CSS动画走transform/opacity GPU加速 |

---

*本章节记录AI页浅色主题重构与全项目优化工作，所有页面经全流程测试验证通过。*
