# 腾讯云 EdgeOne 部署指南

## 推荐架构

使用 **腾讯云 EdgeOne Pages + Pages Functions** 部署：

- 静态站点根目录：`.edgeone-build`
- AI 接口：`.edgeone-build/functions/api/chat.js`
- 前端请求：同源 `/api/chat`
- 提供商：在 EdgeOne Pages 环境变量中设置 `AI_PROVIDER=siliconflow`
- 模型：可设置 `SILICONFLOW_MODEL=Qwen/Qwen3-8B`
- 密钥：在 EdgeOne Pages 的敏感环境变量中设置 `SILICONFLOW_API_KEY`

浏览器不会接触硅基流动或 DeepSeek API Key。

## 部署步骤

1. 在腾讯云 EdgeOne Pages 创建项目并连接 Git 仓库，或上传 `.edgeone-build` 的内容。
2. 将构建/发布目录设为 `.edgeone-build`；这是静态站点和 `functions` 目录共同的根目录。
3. 在项目的生产环境变量中新增 `AI_PROVIDER=siliconflow`、`SILICONFLOW_MODEL=Qwen/Qwen3-8B`，以及敏感变量 `SILICONFLOW_API_KEY`。
4. 部署后访问 `https://你的域名/ai.html`，确认页面请求 `POST /api/chat`：
   - 未配置密钥时应返回 `503`；
   - 配置正确后应返回 `{ "reply": "..." }`。
5. 绑定自定义域名并在 EdgeOne 中启用 HTTPS；发布前不要把源站或本地 Python 服务暴露到公网。
6. 在 EdgeOne 的安全/WAF 规则中，为 POST /api/chat 设置按客户端 IP 的频率限制：建议每分钟不超过 12 次、突发不超过 3 次。函数内也有同样的单实例兜底限流，但平台规则才能覆盖所有边缘实例。

## 发布前检查

- 不要使用 `.edgeone-static` 作为发布目录：它不包含 `functions/api/chat.js`，AI 功能会失效。
- 不要把 `SILICONFLOW_API_KEY`、`DEEPSEEK_API_KEY` 或任何其他密钥写入 HTML、JavaScript、上传文件或 Git 仓库。
- 上传前确认 `.edgeone-build` 不含 `references/`、`docs`、测试文件或重复资源；这些内容不应公开发布。
- 在硅基流动控制台查看调用额度和频率限制；EdgeOne 函数本身不能替代应用级身份验证与更严格的分布式限流。
- 站点使用浏览器语音识别；生产域名必须走 HTTPS，用户仍需自行同意麦克风权限。

## 本地开发

本地 Python 服务和 EdgeOne Pages Functions 是两套运行时：前者用于本机预览，后者用于腾讯云生产部署。两者的 `/api/chat` 请求和响应格式均为：

```json
{ "message": "用户问题" }
```

```json
{ "reply": "AI 回复" }
```
