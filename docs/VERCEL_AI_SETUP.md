# Vercel AI 代理部署

## 这套方案做什么

- GitHub Pages 继续托管项目展示页面。
- Vercel 只托管 `api/chat.js`，负责安全地转发 AI 请求。
- API Key 只存放在 Vercel Environment Variables，不会出现在网页、GitHub 或浏览器中。

## 首次部署

1. 用 GitHub 账号登录 Vercel，点击 **Add New -> Project**。
2. 导入 `halou02/WoodWhisper` 仓库，Framework Preset 选择 **Other**，保持默认构建设置，点击 Deploy。
3. 在项目的 **Settings -> Environment Variables** 添加以下三项，并选择 Production、Preview、Development：
   - `ALLOWED_ORIGIN`：`https://halou02.github.io`
   - `MY_API`：Agnes 新建的 API Key，类型保持 Sensitive。
   - `MY_MODEL`：`agnes-2.0-flash`
4. 在 **Deployments** 点击最新部署右侧菜单，选择 Redeploy，使变量在新部署中生效。
5. 记下 Vercel 地址，例如 `https://woodwhisper.vercel.app`。
6. 将 `js/ai-config.js` 的 `WOODWHISPER_AI_PROXY_URL` 更新为：

   ```js
   window.WOODWHISPER_AI_PROXY_URL = 'https://woodwhisper.vercel.app/api/chat';
   ```

7. 提交并推送这项前端地址改动。GitHub Pages 发布完成后，AI 页面即可通过 Vercel 使用服务。

## 安全与费用

- Vercel Hobby 和 GitHub Pages 都有免费额度，适合课程项目、作品展示和小规模访问；平台规则与额度可能变化。
- Agnes 的可用额度和限流由 Agnes 控制台决定。
- 不要在任何页面、提交、Issue、截图或聊天中粘贴 API Key。已经暴露过的 Key 必须撤销并重建。
- 接口只允许来自 GitHub Pages 的请求，并限制每个 IP 每分钟 12 次请求。

## 新增：TTS 语音侧端（api/tts.js）

### 作用

- 让 AI 页的**动态回复语音**与**静态语音**使用完全相同的音色：Edge-tts `zh-CN-XiaoxiaoNeural`（晓晓，温柔女声），输出 `audio-24khz-32kbitrate-mono-mp3`（24kHz 单声道 32kbps mp3），与 `scripts/gen-tts-audio.mjs` 预合成静态音频的参数完全一致。
- 后端逐句**实时合成**，前端复用同一个隐藏 `<audio>` 逐句播放（与静态音频同一套驱动机制），句间 120ms，逐句高亮、支持停止。

### 部署

- 新增 `api/tts.js` 随 `api/chat.js` 一同在 Vercel 部署（同一 Vercel 项目，无需额外配置路由）。
- `vercel.json` 已为 `api/tts.js` 配置 `maxDuration: 60`（单次合成含逐句耗时，需较长超时上限）。
- 若 `node-edge-tts` 在 Vercel 打包时报「模块缺失」，需确认它被该函数依赖正确解析（可在需要时将其移入 `dependencies`）。

### 环境变量

- 复用现有的 `ALLOWED_ORIGIN`（同源校验，与 `api/chat.js` 一致），无需新增环境变量。
- 无需额外 Secret：TTS 走免费的 Edge-tts 在线接口，不持有任何 API Key。

### 前端接线

- 在 `js/ai-config.js` 中配置 `window.WOODWHISPER_TTS_URL = 'https://wood-whisper.vercel.app/api/tts'`（把它换成你实际的 Vercel 域名，勿照抄示例）。
- 页面未配置该变量时，`js/tts.js` 会自动回退到相对路径 `/api/tts`。

### 风险 / 降级

- Edge-tts 为微软非官方接口，偶有被限流 / 超时 / 失效的风险，无 SLA。
- 侧端不可用（请求失败、超时、返回空句、合成缺失）时，前端 `js/tts.js` 会自动回退到浏览器原生 `speechSynthesis` 逐句朗读，不影响「朗读」功能的可用性。
