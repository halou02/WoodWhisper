# 潮州木雕·数智非遗传承 H5 - 项目架构文档

> 本文档为 AI Agent 和开发者提供项目全景图，修改代码前请先阅读。

---

## 一、项目总览

| 项目信息 | 说明 |
|---------|------|
| 项目名称 | 潮州木雕·数智非遗传承 H5 |
| 技术栈 | 纯静态 HTML5 + CSS3 + 原生 JavaScript（无框架） |
| 本地服务器 | Python `http.server`，端口 **8124** |
| 设计风格 | 仿古宣纸米白底 + 鎏金（#D4AF37）点缀，移动端优先，桌面端居中适配 |
| 页面数量 | 5个HTML页面 |

---

## 二、目录结构详解

```
WoodWhisper/
│
├── 📄 页面入口（根目录，共5个HTML）
│   ├── index.html          # 首页 - 主视觉+三个入口卡片
│   ├── history.html        # 历史脉络页 - 5朝代时间轴+展品拼图
│   ├── inherit.html        # 传承页 - 匠人名录+年轮镌刻交互
│   ├── ai.html             # AI数字人页 - 小匠对话(需配置API Key)
│   └── master.html         # 备用大师入口，跳转至 inherit.html
│
├── 📄 便捷脚本
│   ├── start.bat           # Windows一键启动服务器（双击即可）
│   └── .gitignore          # Git忽略配置，防止敏感文件提交
│
├── 📁 css/                 # 样式目录
│   ├── style.css           # 全站公共样式、变量、导航栏和通用组件
│   ├── history.css         # 历史页专属样式
│   ├── inherit.css         # 传承页专属样式
│   └── ai.css              # AI页专属样式
│
├── 📁 js/                  # 公共脚本目录
│   └── common.js           # ⭐ 全站公共工具函数（escapeHtml防XSS、safeColor颜色校验）
│                           # 所有页面共用一份，消除重复代码
│                           # 必须在各页面内联<script>之前引入
│
├── 📁 assets/              # 静态资源（仅放代码实际引用的文件）
│   ├── images/
│   │   ├── home/           # 首页图片
│   │   │   ├── woodcarving-main.jpg       # 首页主视觉图
│   │   │   └── HomepageUIBackground.jpg   # 全站宣纸肌理底图（body背景）
│   │   ├── history/        # 历史页图片
│   │   │   ├── woodbackground.jpg         # 历史页木质背景
│   │   │   └── optimized/                   # 20组展品图，WebP优先、JPG回退
│   │   ├── inherit/        # 传承页图片
│   │   │   ├── wood_ring_base_clean.jpg   # 年轮木板底图
│   │   │   ├── paper_input_box_base_16x9.jpg # 输入框宣纸背景
│   │   │   ├── inherit_composite_bg_clean_from_screenshot.jpg # 传承页整页背景
│   │   │   ├── modal_carve_bg_dark_clea.jpg # 镌刻弹窗暗色背景
│   │   │   ├── 大师头像（公开肖像）         # 无公开肖像者使用文字占位
│   │   └── ai/             # AI页图片
│   │       └── 数字IP正视图.png            # AI数字人"小匠"形象
│   └── text/               # AI页使用的本地文字素材
│
├── 📁 docs/                # 项目文档（设计报告、蓝图等）
│   ├── BLUEPRINT.md                    # 项目开发蓝图/规范
│   ├── PROJECT_REPORT.md               # 项目报告
│   ├── HOMEPAGE_REDESIGN_REPORT.md     # 首页改版报告
│   ├── PROJECT_STRUCTURE.md            # ⭐ 你正在读的这个文件
│   ├── API_SETUP.md                    # ⭐ API密钥配置教程
│   └── 其他docx参考文档...
│
├── 📁 references/          # 参考资料（不被代码直接引用）
│   └── ui-reference/       # UI设计参考照片
│
├── 📁 server/              # 服务器相关
│   └── start_server.py     # 本地HTTP服务器启动脚本
│
└── 📁 tests/               # 测试文件
    └── test_inherit.py     # 传承页功能测试
```

---

## 三、核心设计规范

### 3.1 CSS 变量（定义在 style.css :root）

```css
--color-bg: #f5efe0;           /* 主背景：宣纸米白 */
--color-gold: #d4af37;         /* 主色：鎏金色 */
--color-gold-dim: #b8941f;     /* 暗金 */
--color-wood: #5c4033;         /* 深木色 */
--color-wood-light: #8b7355;   /* 浅木色 */
--color-red: #9c2424;          /* 印章红 */
--color-paper: #f8f5ed;        /* 纯白宣纸 */
```

### 3.2 响应式断点

| 断点 | 设备 | 导航栏高度 | 图标尺寸 |
|------|------|-----------|---------|
| 默认（<640px） | 手机 | 56px | 24px |
| ≥640px | 桌面/平板横屏 | 88px | 34px |

桌面端内容区域最大宽度：`max-width: calc(100vh * 9/16)`（模拟手机比例居中）

### 3.3 底部导航栏（全站统一）

所有5个页面共用相同的底部导航结构，class命名为：
- `.bottom-nav` - 导航栏容器（fixed定位）
- `.bottom-nav__item` - 单个导航项
- `.bottom-nav__icon` - 图标容器（含SVG）
- `.bottom-nav__label` - 文字标签

**当前页面高亮**：给对应`.bottom-nav__item`加`aria-current="page"`和`.bottom-nav__item--active`类。

---

## 四、各页面功能说明

