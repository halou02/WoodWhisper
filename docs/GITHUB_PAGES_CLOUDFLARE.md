# GitHub Pages + Cloudflare Worker 部署

## 费用和安全

- GitHub Pages 通常可以免费托管公开静态站点。
- Cloudflare Workers 有免费额度，但额度、地区和服务规则可能变化。
- AI 供应商的免费模型有自己的调用次数、速率和可用性限制。
- API Key 只放在 Cloudflare Worker Secret，绝不写入 GitHub Pages 文件。
- Worker 内置来源校验、每分钟 12 次限流、4 KB 请求体限制和 1000 字消息限制。

## 发布网页

1. 将项目推送到 GitHub 仓库。
2. 在仓库 Settings -> Pages 中选择 GitHub Actions。
3. 使用项目提供的 Deploy to GitHub Pages 工作流。
4. 记下站点地址，例如 https://用户名.github.io/WoodWhisper/。

## 创建 Worker

1. 登录 Cloudflare Dashboard，进入 Workers & Pages，创建 Worker。
2. 在 Worker 的 Variables and Secrets 中设置：
   - `ALLOWED_ORIGIN=https://用户名.github.io`，不要写 `*`。
   - Secret `MY_API`：AI 供应商发放的密钥。
   - `MY_MODEL=agnes-2.0-flash`。
3. 部署 Worker，并先在浏览器直接打开它的 `workers.dev` 地址。它应返回 JSON `405`，而不是超时或浏览器错误页。

## 连接网页

将 js/ai-config.js 中的地址改成 Worker 地址：

    window.WOODWHISPER_AI_PROXY_URL = 'https://你的-worker.workers.dev';

修改后提交并推送；GitHub Actions 会生成最新的部署文件。

## 重要提醒

- 不要把真实密钥写进 ai.html、js/ai-config.js、Worker 源码或 GitHub Actions 输出。
- 不要把真实密钥发到聊天、截图、Issue 或 Pull Request。
- GitHub Pages 不能运行 `/api/chat`，AI 必须通过 Worker 代理。
- 若 `workers.dev` 地址本身打不开或超时，网页一定无法使用 AI。请先切换网络或在 Cloudflare 为 Worker 绑定可访问的自定义域名；这不是 API Key 或前端代码问题。
- 不要把真实密钥写进 `ai.html`、`js/ai-config.js`、Worker 源码或 GitHub Actions 输出。若密钥曾出现在聊天记录、截图或提交记录中，请立刻在供应商后台撤销并新建一把。
