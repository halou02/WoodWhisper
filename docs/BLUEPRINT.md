# 潮州木雕数智非遗传承 H5 - 当前项目蓝图

> 最后校准：2026-08-19。本文以当前代码和资源目录为准；旧版目录说明请勿继续沿用。

## 项目定位

这是一个移动端优先的原生多页 H5，用潮州木雕的历史叙事、传承人资料、年轮互动和 AI 讲解串联非遗体验。技术栈为 HTML、CSS 和原生 JavaScript，不依赖前端框架。

## 当前结构

```text
WoodWhisper/
├── index.html                 首页：项目入口与内容分流
├── history.html               历史：五朝代时间轴与展品图集
├── inherit.html               传承：传承人卡片、年轮互动、匠语漫行
├── ai.html                    AI：数字人问答、语音输入、TTS
├── master.html                备用：传统匠人资料列表，不在主导航使用
├── css/style.css              全站共享样式与响应式规则
├── css/ai.css                 AI 页专属样式
├── css/history.css            历史页专属样式
├── css/inherit.css            传承页专属样式
├── js/common.js               escapeHtml、safeColor 等公共工具
├── js/inherit-data.js         18 位传承人资料（独立维护）
├── js/inherit-page.js         传承页卡片、弹窗、年轮与粒子交互
├── js/history-data.js         五朝代历史资料（独立维护）
├── assets/images/
│   ├── home/                  首页图像
│   ├── history/               背景与 optimized/ 展品 WebP/JPG
│   ├── inherit/               传承页背景、年轮与公开肖像
│   └── ai/                    数字人形象
├── references/history-originals/  历史页原始高分辨率展品资料，不参与线上加载
├── server/start_server.py     本地 AI 代理服务器，只服务 .edgeone-build，默认端口 8124
├── scripts/serve-static.mjs   Node 静态预览服务器，只服务 .edgeone-build，默认端口 8125
└── .edgeone-build/            EdgeOne Pages 发布目录，含 functions/api/chat.js
```

## 页面与导航

- `index.html`：首页，入口指向历史、传承和 AI。
- `history.html`：唐、宋、明、清、近现代五段内容；每次只渲染当前朝代的四张展品。浏览器优先加载 WebP，旧浏览器回退 JPG。
- `inherit.html`：当前主导航的“传承”页面。人物资料维护在 `js/inherit-data.js`；没有公开肖像的传承人使用文字占位，不请求不存在的照片。
- `ai.html`：页面专属视觉规则维护在 `css/ai.css`，公共颜色、导航和无障碍规则仍使用 `css/style.css`。
- `history.html`：朝代资料维护在 `js/history-data.js`，页面脚本只负责渲染和交互；专属视觉规则维护在 `css/history.css`。
- `inherit.html`：人物资料维护在 `js/inherit-data.js`，页面专属视觉规则维护在 `css/inherit.css`，复杂交互维护在 `js/inherit-page.js`。
- `ai.html`：首次提交问题前提示用户对话会交给 AI 服务处理；前端只请求同源 `/api/chat`。
- `master.html`：兼容旧链接的跳转页，自动进入正式的 `inherit.html`，不再维护第二套人物资料。

所有主页面共享底部导航：首页、历史、传承、AI。当前页面必须使用 `aria-current="page"` 和 `bottom-nav__item--active`。

## 资源规则

- 页面实际使用的图片只放在 `assets/images/{页面}/`。
- 大尺寸原始资料放 `references/`，不能被 HTML/CSS 直接引用。
- 历史展品使用 `assets/images/history/optimized/{编号}.webp` 和同名 `.jpg` 回退。
- 传承人数据若无可公开展示肖像，设置 `portrait: false` 并使用首字占位；不要填一个不存在的文件路径。

## AI 与部署

- 浏览器请求 `POST /api/chat`，请求体为 `{ "message": "..." }`，成功响应为 `{ "reply": "..." }`。
- 默认通过 `SILICONFLOW_API_KEY` 调用硅基流动 `Qwen/Qwen3-8B`；`AI_PROVIDER`、模型和密钥只通过服务端环境变量提供。严禁写入 HTML、JS 或 Git 仓库。
- 本地 AI 联调：`py -3 server/start_server.py`，访问 `http://127.0.0.1:8124`。
- 仅静态预览：`npm run preview`，访问 `http://127.0.0.1:8125`。静态预览不支持 `/api/chat`。
- 生产发布目录为 `.edgeone-build`，并必须包含 `functions/api/chat.js`。
- `.edgeone-build` 只包含网站运行所需的页面、`assets/`、`css/`、`js/` 和 `functions/`；`references/` 与项目文档不进入发布包。

## 维护准则

- 移动端优先，所有页面允许用户缩放。
- 新增或修改弹窗时：使用 `role="dialog"`、`aria-modal="true"`、可读标题，并在打开时聚焦关闭按钮，关闭时恢复触发位置。
- 通过 `prefers-reduced-motion` 为用户的减少动态效果偏好提供降级。
- 动态插入纯文本用 `textContent`；必须拼接 HTML 时，先用 `escapeHtml()` 处理外部数据。
