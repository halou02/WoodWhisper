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
