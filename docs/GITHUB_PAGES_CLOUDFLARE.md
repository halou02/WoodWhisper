# GitHub Pages + Cloudflare Worker 部署

## 费用和安全

- GitHub Pages 通常可以免费托管公开静态站点。
- Cloudflare Workers 有免费额度，但额度、地区和服务规则可能变化。
- 硅基流动免费模型有自己的调用次数、速率和可用性限制。
- API Key 只放在 Cloudflare Worker Secret，绝不写入 GitHub Pages 文件。
- Worker 内置来源校验、每分钟 12 次限流、4 KB 请求体限制和 1000 字消息限制。

## 发布网页

1. 将项目推送到 GitHub 仓库。
2. 在仓库 Settings -> Pages 中选择 GitHub Actions。
3. 使用项目提供的 Deploy to GitHub Pages 工作流。
4. 记下站点地址，例如 https://用户名.github.io/WoodWhisper/。

## 创建 Worker

1. 登录 Cloudflare Dashboard，进入 Workers & Pages，创建 Worker。
2. 将 worker/wrangler.toml 中的 YOUR_GITHUB_USERNAME 换成你的用户名。
3. ALLOWED_ORIGIN 只填写 GitHub Pages 的源，例如 https://用户名.github.io，不要写 *。
4. 在 Worker 的 Variables and Secrets 中新增 Secret：SILICONFLOW_API_KEY。
5. 设置 SILICONFLOW_MODEL=Qwen/Qwen3-8B 后部署 Worker。

## 连接网页

将 js/ai-config.js 中的地址改成 Worker 地址：

    window.WOODWHISPER_AI_PROXY_URL = 'https://你的-worker.workers.dev';

修改后同步到 .edgeone-build/js/ai-config.js，再提交并推送。

## 重要提醒

- 不要把真实密钥写进 ai.html、js/ai-config.js、Worker 源码或 GitHub Actions 输出。
- 不要把真实密钥发到聊天、截图、Issue 或 Pull Request。
- GitHub Pages 不能运行 /api/chat，AI 必须通过 Worker 代理。
- Worker 的免费额度和硅基流动限制都可能变化，部署前请查看官方控制台。