### 4.1 首页 (index.html)
- **功能**：主视觉展示、三个入口（历史/传承/AI）、底部导航
- **关键元素**：`.hero`（主视觉区）、`.entry-card`（入口卡片）
- **图片**：`assets/images/home/woodcarving-main.jpg`

### 4.2 历史脉络页 (history.html)
- **功能**：5朝代时间轴（唐→宋→明→清→近现代）、展品拼图、朝代详情
- **核心数据**：`DYNASTIES`数组（5个朝代对象，含name/year/texts/images/trivia）
- **关键函数**：`renderDynastyCard(index)`、`switchDynasty(index)`、`escapeHtml(s)`
- **交互**：左右滑动/点击时间轴切换朝代，长按显示冷门小故事

### 4.3 传承页 (inherit.html) ⭐最复杂
- **功能**：18位大师卡片、年轮镌刻交互（一键镌刻/亲手镌刻）、分享和详情弹窗
- **核心数据**：`MASTERS`数组（18位大师）；无公开肖像者使用 `portrait: false`
- **关键函数**：
  - `escapeHtml(s)` - XSS防护
  - `safeColor(color)` - CSS颜色校验
  - `startAutoCarve()` - 一键镌刻动画
  - `onManualStart/Move/End()` - 手动绘制三条线
  - `saveRingImage()` - Canvas保存镌刻结果
  - `finishCarving()` - 镌刻完成处理
- **镌刻逻辑**：手动模式需画3条线（`manualLinesCount`计数），画痕存入`manualAllPaths`数组

### 4.4 AI数字人页 (ai.html)
- **功能**：通过同源 `/api/chat` 请求 AI、语音识别输入、语音合成朗读
- **安全规则**：API Key 只放在 Python 服务或 EdgeOne Function 的 `DEEPSEEK_API_KEY` 环境变量中，浏览器不保存密钥
- **关键函数**：`sendToDeepSeek(messages)`、`startVoiceRecognition()`、`speak(text)`
- **本地预览差异**：Node 静态预览不提供 `/api/chat`；真实 AI 回复需使用 Python 服务或生产函数

### 4.5 备用大师页 (master.html)
- **功能**：保留旧入口并重定向到 `inherit.html`，避免重复维护两套大师数据
- **当前数据源**：`js/inherit-data.js` 中的 18 位大师

---

## 五、代码规范

### 5.1 注释规范（遵循用户"白话翻译"规则）
每段代码前用大白话注释说明：
```javascript
// 人话讲：这个函数是干什么的（生活类比）
// 数据从哪来：xxx
// 数据到哪去：xxx
// 新手易错点：最可能踩的坑是什么
// 验证方法：怎么用最简单的方法验证对不对（F12/console.log等）
```

### 5.2 安全规范
1. **XSS防护**：所有用户输入/动态数据插入`innerHTML`前必须用`escapeHtml()`转义
2. **纯文本优先**：只用`textContent`不用`innerHTML`来设置纯文字
3. **CSS注入防护**：颜色值用正则`/^#[0-9A-Fa-f]{6}$/`校验，不合法返回默认色
4. **API Key**：禁止写入 HTML、JavaScript、部署包或 Git；仅从服务端环境变量 `DEEPSEEK_API_KEY` 读取

### 5.3 路径规范
- 所有路径使用**相对路径**
- HTML引用CSS：`css/style.css`
- HTML引用图片：`assets/images/{页面}/{文件名}`
- CSS引用图片：`../assets/images/home/HomepageUIBackground.jpg`（注意../）

---

## 六、启动方式

### 方式一：双击启动（Windows）
直接双击根目录 `start.bat`

### 方式二：命令行启动
```bash
cd d:\traeproject\WoodWhisper
py -3 server/start_server.py
```
启动后浏览器打开：**http://127.0.0.1:8124**

### 方式三：仅预览静态页面（无需 Python）

如果只想检查首页、历史、传承、大师页面的静态展示，可以在已安装 Node.js 的电脑上运行：

```bash
npm run preview
```

然后访问 `http://127.0.0.1:8125`。这条命令只提供静态文件，**不会**提供 `/api/chat`；需要测试 AI 真实回复时，仍应使用上面的 Python 服务端或 EdgeOne Pages Functions。

---

## 七、修改代码注意事项

1. **不要随意改动公共CSS类名**：`style.css`中的类名被多个页面共用
2. **新增图片**：放到`assets/images/{对应页面}/`目录下
3. **新增页面**：在根目录创建HTML，引入`css/style.css`，复用`.bottom-nav`结构
4. **测试路径**：修改任何路径后，运行 `npm run check:deploy` 和 `npm run test:smoke`，再在 Network 面板确认无404
5. **导航栏一致性**：修改导航栏样式需在所有5个页面验证效果一致
6. **移动端优先**：先写手机样式，用`@media (min-width: 640px)`写桌面端增强

---

## 八、常见问题排查

| 问题 | 排查方法 |
|------|---------|
| 图片不显示（裂图） | F12 → Network → 看状态码是否404，检查路径大小写和相对位置 |
| 导航栏样式不一致 | 检查HTML中class是否为`bottom-nav__item--active`，aria-current是否正确 |
| AI不回复 | 打开控制台看API Key提示，参考 docs/API_SETUP.md 配置 |
| 镌刻没反应 | 检查`manualLinesCount`是否在3次画线后变为3 |
| 桌面端布局错乱 | 检查是否误删了`max-width: calc(100vh * 9/16)`和居中样式 |
| 内容被导航栏遮挡 | 给页面容器加`padding-bottom: calc(56px + env(safe-area-inset-bottom))` |

---

*最后更新：2026-07-31*
